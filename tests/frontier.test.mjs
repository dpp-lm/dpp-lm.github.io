import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { niceTicks, formatTick, extentOf, linearScale, pyG, baselineLabel, tooltipLines, thinLabels, ticksWithin, nearestPoint } from "../js/w-frontier-lib.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const results = JSON.parse(fs.readFileSync(path.join(here, "../data/results.json"), "utf8"));
const SRC = "/Users/prada/Documents/neurips_dpp/cr_from_euler/pool-dpp/analysis";
const srcExists = fs.existsSync(path.join(SRC, "intrinsic_points.json"));

test("ticks cover the data range", () => {
  for (const [lo, hi] of [[-9.1, 0.3], [0.21, 0.26], [0.33, 0.43], [-480, -20], [0.85, 0.93], [-35, -9]]) {
    const { ticks, step } = niceTicks(lo, hi, 5);
    assert.ok(ticks[0] <= lo + 1e-12 && ticks[ticks.length - 1] >= hi - 1e-12, `${lo},${hi}`);
    assert.ok(ticks.length >= 3 && ticks.length <= 9, `count ${ticks.length}`);
    assert.ok(/^[125]$/.test(String(+(step / Math.pow(10, Math.floor(Math.log10(step)))).toFixed(6))));
  }
  assert.deepEqual(niceTicks(0, 1, 5).ticks, [0, 0.2, 0.4, 0.6, 0.8, 1]);
});

test("tick and axis ranges for every task contain all points and bars", () => {
  for (const t of results.tasks) for (const a of ["x", "y"]) {
    const e = extentOf(t, a);
    const { ticks } = niceTicks(e.lo, e.hi, 5);
    for (const m of t.methods) for (const p of m.points) {
      assert.ok(p[a] - p[a + "_ci"] >= e.lo && p[a] + p[a + "_ci"] <= e.hi);
      assert.ok(ticks[0] <= p[a] && p[a] <= ticks[ticks.length - 1]);
    }
  }
});

test("tick formatting", () => {
  assert.equal(formatTick(-1e-9, 0.1), "0.0");
  assert.equal(formatTick(0.25, 0.05), "0.25");
  assert.equal(formatTick(-20, 10), "-20");
  assert.equal(formatTick(0.3, 0.1), "0.3");
});

test("scale maps ends", () => {
  const s = linearScale(2, 4, 10, 110);
  assert.equal(s(2), 10); assert.equal(s(4), 110); assert.equal(s(3), 60);
});

test("knob formatting matches the paper's rules (python format specs)", () => {
  assert.equal(pyG(0.428571, 2), "0.43");
  assert.equal(pyG(0.666667, 2), "0.67");
  assert.equal(pyG(0.818182, 2), "0.82");
  assert.equal(pyG(1.22222, 2), "1.2");
  assert.equal(pyG(1.22222, 3), "1.22");
  assert.equal(pyG(0.428571, 3), "0.429");
  assert.equal(pyG(7.5, 2), "7.5");
  assert.equal(pyG(500, 3), "500");
  assert.equal(pyG(10, 2), "10");
  assert.equal(baselineLabel(1), "1.0");
  assert.equal(baselineLabel(0.6), "0.6");
  assert.equal(baselineLabel(1.25), "1.25");
});

test("labels in results.json follow the rules", () => {
  for (const t of results.tasks) for (const m of t.methods) for (const p of m.points) {
    if (m.knob === "T'") assert.equal(p.label, baselineLabel(p.knob));
    else {
      const sig = t.id === "gsm8k" ? 3 : 2;
      const exp = t.id === "intrinsic" && p.knob >= 10 ? pyG(p.knob, 6) : pyG(p.knob, sig);
      assert.equal(p.label, exp, `${t.id} ${m.name} ${p.knob}`);
    }
  }
});

test("thinLabels drops overlapping boxes only", () => {
  const r = thinLabels([{ x: 0, y: 0, w: 10, h: 5 }, { x: 5, y: 2, w: 10, h: 5 }, { x: 20, y: 0, w: 5, h: 5 }]);
  assert.deepEqual(r, [true, false, true]);
});

test("tooltip text carries method, knob, values and n", () => {
  const t = results.tasks[1], m = t.methods[3], p = m.points[0];
  const lines = tooltipLines(t, m, p);
  assert.equal(lines[0], "PoolDPP-MAP");
  assert.ok(lines[1].startsWith("T = 10"));
  assert.ok(lines[1].includes("pool T' = 1.5"));
  assert.ok(lines[4].startsWith("100 pools"));
});

