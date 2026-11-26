// Pure functions for the "volume" widget: K = 2 DPP over a small set of answers with unit embeddings in the plane.
// An item is { p, angle } with p its probability and angle (degrees) the direction of its unit embedding.

const RAD = Math.PI / 180;

export const quality = (p, T) => Math.pow(p, 1 / T);

/** Length of the quality-scaled embedding: sqrt(kappa) = p^(1/(2T)). */
export const length = (p, T) => Math.pow(p, 1 / (2 * T));

/** sin^2 of the angle between two items, computed from the cross product of their unit embeddings. */
export function sin2(a, b) {
  const cross = Math.cos(a.angle * RAD) * Math.sin(b.angle * RAD) - Math.sin(a.angle * RAD) * Math.cos(b.angle * RAD);
  return cross * cross;
}

/** det(L_S) for S = {a, b} = kappa(a) kappa(b) sin^2(angle). */
export function pairDet(a, b, T) {
  return quality(a.p, T) * quality(b.p, T) * sin2(a, b);
}

/** All index pairs i < j. */
export function pairs(n) {
  const out = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push([i, j]);
  return out;
}

/** Normalizer Z: the sum of det(L_S) over all pairs. */
export function normalizer(items, T) {
  let z = 0;
  for (const [i, j] of pairs(items.length)) z += pairDet(items[i], items[j], T);
  return z;
}

/** 2-DPP probability of every pair, sorted by probability (ties by index). */
export function dppPairs(items, T) {
  const z = normalizer(items, T);
  const rows = pairs(items.length).map(([i, j]) => {
    const det = pairDet(items[i], items[j], T);
    return { i, j, det, prob: z > 0 ? det / z : 0 };
  });
  rows.sort((x, y) => y.prob - x.prob || x.i - y.i || x.j - y.j);
  return { rows, z };
}

/** Probability that two independent draws from p give the unordered pair {i, j}: 2 p_i p_j. */
export function indepPairs(items) {
  const rows = pairs(items.length).map(([i, j]) => ({ i, j, prob: 2 * items[i].p * items[j].p }));
  const same = items.reduce((s, it) => s + it.p * it.p, 0);
  return { rows, same };
}

export function topPair(items, T) {
  const { rows } = dppPairs(items, T);
  return rows[0];
}

/** The pair whose arrows are farthest apart in direction (largest angle between them). */
export function mostDifferentPair(items) {
  let best = null;
  for (const [i, j] of pairs(items.length)) {
    const d = Math.abs(items[i].angle - items[j].angle);
    if (!best || d > best.angle) best = { i, j, angle: d };
  }
  return best;
}

// ---- plot geometry shared by the volume and hero widgets (pure; y axis points up in "unit" coordinates)

const LABEL_GAP = 10;

/**
 * Choose a pixel scale s and origin (ox, oy) so that the origin, every tip, the far corner a + b of every
 * listed pair, and every label stay inside a W x H frame. The longest arrow is at most frac * W long.
 * labelW[i] is the label width in px. Returns { s, ox, oy }.
 */
export function fitView({ items, T, pairList, W, H, frac = 0.45, pad = 10, bottom = 26, top = 8, labelW, labelH = 17 }) {
  const lens = items.map((it) => length(it.p, T));
  const maxL = Math.max(...lens);
  const vec = items.map((it, i) => [lens[i] * Math.cos(it.angle * RAD), lens[i] * Math.sin(it.angle * RAD)]);
  const corners = pairList.map(([i, j]) => [vec[i][0] + vec[j][0], vec[i][1] + vec[j][1]]);
  const extents = (s) => {
    let minx = 0, maxx = 0, maxy = 0;
    items.forEach((it, i) => {
      const c = Math.cos(it.angle * RAD);
      const x = s * vec[i][0], y = s * vec[i][1];
      const w = (labelW ? labelW[i] : 60) + LABEL_GAP;
      minx = Math.min(minx, c < 0 ? x - w : x);
      maxx = Math.max(maxx, c >= 0 ? x + w : x);
      maxy = Math.max(maxy, y + labelH + 6);
    });
    for (const c of corners) {
      minx = Math.min(minx, s * c[0]); maxx = Math.max(maxx, s * c[0]); maxy = Math.max(maxy, s * c[1]);
    }
    return { minx, maxx, maxy };
  };
  let s = (frac * W) / maxL;
  for (let k = 0; k < 40; k++) {
    const e = extents(s);
    const r = Math.min(1, (W - 2 * pad) / (e.maxx - e.minx), (H - bottom - top) / e.maxy);
    if (r > 0.9995) break;
    s *= r;
  }
  const e = extents(s);
  const ox = W / 2 - (e.minx + e.maxx) / 2;
  return { s, ox, oy: H - bottom };
}

/**
 * Place label boxes just past the arrow tips, then separate overlaps. tips[i] = { x, y, L } in px,
 * widths[i] = text width. Returns boxes { i, w, h, cx, cy } (centers) kept inside [0, W] and above oy + 3.
 */
