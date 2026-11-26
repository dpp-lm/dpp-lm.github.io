// Pure helpers for the frontier widget: scales, ticks, extents, labels, tooltip text.

export function linearScale(d0, d1, r0, r1) {
  const k = (r1 - r0) / (d1 - d0);
  return (v) => r0 + (v - d0) * k;
}

// Round a positive span/count to 1, 2, or 5 times a power of ten.
export function niceStep(span, count) {
  const raw = span / Math.max(1, count);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return m * p;
}

// Tick values that cover [lo, hi] (first <= lo, last >= hi), about `count` intervals.
export function niceTicks(lo, hi, count = 5) {
  if (!(hi > lo)) { hi = lo + 1; }
  const step = niceStep(hi - lo, count);
  const first = Math.floor(lo / step + 1e-9) * step;
  const out = [];
  for (let i = 0; i < 50; i++) {
    const v = +(first + i * step).toPrecision(12);
    out.push(v);
    if (v >= hi - step * 1e-9) break;
  }
  return { ticks: out, step };
}

export function decimalsForStep(step) {
  const d = -Math.floor(Math.log10(step) + 1e-9);
  return Math.max(0, d);
}

export function formatTick(v, step) {
  if (Math.abs(v) < step * 1e-6) v = 0;
  return v.toFixed(decimalsForStep(step));
}

// Extent of the points including their interval bars, padded like matplotlib's default margins.
export function extentOf(task, selector) {
  let lo = Infinity, hi = -Infinity;
  for (const m of task.methods) for (const p of m.points) {
    const v = p[selector], e = p[selector + "_ci"] || 0;
    lo = Math.min(lo, v - e); hi = Math.max(hi, v + e);
  }
  const pad = (selector === "x" ? 0.05 : task.y_margin) * (hi - lo);
  return { lo: lo - pad, hi: hi + pad };
}

// Paper formatting of knob values (plot_*.py label_fn): baselines str(float), PoolDPP .2g / .3g / g.
export function pyG(v, sig) {
  // Python format(v, ".<sig>g")
  if (v === 0) return "0";
  const exp = Math.floor(Math.log10(Math.abs(v)));
  let s;
  if (exp < -4 || exp >= sig) {
    s = v.toExponential(sig - 1).replace(/\.?0+e/, "e");
    return s.replace(/e([+-])(\d)$/, "e$10$2");
  }
  s = v.toFixed(Math.max(0, sig - 1 - exp));
  if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s;
}
export function baselineLabel(v) {
  return Number.isInteger(v) ? v.toFixed(1) : String(v);
}

export function knobText(method, point) {
  return method.knob + " = " + point.label;
}

const DECIMALS = { intrinsic: [2, 2], ambrosia: [3, 3], gsm8k: [2, 3] };
export function fmtValue(taskId, axis, v) {
  const d = DECIMALS[taskId][axis === "x" ? 0 : 1];
  return v.toFixed(d);
}
export function fmtInterval(taskId, axis, v, ci) {
  return fmtValue(taskId, axis, v) + " ± " + fmtValue(taskId, axis, ci);
}

// Tooltip content as plain lines, so tests can compare it with data/results.json.
export function tooltipLines(task, method, point) {
  const held = method.held_local_T != null ? " (pool T' = " + method.held_local_T + ")" : "";
  const axisName = (a) => task[a].label.split(" (")[0].split(":")[0];
  return [
    method.name,
    knobText(method, point) + held,
    axisName("x") + ": " + fmtInterval(task.id, "x", point.x, point.x_ci),
    axisName("y") + ": " + fmtInterval(task.id, "y", point.y, point.y_ci),
    point.n + " pools, 95% interval",
  ];
}

// Greedy label thinning: boxes are {x,y,w,h}; keep a box unless it overlaps one already kept.
export function thinLabels(boxes) {
  const kept = [];
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  return boxes.map((b) => {
    if (kept.some((k) => hit(k, b))) return false;
    kept.push(b);
    return true;
  });
}

// Ticks inside [lo, hi], at least `min` of them: refine the step until enough fall inside.
export function ticksWithin(lo, hi, count = 5, min = 3) {
  let c = count, r;
  for (let i = 0; i < 12; i++, c += 1) {
    r = niceTicks(lo, hi, c);
    const inside = r.ticks.filter((v) => v >= lo - 1e-9 && v <= hi + 1e-9);
    if (inside.length >= min) return { ticks: inside, step: r.step };
  }
  return { ticks: r.ticks, step: r.step };
}

// Nearest of `pts` ({x, y, ...} in px) to (px, py) within `maxDist`, or null.
export function nearestPoint(pts, px, py, maxDist = 24) {
  let best = null, bd = maxDist;
  for (const p of pts) {
    const d = Math.hypot(p.x - px, p.y - py);
    if (d <= bd) { bd = d; best = p; }
  }
  return best;
}

// Label placement. labels: [{x, y, w, h}] (marker position and text box size). obstacles: [{x, y, w, h}]
// (markers, interval bars, line samples). bounds: {x0, y0, x1, y1}. Each label tries 8 directions at 2 gaps.
// A candidate may not overlap a placed label or leave the bounds; its score is the number of obstacles it
// overlaps. Labels with the fewest obstacle-free candidates go first. Returns [{cx, cy} | null] (box center).
const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
const GAPS = [4, 11];
const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export function placeLabels(labels, obstacles, bounds, pad = 1.5) {
  const cands = labels.map((l) => {
    const out = [];
    for (const g of GAPS) for (const [sx, sy] of DIRS) {
      const cx = l.x + sx * (l.w / 2 + g), cy = l.y + sy * (l.h / 2 + g);
      const box = { x: cx - l.w / 2 - pad, y: cy - l.h / 2, w: l.w + 2 * pad, h: l.h };
      if (box.x < bounds.x0 || box.y < bounds.y0 || box.x + box.w > bounds.x1 || box.y + box.h > bounds.y1) continue;
      let score = 0;
      for (const o of obstacles) if (hits(box, o)) score++;
      out.push({ cx, cy, box, score });
    }
    return out;
  });
  const free = cands.map((c) => c.filter((k) => k.score === 0).length);
  const order = labels.map((_, i) => i).sort((a, b) => free[a] - free[b] || cands[a].length - cands[b].length || a - b);
  const placed = [], res = labels.map(() => null);
  for (const i of order) {
    let best = null;
    for (const k of cands[i]) {
      if (placed.some((p) => hits(k.box, p))) continue;
      if (!best || k.score < best.score) best = k;
    }
    if (best) { res[i] = { cx: best.cx, cy: best.cy }; placed.push(best.box); }
  }
  return res;
}
