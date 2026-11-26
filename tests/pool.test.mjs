import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mulberry32 } from '../js/vendor/dpp.js';
import { TOY, phi } from '../js/toy.js';
import {
  PAIRS, N_GRID, T_GRID, targetPairs, normalizerFromDualKernel, poolDistribution, poolDistributionBrute,
  drawSeq, countsOf, poolFromSeed, zhat, zhatMoments, klBound, redrawProbability, kappas,
} from '../js/w-pool-lib.js';

const sum = (a) => a.reduce((s, x) => s + x, 0);

test('target sums to 1 and matches a direct 2x2 determinant', () => {
  for (const T of T_GRID) {
    const { probs, Z } = targetPairs(T);
    assert.ok(Math.abs(sum(probs) - 1) < 1e-12);
    const k = kappas(T);
    let zz = 0;
    const det = PAIRS.map(([a, b]) => {
      // L = sqrt(kappa) phi^T phi sqrt(kappa) restricted to {a, b}
      const fa = phi(TOY[a]), fb = phi(TOY[b]);
      const l = (x, y, fx, fy) => Math.sqrt(k[x] * k[y]) * (fx[0] * fy[0] + fx[1] * fy[1]);
      const d = l(a, a, fa, fa) * l(b, b, fb, fb) - l(a, b, fa, fb) ** 2;
      zz += d;
      return d;
    });
    probs.forEach((p, e) => assert.ok(Math.abs(p - det[e] / zz) < 1e-12));
    assert.ok(Math.abs(Z - zz) < 1e-12);
    assert.ok(Math.abs(Z - normalizerFromDualKernel(T)) < 1e-12, 'normalizer equals e_2 of the dual kernel');
  }
});

test('pool distribution sums to 1 and equals the brute-force sum of determinants over index pairs', () => {
  const rng = mulberry32(7);
  for (const T of T_GRID) {
    for (const N of [2, 3, 5, 9, 17, 40]) {
      for (let rep = 0; rep < 5; rep++) {
        const seq = drawSeq(N, rng);
        const fast = poolDistribution(countsOf(seq), T);
        const brute = poolDistributionBrute(seq, T);
        if (fast === null) { assert.equal(brute, null); continue; }
        assert.ok(Math.abs(sum(fast) - 1) < 1e-12);
        fast.forEach((p, e) => assert.ok(Math.abs(p - brute[e]) < 1e-9, `T=${T} N=${N} pair ${e}`));
      }
    }
  }
});

test('a pool with one distinct answer has no pair and is redrawn with the next seed', () => {
  assert.equal(poolDistribution([5, 0, 0, 0, 0, 0], 1), null);
  const r = poolFromSeed(1, 2, 1, mulberry32);
  assert.ok(r.dist && Math.abs(sum(r.dist) - 1) < 1e-12);
  assert.equal(r.seed, 1 + r.redraws);
  // Find a seed that redraws at N = 2 to exercise the path.
  let found = false;
  for (let s = 0; s < 200 && !found; s++) found = poolFromSeed(s, 2, 1, mulberry32).redraws > 0;
  assert.ok(found);
});

test('sketched weight is unbiased by exact moments, and redraw probability matches', () => {
  for (const N of [2, 5, 11]) {
    for (const T of T_GRID) {
      const { mean } = zhatMoments(N, T);
      assert.ok(Math.abs(mean / targetPairs(T).Z - 1) < 1e-10);
    }
    assert.ok(redrawProbability(N) > 0 && redrawProbability(N) < 1);
  }
  assert.ok(zhat([1, 1, 0, 0, 0, 0], 1) > 0);
});

const data = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'pool-toy.json'), 'utf8'));

test('data file: validation flags, pi-bar sums to 1, KL <= bound, KL decreasing in N', () => {
  assert.ok(data.meta.validation.unbiased_ok);
  assert.ok(data.meta.validation.overlap_ok);
  assert.ok(data.meta.validation.bound_ok_all);
  for (const T of T_GRID) {
    const d = data.T[T];
    assert.ok(Math.abs(sum(d.target) - 1) < 1e-12);
    assert.deepEqual(d.entries.map((e) => e.N), N_GRID);
    d.entries.forEach((e, i) => {
      assert.ok(Math.abs(sum(e.pibar) - 1) < 1e-9, `pibar sums to 1 at T=${T}, N=${e.N}`);
      assert.ok(e.kl - 3 * (e.kl_se || 0) <= e.bound, `KL <= bound at T=${T}, N=${e.N}`);
      assert.ok(Math.abs(e.bound - klBound(e.N, T)) < 1e-9);
      if (e.N >= 6 && i > 0) {
        const prev = d.entries[i - 1];
        // Monte Carlo entries may fluctuate by their standard error.
        assert.ok(e.kl <= prev.kl + 3 * Math.hypot(e.kl_se || 0, prev.kl_se || 0), `KL decreasing at T=${T}, N=${e.N}`);
      }
    });
    assert.ok(Number.isFinite(d.slope_logKL_logN_N_ge_32));
  }
});
