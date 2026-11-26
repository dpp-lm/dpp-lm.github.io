// Widget "hero": six answers as arrows that cycle through pairs, each pair's parallelogram and probabilities.
import { TOY, TOY_PROMPT } from './toy.js';
import { length, pairDet, normalizer, indepPairs, fitContent, placeLabels } from './w-volume-lib.js';

const NS = 'http://www.w3.org/2000/svg';
const RAD = Math.PI / 180;
const FONT = 12;
const T = 1;
const INTERVAL = 5000;
const TWEEN = 900;
// Alternates similar pairs (small angle) and different pairs (large angle).
const SEQUENCE = [[0, 1], [0, 2], [2, 3], [1, 4], [4, 5], [2, 5]];
// Every pair a visitor can select; the fixed view fits all of their parallelograms.
const ALL_PAIRS = TOY.flatMap((_, i) => TOY.map((_, j) => [i, j]).filter(([, j]) => j > i));
const REDUCED_PAIR = [0, 2];
const coarse = () => matchMedia('(pointer: coarse)').matches;
const pct = (x) => (100 * x).toFixed(1) + '%';

const el = (tag, attrs = {}, text) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};
const h = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export function mount(root) {
  const items = TOY.map((t) => ({ ...t }));
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const z = normalizer(items, T);
  const ind = new Map(indepPairs(items).rows.map((r) => [r.i * 10 + r.j, r.prob]));
  const probOf = ([i, j]) => {
    const a = Math.min(i, j), b = Math.max(i, j);
    return { dpp: pairDet(items[a], items[b], T) / z, ind: ind.get(a * 10 + b) };
  };

  root.classList.add('w-hero');
  root.textContent = '';
  const plotBox = h('div', 'wh-plot');
  const svg = el('svg', { class: 'wh-svg', role: 'group', 'aria-label': 'Six answers as arrows from the origin' });
  plotBox.append(svg);
  const line = h('p', 'wh-line');
  line.setAttribute('aria-live', 'off');
  const names = h('span', 'wh-names');
  const pD = h('span', 'wh-num'), pI = h('span', 'wh-num');
  const sD = h('span', 'wh-stat'); sD.append(h('span', 'wh-lab', 'Probability under the DPP'), pD);
  const sI = h('span', 'wh-stat'); sI.append(h('span', 'wh-lab', 'In two independent draws'), pI);
  line.append(names, sD, sI);
  // Both labels share one grid cell, so the button keeps the width of the longer one.
  const play = h('button');
  play.type = 'button';
  const playLab = h('span', 'wh-playlab'), lPause = h('span', null, 'Pause'), lPlay = h('span', null, 'Play');
  playLab.append(lPause, lPlay);
  play.append(playLab);
  const caption = h('p', 'wh-caption fig-note', `Prompt: “${TOY_PROMPT}” A DPP favors sets that span different directions.`);
  const capline = h('div', 'wh-capline');
  capline.append(caption, play);
  root.append(plotBox, line, capline);

  // ---- geometry: one fixed view fits every arrow, label, and pair parallelogram, so only the parallelogram moves
  const state = { sel: [...(reduced() ? REDUCED_PAIR : SEQUENCE[0])], step: 0, userPaused: false, hoverPaused: false, visible: true };
  let timer = null, tween = null;
  let W = 0, H = 0, widths = [];
  let view = null, vecU = null; // view = { s, ox, oy }, vecU = unit-scale vectors of the drawn parallelogram
  let arrows = [], labelEls = [], leaders = [], areaEl = null, axisEl = null, originEl = null;
  const unitVec = (i) => {
    const L = length(items[i].p, T), a = items[i].angle * RAD;
    return [L * Math.cos(a), L * Math.sin(a)];
  };

  function measure() {
    W = Math.max(250, Math.min(420, Math.floor(plotBox.clientWidth || 380)));
    const ctx = h('canvas').getContext('2d');
    ctx.font = `600 ${FONT}px ${getComputedStyle(root).fontFamily || 'sans-serif'}`;
    widths = items.map((it) => ctx.measureText(it.short).width);
    view = fitContent({ items, T, pairList: ALL_PAIRS, W, hMin: 0.45 * W, hMax: 0.75 * W, labelW: widths, labelH: FONT + 5 });
    H = view.H;
  }

  function build() {
    measure();
    svg.textContent = '';
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    axisEl = el('line', { class: 'wh-axis' }); svg.append(axisEl);
    areaEl = el('polygon', { class: 'wh-area' }); svg.append(areaEl);
    arrows = items.map((it, i) => {
      const g = el('g', { class: 'wh-arrow', tabindex: 0, role: 'button', 'data-i': i, 'aria-label': `${it.short}, probability ${pct(it.p)}` });
      const hit = el('line', { class: 'wh-hit' }), shaft = el('line', { class: 'wh-shaft' });
      const hh = el('circle', { class: 'wh-hhit', r: coarse() ? 22 : 15 }), hd = el('circle', { class: 'wh-handle', r: 5.5 });
      g.append(hit, shaft, hh, hd);
      svg.append(g);
      g.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { state.hoverPaused = true; choose(i); sync(); } });
      g.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { state.hoverPaused = false; sync(); } });
      g.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') { state.userPaused = true; choose(i); sync(); } });
      g.addEventListener('focus', () => { state.hoverPaused = true; choose(i); sync(); });
      g.addEventListener('blur', () => { state.hoverPaused = false; sync(); });
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(i); } });
      return { g, hit, shaft, hh, hd };
    });
    originEl = el('circle', { class: 'wh-origin', r: 3 }); svg.append(originEl);
    leaders = items.map(() => { const l = el('line', { class: 'wh-leader' }); svg.append(l); return l; });
    labelEls = items.map((it, i) => {
      const t = el('text', { class: 'wh-label', 'data-i': i, 'font-size': FONT }, it.short);
      svg.append(t);
      t.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') state.userPaused = true; choose(i); sync(); });
      return t;
    });
    vecU = state.sel.map(unitVec);
    place();
    markSelected();
    setText();
  }

  // Position every element from the view and the (possibly mid-tween) parallelogram vectors.
  function place() {
    const { s, ox, oy } = view;
    axisEl.setAttribute('x1', 0); axisEl.setAttribute('x2', W); axisEl.setAttribute('y1', oy); axisEl.setAttribute('y2', oy);
    originEl.setAttribute('cx', ox); originEl.setAttribute('cy', oy);
    const tips = items.map((_, i) => { const [ux, uy] = unitVec(i); return { x: ox + ux * s, y: oy - uy * s, L: Math.hypot(ux, uy) * s }; });
    arrows.forEach((a, i) => {
      const t = tips[i];
      for (const n of [a.hit, a.shaft]) { n.setAttribute('x1', ox); n.setAttribute('y1', oy); n.setAttribute('x2', t.x); n.setAttribute('y2', t.y); }
      for (const n of [a.hh, a.hd]) { n.setAttribute('cx', t.x); n.setAttribute('cy', t.y); }
    });
    const [A, B] = vecU.map(([x, y]) => [x * s, -y * s]);
    areaEl.setAttribute('points', `${ox},${oy} ${ox + A[0]},${oy + A[1]} ${ox + A[0] + B[0]},${oy + A[1] + B[1]} ${ox + B[0]},${oy + B[1]}`);
    const boxes = placeLabels({ items, tips, ox, oy, W, widths, rMin: 34, h: FONT + 5 });
    for (const b of boxes) {
      const t = tips[b.i];
      labelEls[b.i].setAttribute('x', b.cx - (b.w - 6) / 2); labelEls[b.i].setAttribute('y', b.cy + FONT * 0.35);
      const nx = Math.min(b.cx + b.w / 2, Math.max(b.cx - b.w / 2, t.x)), ny = Math.min(b.cy + b.h / 2, Math.max(b.cy - b.h / 2, t.y));
      const l = leaders[b.i], far = Math.hypot(nx - t.x, ny - t.y) > 16;
      l.style.display = far ? '' : 'none';
      if (far) { l.setAttribute('x1', t.x); l.setAttribute('y1', t.y); l.setAttribute('x2', nx); l.setAttribute('y2', ny); }
    }
  }
  function markSelected() {
    arrows.forEach((a, i) => a.g.classList.toggle('is-sel', state.sel.includes(i)));
    labelEls.forEach((t, i) => t.classList.toggle('is-sel', state.sel.includes(i)));
    for (const i of state.sel) svg.insertBefore(arrows[i].g, originEl);
  }
  function setText() {
    const [i, j] = state.sel;
    const p = probOf(state.sel);
    names.textContent = `${items[i].short} + ${items[j].short}`;
    pD.textContent = pct(p.dpp);
    pI.textContent = pct(p.ind);
    root.dataset.pair = state.sel.map((k) => items[k].id).join(',');
  }

  function goto(pair) {
    state.sel = [...pair];
    markSelected();
    setText();
    if (tween) cancelAnimationFrame(tween);
    const toVec = pair.map(unitVec);
    if (reduced()) { vecU = toVec; tween = null; place(); return; }
    const fromVec = vecU.map((v) => [...v]), t0 = performance.now();
    const L = (a, b, e) => a + (b - a) * e;
    const step = (now) => {
      const u = Math.min(1, (now - t0) / TWEEN), e = u * u * (3 - 2 * u);
      vecU = toVec.map((t, k) => [L(fromVec[k][0], t[0], e), L(fromVec[k][1], t[1], e)]);
      place();
      if (u < 1) tween = requestAnimationFrame(step); else tween = null;
    };
    tween = requestAnimationFrame(step);
  }
  // Selecting arrow i pairs it with the most recently selected arrow.
  function choose(i) {
    if (i === state.sel[1]) return;
    goto([state.sel[1], i]);
  }

  // ---- cycle
  const running = () => !reduced() && !state.userPaused && !state.hoverPaused && state.visible && !document.hidden;
  function sync() {
    clearTimeout(timer); timer = null;
    const paused = reduced() || state.userPaused || state.hoverPaused;
    lPause.classList.toggle('is-off', paused);
    lPlay.classList.toggle('is-off', !paused);
    if (running()) timer = setTimeout(tick, INTERVAL);
  }
  function tick() {
    state.step = (state.step + 1) % SEQUENCE.length;
    goto(SEQUENCE[state.step]);
    sync();
  }
  play.addEventListener('click', () => {
    if (reduced()) { state.step = (state.step + 1) % SEQUENCE.length; goto(SEQUENCE[state.step]); return; }
    state.userPaused = !state.userPaused;
    state.hoverPaused = false;
    if (!state.userPaused) { tick(); } else sync();
  });
  document.addEventListener('visibilitychange', sync);
  if (typeof IntersectionObserver !== 'undefined') {
    new IntersectionObserver((es) => { state.visible = es[es.length - 1].isIntersecting; sync(); }).observe(root);
  }
  if (typeof ResizeObserver !== 'undefined') {
    let last = 0;
    new ResizeObserver(() => { const w = Math.floor(plotBox.clientWidth); if (w && w !== last) { last = w; build(); } }).observe(plotBox);
  }
  build();
  sync();
}
