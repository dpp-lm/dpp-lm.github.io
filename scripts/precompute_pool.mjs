// Precompute data/pool-toy.json for the pool widget.
//   node scripts/precompute_pool.mjs [--exact-max 128] [--mc-pools 2000000] [--seed 20260101]
// For T in {0.7, 1, 2} and N in the grid: target, pi-bar (average of the pool distribution over pools, after redraw),
// KL(target || pi-bar), the bound log(1 + Var(Z-hat) / Z^2), and the redraw probability.
// Pi-bar is exact (multinomial enumeration over count vectors) for N <= exact-max and Monte Carlo above.
// The bound and the redraw probability are exact at every N (closed-form multinomial moments).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mulberry32 } from '../js/vendor/dpp.js';
import {
  M, PAIRS, S2, N_GRID, T_GRID, TOY, weights, targetPairs, zhatMoments, klBound, redrawProbability, kl,
} from '../js/w-pool-lib.js';

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
};
const EXACT_MAX = arg('exact-max', 128);
const MC_POOLS = arg('mc-pools', 2_000_000);
const SEED = arg('seed', 20260101);
const OVERLAP = [32, 64, 128]; // Monte Carlo is also run here to compare with the exact values
const BATCHES = 50;

const E = PAIRS.length;
const P = TOY.map((t) => t.p);
const lgam = (() => {
  const t = [0];
  for (let i = 1; i <= 600; i++) t[i] = t[i - 1] + Math.log(i);
  return t;
})();

const A = T_GRID.map((T) => {
  const w = weights(T);
  return PAIRS.map(([a, b], e) => w[a] * w[b] * S2[e]);
});
const TARGET = T_GRID.map((T) => targetPairs(T));

// ---------- exact enumeration over count vectors ----------
function enumerate(N) {
  const lt = P.map((p) => Array.from({ length: N + 1 }, (_, c) => c * Math.log(p) - lgam[c]));
  const base = lgam[N];
  const nT = T_GRID.length;
  const numer = T_GRID.map(() => new Float64Array(E));
  const efhat = T_GRID.map(() => new Float64Array(E));
  const ez = new Float64Array(nT), ez2 = new Float64Array(nT);
  let gamma = 0, states = 0;
  const alpha = N / (N - 1), c0 = alpha / (N * N);
  const c = new Int32Array(M);
  const prod = new Float64Array(E);
  const visit = (lp) => {
    states++;
    const pmf = Math.exp(base + lp);
    for (let e = 0; e < E; e++) prod[e] = c[PAIRS[e][0]] * c[PAIRS[e][1]];
    let anyPos = false;
    for (let t = 0; t < nT; t++) {
      const At = A[t];
      let tot = 0;
      for (let e = 0; e < E; e++) tot += prod[e] * At[e];
      const z = c0 * tot;
      ez[t] += pmf * z;
      ez2[t] += pmf * z * z;
      if (tot > 0) {
        anyPos = true;
        const f = pmf / tot;
        for (let e = 0; e < E; e++) numer[t][e] += f * prod[e] * At[e];
      }
      for (let e = 0; e < E; e++) efhat[t][e] += pmf * c0 * prod[e] * At[e];
    }
    if (anyPos) gamma += pmf;
  };
  for (c[0] = 0; c[0] <= N; c[0]++) {
    const r0 = N - c[0], l0 = lt[0][c[0]];
    for (c[1] = 0; c[1] <= r0; c[1]++) {
      const r1 = r0 - c[1], l1 = l0 + lt[1][c[1]];
      for (c[2] = 0; c[2] <= r1; c[2]++) {
        const r2 = r1 - c[2], l2 = l1 + lt[2][c[2]];
        for (c[3] = 0; c[3] <= r2; c[3]++) {
          const r3 = r2 - c[3], l3 = l2 + lt[3][c[3]];
          for (c[4] = 0; c[4] <= r3; c[4]++) {
            c[5] = r3 - c[4];
            visit(l3 + lt[4][c[4]] + lt[5][c[5]]);
          }
        }
      }
    }
  }
  return { numer, efhat, ez, ez2, gamma, states };
}

