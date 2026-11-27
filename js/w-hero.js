// Widget "hero": six answers as arrows from the origin of a plane with two named scales; the cycle selects pairs and shows each pair's parallelogram and probabilities.
import { HERO_TOY, TOY_PROMPT, HERO_AXES } from './toy-hero.js';
import { length, pairDet, normalizer, indepPairs } from './w-volume-lib.js';
import { layoutHero } from './w-hero-lib.js';

const NS = 'http://www.w3.org/2000/svg';
const RAD = Math.PI / 180;
const FONT = 12;
const T = 1;
const INTERVAL = 5000;
const TWEEN = 900;
// Alternates two wordings of one gift (small angle) and two different gifts (large angle).
const SEQUENCE = [[0, 1], [0, 2], [2, 3], [1, 4], [4, 5], [2, 5]];
const REDUCED_PAIR = [0, 2];
const coarse = () => matchMedia('(pointer: coarse)').matches;
const pct = (x) => (x > 0 && x < 0.0005 ? '<0.1%' : (100 * x).toFixed(1) + '%');

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
  const items = HERO_TOY.map((t) => ({ ...t }));
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
  const svg = el('svg', { class: 'wh-svg', role: 'group', 'aria-label': 'Six answers as arrows from the origin. Horizontal scale: object to experience. Vertical scale: generic to personal.' });
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
  let view = null, vecU = null; // view = layoutHero result, vecU = unit-scale vectors of the drawn parallelogram
  let arrows = [], labelEls = [], areaEl = null, originEl = null;
  const unitVec = (i) => {
    const L = length(items[i].p, T), a = items[i].angle * RAD;
    return [L * Math.cos(a), L * Math.sin(a)];
  };

  function measure() {
    W = Math.max(250, Math.min(420, Math.floor(plotBox.clientWidth || 380)));
    H = Math.round(0.76 * W);
    const ctx = h('canvas').getContext('2d');
    ctx.font = `600 ${FONT}px ${getComputedStyle(root).fontFamily || 'sans-serif'}`;
    widths = items.map((it) => ctx.measureText(it.short).width + 2);
    ctx.font = `400 ${FONT}px ${getComputedStyle(root).fontFamily || 'sans-serif'}`;
    const titleW = {};
    for (const k of Object.keys(HERO_AXES)) titleW[k] = ctx.measureText(HERO_AXES[k]).width + 2;
    view = layoutHero({ items, T, W, H, labelW: widths, labelH: FONT + 5, titleW, avoidPairs: SEQUENCE });
  }

  function build() {
    measure();
    svg.textContent = '';
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    const { ox, oy } = view;
    svg.append(el('line', { class: 'wh-axis', x1: 0, x2: W, y1: oy, y2: oy }), el('line', { class: 'wh-axis', x1: ox, x2: ox, y1: 0, y2: H }));
    areaEl = el('polygon', { class: 'wh-area' }); svg.append(areaEl);
    for (const [k, tt] of Object.entries(view.titles)) {
      svg.append(el('text', { class: 'wh-axt', x: tt.x, y: tt.y + tt.h - 4, 'text-anchor': tt.anchor }, HERO_AXES[k]));
    }
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
    // A label more than 16 px from its tip gets a dashed leader to the nearest point of its box.
    for (const b of view.labels) {
      if (b.dist <= 16) continue;
      const tp = view.tips[b.i];
      const nx = Math.min(b.x + b.w, Math.max(b.x, tp.x)), ny = Math.min(b.y + b.h, Math.max(b.y, tp.y));
      svg.append(el('line', { class: 'wh-leader', x1: tp.x, y1: tp.y, x2: nx, y2: ny }));
    }
    labelEls = items.map((it, i) => {
      const b = view.labels[i];
      const t = el('text', { class: 'wh-label', 'data-i': i, 'font-size': FONT, x: b.x + b.w / 2, y: b.y + b.h / 2 + FONT * 0.35, 'text-anchor': 'middle' }, it.short);
      svg.append(t);
      t.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') state.userPaused = true; choose(i); sync(); });
      return t;
    });
    vecU = state.sel.map(unitVec);
    place();
    markSelected();
    setText();
  }

  // Only the parallelogram moves: the arrows and labels are fixed by the layout.
  function place() {
    const { s, ox, oy, tips } = view;
    originEl.setAttribute('cx', ox); originEl.setAttribute('cy', oy);
    arrows.forEach((a, i) => {
      const t = tips[i];
      for (const n of [a.hit, a.shaft]) { n.setAttribute('x1', ox); n.setAttribute('y1', oy); n.setAttribute('x2', t.x); n.setAttribute('y2', t.y); }
      for (const n of [a.hh, a.hd]) { n.setAttribute('cx', t.x); n.setAttribute('cy', t.y); }
    });
    const [A, B] = vecU.map(([x, y]) => [x * s, -y * s]);
    areaEl.setAttribute('points', `${ox},${oy} ${ox + A[0]},${oy + A[1]} ${ox + A[0] + B[0]},${oy + A[1] + B[1]} ${ox + B[0]},${oy + B[1]}`);
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
