import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { diversity, quality } from '../js/vendor/dpp.js';
import { makePool, windowIndices, select, describe, seedFor, tFromPos, posFromT, mergeDuplicates } from '../js/w-samples-lib.js';

const dir = new URL('../data/samples/', import.meta.url);
const load = (id) => {
  const j = JSON.parse(fs.readFileSync(new URL(id + '.json', dir)));
  const b = fs.readFileSync(new URL(id + '.G.bin', dir));
  return makePool(j, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const pool = load('gift');

test('describe reproduces diversity and quality of dpp.js on a fixture', () => {
  const S = [0, 1, 2, 3, 4];
  const d = describe(pool, S);
  assert.equal(d.diversity, diversity(pool.G, pool.N, S));
  assert.equal(d.quality, quality(pool.logp, S));
  assert.ok(Number.isFinite(d.diversity) && d.diversity < 0);
  assert.equal(d.sim[1][1], pool.G[1 * pool.N + 1]);
});

test('duplicate strings give -Infinity diversity and a marker', () => {
  const samples = [{ text: 'a' }, { text: 'b' }, { text: 'a' }];
  const G = Float64Array.from([1, 0.2, 0.9, 0.2, 1, 0.1, 0.9, 0.1, 1]);
  const H = mergeDuplicates(samples, G);
  assert.equal(H[2 * 3 + 0], 1);
  const p = { N: 3, G: H, texts: ['a', 'b', 'a'], logp: [-1, -2, -1] };
  const d = describe(p, [0, 1, 2]);
  assert.equal(d.diversity, -Infinity);
  assert.deepEqual(d.same, [-1, -1, 0]);
  assert.ok(d.hasDuplicate);
});

test('consecutive-draw windows wrap at N', () => {
  assert.deepEqual(windowIndices(0, 5, 200), [0, 1, 2, 3, 4]);
  assert.deepEqual(windowIndices(1, 5, 200), [5, 6, 7, 8, 9]);
  assert.deepEqual(windowIndices(39, 5, 200), [195, 196, 197, 198, 199]);
  assert.deepEqual(windowIndices(40, 5, 200), [0, 1, 2, 3, 4]);
  assert.deepEqual(windowIndices(26, 7, 200), [182 % 200, 183, 184, 185, 186, 187, 188]);
  assert.deepEqual(windowIndices(28, 7, 200), [196, 197, 198, 199, 0, 1, 2]);
});

test('MAP selection is deterministic and has K distinct strings', () => {
  const a = select(pool, { mode: 'map', T: 10, K: 5, seed: 1 });
  const b = select(pool, { mode: 'map', T: 10, K: 5, seed: 99 });
  assert.deepEqual(a, b);
  assert.equal(new Set(a.map((i) => pool.texts[i])).size, 5);
});

test('Sample selection has K distinct strings and repeats for the same call', () => {
  for (const K of [3, 5, 8]) for (let c = 0; c < 6; c++) {
    const args = { mode: 'sample', T: 0.8, K, seed: seedFor(0, K, c) };
    const s = select(pool, args);
    assert.equal(s.length, K);
    assert.equal(new Set(s.map((i) => pool.texts[i])).size, K);
    assert.deepEqual(select(pool, args), s);
  }
  const x = select(pool, { mode: 'sample', T: 0.8, K: 5, seed: seedFor(0, 5, 0) });
  const y = select(pool, { mode: 'sample', T: 0.8, K: 5, seed: seedFor(0, 5, 1) });
  assert.notDeepEqual(x, y);
});

test('temperature slider mapping round-trips over the stated ranges', () => {
  assert.ok(Math.abs(tFromPos('sample', 0) - 0.43) < 1e-12 && Math.abs(tFromPos('sample', 1) - 1.22) < 1e-12);
  assert.ok(Math.abs(tFromPos('map', 0) - 1) < 1e-12 && Math.abs(tFromPos('map', 1) - 500) < 1e-9);
  for (const m of ['sample', 'map']) assert.ok(Math.abs(posFromT(m, tFromPos(m, 0.37)) - 0.37) < 1e-12);
});

import { project2, distinctDots } from '../js/w-samples-lib.js';
test('2-D projection of a rank-2 Gram matrix reproduces 2 - 2 G_ij', () => {
  const N = 30, ang = Array.from({ length: N }, (_, i) => 0.37 * i + 0.1 * Math.sin(i));
  const G = new Float64Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) G[i * N + j] = Math.cos(ang[i] - ang[j]);
  const { x, y } = project2(G, N);
  let worst = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const d2 = (x[i] - x[j]) ** 2 + (y[i] - y[j]) ** 2;
    worst = Math.max(worst, Math.abs(d2 - (2 - 2 * G[i * N + j])));
  }
  assert.ok(worst < 1e-6, 'worst error ' + worst);
});
test('pool projection is computed once and identical strings share a dot', () => {
  assert.equal(pool.proj.x.length, pool.N);
  const dots = distinctDots(pool.texts);
  assert.equal(dots.reduce((a, d) => a + d.count, 0), pool.N);
  assert.ok(dots.length <= pool.N);
});

import { repeatedWords, markSegments } from '../js/w-samples-lib.js';
test('repeatedWords needs ceil(K/2)+1 answers, ignores case, punctuation, stop words, prompt words', () => {
  const t = ['A big, Red ball.', 'the red BALL of joy', 'Red ball! big', 'blue kite', 'green kite'];
  assert.deepEqual([...repeatedWords(t)].sort(), []);          // K=5 needs 4
  const t3 = ['Red ball, big', 'the RED ball', 'a red ball of joy'];   // K=3 needs 3
  assert.deepEqual([...repeatedWords(t3)].sort(), ['ball', 'red']);
  assert.deepEqual([...repeatedWords(t3, 'Pick a ball')].sort(), ['red']);
  assert.deepEqual([...repeatedWords(['the cat', 'the dog', 'the cow'])], []);
});
test('markSegments splits around marked words and keeps the text', () => {
  const segs = markSegments('A red, RED ball.', new Set(['red']));
  assert.equal(segs.map((s) => s.t).join(''), 'A red, RED ball.');
  assert.deepEqual(segs.filter((s) => s.mark).map((s) => s.t), ['red', 'RED']);
});