// ---------- Monte Carlo ----------
function monteCarlo(N, pools, seed) {
  const rng = mulberry32(seed);
  const cum = [];
  { let s = 0; for (const p of P) { s += p; cum.push(s); } }
  const nT = T_GRID.length;
  const per = Math.floor(pools / BATCHES);
  const bx = T_GRID.map(() => Array.from({ length: BATCHES }, () => new Float64Array(E)));
  const bs = new Float64Array(BATCHES);
  const c = new Int32Array(M);
  const prod = new Float64Array(E);
  for (let b = 0; b < BATCHES; b++) {
    for (let k = 0; k < per; k++) {
      c.fill(0);
      for (let n = 0; n < N; n++) {
        const u = rng();
        let a = 0;
        while (a < M - 1 && u >= cum[a]) a++;
        c[a]++;
      }
      for (let e = 0; e < E; e++) prod[e] = c[PAIRS[e][0]] * c[PAIRS[e][1]];
      let ok = false;
      for (let t = 0; t < nT; t++) {
        const At = A[t];
        let tot = 0;
        for (let e = 0; e < E; e++) tot += prod[e] * At[e];
        if (tot > 0) {
          ok = true;
          const f = 1 / tot;
          const row = bx[t][b];
          for (let e = 0; e < E; e++) row[e] += f * prod[e] * At[e];
        }
      }
      if (ok) bs[b] += 1;
    }
  }
  const out = [];
  for (let t = 0; t < nT; t++) {
    const m = new Float64Array(E);
    let s = 0;
    for (let b = 0; b < BATCHES; b++) { s += bs[b]; for (let e = 0; e < E; e++) m[e] += bx[t][b][e]; }
    const pibar = Array.from(m, (x) => x / s);
    const tg = TARGET[t].probs;
    const klv = kl(tg, pibar);
    // Delta method on batch means: d KL = - sum_i (t_i / pibar_i) (dm_i - pibar_i ds) / gamma.
    const gamma = s / (BATCHES * per);
    const infl = [];
    for (let b = 0; b < BATCHES; b++) {
      let u = 0;
      for (let e = 0; e < E; e++) u += -(tg[e] / pibar[e]) * (bx[t][b][e] / per - pibar[e] * (bs[b] / per)) / gamma;
      infl.push(u);
    }
    const mean = infl.reduce((x, y) => x + y, 0) / BATCHES;
    const sd = Math.sqrt(infl.reduce((x, y) => x + (y - mean) ** 2, 0) / (BATCHES - 1));
    out.push({ pibar, kl: klv, kl_se: sd / Math.sqrt(BATCHES), gamma, pools: per * BATCHES });
  }
  return out;
}

