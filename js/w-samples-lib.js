// Pure logic for the samples widget. Mirrors the demo (dpp-lm-demo/js/main.js): same-string rows of the
// Gram matrix are merged, the Sample mode draws from the K-DPP with column scales log(w), MAP runs the
// greedy on log kappa.
import { eigSym, kdpp, greedyMAPLog, columnLogScale, quality, diversity, mulberry32 } from './vendor/dpp.js';

export const T_RANGE = { sample: { min: 0.43, max: 1.22, log: false }, map: { min: 1, max: 500, log: true } };
export const K_RANGE = { min: 3, max: 8 };

/** Float32 row-major bytes to a Float64Array. */
export function parseGram(buf, N) {
  const f = new Float32Array(buf);
  if (f.length !== N * N) throw new Error('Gram size mismatch');
  return Float64Array.from(f);
}

/** Identical strings get identical rows (copies the row of the first occurrence), as in the demo. */
export function mergeDuplicates(samples, G) {
  const N = samples.length, first = new Map();
  const c = samples.map((s, i) => (first.has(s.text) ? first.get(s.text) : (first.set(s.text, i), i)));
  if (c.every((x, i) => x === i)) return G;
  const H = new Float64Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) H[i * N + j] = G[c[i] * N + c[j]];
  return H;
}

export function makePool(pool, gramBuf) {
  const N = pool.samples.length;
  const G = mergeDuplicates(pool.samples, parseGram(gramBuf, N));
  const out = {
    N, G, proj: null, texts: pool.samples.map((s) => s.text),
    logp: pool.samples.map((s) => s.logp), logq: pool.samples.map((s) => s.logq),
  };
  out.proj = project2(G, N);
  return out;
}

/** The k-th window of K consecutive draws, wrapping at N. */
export function windowIndices(counter, K, N) {
  const start = (((counter * K) % N) + N) % N;
  return Array.from({ length: K }, (_, i) => (start + i) % N);
}

/** Slider position in [0, 1] to T and back. */
export function tFromPos(mode, pos) {
  const r = T_RANGE[mode];
  return r.log ? r.min * Math.pow(r.max / r.min, pos) : r.min + pos * (r.max - r.min);
}
export function posFromT(mode, T) {
  const r = T_RANGE[mode];
  return r.log ? Math.log(T / r.min) / Math.log(r.max / r.min) : (T - r.min) / (r.max - r.min);
}

export function seedFor(promptIdx, K, counter) {
  return (promptIdx * 100003 + K * 1009 + counter * 7919 + 17) >>> 0;
}

/** K-DPP selection of the pool. Sample is deterministic in (pool, K, T, seed); MAP ignores the seed. */
export function select(pool, { mode, T, K, seed }) {
  const logScale = columnLogScale(mode, pool.logp, pool.logq, T);
  if (mode === 'map') return greedyMAPLog(pool.G, pool.N, logScale, K).set.slice();
  const set = kdpp(pool.G, pool.N, logScale, K).sample(mulberry32(seed));
  return set ? Array.from(set) : [];
}

/** Everything the panels show for one set of pool indices. */
export function describe(pool, set) {
  const K = set.length;
  const sim = Array.from({ length: K }, (_, a) => Array.from({ length: K }, (_, b) => pool.G[set[a] * pool.N + set[b]]));
  const same = set.map((i, a) => { for (let b = 0; b < a; b++) if (pool.texts[set[b]] === pool.texts[i]) return b; return -1; });
  const div = diversity(pool.G, pool.N, set);
  return {
    set, sim, same,
    diversity: div,
    quality: quality(pool.logp, set),
    hasDuplicate: same.some((x) => x >= 0) || div === -Infinity,
  };
}

export const fmt = (x, d = 2) => (x === -Infinity ? '−∞' : (x < 0 ? '−' : '') + Math.abs(x).toFixed(d));

/**
 * Classical MDS of the unit embeddings from their Gram matrix: double-center G, take the top two
 * eigenvectors scaled by the square root of their eigenvalues. Squared distances in the plane approximate
 * G_ii + G_jj - 2 G_ij = 2 - 2 G_ij for unit vectors, exactly when G has rank 2.
 */
export function project2(G, N) {
  const rm = new Float64Array(N); let tot = 0;
  for (let i = 0; i < N; i++) { let s = 0; for (let j = 0; j < N; j++) s += G[i * N + j]; rm[i] = s / N; tot += s; }
  tot /= N * N;
  const B = new Float64Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) B[i * N + j] = G[i * N + j] - rm[i] - rm[j] + tot;
  const { values, vectors } = eigSym(B, N);
  const x = new Float64Array(N), y = new Float64Array(N);
  const sx = Math.sqrt(Math.max(0, values[0])), sy = Math.sqrt(Math.max(0, values[1]));
  for (let i = 0; i < N; i++) { x[i] = sx * vectors[0][i]; y[i] = sy * vectors[1][i]; }
  return { x, y };
}

/** Distinct strings: for each, the first index and the number of draws. Dots are drawn per string. */
export function distinctDots(texts) {
  const m = new Map();
  texts.forEach((t, i) => { const e = m.get(t); if (e) e.count++; else m.set(t, { i, count: 1 }); });
  return [...m.values()];
}

export const STOP_WORDS = new Set(['a', 'an', 'the', 'of', 'to', 'and', 'or', 'in', 'for', 'with', 'your', 'their', 'would', 'make', 'makes', 'is', 'that', 'it', 'as', 'on']);
export const words = (text) => text.toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g) || [];

/**
 * Words (lowercase, no punctuation) that occur in at least ceil(K/2)+1 of the K answers, counting each
 * answer once. Stop words and the words of `prompt` are ignored.
 */
export function repeatedWords(texts, prompt = '') {
  const K = texts.length, need = Math.ceil(K / 2) + 1;
  const skip = new Set([...STOP_WORDS, ...words(prompt)]);
  const df = new Map();
  for (const t of texts) for (const w of new Set(words(t))) if (!skip.has(w)) df.set(w, (df.get(w) || 0) + 1);
  return new Set([...df].filter(([, c]) => c >= need).map(([w]) => w));
}

/** Splits a text into {t, mark} pieces; mark is true for words in `set`. */
export function markSegments(text, set) {
  const out = []; let last = 0;
  for (const m of text.matchAll(/[A-Za-z0-9]+(?:'[A-Za-z]+)?/g)) {
    if (!set.has(m[0].toLowerCase())) continue;
    if (m.index > last) out.push({ t: text.slice(last, m.index), mark: false });
    out.push({ t: m[0], mark: true }); last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last), mark: false });
  return out;
}
