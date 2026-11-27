// Pure layout for the 2-D hero figure: scale, origin, label boxes, and axis titles for six arrows from the origin.
// Pixel coordinates have y pointing down; model coordinates have y pointing up. No DOM.
import { length } from './w-volume-lib.js';

const RAD = Math.PI / 180;
export const MARGIN = 8;
const HANDLE = 5.5;
const CLEAR = HANDLE + 3; // a label stays this far from every tip centre
const TITLE_H = 15;

/** Tip of arrow i in model units. */
export const tipUnit = (it, T) => {
  const L = length(it.p, T), a = it.angle * RAD;
  return [L * Math.cos(a), L * Math.sin(a)];
};

// ---- geometry helpers
const rect = (x, y, w, h) => ({ x, y, w, h });
const inflate = (r, d) => rect(r.x - d, r.y - d, r.w + 2 * d, r.h + 2 * d);
const rectsOverlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const circleHitsRect = (cx, cy, r, b) => {
  const nx = Math.min(b.x + b.w, Math.max(b.x, cx)), ny = Math.min(b.y + b.h, Math.max(b.y, cy));
  return Math.hypot(nx - cx, ny - cy) < r;
};
const inRect = (px, py, b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
/** Does the segment (x1, y1)-(x2, y2) touch the rectangle? Liang-Barsky clipping. */
function segHitsRect(x1, y1, x2, y2, b) {
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  for (const [p, q] of [[-dx, x1 - b.x], [dx, b.x + b.w - x1], [-dy, y1 - b.y], [dy, b.y + b.h - y1]]) {
    if (p === 0) { if (q < 0) return false; } else {
      const r = q / p;
      if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return true;
}
const polyHitsRect = (pts, b) => {
  let a0 = Infinity, a1 = -Infinity, c0 = Infinity, c1 = -Infinity;
  for (const [x, y] of pts) { if (x < a0) a0 = x; if (x > a1) a1 = x; if (y < c0) c0 = y; if (y > c1) c1 = y; }
  if (b.x > a1 || b.x + b.w < a0 || b.y > c1 || b.y + b.h < c0) return false;
  if (pts.some(([x, y]) => inRect(x, y, b))) return true;
  for (let k = 0; k < pts.length; k++) {
    const [x1, y1] = pts[k], [x2, y2] = pts[(k + 1) % pts.length];
    if (segHitsRect(x1, y1, x2, y2, b)) return true;
  }
  // rectangle wholly inside the polygon
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  let inside = false;
  for (let k = 0, m = pts.length - 1; k < pts.length; m = k++) {
    const [xi, yi] = pts[k], [xj, yj] = pts[m];
    if ((yi > cy) !== (yj > cy) && cx < ((xj - xi) * (cy - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const rectDist = (px, py, b) => {
  const nx = Math.min(b.x + b.w, Math.max(b.x, px)), ny = Math.min(b.y + b.h, Math.max(b.y, py));
  return Math.hypot(nx - px, ny - py);
};

// ---- label candidates around a tip (relative to the origin, y down)
const SIDES = { left: [-1, 0], right: [1, 0], above: [0, -1], below: [0, 1] };
const CAND_PER_SIDE = 3, CAND_MAX = 12, NODE_CAP = 400, COLLECT_CAP = 40;

function rawCandidates(tip, w, h, maxDist) {
  const [tx, ty] = tip;
  const gaps = maxDist <= 14 ? [9.5, 11, 13] : [9.5, 13, 18, 24, 30];
  const out = [];
  for (const side of Object.keys(SIDES)) {
    for (const gap of gaps) {
      for (let k = -4; k <= 4; k++) {
        let b;
        if (side === 'left') b = rect(tx - gap - w, ty + (k * h) / 4 - h / 2, w, h);
        else if (side === 'right') b = rect(tx + gap, ty + (k * h) / 4 - h / 2, w, h);
        else if (side === 'above') b = rect(tx + (k * w) / 4 - w / 2, ty - gap - h, w, h);
        else b = rect(tx + (k * w) / 4 - w / 2, ty + gap, w, h);
        const d = rectDist(tx, ty, b);
        if (d < CLEAR + 0.5 || d > maxDist) continue;
        out.push({ box: b, side, dist: d });
      }
    }
  }
  return out;
}

const crossings = (b) => (b.x < 0 && b.x + b.w > 0 ? 1 : 0) + (b.y < 0 && b.y + b.h > 0 ? 1 : 0);

/**
 * Lay out the figure in a W x H frame. items: [{ p, angle }]; labelW[i], labelH: label box size in px; titleW: widths of
 * the axis titles { left, right, top, bottom }. avoidPairs: index pairs whose parallelograms the titles stay clear of.
 * keepClear: index pairs whose parallelograms no label may touch (default: the same-gift pairs 0-1, 2-3, 4-5).
 * A label's nearest edge is at most 14 px (tier 1) or 30 px (tier 2) from its tip; tier 1 is used unless its scale is
 * below 0.8 times the tier-2 scale.
 * Returns { s, ox, oy, tier, tips: [{x, y}], labels: [{i, x, y, w, h, side, dist, crossings}], titles, W, H }
 * where each title is { x, y, w, h, anchor, side, box } (box top-left; x is the text anchor position).
 */
export function layoutHero({ items, T = 1, W, H, labelW, labelH = 17, titleW = {}, avoidPairs = [], keepClear }) {
  const n = items.length;
  const unit = items.map((it) => tipUnit(it, T));
  const pairsAll = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairsAll.push([i, j]);
  const clearPairs = keepClear || Array.from({ length: Math.floor(n / 2) }, (_, g) => [2 * g, 2 * g + 1]);
  const tw = { left: 40, right: 70, top: 55, bottom: 55, ...titleW };
  const maxW = W - 2 * MARGIN, maxH = H - 2 * MARGIN;

  // Extent of the origin, tips with handles, and all far corners at scale s (relative to the origin).
  const extent = (s) => {
    let x0 = -5, x1 = 5, y0 = -5, y1 = 5;
    for (const [ux, uy] of unit) {
      x0 = Math.min(x0, ux * s - HANDLE - 1); x1 = Math.max(x1, ux * s + HANDLE + 1);
      y0 = Math.min(y0, -uy * s - HANDLE - 1); y1 = Math.max(y1, -uy * s + HANDLE + 1);
    }
    for (const [i, j] of pairsAll) {
      const x = (unit[i][0] + unit[j][0]) * s, y = -(unit[i][1] + unit[j][1]) * s;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    return { x0, x1, y0, y1 };
  };
  const arrowsFit = (s) => { const e = extent(s); return e.x1 - e.x0 <= maxW && e.y1 - e.y0 <= maxH; };

  // Try to place all labels at scale s; collect = true returns the best of several solutions.
  function attempt(s, maxDist, collect) {
    const tips = unit.map(([x, y]) => [x * s, -y * s]);
    const e = extent(s);
    const polys = clearPairs.map(([i, j]) => [[0, 0], tips[i], [tips[i][0] + tips[j][0], tips[i][1] + tips[j][1]], tips[j]]);
    // A label prefers the side that faces away from its own gift's partner arrow, then away from the origin.
    const sidePenalty = (i, side) => {
      const d = SIDES[side], [tx, ty] = tips[i], len = Math.hypot(tx, ty) || 1;
      const face = (d[0] * tx + d[1] * ty) / len;
      const m = i ^ 1;
      if (m >= n) return (1 - face) * 2;
      const nx = -ty / len, ny = tx / len; // normal to arrow i
      const sg = Math.sign(nx * (tx - tips[m][0]) + ny * (ty - tips[m][1])) || 1;
      return (1 - sg * (d[0] * nx + d[1] * ny)) * 4 + (1 - face) * 2;
    };
    const cands = [];
    for (let i = 0; i < n; i++) {
      const tip = tips[i];
      const ok = rawCandidates(tip, labelW[i], labelH, maxDist).filter((c) => {
        const b = c.box;
        if (b.x < e.x1 - maxW || b.x + b.w > e.x0 + maxW || b.y < e.y1 - maxH || b.y + b.h > e.y0 + maxH) return false;
        if (circleHitsRect(0, 0, 5, b)) return false;
        for (let k = 0; k < n; k++) if (circleHitsRect(tips[k][0], tips[k][1], CLEAR, b)) return false;
        const bs = inflate(b, 1.5);
        for (let k = 0; k < n; k++) if (segHitsRect(0, 0, tips[k][0], tips[k][1], bs)) return false;
        const bi = inflate(b, 2);
        for (const pl of polys) if (polyHitsRect(pl, bi)) return false;
        return true;
      }).map((c) => ({ ...c, cross: crossings(c.box), cost: crossings(c.box) * 100 + c.dist + sidePenalty(i, c.side) }));
      ok.sort((a, b) => a.cost - b.cost);
      const per = {}, keep = [];
      for (const c of ok) { per[c.side] = (per[c.side] || 0) + 1; if (per[c.side] <= CAND_PER_SIDE) keep.push(c); }
      if (keep.length === 0) return null;
      cands.push(keep.slice(0, CAND_MAX));
    }
    const order = [...Array(n).keys()].sort((a, b) => cands[a].length - cands[b].length);
    const placed = [], pick = new Array(n);
    let nodes = 0, bestSol = null, leaves = 0, leafTries = 0;
    const fits = () => {
      let a0 = e.x0, a1 = e.x1, b0 = e.y0, b1 = e.y1;
      for (const p of placed) { a0 = Math.min(a0, p.box.x); a1 = Math.max(a1, p.box.x + p.box.w); b0 = Math.min(b0, p.box.y); b1 = Math.max(b1, p.box.y + p.box.h); }
      return a1 - a0 <= maxW && b1 - b0 <= maxH ? { a0, a1, b0, b1 } : null;
    };
    const leaf = () => {
      if (++leafTries > (collect ? 150 : 25)) return true;
      const f = fits();
      if (!f) return false;
      const ox = MARGIN + (maxW - (f.a1 - f.a0)) / 2 - f.a0, oy = MARGIN + (maxH - (f.b1 - f.b0)) / 2 - f.b0;
      const titles = placeTitles({ ox, oy, W, H, tw, tips, placed, s, unit, avoidPairs });
      if (!titles) return false;
      const cost = placed.reduce((a, p) => a + p.cross * 1000 + p.dist, 0);
      if (!bestSol || cost < bestSol.cost) bestSol = { s, ox, oy, titles, cost, placed: placed.map((p) => ({ i: p.i, box: { ...p.box }, side: p.side, dist: p.dist, cross: p.cross })) };
      return !collect || ++leaves >= COLLECT_CAP;
    };
    const dfs = (d) => {
      if (d === n) return leaf();
      if (++nodes > NODE_CAP * (collect ? 3 : 1)) return true;
      const i = order[d];
      for (const c of cands[i]) {
        if (placed.some((p) => rectsOverlap(inflate(c.box, 1), p.box))) continue;
        let a0 = e.x0, a1 = e.x1, b0 = e.y0, b1 = e.y1;
        for (const q of [...placed, { box: c.box }]) { a0 = Math.min(a0, q.box.x); a1 = Math.max(a1, q.box.x + q.box.w); b0 = Math.min(b0, q.box.y); b1 = Math.max(b1, q.box.y + q.box.h); }
        if (a1 - a0 > maxW || b1 - b0 > maxH) continue;
        placed.push({ i, box: c.box, side: c.side, dist: c.dist, cross: c.cross });
        if (dfs(d + 1)) return true;
        placed.pop();
      }
      return false;
    };
    dfs(0);
    return bestSol;
  }

  // Largest scale with a feasible placement: coarse scan down from the arrows-only bound, then a fine pass.
  function search(maxDist) {
    let hi = 4;
    for (let t = Math.min(W, H) * 1.5; t >= 4; t -= 2) if (arrowsFit(t)) { hi = t; break; }
    for (let c = hi; c >= 4; c -= 4) {
      if (!attempt(c, maxDist, false)) continue;
      for (let f = Math.min(c + 3.5, hi); f > c; f -= 0.5) if (attempt(f, maxDist, false)) { c = f; break; }
      return attempt(c, maxDist, true) || attempt(c, maxDist, false);
    }
    return null;
  }

  const cross = (r) => r.placed.reduce((a, p) => a + p.cross, 0);
  const r1 = search(14), r2 = search(30);
  let best, tier;
  if (r1 && (!r2 || (r1.s >= 0.8 * r2.s && cross(r1) <= cross(r2)))) { best = r1; tier = 1; } else if (r2) { best = r2; tier = 2; }
  if (!best) throw new Error('layoutHero: no fit');
  const { s, ox, oy } = best;
  const tips = unit.map(([x, y]) => ({ x: ox + x * s, y: oy - y * s }));
  const labels = best.placed.sort((a, b) => a.i - b.i).map((p) => ({ i: p.i, x: ox + p.box.x, y: oy + p.box.y, w: p.box.w, h: p.box.h, side: p.side, dist: p.dist, crossings: p.cross }));
  return { s, ox, oy, tier, tips, labels, titles: best.titles, W, H };
}

// Titles sit beside the ends of the axes, on the side that is clear of everything else.
function placeTitles({ ox, oy, W, H, tw, tips, placed, s, unit, avoidPairs }) {
  const abs = (b) => rect(ox + b.x, oy + b.y, b.w, b.h);
  const labelBoxes = placed.map((p) => abs(p.box));
  const polys = avoidPairs.map(([i, j]) => {
    const a = unit[i], b = unit[j];
    return [[ox, oy], [ox + a[0] * s, oy - a[1] * s], [ox + (a[0] + b[0]) * s, oy - (a[1] + b[1]) * s], [ox + b[0] * s, oy - b[1] * s]];
  });
  const clear = (box, withPolys) => {
    if (box.x < 2 || box.y < 2 || box.x + box.w > W - 2 || box.y + box.h > H - 2) return false;
    for (const l of labelBoxes) if (rectsOverlap(inflate(box, 1), l)) return false;
    for (const [tx, ty] of tips) {
      const x = ox + tx, y = oy + ty;
      if (circleHitsRect(x, y, CLEAR, box)) return false;
      if (segHitsRect(ox, oy, x, y, inflate(box, 1.5))) return false;
    }
    if (withPolys) for (const p of polys) if (polyHitsRect(p, box)) return false;
    return true;
  };
  const opts = {
    left: [[4, oy - 4 - TITLE_H, 'start', 'above'], [4, oy + 4, 'start', 'below']],
    right: [[W - 4 - tw.right, oy - 4 - TITLE_H, 'end', 'above'], [W - 4 - tw.right, oy + 4, 'end', 'below']],
    top: [[ox + 6, 3, 'start', 'right'], [ox - 6 - tw.top, 3, 'end', 'left']],
    bottom: [[ox + 6, H - 3 - TITLE_H, 'start', 'right'], [ox - 6 - tw.bottom, H - 3 - TITLE_H, 'end', 'left']],
  };
  const out = {};
  const taken = [];
  for (const name of ['left', 'right', 'top', 'bottom']) {
    let pick = null;
    for (const withPolys of [true, false]) {
      for (const [x, y, anchor, side] of opts[name]) {
        const box = rect(x, y, tw[name], TITLE_H);
        if (!clear(box, withPolys)) continue;
        if (taken.some((t) => rectsOverlap(t, box))) continue;
        pick = { x: anchor === 'start' ? x : x + tw[name], y, w: tw[name], h: TITLE_H, anchor, side, box, polysClear: withPolys };
        break;
      }
      if (pick) break;
    }
    if (!pick) return null;
    taken.push(pick.box);
    out[name] = pick;
  }
  return out;
}
