// Pure logic for the pool widget: the exact toy model of PoolDPP-Samp with K = 2.
//
// Toy model (js/toy.js): six answers with probability p_a and a unit embedding at angle theta_a in the plane.
// Target: the 2-DPP with quality kappa_a = p_a^(1/T), P({a,b}) proportional to kappa_a kappa_b sin^2(theta_a - theta_b).
// Pool: N draws i.i.d. from q = p (local temperature 1), weights w = kappa / q, columns sqrt(w/N) phi(draw).
//
// Pushforward (paper, prop:pushforward). Index pairs {i, j} of two draws of strings a != b have
// det(L_{ij}) = (w_a w_b / N^2) sin^2(theta_a - theta_b). A pair of equal strings has determinant 0. If string a was
// drawn c_a times, exactly c_a c_b index pairs map to {a, b}, so the pool distribution over string pairs is
//   pihat({a,b}) = c_a c_b w_a w_b sin^2 / sum over pairs {a',b'} of c_a' c_b' w_a' w_b' sin^2,
// and the sketched weight (eq. PoolDPP-fhat) is fhat({a,b}) = alpha c_a c_b w_a w_b sin^2 / N^2, alpha = N^2 / (N (N-1)).
import { TOY, TOY_K, phi, kappa } from './toy.js';

export { TOY, TOY_K };
export const M = TOY.length;

// The 15 unordered pairs in lexicographic order (a < b). Index into this list is the "pair id".
export const PAIRS = [];
for (let a = 0; a < M; a++) for (let b = a + 1; b < M; b++) PAIRS.push([a, b]);

export const N_GRID = [2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512];
export const T_GRID = [0.7, 1, 2];

const P = TOY.map((t) => t.p);

// sin^2 of the angle between two answers' embeddings = det [phi_a phi_b]^2.
export function sin2(a, b) {
  const [x1, y1] = phi(TOY[a]);
  const [x2, y2] = phi(TOY[b]);
  const d = x1 * y2 - y1 * x2;
  return d * d;
}
export const S2 = PAIRS.map(([a, b]) => sin2(a, b));

export const kappas = (T) => P.map((p) => kappa(p, T));
// Importance weight w = kappa / q with q = p.
export const weights = (T) => P.map((p) => kappa(p, T) / p);

// Exact target over the 15 pairs, by the 2x2 determinant formula kappa_a kappa_b sin^2.
export function targetPairs(T) {
  const k = kappas(T);
  const u = PAIRS.map(([a, b], e) => k[a] * k[b] * S2[e]);
  const Z = u.reduce((s, x) => s + x, 0);
  return { probs: u.map((x) => x / Z), Z };
}

// Normalizer check: e_2 of the eigenvalues of the population dual kernel C = sum_a kappa_a phi phi^T.
export function normalizerFromDualKernel(T) {
  const k = kappas(T);
  let c11 = 0, c12 = 0, c22 = 0;
  TOY.forEach((t, a) => {
    const [x, y] = phi(t);
    c11 += k[a] * x * x; c12 += k[a] * x * y; c22 += k[a] * y * y;
  });
  return c11 * c22 - c12 * c12; // e_2 of a 2x2 matrix is its determinant
}

// Pool distribution over the 15 pairs from the counts of each answer. Returns null if the pool has no pair of
// distinct answers (Z-hat = 0). `alpha` is not needed here because it cancels.
export function poolDistribution(counts, T) {
  const w = weights(T);
  const u = PAIRS.map(([a, b], e) => counts[a] * counts[b] * w[a] * w[b] * S2[e]);
  const tot = u.reduce((s, x) => s + x, 0);
  if (!(tot > 0)) return null;
  return u.map((x) => x / tot);
}

// Sketched normalizer Z-hat = alpha e_2(eig(C-hat)) = alpha sum_pairs c_a c_b w_a w_b sin^2 / N^2.
export function zhat(counts, T) {
  const N = counts.reduce((s, c) => s + c, 0);
  const w = weights(T);
  let s = 0;
  PAIRS.forEach(([a, b], e) => { s += counts[a] * counts[b] * w[a] * w[b] * S2[e]; });
  return (N / (N - 1)) * (s / (N * N));
}

