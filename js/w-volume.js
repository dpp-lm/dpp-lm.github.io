// Widget "volume": the squared area spanned by two quality-scaled embeddings is the 2-DPP score of a pair.
import { TOY, TOY_PROMPT, TOY_AXES } from './toy.js';
import { bindRange } from './ui-range.js';
import { quality, length, sin2, dppPairs, indepPairs, topPair, mostDifferentPair, placeLabels } from './w-volume-lib.js';

const NS = 'http://www.w3.org/2000/svg';
const RAD = Math.PI / 180;
const T_MIN = 0.3, T_MAX = 5, T_DEFAULT = 1;
const DEFAULT_SEL = [0, 1];
const FONT = 12;
// Arrows stay in the first quadrant, where a larger angle between two arrows always means a larger area.
const A_MIN = 2, A_MAX = 88;

const sliderToT = (v) => T_MIN * Math.pow(T_MAX / T_MIN, v / 1000);
const tToSlider = (T) => (1000 * Math.log(T / T_MIN)) / Math.log(T_MAX / T_MIN);
const pct = (x) => (x > 0 && x < 0.0005 ? '<0.1%' : (100 * x).toFixed(1) + '%');
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
function num(x) {
  if (x === 0) return '0';
  if (x >= 0.01) return x.toFixed(x >= 1 ? 2 : 3);
  const [m, e] = x.toExponential(1).split('e');
  return `${m}×10${[...String(parseInt(e, 10))].map((c) => SUP[c]).join('')}`;
}

