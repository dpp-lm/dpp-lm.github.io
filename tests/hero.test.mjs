import test from 'node:test';
import assert from 'node:assert/strict';
import { HERO_TOY, HERO_AXES } from '../js/toy-hero.js';
import { pairDet, normalizer, indepPairs, sin2 } from '../js/w-volume-lib.js';
import { layoutHero, tipUnit, MARGIN } from '../js/w-hero-lib.js';

const T = 1;
const near = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const Z = normalizer(HERO_TOY, T);
const dpp = (i, j) => pairDet(HERO_TOY[i], HERO_TOY[j], T) / Z;
const ind = (i, j) => 2 * HERO_TOY[i].p * HERO_TOY[j].p;
const SEQUENCE = [[0, 1], [0, 2], [2, 3], [1, 4], [4, 5], [2, 5]];

test('probabilities at T = 1', () => {
  near(Z, 0.220636, 1e-5);
  near(dpp(0, 1), 0.0048); near(ind(0, 1), 0.1440);
  near(dpp(0, 2), 0.1561); near(ind(0, 2), 0.1080);
  near(dpp(2, 4), 0.0612); near(ind(2, 4), 0.0360);
  near(dpp(0, 1) + dpp(2, 3) + dpp(4, 5), 0.00676, 1e-4);
  const rows = indepPairs(HERO_TOY).rows;
  assert.equal(rows.length, 15);
  const gift = (i) => i >> 1;
  let n = 0;
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) if (gift(i) !== gift(j)) { n++; assert.ok(dpp(i, j) > ind(i, j), `${i},${j}`); }
  assert.equal(n, 12);
});

test('angles: at most 127 degrees apart and 53 or more from opposite', () => {
  let maxA = 0, minOpp = 180;
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
    let d = Math.abs(HERO_TOY[i].angle - HERO_TOY[j].angle) % 360;
    if (d > 180) d = 360 - d;
    if (i >> 1 !== j >> 1) { maxA = Math.max(maxA, d); minOpp = Math.min(minOpp, 180 - d); }
    else assert.ok(sin2(HERO_TOY[i], HERO_TOY[j]) < 0.1);
  }
  near(maxA, 127, 0.5);
  assert.ok(minOpp >= 53 - 0.5, `${minOpp}`);
});

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
function segRect(x1, y1, x2, y2, b) {
  let t0 = 0, t1 = 1; const dx = x2 - x1, dy = y2 - y1;
  for (const [p, q] of [[-dx, x1 - b.x], [dx, b.x + b.w - x1], [-dy, y1 - b.y], [dy, b.y + b.h - y1]]) {
    if (p === 0) { if (q < 0) return false; } else { const r = q / p; if (p < 0) { if (r > t1) return false; t0 = Math.max(t0, r); } else { if (r < t0) return false; t1 = Math.min(t1, r); } }
  }
  return true;
}
const rectDist = (x, y, b) => Math.hypot(Math.min(b.x + b.w, Math.max(b.x, x)) - x, Math.min(b.y + b.h, Math.max(b.y, y)) - y);

const WIDTHS = [250, 288, 320, 328, 343, 358, 390, 420];
const mk = (W) => layoutHero({ items: HERO_TOY, T, W, H: Math.round(0.76 * W), labelW: HERO_TOY.map((it) => 6.6 * it.short.length), labelH: 17, avoidPairs: SEQUENCE });
const polyRect = (pts, b) => {
  const inR = ([x, y]) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  if (pts.some(inR)) return true;
  for (let k = 0; k < pts.length; k++) if (segRect(...pts[k], ...pts[(k + 1) % pts.length], b)) return true;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  let ins = false;
  for (let k = 0, m = pts.length - 1; k < pts.length; m = k++) {
    const [xi, yi] = pts[k], [xj, yj] = pts[m];
    if ((yi > cy) !== (yj > cy) && cx < ((xj - xi) * (cy - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
};

for (const W of WIDTHS) {
  test(`layout at W = ${W}`, () => {
    const H = Math.round(0.76 * W);
    const t0 = performance.now();
    const lay = mk(W);
    assert.ok(performance.now() - t0 < 150, `took ${performance.now() - t0} ms`);
    const { s, ox, oy, tips, labels, titles, tier } = lay;
    assert.ok(s > 0 && (tier === 1 || tier === 2));
    const inside = (x, y, m) => x >= m - 1e-9 && x <= W - m + 1e-9 && y >= m - 1e-9 && y <= H - m + 1e-9;
    assert.ok(inside(ox, oy, MARGIN));
    tips.forEach((t, i) => assert.ok(inside(t.x - 6.5, t.y - 6.5, MARGIN) && inside(t.x + 6.5, t.y + 6.5, MARGIN), `tip ${i}`));
    const u = HERO_TOY.map((it) => tipUnit(it, T));
    for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
      assert.ok(inside(ox + (u[i][0] + u[j][0]) * s, oy - (u[i][1] + u[j][1]) * s, MARGIN), `corner ${i},${j}`);
    }
    const limit = tier === 1 ? 14 : 30;
    const slivers = [[0, 1], [2, 3], [4, 5]].map(([i, j]) => [[ox, oy], [tips[i].x, tips[i].y], [tips[i].x + tips[j].x - ox, tips[i].y + tips[j].y - oy], [tips[j].x, tips[j].y]]);
    labels.forEach((b, i) => {
      assert.ok(b.x >= -2 && b.y >= -2 && b.x + b.w <= W + 2 && b.y + b.h <= H + 2, `label ${i} in frame`);
      assert.ok(rectDist(tips[i].x, tips[i].y, b) <= limit + 1e-9, `label ${i} near its tip`);
      labels.forEach((c, j) => { if (j > i) assert.ok(!overlap(b, c), `labels ${i},${j}`); });
      tips.forEach((t, k) => assert.ok(rectDist(t.x, t.y, b) >= 8.5, `label ${i} vs handle ${k}`));
      tips.forEach((t, k) => { if (k !== i) assert.ok(!segRect(ox, oy, t.x, t.y, b), `label ${i} vs shaft ${k}`); });
      for (const [k, tt] of Object.entries(titles)) assert.ok(!overlap(b, tt.box), `label ${i} vs title ${k}`);
      slivers.forEach((pl, g) => assert.ok(!polyRect(pl, { x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + 4 }), `label ${i} on sliver ${g}`));
    });
    assert.deepEqual(Object.keys(titles).sort(), Object.keys(HERO_AXES).sort());
  });
}

test('no label crosses an axis line at W = 420 and 358', () => {
  for (const W of [420, 358]) {
    const { ox, oy, labels } = mk(W);
    labels.forEach((b, i) => {
      assert.ok(!(b.x < ox && b.x + b.w > ox), `label ${i} crosses the vertical axis at W = ${W}`);
      assert.ok(!(b.y < oy && b.y + b.h > oy), `label ${i} crosses the horizontal axis at W = ${W}`);
    });
  }
});

test('scale on phone widths and monotone in W', () => {
  assert.ok(mk(328).s >= 170, `${mk(328).s}`);
  assert.ok(mk(343).s >= 180, `${mk(343).s}`);
  let prev = mk(250).s;
  for (let W = 260; W <= 420; W += 10) {
    const s = mk(W).s;
    assert.ok(s >= 0.9 * prev, `s drops from ${prev} to ${s} at W = ${W}`);
    prev = s;
  }
});