// Pool built from the sequence of drawn answers, by brute force: N x N pool kernel L = B^T B with columns
// sqrt(w/N) phi, then the sum of 2x2 principal minors over index pairs, grouped by the pair of strings.
export function poolDistributionBrute(seq, T) {
  const N = seq.length;
  const w = weights(T);
  const B = seq.map((a) => {
    const f = phi(TOY[a]);
    const s = Math.sqrt(w[a] / N);
    return [s * f[0], s * f[1]];
  });
  const L = (i, j) => B[i][0] * B[j][0] + B[i][1] * B[j][1];
  const acc = new Array(PAIRS.length).fill(0);
  const id = (a, b) => PAIRS.findIndex(([x, y]) => x === Math.min(a, b) && y === Math.max(a, b));
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const det = L(i, i) * L(j, j) - L(i, j) * L(i, j);
      if (seq[i] === seq[j]) continue; // identical columns: determinant 0 up to rounding
      acc[id(seq[i], seq[j])] += det;
    }
  }
  const tot = acc.reduce((s, x) => s + x, 0);
  return tot > 1e-300 ? acc.map((x) => x / tot) : null;
}

export function drawSeq(N, rng) {
  const cum = [];
  let c = 0;
  for (const p of P) { c += p; cum.push(c); }
  const seq = new Array(N);
  for (let n = 0; n < N; n++) {
    const u = rng() * c;
    let a = 0;
    while (a < M - 1 && u >= cum[a]) a++;
    seq[n] = a;
  }
  return seq;
}

export const countsOf = (seq) => {
  const c = new Array(M).fill(0);
  for (const a of seq) c[a]++;
  return c;
};

// Draw a pool with the rng seeded by `seed`. If the pool cannot form a pair, redraw with the next seed.
// `mulberry32` is passed in so tests do not need the vendor module.
export function poolFromSeed(seed, N, T, mulberry32) {
  let s = seed;
  let redraws = 0;
  for (;;) {
    const seq = drawSeq(N, mulberry32(s));
    const counts = countsOf(seq);
    const dist = poolDistribution(counts, T);
    if (dist) return { seed: s, requestedSeed: seed, redraws, seq, counts, dist };
    redraws++;
    s++;
    if (redraws > 1000) throw new Error('no non-degenerate pool found');
  }
}

export const tv = (a, b) => 0.5 * a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0);
export const kl = (t, q) => t.reduce((s, x, i) => (x > 0 ? s + x * Math.log(x / q[i]) : s), 0);

// ---------- exact moments of Z-hat under the multinomial pool ----------

// E[prod_i (c_i)_{s_i}] = (N)_{sum s} prod p_i^{s_i}.
function factMoment(N, s) {
  const tot = s.reduce((x, y) => x + y, 0);
  let r = 1;
  for (let k = 0; k < tot; k++) r *= N - k;
  s.forEach((si, i) => { if (si) r *= Math.pow(P[i], si); });
  return r;
}
// E[prod_i c_i^{m_i}] with m_i in {0, 1, 2}: c^2 = (c)_2 + (c)_1.
function rawMoment(N, m) {
  let total = 0;
  const idx = m.map((x, i) => (x === 2 ? i : -1)).filter((i) => i >= 0);
  for (let mask = 0; mask < 1 << idx.length; mask++) {
    const s = m.slice();
    idx.forEach((i, b) => { if (mask >> b & 1) s[i] = 1; });
    total += factMoment(N, s);
  }
  return total;
}

// Exact mean and variance of Z-hat (unconditional on Z-hat > 0; Z-hat = 0 on degenerate pools).
export function zhatMoments(N, T) {
  const w = weights(T);
  const a = PAIRS.map(([x, y], e) => w[x] * w[y] * S2[e]);
  const c0 = (N / (N - 1)) / (N * N);
  let mean = 0;
  PAIRS.forEach(([x, y], e) => {
    const m = new Array(M).fill(0); m[x] = 1; m[y] = 1;
    mean += a[e] * rawMoment(N, m);
  });
  mean *= c0;
  let second = 0;
  for (let e = 0; e < PAIRS.length; e++) {
    for (let f = 0; f < PAIRS.length; f++) {
      const m = new Array(M).fill(0);
      m[PAIRS[e][0]]++; m[PAIRS[e][1]]++; m[PAIRS[f][0]]++; m[PAIRS[f][1]]++;
      second += a[e] * a[f] * rawMoment(N, m);
    }
  }
  second *= c0 * c0;
  return { mean, variance: second - mean * mean };
}

// Bound of thm:var-kl-mixture: log(1 + Var(Z-hat) / Z^2).
export function klBound(N, T) {
  const Z = targetPairs(T).Z;
  const { variance } = zhatMoments(N, T);
  return Math.log1p(variance / (Z * Z));
}

// Probability that the pool has a single distinct answer (Z-hat = 0, since all six directions are pairwise non-parallel).
export const redrawProbability = (N) => P.reduce((s, p) => s + Math.pow(p, N), 0);
