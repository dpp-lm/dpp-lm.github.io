import test from 'node:test';
import assert from 'node:assert/strict';
import { TOY } from '../js/toy.js';
import { kernel, logDetSub } from '../js/vendor/dpp.js';
import { pairDet, normalizer, dppPairs, indepPairs, topPair, sin2, length, quality } from '../js/w-volume-lib.js';

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const close = (a, b, tol = 1e-12) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('2-DPP probabilities sum to 1 for several T', () => {
  for (const T of [0.3, 0.5, 1, 2, 5]) {
    const { rows } = dppPairs(TOY, T);
    assert.equal(rows.length, 15);
    close(sum(rows.map((r) => r.prob)), 1);
  }
});

test('determinant equals the 2x2 determinant of the kernel from dot products', () => {
  const T = 1.7;
  const phi = TOY.map((t) => [Math.cos((t.angle * Math.PI) / 180), Math.sin((t.angle * Math.PI) / 180)]);
  const N = TOY.length;
  const G = new Float64Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) G[i * N + j] = phi[i][0] * phi[j][0] + phi[i][1] * phi[j][1];
  const { L } = kernel(G, N, TOY.map((t) => Math.log(quality(t.p, T))));
  // kernel() rescales by the max column; recompute the unscaled L for the direct check.
  const ka = TOY.map((t) => quality(t.p, T));
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const lii = ka[i], ljj = ka[j], lij = Math.sqrt(ka[i] * ka[j]) * G[i * N + j];
      close(pairDet(TOY[i], TOY[j], T), lii * ljj - lij * lij, 1e-14);
    }
  }
  // Cholesky log-det on the rescaled kernel differs by the log of the column scales.
  const m = Math.max(...ka.map(Math.log));
  for (const [i, j] of [[0, 2], [1, 4], [3, 5]]) {
    const ld = logDetSub(L, N, [i, j]) + 2 * m;
    close(Math.exp(ld), pairDet(TOY[i], TOY[j], T), 1e-12);
  }
});

test('parallel arrows give zero determinant', () => {
  const a = { p: 0.3, angle: 40 };
  const b = { p: 0.2, angle: 40 };
  assert.equal(pairDet(a, b, 1), 0);
  close(sin2(a, { p: 0.1, angle: 40 + 180 }), 0, 1e-15);
  close(sin2(a, { p: 0.1, angle: 130 }), 1, 1e-15);
});

test('squared parallelogram area from quality-scaled vectors equals the determinant', () => {
  const T = 0.8;
  const [a, b] = [TOY[1], TOY[4]];
  const va = [length(a.p, T) * Math.cos((a.angle * Math.PI) / 180), length(a.p, T) * Math.sin((a.angle * Math.PI) / 180)];
  const vb = [length(b.p, T) * Math.cos((b.angle * Math.PI) / 180), length(b.p, T) * Math.sin((b.angle * Math.PI) / 180)];
  const area = Math.abs(va[0] * vb[1] - va[1] * vb[0]);
  close(area * area, pairDet(a, b, T), 1e-14);
});

test('independent pair probabilities plus the same answer twice sum to 1', () => {
  const { rows, same } = indepPairs(TOY);
  close(sum(rows.map((r) => r.prob)) + same, 1);
  close(same, sum(TOY.map((t) => t.p * t.p)));
});

test('normalizer equals the sum of the pair determinants', () => {
  const T = 1;
  const { rows, z } = dppPairs(TOY, T);
  close(z, normalizer(TOY, T));
  close(z, sum(rows.map((r) => r.det)));
});

test('default configuration: top pairs and the (Photo album, Photo book) probability', () => {
  const { rows } = dppPairs(TOY, 1);
  const ind = indepPairs(TOY).rows;
  const top3 = rows.slice(0, 3).map((r) => `${TOY[r.i].short} + ${TOY[r.j].short}: ${(100 * r.prob).toFixed(1)}%`);
  const np = rows.find((r) => r.i === 0 && r.j === 1);
  const npInd = ind.find((r) => r.i === 0 && r.j === 1);
  console.log('top three at T = 1:', top3.join('; '));
  console.log(`(Photo album, Photo book): 2-DPP ${(100 * np.prob).toFixed(2)}%, independent ${(100 * npInd.prob).toFixed(2)}%`);
  assert.equal(topPair(TOY, 1).i, rows[0].i);
  assert.ok(np.prob < npInd.prob);
});

import { mostDifferentPair, fitView, placeLabels } from '../js/w-volume-lib.js';