function el(tag, attrs = {}, text) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
}
function h(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function mount(root) {
  const items = TOY.map((t) => ({ ...t }));
  const state = { T: T_DEFAULT, sel: [...DEFAULT_SEL], expanded: false };
  let hint = null;
  const narrow = () => matchMedia('(max-width: 640px)').matches;
  const coarse = () => matchMedia('(pointer: coarse)').matches;
  const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const resetAngles = () => items.forEach((it, i) => { it.angle = TOY[i].angle; });

  root.classList.add('w-volume');
  root.textContent = '';

  // ---- controls (one row above the plot)
  const controls = h('div', 'wv-controls');
  const tBlock = h('div', 'wv-tblock');
  const tLabel = h('label', 'wv-tlabel fig-label');
  tLabel.htmlFor = 'wv-t-' + Math.random().toString(36).slice(2, 7);
  const tVal = h('output', 'wv-tval fig-num');
  tLabel.append(h('span', null, 'Global temperature T'), tVal);
  const slider = h('input');
  slider.type = 'range'; slider.min = '0'; slider.max = '1000'; slider.step = '1'; slider.id = tLabel.htmlFor;
  bindRange(slider);
  const ends = h('div', 'wv-ends fig-note');
  ends.append(h('span', null, 'favors quality'), h('span', null, 'favors diversity'));
  tBlock.append(tLabel, slider, ends);
  const btns = h('div', 'wv-btns');
  const bSame = h('button', null, 'Same gift, two wordings');
  const bTop = h('button', null, 'Most likely pair');
  const bDiff = h('button', null, 'Most different pair');
  const bReset = h('button', null, 'Reset');
  for (const b of [bSame, bTop, bDiff, bReset]) b.type = 'button';
  btns.append(bSame, bTop, bDiff, bReset);
  controls.append(tBlock, btns);

  // ---- panels
  const grid = h('div', 'wv-grid');
  const plotPanel = h('div', 'wv-plotpanel');
  const plotBox = h('div', 'wv-plotbox');
  const svg = el('svg', { class: 'wv-svg', role: 'group', 'aria-label': `Six answers as arrows from the origin. Horizontal: ${TOY_AXES.x.toLowerCase()}. Vertical: ${TOY_AXES.y.toLowerCase()}.` });
  plotBox.append(svg);
  const plotNote = h('p', 'wv-help fig-note', 'Select two arrows or drag a tip. Length is the square root of quality, relative to the longest arrow.');
  const readout = h('div', 'wv-readout');
  plotPanel.append(plotBox, plotNote, readout);
  const side = h('div', 'wv-side');
  const listBox = h('div', 'wv-listbox');
  side.append(listBox);
  grid.append(plotPanel, side);
  root.append(controls, grid);

  // ---- geometry
  let geo = { W: 0, H: 0 };
  let view = null; // current { W, H, s, ox, oy, T }
  let anim = null;
  let drag = null;
  const measure = h('canvas').getContext('2d');
  const labelWidths = () => {
    const font = getComputedStyle(root).fontFamily || 'sans-serif';
    measure.font = `600 ${FONT}px ${font}`;
    return items.map((it) => measure.measureText(it.short).width);
  };

  // The plot is a square of side W, with the origin at its lower left.
  function frame() {
    return { W: Math.max(260, Math.min(SIDE_MAX, Math.floor(plotBox.clientWidth || 320))) };
  }
  // One fixed frame for every pair, drag angle, and T. Scaling all lengths by one factor leaves the 2-DPP unchanged,
  // so lengths are drawn relative to the longest arrow, which keeps R pixels. With angles in [A_MIN, A_MAX], a far
  // corner lies within REACH * R of the origin along each axis, where REACH = 1 + the second-longest relative
  // length at T_MAX. GUT holds the axis titles, left of the vertical axis and below the horizontal one.
  const REACH = (() => { const l = items.map((it) => length(it.p, T_MAX)).sort((a, b) => b - a); return 1 + l[1] / l[0]; })();
  const MARGIN = 12, GUT = 18, SIDE_MAX = 440;
  function viewAt(T) {
    const { W } = frame();
    const R = (W - GUT - MARGIN) / REACH;
    return { W, H: W, s: R / Math.max(...items.map((it) => length(it.p, T))), ox: GUT, oy: W - GUT, T };
  }
  const tipAt = (i, v) => {
    const L = length(items[i].p, v.T) * v.s;
    const a = items[i].angle * RAD;
    return { x: v.ox + L * Math.cos(a), y: v.oy - L * Math.sin(a), L };
  };

  function render() {
    const W = frame().W, H = view.H;
    geo = { W, H };
    const v = view;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W);
    svg.setAttribute('height', Math.round(H));
    const active = document.activeElement;
    const keep = svg.contains(active) && active.dataset ? active.dataset.i : null;
    svg.textContent = '';
    const { ox, oy } = v;
    const [sa, sb] = state.sel;
    svg.append(el('line', { class: 'wv-axis', x1: ox, y1: oy, x2: W, y2: oy }));
    svg.append(el('line', { class: 'wv-axis', x1: ox, y1: oy, x2: ox, y2: 0 }));
    svg.append(el('text', { class: 'wv-axt', x: W - 2, y: oy + 14, 'text-anchor': 'end' }, TOY_AXES.x));
    svg.append(el('text', { class: 'wv-axt', transform: `translate(${ox - 6} 2) rotate(-90)`, 'text-anchor': 'end' }, TOY_AXES.y));

    const tips = items.map((_, i) => tipAt(i, v));
    const A = tips[sa], B = tips[sb];
    const pts = [[ox, oy], [A.x, A.y], [A.x + B.x - ox, A.y + B.y - oy], [B.x, B.y]];
    svg.append(el('polygon', { class: 'wv-area', points: pts.map((p) => p.join(',')).join(' ') }));
    const areaPx = Math.abs((A.x - ox) * (B.y - oy) - (A.y - oy) * (B.x - ox));
    const areaText = areaPx > 12000 ? el('text', { class: 'wv-areatext', 'text-anchor': 'middle' }, `area² ${num(quality(items[sa].p, state.T) * quality(items[sb].p, state.T) * sin2(items[sa], items[sb]))}`) : null;
    if (areaText) svg.append(areaText);

    const widths = labelWidths();
    const boxes = placeLabels({ items, tips, ox, oy, W, widths, rMin: Math.max(34, 0.09 * W), h: FONT + 5 });
    if (areaText) {
      // On the diagonal of the parallelogram, at the spot nearest its center that is clear of the answer labels and tips.
      const tw = 7.2 * areaText.textContent.length, th = 16;
      const clear = ([cx, cy]) => boxes.every((b) => Math.abs(b.cx - cx) >= (b.w + tw) / 2 || Math.abs(b.cy - cy) >= (b.h + th) / 2)
        && tips.every((t) => Math.abs(t.x - cx) >= tw / 2 + 9 || Math.abs(t.y - cy) >= th / 2 + 9);
      const spots = [0.5, 0.6, 0.4, 0.7, 0.3, 0.8].map((u) => [ox + (pts[2][0] - ox) * u, oy + (pts[2][1] - oy) * u]);
      const [cx, cy] = spots.find(clear) || spots[0];
      areaText.setAttribute('x', cx); areaText.setAttribute('y', cy + 4);
    }

    const order = items.map((_, i) => i).sort((a, b) => (state.sel.includes(a) ? 1 : 0) - (state.sel.includes(b) ? 1 : 0));
    for (const i of order) {
      const sel = state.sel.includes(i);
      const t = tips[i];
      const g = el('g', {
        class: 'wv-arrow' + (sel ? ' is-sel' : ''),
        tabindex: 0, role: 'slider', 'data-i': i,
        'aria-label': `${items[i].short}, probability ${pct(items[i].p)}`,
        'aria-valuemin': A_MIN, 'aria-valuemax': A_MAX, 'aria-valuenow': Math.round(items[i].angle),
        'aria-valuetext': `${Math.round(items[i].angle)} degrees${sel ? ', selected' : ''}`,
      });
      g.append(el('line', { class: 'wv-hit', x1: ox, y1: oy, x2: t.x, y2: t.y }));
      g.append(el('line', { class: 'wv-shaft', x1: ox, y1: oy, x2: t.x, y2: t.y }));
      g.append(el('circle', { class: 'wv-hhit', cx: t.x, cy: t.y, r: coarse() ? 22 : 15 }));
      g.append(el('circle', { class: 'wv-ring', cx: t.x, cy: t.y, r: 11 }));
      g.append(el('circle', { class: 'wv-handle', cx: t.x, cy: t.y, r: 6.5 }));
      svg.append(g);
      bindArrow(g, i);
    }
    svg.append(el('circle', { class: 'wv-origin', cx: ox, cy: oy, r: 3 }));

    const top = el('g');
    for (const b of boxes) {
      const i = b.i, sel = state.sel.includes(i);
      const t0 = tips[i];
      const nx = Math.min(b.cx + b.w / 2, Math.max(b.cx - b.w / 2, t0.x)), ny = Math.min(b.cy + b.h / 2, Math.max(b.cy - b.h / 2, t0.y));
      if (Math.hypot(nx - t0.x, ny - t0.y) > 16) top.append(el('line', { class: 'wv-leader', x1: t0.x, y1: t0.y, x2: nx, y2: ny }));
      const bg = el('rect', { class: 'wv-labelbg', x: b.cx - b.w / 2, y: b.cy - b.h / 2, width: b.w, height: b.h, rx: 3, 'data-i': i });
      const t = el('text', { class: 'wv-label' + (sel ? ' is-sel' : ''), 'font-size': FONT, x: b.cx - (b.w - 6) / 2, y: b.cy + FONT * 0.35, 'data-i': i, 'data-testid': 'label' }, items[i].short);
      top.append(bg, t);
      for (const n of [bg, t]) n.addEventListener('pointerdown', (e) => { e.preventDefault(); select(i); });
    }
    svg.append(top);
    if (keep != null && keep !== '') svg.querySelector(`.wv-arrow[data-i="${keep}"]`)?.focus({ preventScroll: true });
  }

  // The frame never moves. Only a change of T is animated, by easing the arrow lengths to the new T.
  function refreshPlot(animate) {
    if (anim) { cancelAnimationFrame(anim.raf); anim = null; }
    const to = viewAt(state.T);
    if (!view || !animate || reduced() || view.T === state.T || view.W !== to.W) { view = to; render(); return; }
    const fromT = view.T, t0 = performance.now(), D = 250;
    const step = (now) => {
      const u = Math.min(1, (now - t0) / D), e = u * u * (3 - 2 * u);
      view = viewAt(fromT + (state.T - fromT) * e);
      render();
      if (u < 1) anim.raf = requestAnimationFrame(step); else anim = null;
    };
    anim = { raf: requestAnimationFrame(step) };
  }

  // ---- interaction
  function bindArrow(g, i) {
    g.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      drag = { i, id: e.pointerId };
      select(i);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);
    });
    g.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setAngle(i, items[i].angle + (e.key === 'ArrowLeft' ? 2 : -2));
        update(true);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select(i);
      }
    });
  }
  function pointerAngle(e) {
    const r = svg.getBoundingClientRect();
    const x = (e.clientX - r.left) * (geo.W / r.width);
    const y = (e.clientY - r.top) * (geo.H / r.height);
    return Math.atan2(view.oy - y, x - view.ox) / RAD;
  }
  function setAngle(i, a) { items[i].angle = Math.min(A_MAX, Math.max(A_MIN, a)); }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    setAngle(drag.i, pointerAngle(e));
    update(false);
  }
  function onEnd(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onEnd);
    window.removeEventListener('pointercancel', onEnd);
    update(false);
  }
  // The less recently selected arrow is released.
  function select(i) {
    if (i !== state.sel[1]) state.sel = [state.sel[1], i];
    update(true);
  }

  function update(animate = false) {
    refreshPlot(animate);
    renderReadout();
    renderList();
    tVal.textContent = state.T.toFixed(2);
    slider.setAttribute('aria-valuetext', 'T = ' + state.T.toFixed(2));
    bDiff.hidden = (() => { const m = mostDifferentPair(items), t = topPair(items, state.T); return m.i === t.i && m.j === t.j; })();
  }

  // ---- readout
  function renderReadout() {
    const [ia, ib] = state.sel;
    const a = items[ia], b = items[ib];
    const T = state.T;
    const ka = quality(a.p, T), kb = quality(b.p, T);
    const s2 = sin2(a, b);
    const area = ka * kb * s2;
    const { z } = dppPairs(items, T);
    const theta = Math.abs(a.angle - b.angle);
    readout.textContent = '';
    readout.append(h('div', 'wv-h fig-h', 'Selected pair'));
    const names = h('ul', 'wv-names');
    for (const [it, k] of [[a, ka], [b, kb]]) {
      const li = h('li');
      li.append(h('span', 'wv-text', `“${it.text}”`), h('span', 'wv-meta', `p ${pct(it.p)}, κ ${num(k)}`));
      names.append(li);
    }
    const eq = h('div', 'wv-eq');
    const cell = (label, value, sub, cls) => {
      const c = h('div', 'wv-cell' + (cls ? ' ' + cls : ''));
      c.append(h('div', 'wv-cl', label), h('div', 'wv-cv', value), h('div', 'wv-cs', sub));
      return c;
    };
    eq.append(
      cell('Quality', num(ka * kb), 'κ(a) × κ(b)'),
      h('div', 'wv-op', '×'),
      cell('Diversity', num(s2), `sin² of ${theta.toFixed(0)}°`),
      h('div', 'wv-op', '='),
      cell('Squared area', num(area), 'det(L)', 'is-area'),
    );
    const prob = h('div', 'wv-prob');
    const pv = h('div', 'wv-pv', pct(area / z));
    prob.append(h('div', 'wv-cl', 'Probability under the 2-DPP'), pv,
      h('div', 'wv-cs', `squared area ${num(area)} / Z ${num(z)} (Z sums all 15 pairs)`));
    readout.append(names, eq, prob);
  }

  // ---- list of pairs
  function renderList() {
    const { rows } = dppPairs(items, state.T);
    const ind = indepPairs(items);
    const indMap = new Map(ind.rows.map((r) => [r.i * 10 + r.j, r.prob]));
    let mx = ind.same;
    for (const r of rows) mx = Math.max(mx, r.prob, indMap.get(r.i * 10 + r.j));
    listBox.textContent = '';
    listBox.append(h('div', 'wv-h fig-h', 'All 15 pairs, by 2-DPP probability'));
    const head = h('div', 'wv-row wv-head');
    const hd = h('span', 'wv-pd'); hd.append('2-DPP');
    const hi = h('span', 'wv-pi'); hi.append('independent');
    head.append(h('span', 'wv-pn', 'Pair'), h('span', 'wv-bars'), hd, hi);
    listBox.append(head);
    const list = h('div', 'wv-list');
    const [sa, sb] = [...state.sel].sort((x, y) => x - y);
    const barsOf = (a, b) => {
      const t = h('span', 'wv-bars');
      const mk = (cls, v) => { const f = h('i', 'wv-fill ' + cls); f.style.width = (100 * v / mx).toFixed(2) + '%'; return f; };
      if (a != null) t.append(mk('wv-sw-dpp', a));
      if (b != null) t.append(mk('wv-sw-ind', b));
      if (a == null) t.classList.add('wv-single');
      return t;
    };
    const collapsed = narrow() && !state.expanded;
    const keep = new Set(rows.slice(0, 5).map((r) => `${r.i},${r.j}`).concat([`${sa},${sb}`]));
    for (const r of rows) {
      if (collapsed && !keep.has(`${r.i},${r.j}`)) continue;
      const iv = indMap.get(r.i * 10 + r.j);
      const sel = r.i === sa && r.j === sb;
      const btn = h('button', 'wv-row btn-plain' + (sel ? ' is-sel' : ''));
      btn.type = 'button';
      btn.dataset.pair = `${r.i},${r.j}`;
      btn.setAttribute('aria-pressed', sel ? 'true' : 'false');
      btn.title = `${items[r.i].short} + ${items[r.j].short}`;
      btn.append(h('span', 'wv-pn', `${items[r.i].short} + ${items[r.j].short}`), barsOf(r.prob, iv), h('span', 'wv-pd', pct(r.prob)), h('span', 'wv-pi', pct(iv)));
      btn.addEventListener('click', () => { state.sel = [r.i, r.j]; update(true); });
      list.append(btn);
    }
    if (narrow()) {
      const more = h('button', 'wv-more', state.expanded ? 'Show fewer pairs' : 'Show all 15 pairs');
      more.type = 'button';
      more.setAttribute('aria-expanded', state.expanded ? 'true' : 'false');
      more.addEventListener('click', () => { state.expanded = !state.expanded; renderList(); });
      list.append(more);
    }
    const same = h('div', 'wv-row wv-same');
    same.append(h('span', 'wv-pn', 'The same answer twice'), barsOf(null, ind.same), h('span', 'wv-pd', ''), h('span', 'wv-pi', pct(ind.same)));
    list.append(same);
    listBox.append(list);
  }

  // ---- controls
  slider.addEventListener('input', () => { state.T = sliderToT(+slider.value); update(true); });
  bSame.addEventListener('click', () => { state.sel = [0, 1]; update(true); });
  bTop.addEventListener('click', () => { const t = topPair(items, state.T); state.sel = [t.i, t.j]; update(true); });
  bDiff.addEventListener('click', () => { const m = mostDifferentPair(items); state.sel = [m.i, m.j]; update(true); });
  bReset.addEventListener('click', () => {
    resetAngles(); state.T = T_DEFAULT; state.sel = [...DEFAULT_SEL];
    slider.value = String(Math.round(tToSlider(T_DEFAULT)));
    update(true);
  });

  // First-view hint: the Board game tip swings 12 degrees and back, then stops.
  const HINT_I = 4;
  function stopHint() { if (hint) { cancelAnimationFrame(hint.raf); items[HINT_I].angle = hint.base; hint = null; update(false); } }
  function playHint() {
    if (reduced() || hint || drag) return;
    const base = items[HINT_I].angle, t0 = performance.now(), D = 1200;
    hint = { base, raf: 0 };
    const step = (now) => {
      if (!hint) return;
      const u = Math.min(1, (now - t0) / D);
      items[HINT_I].angle = base - 12 * Math.sin(Math.PI * u);
      update(false);
      if (u < 1) hint.raf = requestAnimationFrame(step); else { items[HINT_I].angle = base; hint = null; update(false); }
    };
    hint.raf = requestAnimationFrame(step);
  }
  for (const ev of ['pointerdown', 'keydown']) root.addEventListener(ev, () => { if (hint) stopHint(); }, true);
  matchMedia('(max-width: 640px)').addEventListener?.('change', () => renderList());

  slider.value = String(Math.round(tToSlider(T_DEFAULT)));
  update();
  if (typeof IntersectionObserver !== 'undefined' && !reduced()) {
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); setTimeout(playHint, 400); } }, { threshold: 0.6 });
    io.observe(plotBox);
  }
  if (typeof ResizeObserver !== 'undefined') {
    let last = geo.W;
    new ResizeObserver(() => {
      const w = frame().W;
      if (w !== last && !drag) { last = w; update(); }
    }).observe(plotBox);
  }
  root.dataset.prompt = TOY_PROMPT;
}
