import { linearScale, ticksWithin, nearestPoint, formatTick, extentOf, tooltipLines, placeLabels } from "./w-frontier-lib.js";

const SVGNS = "http://www.w3.org/2000/svg";
const DATA_URL = new URL("../data/results.json", import.meta.url);
function el(tag, attrs, parent, text) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
}
function h(tag, cls, parent, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
}

export async function mount(root) {
  root.classList.add("w-frontier");
  let data;
  try {
    data = await (await fetch(DATA_URL)).json();
  } catch (e) {
    h("p", "w-frontier-error", root, "The measured points could not be loaded.");
    throw e;
  }
  const tasks = data.tasks;
  let cur = 0;
  const hidden = new Set(); // method ids switched off

  const uid = "wf" + Math.random().toString(36).slice(2, 7);
  const tabs = h("div", "w-frontier-tabs seg seg-fill", root);
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Task");
  const tabBtns = tasks.map((t, i) => {
    const b = h("button", "w-frontier-tab", tabs);
    b.type = "button";
    b.setAttribute("role", "tab");
    b.id = `${uid}-tab-${i}`;
    b.setAttribute("aria-controls", `${uid}-panel`);
    h("span", "w-frontier-tab-name", b, t.tab);
    h("span", "w-frontier-tab-sub", b, t.dataset);
    b.addEventListener("click", () => select(i));
    b.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const j = (i + d + tasks.length) % tasks.length;
      select(j);
      tabBtns[j].focus();
    });
    return b;
  });

  const panel = h("div", "w-frontier-panel", root);
  panel.id = `${uid}-panel`;
  panel.setAttribute("role", "tabpanel");
  const title = h("h3", "w-frontier-title fig-h", panel);
  const legend = h("div", "w-frontier-legend legend", panel);
  legend.setAttribute("role", "group");
  legend.setAttribute("aria-label", "Methods");
  const wrap = h("div", "w-frontier-chart", panel);
  const svg = el("svg", { role: "group", class: "w-frontier-svg" }, wrap);
  const tip = h("div", "w-frontier-tip", wrap);
  tip.setAttribute("role", "status");
  tip.hidden = true;
  const caption = h("p", "w-frontier-caption fig-note", panel);
  const result = h("p", "w-frontier-result", panel);

  function select(i) {
    cur = i;
    hidden.clear();
    tabBtns.forEach((b, j) => {
      b.setAttribute("aria-selected", String(j === i));
      b.tabIndex = j === i ? 0 : -1;
    });
    panel.setAttribute("aria-labelledby", `${uid}-tab-${i}`);
    buildStatic();
    draw();
  }

  function swatch(m, parent) {
    const s = el("svg", { class: "w-frontier-swatch", viewBox: "0 0 40 10", width: 40, height: 10, "aria-hidden": "true" }, parent);
    el("line", { x1: 1, x2: 39, y1: 5, y2: 5, stroke: `var(${m.color})`, "stroke-width": 2, "stroke-dasharray": m.dash.join(" ") }, s);
    el("circle", { cx: 20, cy: 5, r: 3, fill: `var(${m.color})` }, s);
    el("line", { x1: 4, x2: 36, y1: 9, y2: 1, class: "w-frontier-strike" }, s);
  }

  function buildStatic() {
    const t = tasks[cur];
    title.textContent = t.title;
    legend.textContent = "";
    for (const m of t.methods) {
      const b = h("button", "legend-item btn-plain", legend);
      b.type = "button";
      b.dataset.method = m.id;
      b.setAttribute("aria-pressed", "true");
      swatch(m, b);
      h("span", "", b, `${m.name} (${m.knob.replace("'", "\u2032")})`);
      b.addEventListener("click", () => {
        if (hidden.has(m.id)) hidden.delete(m.id); else hidden.add(m.id);
        b.setAttribute("aria-pressed", String(!hidden.has(m.id)));
        hideTip();
        draw();
      });
    }
    caption.textContent = t.caption;
    result.textContent = "";
    h("strong", "", result, "Result. ");
    result.append(t.result);
  }

  // ---- tooltip ----
  let tipOwner = null;
  function showTip(m, p, circle) {
    const t = tasks[cur];
    const lines = tooltipLines(t, m, p);
    tip.textContent = "";
    const head = h("div", "w-frontier-tip-head", tip);
    swatch(m, head);
    h("span", "", head, lines[0]);
    for (const l of lines.slice(1)) h("div", "w-frontier-tip-line", tip, l);
    tip.hidden = false;
    tipOwner = circle;
    const cx = +circle.dataset.px, cy = +circle.dataset.py;
    const W = wrap.clientWidth, H = wrap.clientHeight;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = cx + 14, top = cy - th - 12;
    if (left + tw > W - 4) left = cx - tw - 14;
    left = Math.max(4, Math.min(left, W - tw - 4));
    if (top < 4) top = Math.min(cy + 14, H - th - 4);
    top = Math.max(4, Math.min(top, H - th - 4));
    tip.style.left = left + "px";
    tip.style.top = top + "px";
    svg.querySelectorAll(".is-on").forEach((n) => n.classList.remove("is-on"));
    circle.parentNode.querySelector(".w-frontier-dot").classList.add("is-on");
    circle.parentNode.querySelector(".w-frontier-ring").classList.add("is-on");
  }
  function hideTip() {
    tip.hidden = true;
    tipOwner = null;
    svg.querySelectorAll(".is-on").forEach((n) => n.classList.remove("is-on"));
  }

  let pickList = [], hiddenLabels = 0;
  // ---- chart ----
  function draw() {
    const t = tasks[cur];
    const W = Math.max(300, Math.round(wrap.clientWidth || root.clientWidth || 640));
    const narrow = W < 520;
    const H = Math.round(Math.min(480, Math.max(300, W * (narrow ? 0.95 : 0.6))));
    const M = { l: narrow ? 50 : 62, r: 14, t: 20, b: narrow ? 50 : 52 };
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);
    svg.setAttribute("aria-label", `${t.title}: ${t.methods.length} methods`);
    svg.textContent = "";
    hideTip();

    const ex = extentOf(t, "x"), ey = extentOf(t, "y");
    const tx = ticksWithin(ex.lo, ex.hi, narrow ? 3 : 7), ty = ticksWithin(ey.lo, ey.hi, narrow ? 4 : 6);
    const sx = linearScale(ex.lo, ex.hi, M.l, W - M.r);
    const sy = linearScale(ey.lo, ey.hi, H - M.b, M.t);

    const grid = el("g", { class: "w-frontier-grid" }, svg);
    const clip = el("clipPath", { id: `${uid}-clip` }, svg);
    el("rect", { x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b }, clip);
    for (const v of tx.ticks) {
      el("line", { x1: sx(v), x2: sx(v), y1: M.t, y2: H - M.b }, grid);
      el("text", { x: sx(v), y: H - M.b + 16, "text-anchor": "middle", class: "w-frontier-tick" }, grid, formatTick(v, tx.step));
    }
    for (const v of ty.ticks) {
      el("line", { x1: M.l, x2: W - M.r, y1: sy(v), y2: sy(v) }, grid);
      el("text", { x: M.l - 7, y: sy(v) + 4, "text-anchor": "end", class: "w-frontier-tick" }, grid, formatTick(v, ty.step));
    }
    el("rect", { x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b, class: "w-frontier-frame" }, svg);
    const xt = el("text", { x: (M.l + W - M.r) / 2, y: H - 8, "text-anchor": "middle", class: "w-frontier-axis" }, svg, `${t.x.label} \u2192 ${t.x.dir}`);
    const yt = el("text", { transform: `translate(14 ${(M.t + H - M.b) / 2}) rotate(-90)`, "text-anchor": "middle", class: "w-frontier-axis" }, svg, `${t.y.label} \u2192 ${t.y.dir}`);
    // Fall back to the bare arrow when the direction does not fit the plot.
    if (xt.getComputedTextLength() > W - M.l - M.r) xt.textContent = `${t.x.label} \u2192`;
    if (yt.getComputedTextLength() > H - M.t - M.b) yt.textContent = `${t.y.label} \u2192`;
    const obstacles = [];

    const labelNodes = [];
    pickList = [];
    for (const m of t.methods) {
      if (hidden.has(m.id)) continue;
      const g = el("g", { class: "w-frontier-method", "data-method": m.id, style: `--c: var(${m.color})` }, svg);
      const bars = el("g", { class: "w-frontier-bars", "clip-path": `url(#${uid}-clip)` }, g);
      el("path", {
        d: m.points.map((p, i) => (i ? "L" : "M") + sx(p.x).toFixed(2) + " " + sy(p.y).toFixed(2)).join(" "),
        class: "w-frontier-line", "stroke-dasharray": m.dash.join(" "), "clip-path": `url(#${uid}-clip)`,
      }, g);
      for (let i = 1; i < m.points.length; i++) {
        const a = m.points[i - 1], b = m.points[i];
        const x0 = sx(a.x), y0 = sy(a.y), x1 = sx(b.x), y1 = sy(b.y), n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4);
        for (let k = 0; k <= n; k++) obstacles.push({ x: x0 + (x1 - x0) * k / n - 1.5, y: y0 + (y1 - y0) * k / n - 1.5, w: 3, h: 3 });
      }
      m.points.forEach((p) => {
        const x = sx(p.x), y = sy(p.y), ex_ = p.x_ci * (W - M.l - M.r) / (ex.hi - ex.lo), ey_ = p.y_ci * (H - M.t - M.b) / (ey.hi - ey.lo);
        const c = 3;
        obstacles.push({ x: x - ex_, y: y - 1, w: 2 * ex_, h: 2 }, { x: x - 1, y: y - ey_, w: 2, h: 2 * ey_ },
          { x: x - ex_ - 1, y: y - c, w: 2, h: 2 * c }, { x: x + ex_ - 1, y: y - c, w: 2, h: 2 * c },
          { x: x - c, y: y - ey_ - 1, w: 2 * c, h: 2 }, { x: x - c, y: y + ey_ - 1, w: 2 * c, h: 2 });
        el("path", { d: `M${x - ex_} ${y}H${x + ex_}M${x - ex_} ${y - c}V${y + c}M${x + ex_} ${y - c}V${y + c}M${x} ${y - ey_}V${y + ey_}M${x - c} ${y - ey_}H${x + c}M${x - c} ${y + ey_}H${x + c}`, class: "w-frontier-bar" }, bars);
      });
      m.points.forEach((p, i) => {
        const x = sx(p.x), y = sy(p.y);
        const pg = el("g", { class: "w-frontier-pt" }, g);
        el("circle", { cx: x, cy: y, r: 8, class: "w-frontier-ring" }, pg);
        el("circle", { cx: x, cy: y, r: 3.2, class: "w-frontier-dot", "data-i": i }, pg);
        const hit = el("circle", {
          cx: x, cy: y, r: 6, class: "w-frontier-hit", tabindex: 0, "data-i": i,
          "data-px": x, "data-py": y, role: "img", "data-method": m.id,
          "aria-label": tooltipLines(t, m, p).join(", "),
        }, pg);
        hit.addEventListener("focus", () => showTip(m, p, hit));
        hit.addEventListener("blur", () => { if (tipOwner === hit) hideTip(); });
        hit.addEventListener("keydown", (e) => { if (e.key === "Escape") { hideTip(); hit.blur(); } });
        pickList.push({ x, y, m, p, hit });
        obstacles.push({ x: x - 4, y: y - 4, w: 8, h: 8 });
        const lt = el("text", { x, y, "text-anchor": "middle", class: "w-frontier-pl", style: "fill: var(--c)" }, g, p.label);
        labelNodes.push({ node: lt, x, y });
      });
    }
    // Place each label at the free position nearest its point; hide it only when every position overlaps another label.
    // Phones show no point labels; the tooltip keeps every value.
    labelNodes.forEach(({ node }) => node.setAttribute("visibility", "hidden"));
    hiddenLabels = 0;
    if (!narrow) {
      const labels = labelNodes.map(({ node, x, y }) => ({ x, y, w: node.getComputedTextLength(), h: 12 }));
      // the label's own marker and bars are obstacles for it too; they are in `obstacles`
      const pos = placeLabels(labels, obstacles, { x0: M.l, y0: M.t, x1: W - M.r, y1: H - M.b });
      labelNodes.forEach(({ node }, i) => {
        if (!pos[i]) { hiddenLabels++; return; }
        node.setAttribute("x", pos[i].cx);
        node.setAttribute("y", pos[i].cy + 4);
        node.removeAttribute("visibility");
      });
    }
    svg.dataset.hiddenLabels = hiddenLabels;
  }

  function pick(e) {
    const r = svg.getBoundingClientRect();
    const k = r.width ? parseFloat(svg.getAttribute("width")) / r.width : 1;
    return nearestPoint(pickList, (e.clientX - r.left) * k, (e.clientY - r.top) * k, 24 * k);
  }
  svg.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    const n = pick(e);
    if (n) { if (tipOwner !== n.hit) showTip(n.m, n.p, n.hit); } else hideTip();
  });
  svg.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse" && !svg.contains(document.activeElement)) hideTip(); });
  svg.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    const n = pick(e);
    if (n) showTip(n.m, n.p, n.hit); else hideTip();
  });
  document.addEventListener("pointerdown", (e) => { if (!wrap.contains(e.target)) hideTip(); });

  let lastW = 0;
  new ResizeObserver(() => {
    const w = Math.round(wrap.clientWidth);
    if (w && w !== lastW) { lastW = w; draw(); }
  }).observe(wrap);
  select(0);
}