test('most different pair is the one with the largest angle, and differs from the top pair at T = 1', () => {
  const m = mostDifferentPair(TOY);
  assert.deepEqual([m.i, m.j], [0, 3]);
  assert.equal(m.angle, 72);
  const t = topPair(TOY, 1);
  assert.notDeepEqual([m.i, m.j], [t.i, t.j]);
});

test('fitView keeps every tip and far corner inside the frame at every T and for random angles', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const W of [330, 520]) {
    const H = Math.round(W * 0.75);
    for (const T of [0.3, 1, 5]) {
      for (let trial = 0; trial < 30; trial++) {
        const items = TOY.map((t) => ({ ...t, angle: 2 + 176 * rnd() }));
        const i = Math.floor(rnd() * 6);
        let j = Math.floor(rnd() * 6); if (j === i) j = (i + 1) % 6;
        const { s, ox, oy } = fitView({ items, T, pairList: [[i, j]], W, H, labelW: items.map(() => 80) });
        const v = (k) => [length(items[k].p, T) * Math.cos(items[k].angle * Math.PI / 180) * s, length(items[k].p, T) * Math.sin(items[k].angle * Math.PI / 180) * s];
        const pts = [v(i), v(j), [v(i)[0] + v(j)[0], v(i)[1] + v(j)[1]]];
        for (const [x, y] of pts) {
          assert.ok(ox + x >= -0.5 && ox + x <= W + 0.5, `x ${ox + x} W ${W}`);
          assert.ok(oy - y >= -0.5, `y ${oy - y}`);
        }
        const maxLen = Math.max(...items.map((it) => length(it.p, T))) * s;
        assert.ok(maxLen <= 0.45 * W + 1e-6);
      }
    }
  }
});

test('placeLabels returns non-overlapping boxes at the default configuration', () => {
  const W = 520, H = 390, T = 1;
  const widths = TOY.map((t) => t.short.length * 6.4);
  const { s, ox, oy } = fitView({ items: TOY, T, pairList: [[0, 1]], W, H, labelW: widths });
  const tips = TOY.map((t) => { const L = length(t.p, T) * s, a = t.angle * Math.PI / 180; return { x: ox + L * Math.cos(a), y: oy - L * Math.sin(a), L }; });
  const boxes = placeLabels({ items: TOY, tips, ox, oy, W, widths, rMin: 40 });
  for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
    const A = boxes[a], B = boxes[b];
    assert.ok(Math.abs(A.cx - B.cx) >= (A.w + B.w) / 2 || Math.abs(A.cy - B.cy) >= (A.h + B.h) / 2, `labels ${a},${b}`);
  }
});

import { fitContent } from '../js/w-volume-lib.js';

test('fitContent keeps tips and the selected far corner inside the frame with margin', () => {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const W of [334, 520]) for (const T of [0.3, 1, 5]) for (let trial = 0; trial < 40; trial++) {
    const items = TOY.map((t) => ({ ...t, angle: 2 + 176 * rnd() }));
    const i = Math.floor(rnd() * 6); let j = Math.floor(rnd() * 6); if (j === i) j = (i + 1) % 6;
    const f = fitContent({ items, T, pairList: [[i, j]], W, hMin: 0.45 * W, hMax: 0.75 * W, labelW: items.map(() => 80) });
    assert.ok(f.H >= Math.round(0.45 * W) && f.H <= Math.round(0.75 * W));
    const v = (k) => [length(items[k].p, T) * f.s * Math.cos(items[k].angle * Math.PI / 180), length(items[k].p, T) * f.s * Math.sin(items[k].angle * Math.PI / 180)];
    const pts = [[0, 0], v(i), v(j), [v(i)[0] + v(j)[0], v(i)[1] + v(j)[1]], ...items.map((_, k) => v(k))];
    for (const [x, y] of pts) {
      assert.ok(f.ox + x >= 12 - 1e-6 && f.ox + x <= W - 12 + 1e-6, `x ${f.ox + x}`);
      assert.ok(f.oy - y >= 11 || y <= 0, `y ${f.oy - y}`);
    }
  }
});

test('fitContent: longest arrow at the default state is at least 29% of the plot width', () => {
  for (const W of [334, 520]) {
    const widths = TOY.map((t) => t.short.length * 6.6);
    const f = fitContent({ items: TOY, T: 1, pairList: [[0, 1]], W, hMin: 0.45 * W, hMax: 0.75 * W, labelW: widths });
    const frac = (Math.max(...TOY.map((t) => length(t.p, 1))) * f.s) / W;
    console.log(`W=${W}: longest arrow ${(100 * frac).toFixed(1)}% of width, H=${f.H}`);
    assert.ok(frac >= 0.29);
  }
});