function keyOrder(raw) {
  const out = {}; let cur = null;
  for (const line of raw.split("\n")) {
    let m = line.match(/^ "([^"]+)": \{/);
    if (m) { cur = m[1]; out[cur] = []; continue; }
    m = line.match(/^  "([^"]+)": \{/);
    if (m && cur) out[cur].push(m[1]);
  }
  return out;
}
const names = { Ancestral: "Ancestral", kmeans: "k-Means", naive: "Naive-DPP", samp: "PoolDPP-Samp", map: "PoolDPP-MAP" };
const idToKey = { ancestral: "Ancestral", kmeans: "k-Means", naive: "Naive-DPP", samp: "PoolDPP-Samp", map: "PoolDPP-MAP" };

test("results.json matches the source points exactly (set, order, full precision)", { skip: srcExists ? false : `source JSON not found at ${SRC}` }, () => {
  // Methods the plot scripts draw, re-derived independently from the scripts' headline lists.
  const drawn = {
    intrinsic: ["Ancestral", "k-Means", "PoolDPP-Samp", "PoolDPP-MAP"],
    ambrosia: ["Ancestral", "k-Means", "PoolDPP-Samp", "PoolDPP-MAP"],
    gsm8k: ["Ancestral", "Naive-DPP", "k-Means", "PoolDPP-Samp", "PoolDPP-MAP"],
  };
  for (const t of results.tasks) {
    const raw = fs.readFileSync(path.join(SRC, `${t.id}_points.json`), "utf8");
    const src = JSON.parse(raw);
    const order = keyOrder(raw);  // JSON.parse sorts integer-like keys first ("1" before "0.6"), so read the file order
    assert.deepEqual(t.methods.map((m) => idToKey[m.id]), drawn[t.id]);
    for (const m of t.methods) {
      const s = src[idToKey[m.id]];
      const keys = order[idToKey[m.id]];
      assert.deepEqual([...keys].sort(), Object.keys(s).sort());
      assert.equal(m.points.length, keys.length, `${t.id} ${m.name} count`);
      m.points.forEach((p, i) => {
        const v = s[keys[i]];
        assert.equal(p.knob, parseFloat(keys[i]));
        assert.equal(p.x, v.x_mean); assert.equal(p.y, v.y_mean);
        assert.equal(p.x_ci, v.x_ci); assert.equal(p.y_ci, v.y_ci);
        assert.equal(p.n, v.n);
      });
    }
  }
});

test("every task has structure the widget needs", () => {
  assert.equal(results.tasks.length, 3);
  for (const t of results.tasks) {
    for (const k of ["title", "tab", "dataset", "caption", "result", "K", "pools"]) assert.ok(t[k] != null, k);
    assert.ok(t.x.label && t.x.meaning && t.y.label && t.y.meaning);
    assert.ok(!/[–—]/.test(JSON.stringify(t)));
  }
  assert.match(results.provenance.commit, /^[0-9a-f]{7,}$/);
});

test("ticksWithin gives at least three ticks inside the range", () => {
  for (const t of results.tasks) for (const a of ["x", "y"]) {
    const e = extentOf(t, a);
    for (const c of [3, 4, 7]) {
      const { ticks } = ticksWithin(e.lo, e.hi, c, 3);
      assert.ok(ticks.length >= 3, `${t.id} ${a} ${c}: ${ticks}`);
      assert.ok(ticks.every((v) => v >= e.lo - 1e-9 && v <= e.hi + 1e-9));
    }
  }
});

test("nearestPoint picks the closest within the radius", () => {
  const pts = [{ x: 0, y: 0, id: "a" }, { x: 10, y: 0, id: "b" }];
  assert.equal(nearestPoint(pts, 7, 3, 24).id, "b");
  assert.equal(nearestPoint(pts, 4, 0, 24).id, "a");
  assert.equal(nearestPoint(pts, 100, 100, 24), null);
});

import { placeLabels } from "../js/w-frontier-lib.js";
test("placeLabels avoids overlaps and keeps labels in bounds", () => {
  const labels = [{ x: 50, y: 50, w: 20, h: 12 }, { x: 55, y: 52, w: 20, h: 12 }, { x: 90, y: 50, w: 20, h: 12 }];
  const pos = placeLabels(labels, [], { x0: 0, y0: 0, x1: 200, y1: 100 });
  assert.ok(pos.every(Boolean));
  const box = (l, p) => ({ x: p.cx - l.w / 2, y: p.cy - l.h / 2, w: l.w, h: l.h });
  const bs = labels.map((l, i) => box(l, pos[i]));
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const a = bs[i], b = bs[j];
    assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));
  }
  for (const b of bs) assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 200 && b.y + b.h <= 100);
});
test("placeLabels hides a label when no position fits", () => {
  const pos = placeLabels([{ x: 5, y: 5, w: 100, h: 12 }], [], { x0: 0, y0: 0, x1: 20, y1: 20 });
  assert.equal(pos[0], null);
});