export function placeLabels({ items, tips, ox, oy, W, widths, rMin, h = 17 }) {
  const n = items.length;
  const clamp = (b, low = oy - 4) => {
    b.cx = Math.min(W - 2 - b.w / 2, Math.max(2 + b.w / 2, b.cx));
    b.cy = Math.min(low - b.h / 2, Math.max(2 + b.h / 2, b.cy));
  };
  const boxes = items.map((it, i) => {
    const a = it.angle * RAD, c = Math.cos(a), s = Math.sin(a);
    const r = Math.max(tips[i].L, rMin) + 9;
    const w = widths[i] + 6;
    const side = c >= 0 ? 1 : -1;
    return { i, w, h, cx: ox + r * c + (side * w / 2) * (0.6 + 0.4 * Math.abs(c)), cy: oy - r * s - (s * h) / 2 - 2 };
  });
  boxes.forEach((b) => clamp(b));
  for (let it = 0; it < 200; it++) {
    let moved = false;
    for (let m = 0; m < n; m++) {
      for (let k = m + 1; k < n; k++) {
        const A = boxes[m], B = boxes[k];
        const dx = (A.w + B.w) / 2 - Math.abs(A.cx - B.cx);
        const dy = (A.h + B.h) / 2 - Math.abs(A.cy - B.cy);
        if (dx > 0 && dy > -1) {
          const dir = A.cy <= B.cy ? -1 : 1;
          const push = (dy + 1) / 2 + 0.25;
          A.cy += dir * push; B.cy -= dir * push;
          moved = true;
        }
      }
    }
    for (const B of boxes) {
      for (const t of tips) {
        const dx = B.w / 2 + 10 - Math.abs(B.cx - t.x), dy = B.h / 2 + 10 - Math.abs(B.cy - t.y);
        if (dx > 0 && dy > 0) { B.cy = t.y - 10 - B.h / 2 - 1; moved = true; }
      }
    }
    boxes.forEach((b) => clamp(b));
    if (!moved) break;
  }
  const hits = (B) => {
    const x0 = B.cx - B.w / 2, x1 = B.cx + B.w / 2, y0 = B.cy - B.h / 2, y1 = B.cy + B.h / 2;
    if (x0 < 2 || x1 > W - 2 || y0 < 2 || y1 > oy + 3) return true;
    for (const O of boxes) {
      if (O !== B && Math.abs(O.cx - B.cx) < (O.w + B.w) / 2 && Math.abs(O.cy - B.cy) < (O.h + B.h) / 2) return true;
    }
    for (let k = 0; k < n; k++) {
      const t = tips[k];
      if (t.x > x0 - 9 && t.x < x1 + 9 && t.y > y0 - 9 && t.y < y1 + 9) return true;
      if (k === B.i) continue;
      for (let u = 0; u <= 1; u += 0.02) {
        const x = ox + (t.x - ox) * u, y = oy + (t.y - oy) * u;
        if (x > x0 - 2 && x < x1 + 2 && y > y0 - 2 && y < y1 + 2) return true;
      }
    }
    return false;
  };
  for (const B of boxes) {
    if (!hits(B)) continue;
    const t = tips[B.i], keep = { cx: B.cx, cy: B.cy };
    const cands = [];
    for (let dx = -2; dx <= 2; dx++) for (let dy = -3; dy <= 2; dy++) {
      cands.push([t.x + dx * (B.w / 2 + 8) * 0.8, t.y + dy * (B.h + 6) + (dy >= 0 ? B.h / 2 + 10 : -(B.h / 2 + 10))]);
    }
    cands.sort((p, q) => Math.hypot(p[0] - keep.cx, p[1] - keep.cy) - Math.hypot(q[0] - keep.cx, q[1] - keep.cy));
    let ok = false;
    for (const [cx, cy] of cands) { B.cx = cx; B.cy = cy; clamp(B, oy + 3); if (!hits(B)) { ok = true; break; } }
    if (!ok) { B.cx = keep.cx; B.cy = keep.cy; }
  }
  return boxes;
}

/**
 * Fit the view to what is drawn: the origin, every tip with a share of its label, and the far corner a + b of
 * each pair in pairList. Uniform scale, origin wherever the fit puts it. The frame is W wide and between
 * hMin and hMax tall (or hFixed). Returns { s, ox, oy, H }; the baseline sits `margin` above the bottom.
 */
export function fitContent({ items, T, pairList, W, hMin, hMax, hFixed, margin = 12, labelW, labelH = 17, labelShare = 0.1, leftShare = 0.7 }) {
  const lens = items.map((it) => length(it.p, T));
  const maxL = Math.max(...lens);
  const vec = items.map((it, i) => [lens[i] * Math.cos(it.angle * RAD), lens[i] * Math.sin(it.angle * RAD)]);
  const corners = pairList.map(([i, j]) => [vec[i][0] + vec[j][0], vec[i][1] + vec[j][1]]);
  const top = hFixed ? hFixed : hMax;
  const extents = (s) => {
    let minx = 0, maxx = 0, maxy = 0;
    items.forEach((it, i) => {
      const x = s * vec[i][0], y = s * vec[i][1];
      const w = ((labelW ? labelW[i] : 60) + LABEL_GAP);
      minx = Math.min(minx, x - (it.angle > 90 ? w * leftShare : 6));
      maxx = Math.max(maxx, x + (it.angle <= 90 ? w * labelShare : 6));
      maxy = Math.max(maxy, y + labelH + 6);
    });
    for (const c of corners) { minx = Math.min(minx, s * c[0]); maxx = Math.max(maxx, s * c[0]); maxy = Math.max(maxy, s * c[1]); }
    return { minx, maxx, maxy };
  };
  let s = (0.9 * W) / maxL;
  for (let k = 0; k < 60; k++) {
    const e = extents(s);
    const r = Math.min((W - 2 * margin) / (e.maxx - e.minx), (top - 2 * margin) / e.maxy);
    if (Math.abs(r - 1) < 0.0005) break;
    s *= r;
  }
  for (let k = 0; k < 200; k++) {
    const q = extents(s);
    if (q.maxx - q.minx <= W - 2 * margin && q.maxy <= top - 2 * margin) break;
    s *= 0.999;
  }
  const e = extents(s);
  const H = hFixed ? hFixed : Math.round(Math.min(hMax, Math.max(hMin, e.maxy + 2 * margin)));
  return { s, ox: margin - e.minx, oy: H - margin, H, content: { w: e.maxx - e.minx, h: e.maxy } };
}