// ---------- run ----------
const t0 = Date.now();
const log = (...a) => console.error(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
const result = { exact: {}, mc: {}, validation: {} };
let maxUnbiasErr = 0, maxMomentErr = 0;
for (const N of N_GRID.filter((n) => n <= EXACT_MAX)) {
  const r = enumerate(N);
  log('exact N =', N, 'states', r.states);
  result.exact[N] = T_GRID.map((T, t) => {
    const tg = TARGET[t];
    const pibar = Array.from(r.numer[t], (x) => x / r.gamma);
    // (a) unbiasedness: E[fhat(S)] = f(S) = kappa_a kappa_b sin^2.
    const kap = weights(T).map((w, a) => w * P[a]);
    PAIRS.forEach(([a, b], e) => {
      const f = kap[a] * kap[b] * S2[e];
      maxUnbiasErr = Math.max(maxUnbiasErr, Math.abs(r.efhat[t][e] / f - 1));
    });
    // Moments by enumeration against the closed form.
    const mom = zhatMoments(N, T);
    const varEnum = r.ez2[t] - r.ez[t] ** 2;
    maxMomentErr = Math.max(maxMomentErr, Math.abs(r.ez[t] / mom.mean - 1), Math.abs(varEnum / mom.variance - 1));
    return { pibar, kl: kl(tg.probs, pibar), gamma: r.gamma };
  });
}
result.validation.max_rel_error_unbiasedness = maxUnbiasErr;
result.validation.max_rel_error_moments = maxMomentErr;
log('unbiasedness max rel error', maxUnbiasErr, 'moments', maxMomentErr);

const mcNs = [...new Set([...N_GRID.filter((n) => n > EXACT_MAX), ...OVERLAP.filter((n) => n <= EXACT_MAX)])].sort((a, b) => a - b);
for (const N of mcNs) {
  result.mc[N] = monteCarlo(N, MC_POOLS, SEED + N);
  log('mc N =', N, result.mc[N].map((x) => x.kl.toFixed(6) + '+-' + x.kl_se.toExponential(1)).join(' '));
}

// (b) exact vs Monte Carlo at overlapping N.
const overlap = [];
let overlapOk = true;
for (const N of OVERLAP.filter((n) => n <= EXACT_MAX)) {
  T_GRID.forEach((T, t) => {
    const ex = result.exact[N][t].kl, mc = result.mc[N][t];
    const z = (mc.kl - ex) / mc.kl_se;
    overlap.push({ T, N, exact_kl: ex, mc_kl: mc.kl, mc_se: mc.kl_se, z });
    if (Math.abs(z) > 4) overlapOk = false;
  });
}
result.validation.overlap = overlap;
result.validation.overlap_ok = overlapOk;
log('overlap ok', overlapOk, overlap.map((o) => o.z.toFixed(2)).join(' '));

// ---------- assemble ----------
const out = {
  meta: {
    description: 'Pool toy model: exact target, pool-averaged output law pibar, KL(target || pibar), and the bound log(1 + Var(Zhat)/Z^2).',
    toy: TOY.map((t) => ({ id: t.id, p: t.p, angle: t.angle })),
    K: 2,
    proposal: 'q = p (local temperature 1)',
    redraw: 'pools with Zhat = 0 (one distinct answer) are redrawn; pibar is conditioned on Zhat > 0',
    pairs: PAIRS,
    pair_order: 'lexicographic over answer indices a < b',
    N_grid: N_GRID,
    T_grid: T_GRID,
    exact_max_N: EXACT_MAX,
    mc_pools: MC_POOLS,
    seed: SEED,
    bound: 'exact multinomial moments of Zhat; variance taken under the pool law before redraw (appendix "Redrawing degenerate pools")',
    validation: result.validation,
  },
  T: {},
};
let boundOk = true;
for (const [t, T] of T_GRID.entries()) {
  const tg = TARGET[t];
  const entries = [];
  for (const N of N_GRID) {
    const ex = result.exact[N]?.[t];
    const mc = result.mc[N]?.[t];
    const src = ex ? { method: 'exact', pibar: ex.pibar, kl: ex.kl, kl_se: null } : { method: 'monte_carlo', pibar: mc.pibar, kl: mc.kl, kl_se: mc.kl_se };
    const bound = klBound(N, T);
    const slack = src.kl_se ? 3 * src.kl_se : 0;
    if (!(src.kl - slack <= bound)) { boundOk = false; console.error('BOUND VIOLATED', T, N, src.kl, bound); }
    const redraw = redrawProbability(N);
    entries.push({ N, method: src.method, kl: src.kl, kl_se: src.kl_se, bound, redraw, pibar: src.pibar });
  }
  // Least-squares slope of log KL against log N over N >= 32.
  const pts = entries.filter((e) => e.N >= 32).map((e) => [Math.log(e.N), Math.log(e.kl)]);
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const slope = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  const klDecreasing = entries.every((e, i) => i === 0 || e.N < 6 || e.kl <= entries[i - 1].kl);
  out.T[T] = { target: tg.probs, Z: tg.Z, slope_logKL_logN_N_ge_32: slope, entries };
  log('T', T, 'slope', slope.toFixed(3), 'KL decreasing', klDecreasing);
}
out.meta.validation.bound_ok_all = boundOk;
out.meta.validation.unbiased_ok = maxUnbiasErr < 1e-9;
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'pool-toy.json'), JSON.stringify(out));
log('written; unbiased_ok', out.meta.validation.unbiased_ok, 'overlap_ok', overlapOk, 'bound_ok', boundOk);
if (!out.meta.validation.unbiased_ok || !overlapOk || !boundOk) process.exitCode = 1;
