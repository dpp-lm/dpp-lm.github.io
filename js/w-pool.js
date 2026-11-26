// Pool widget: PoolDPP-Samp on the toy model (six answers, K = 2), with the exact target and the exact error curve.
import { mulberry32 } from './vendor/dpp.js';
import * as L from './w-pool-lib.js';
import { bindRange } from './ui-range.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const DATA_URL = new URL('../data/pool-toy.json', import.meta.url);

const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const s = (tag, attrs = {}, text) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (n) => String(n).split('').map((c) => SUP[c]).join('');
const fmt = (x, d = 3) => x.toFixed(d);
function sci(x) {
  if (x === 0) return '0';
  if (x >= 0.01) return x.toFixed(3);
  const e = Math.floor(Math.log10(x));
  const m = x / Math.pow(10, e);
  return `${m.toFixed(1)}×10${sup(e)}`;
}
const niceMax = (x) => {
  const steps = [0.05, 0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 1];
  return steps.find((v) => v >= x - 1e-12) ?? 1;
};

export function mount(el) {
  const state = { ni: L.N_GRID.indexOf(16), T: 2, seed: 3, avg: false, hover: null, data: null, dataError: false };
  let pool = null;
  const uid = 'wp' + Math.random().toString(36).slice(2, 7);

  el.classList.add('w-pool');
  el.textContent = '';

  // ---------- controls ----------
  const controls = h('div', 'w-pool-controls');
  const fN = h('div', 'w-pool-field');
  const lN = h('label', 'fig-label', 'Pool size N');
  lN.htmlFor = uid + '-n';
  const outN = h('output', 'fig-num');
  outN.htmlFor = uid + '-n';
  const rN = h('input');
  rN.type = 'range'; rN.id = uid + '-n'; rN.min = 0; rN.max = L.N_GRID.length - 1; rN.step = 1; rN.value = state.ni;
  bindRange(rN);
  const rHead = h('div', 'w-pool-fieldhead');
  rHead.append(lN, outN);
  const scale = h('div', 'w-pool-rscale fig-note'); scale.append(h('span', null, '2'), h('span', null, '512'));
  fN.append(rHead, rN, scale);

  const segment = (legend, name, items, checked, cls) => {
    const fs = h('fieldset', 'w-pool-seg ' + (cls || ''));
    fs.append(h('legend', 'fig-label', legend));
    const wrap = h('div', 'w-pool-segwrap seg');
    items.forEach(([val, text]) => {
      const id = `${uid}-${name}-${val}`;
      const inp = h('input'); inp.type = 'radio'; inp.name = `${uid}-${name}`; inp.id = id; inp.value = val; inp.checked = String(val) === String(checked);
      const lab = h('label', null, text); lab.htmlFor = id;
      wrap.append(inp, lab);
    });
    fs.append(wrap);
    return { fs, wrap };
  };
  const segT = segment('Global temperature T', 'T', L.T_GRID.map((T) => [T, String(T)]), state.T);
  const bNew = h('button', null, 'Draw a new pool'); bNew.type = 'button';
  controls.append(fN, segT.fs, bNew);

  const status = h('p', 'w-pool-status');
  status.setAttribute('aria-live', 'polite');
  const intro = h('p', 'w-pool-intro fig-note', 'The toy model has six possible answers.');

  // ---------- table (steps 1 and 2) ----------
  const main = h('div', 'w-pool-main');
  const left = h('div', 'w-pool-left');
  const table = h('div', 'w-pool-table');
  const head = h('div', 'w-pool-trow w-pool-thead');
  const badge = (n) => h('span', 'w-pool-badge', String(n));
  const hDrawT = h('span', null, 'Draw N answers');
  const hDraw = h('b', 'w-pool-th1'); hDraw.append(badge(1), hDrawT);
  const hW = h('b', 'w-pool-th1 w-pool-thspan'); hW.append(badge(2), h('span', null, 'Weight'));
  head.append(h('div'), hDraw, hW);
  const head2 = h('div', 'w-pool-trow w-pool-thead2');
  head2.append(h('div'), h('div'), h('div', 'w-pool-th2', 'w = \u03ba/q'), h('div', 'w-pool-th2', 'Weighted share'));
  table.append(head, head2);
  const avgNote = h('p', 'w-pool-avgnote fig-note', 'One example pool. The bars at right average over all pools of this size.');
  const mkSwatch = (angle) => {
    const svg = s('svg', { viewBox: '-12 -12 24 24', class: 'w-pool-swatch', 'aria-hidden': 'true' });
    const a = (angle * Math.PI) / 180;
    svg.append(s('circle', { r: 10, class: 'w-pool-sw-c' }));
    svg.append(s('line', { x1: 0, y1: 0, x2: 9 * Math.cos(a), y2: -9 * Math.sin(a), class: 'w-pool-sw-l' }));
    svg.append(s('circle', { cx: 9 * Math.cos(a), cy: -9 * Math.sin(a), r: 2, class: 'w-pool-sw-d' }));
    return svg;
  };
  const rows = L.TOY.map((t) => {
    const r = h('div', 'w-pool-trow');
    const name = h('div', 'w-pool-name'); name.append(mkSwatch(t.angle), h('span', null, t.short));
    const draw = h('div', 'w-pool-draw');
    const dots = h('div', 'w-pool-dots'); const bar = h('div', 'w-pool-track'); const fill = h('div', 'w-pool-fill w-pool-fill-draw'); bar.append(fill);
    const cnt = h('span', 'w-pool-count');
    draw.append(dots, bar, cnt);
    const wnum = h('div', 'w-pool-num');
    const mass = h('div', 'w-pool-mass');
    const mnum = h('span', 'w-pool-num');
    const mtrack = h('div', 'w-pool-track'); const mfill = h('div', 'w-pool-fill w-pool-fill-mass'); const mtick = h('div', 'w-pool-tick');
    mtrack.append(mfill, mtick); mass.append(mnum, mtrack);
    r.append(name, draw, wnum, mass);
    table.append(r);
    return { r, dots, bar, fill, cnt, wnum, mnum, mfill, mtick };
  });
  const tableNote = h('p', 'w-pool-note fig-note');
  const tickLg = h('p', 'w-pool-ticklg legend-item'); tickLg.append(h('i', 'w-pool-lg-tick'), h('span', null, 'tick: exact value'));
  left.append(avgNote, table, tableNote, tickLg);

  // ---------- step 3 ----------
  const right = h('div', 'w-pool-right');
  const s3head = h('div', 'w-pool-s3head');
  const h3 = h('b', 'w-pool-h fig-h'); h3.append(badge(3), h('span', null, 'K-DPP on the pool'));
  s3head.append(h3);
  const segM = segment('Show', 'mode', [['one', 'One pool'], ['avg', 'Average over pools']], 'one', 'w-pool-segmode');
  s3head.append(segM.fs);
  const legend = h('div', 'w-pool-legend legend');
  const lgBar = h('span', 'legend-item'); const lgBarT = h('span', null, 'This pool'); lgBar.append(h('i', 'w-pool-lg-bar'), lgBarT);
  const lgTick = h('span', 'legend-item'); lgTick.append(h('i', 'w-pool-lg-tick'), h('span', null, 'Exact target'));
  const scaleNote = h('span', 'w-pool-scale');
  legend.append(lgBar, lgTick, scaleNote);
  const pairRows = h('div', 'w-pool-pairs');
  const prow = L.PAIRS.map(([a, b], e) => {
    const r = h('div', 'w-pool-prow');
    const name = h('div', 'w-pool-pname', `${L.TOY[a].short} + ${L.TOY[b].short}`);
    const track = h('div', 'w-pool-track w-pool-ptrack');
    const fill = h('div', 'w-pool-fill w-pool-fill-pair'); const tick = h('div', 'w-pool-tick');
    track.append(fill, tick);
    const num = h('div', 'w-pool-num w-pool-pnum');
    r.append(name, track, num);
    return { e, r, fill, tick, num };
  });
  const metric = h('p', 'w-pool-metric');
  metric.setAttribute('aria-live', 'polite');
  right.append(s3head, legend, pairRows, metric);
  main.append(left, right);

  // ---------- chart ----------
  const s4 = h('section', 'w-pool-chartwrap');
  const s4h = h('b', 'w-pool-h fig-h', 'Error against pool size');
  const readout2 = h('p', 'w-pool-readout2 fig-note');
  const readout = h('p', 'w-pool-readout');
  readout.setAttribute('aria-live', 'polite');
  const svg = s('svg', { viewBox: '0 0 640 300', class: 'w-pool-svg', tabindex: 0, role: 'group',
    'aria-label': 'Log-log chart of KL divergence against pool size. Use the left and right arrow keys to read values.' });
  const caption = h('p', 'w-pool-caption fig-note');
  const clegend = h('div', 'w-pool-clegend legend');
  [['w-pool-cl-kl', 'measured KL'], ['w-pool-cl-bound', "paper's bound (upper limit)"], ['w-pool-cl-guide', 'slope of 1/N, for reference']].forEach(([c, txt]) => {
    const it = h('span', 'legend-item'); it.append(h('i', 'w-pool-cl-sw ' + c), h('span', null, txt)); clegend.append(it);
  });
  s4.append(s4h, readout, readout2, clegend, svg, caption);

  el.append(controls, status, intro, main, s4);

  // ---------- rendering ----------
  const entryFor = (T, N) => state.data?.T[T]?.entries.find((x) => x.N === N);

  function drawPool() {
    const N = L.N_GRID[state.ni];
    pool = L.poolFromSeed(state.seed, N, state.T, mulberry32);
    if (pool.redraws > 0) {
      status.textContent = `This pool cannot form a pair (all ${N} draws are the same answer), redrawn ${pool.redraws === 1 ? 'once' : pool.redraws + ' times'} with the next seed.`;
      status.classList.add('w-pool-status-on');
    } else {
      status.textContent = '';
      status.classList.remove('w-pool-status-on');
    }
  }

  function render() {
    const N = L.N_GRID[state.ni];
    const T = state.T;
    outN.textContent = String(N);
    rN.setAttribute('aria-valuetext', `N = ${N}`);
    const w = L.weights(T), kap = L.kappas(T);
    const tgt = L.targetPairs(T).probs;
    const counts = pool.counts;
    hDrawT.textContent = `Draw ${N} answers`;
    avgNote.style.visibility = state.avg ? 'visible' : 'hidden';

    const mass = counts.map((c, a) => (c * w[a]) / N);
    const mmax = Math.max(1.1 * Math.max(...mass, ...kap), 0.1);
    rows.forEach((r, a) => {
      const c = counts[a];
      const dotsMode = N <= 32 && c <= 14;
      r.dots.style.display = dotsMode ? '' : 'none';
      r.bar.style.display = dotsMode ? 'none' : '';
      if (dotsMode) {
        if (r.dots.childNodes.length !== c) {
          r.dots.textContent = '';
          for (let k = 0; k < c; k++) r.dots.append(h('i', 'w-pool-dot'));
        }
      } else {
        r.fill.style.width = `${Math.min(100, (c / (0.5 * N)) * 100)}%`;
      }
      r.cnt.textContent = String(c);
      r.wnum.textContent = fmt(w[a], 2);
      r.mnum.textContent = fmt(mass[a], 3);
      r.mfill.style.width = `${(mass[a] / mmax) * 100}%`;
      r.mtick.style.left = `${(kap[a] / mmax) * 100}%`;
      r.r.classList.toggle('w-pool-empty', c === 0);
    });
    tableNote.textContent = 'Weighted share = count \u00d7 weight / N: what the pool\'s draws of an answer contribute to the K-DPP. The weight is w = \u03ba/q, with \u03ba = p^(1/T).';

    // step 3
    const order = L.PAIRS.map((_, e) => e).sort((x, y) => tgt[y] - tgt[x]);
    const entry = entryFor(T, N);
    const useAvg = state.avg && entry;
    const shown = useAvg ? entry.pibar : pool.dist;
    const scale = niceMax(Math.max(...tgt, ...shown) * 1.05);
    scaleNote.textContent = `Bar scale: 0 to ${scale}`;
    lgBarT.textContent = useAvg ? 'Average over pools' : 'This pool';
    order.forEach((e) => pairRows.append(prow[e].r));
    prow.forEach((pr) => {
      const v = shown[pr.e], t = tgt[pr.e];
      pr.fill.style.width = `${(v / scale) * 100}%`;
      pr.tick.style.left = `${(t / scale) * 100}%`;
      pr.num.textContent = v === 0 ? '0' : fmt(v, 3);
      pr.num.title = `target ${fmt(t, 3)}`;
      pr.r.classList.toggle('w-pool-zero', v === 0 && !useAvg);
    });
    if (useAvg) {
      const se = entry.kl_se ? ` ± ${sci(entry.kl_se)} (Monte Carlo standard error)` : ' (exact)';
      metric.textContent = `KL(target ‖ average) = ${sci(entry.kl)} nats${se}.`;
    } else {
      const zeros = pool.dist.filter((x) => x === 0).length;
      metric.textContent = (zeros > 0 ? `This pool cannot produce ${zeros} of the 15 pairs. ` : '') +
        `Total variation distance to the target: ${fmt(L.tv(tgt, pool.dist), 3)}.`;
    }
    if (state.avg && !entry) metric.textContent = state.dataError ? 'The precomputed averages could not be loaded.' : 'Loading the precomputed averages.';

    renderChart();
  }

  // chart geometry
  let W = 640, H = 340, ml = 66, mr = 20, mt = 14, mb = 50;
  const xs = (N) => ml + ((Math.log(N) - Math.log(2)) / (Math.log(512) - Math.log(2))) * (W - ml - mr);
  function geometry() {
    const w = svg.getBoundingClientRect().width || 640;
    W = Math.round(w);
    const narrow = W < 520;
    H = narrow ? 280 : 290;
    ml = narrow ? 56 : 66; mr = narrow ? 14 : 20; mb = narrow ? 44 : 46;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.height = `${H}px`;
  }

  function renderChart() {
    svg.textContent = '';
    geometry();
    const T = state.T, N = L.N_GRID[state.ni];
    const d = state.data?.T[T];
    if (!d) {
      svg.append(s('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'w-pool-t' }, state.dataError ? 'Precomputed data could not be loaded.' : 'Loading.'));
      readout.textContent = ''; readout2.textContent = '';
      return;
    }
    const E = d.entries;
    const all = E.flatMap((e) => [e.kl, e.bound]).filter((x) => x > 0);
    const lo = Math.pow(10, Math.floor(Math.log10(Math.min(...all)) - 0.0)), hi = Math.pow(10, Math.ceil(Math.log10(Math.max(...all))));
    const lly = (v) => Math.log10(v);
    const ys = (v) => mt + ((lly(hi) - lly(v)) / (lly(hi) - lly(lo))) * (H - mt - mb);
    // grid and ticks
    const g = s('g', { class: 'w-pool-grid' });
    for (let k = Math.round(lly(lo)); k <= Math.round(lly(hi)); k++) {
      const y = ys(Math.pow(10, k));
      g.append(s('line', { x1: ml, x2: W - mr, y1: y, y2: y, class: 'w-pool-gl' }));
      g.append(s('text', { x: ml - 8, y: y + 4, 'text-anchor': 'end', class: 'w-pool-t' }, k === 0 ? '1' : `10${sup(k)}`));
    }
    (W < 520 ? [2, 8, 32, 128, 512] : [2, 4, 8, 16, 32, 64, 128, 256, 512]).forEach((n) => {
      const x = xs(n);
      g.append(s('line', { x1: x, x2: x, y1: mt, y2: H - mb, class: 'w-pool-gl' }));
      g.append(s('text', { x, y: H - mb + 16, 'text-anchor': 'middle', class: 'w-pool-t' }, String(n)));
    });
    g.append(s('line', { x1: ml, x2: W - mr, y1: H - mb, y2: H - mb, class: 'w-pool-axis' }));
    g.append(s('line', { x1: ml, x2: ml, y1: mt, y2: H - mb, class: 'w-pool-axis' }));
    g.append(s('text', { x: (ml + W - mr) / 2, y: H - 8, 'text-anchor': 'middle', class: 'w-pool-t w-pool-axl' }, 'Pool size N'));
    g.append(s('text', { x: 14, y: (mt + H - mb) / 2, 'text-anchor': 'middle', transform: `rotate(-90 14 ${(mt + H - mb) / 2})`, class: 'w-pool-t w-pool-axl' }, 'KL divergence (nats)'));
    svg.append(g);

    const clip = s('clipPath', { id: uid + '-clip' });
    clip.append(s('rect', { x: ml, y: mt, width: W - ml - mr, height: H - mt - mb }));
    const defs = s('defs'); defs.append(clip); svg.append(defs);
    const plot = s('g', { 'clip-path': `url(#${uid}-clip)` });
    // slope 1/N guide through the KL at N = 32
    const e32 = E.find((e) => e.N === 32);
    const c = e32.kl * 32;
    const guide = [2, 512].map((n) => `${xs(n)},${ys(c / n)}`).join(' ');
    plot.append(s('polyline', { points: guide, class: 'w-pool-guide' }));
    // bound
    plot.append(s('polyline', { points: E.map((e) => `${xs(e.N)},${ys(e.bound)}`).join(' '), class: 'w-pool-bound' }));
    // KL curve
    plot.append(s('polyline', { points: E.map((e) => `${xs(e.N)},${ys(e.kl)}`).join(' '), class: 'w-pool-curve' }));
    E.forEach((e) => {
      plot.append(s('circle', { cx: xs(e.N), cy: ys(e.kl), r: 3.6, class: 'w-pool-pt' + (e.method === 'exact' ? '' : ' w-pool-pt-mc') }));
    });
    svg.append(plot);
    // direct labels
    const at = (N0) => E.find((e) => e.N === N0);
    const direct = W >= 700;
    clegend.style.display = direct ? 'none' : '';
    if (direct) {
      svg.append(s('text', { x: xs(512) - 4, y: ys(at(512).bound) + 18, 'text-anchor': 'end', class: 'w-pool-t w-pool-lab-bound' }, "paper's bound (upper limit)"));
      svg.append(s('text', { x: xs(2) + 6, y: ys(c / 2) - 9, 'text-anchor': 'start', class: 'w-pool-t w-pool-lab-guide' }, 'slope of 1/N, for reference'));
      svg.append(s('text', { x: xs(64) - 12, y: ys(at(64).kl) + 22, 'text-anchor': 'end', class: 'w-pool-t w-pool-lab-kl' }, 'measured KL'));
    }

    // current N marker
    const cur = E.find((e) => e.N === N);
    const mx = xs(N), my = ys(cur.kl);
    svg.append(s('line', { x1: mx, x2: mx, y1: my, y2: H - mb, class: 'w-pool-cur-line' }));
    svg.append(s('circle', { cx: mx, cy: my, r: 7, class: 'w-pool-cur' }));
    // hover marker
    const hi2 = state.hover;
    if (hi2 != null) {
      const he = E[hi2];
      svg.append(s('line', { x1: xs(he.N), x2: xs(he.N), y1: mt, y2: H - mb, class: 'w-pool-hover-line' }));
      svg.append(s('circle', { cx: xs(he.N), cy: ys(he.kl), r: 5, class: 'w-pool-hover' }));
      svg.append(s('circle', { cx: xs(he.N), cy: ys(he.bound), r: 4, class: 'w-pool-hover w-pool-hover-b' }));
    }
    const re = hi2 != null ? E[hi2] : cur;
    readout.textContent = `At N = ${re.N}: measured KL ${sci(re.kl)} nats${re.method === 'exact' ? '' : ' (standard error ' + sci(re.kl_se) + ')'}, bound ${sci(re.bound)}.`;
    readout2.textContent = re.redraw >= 0.001 ? `With N this small, ${(re.redraw * 100).toFixed(1)}% of pools contain a single distinct answer and are redrawn.` : '';

    const slope = d.slope_logKL_logN_N_ge_32;
    caption.textContent = `Toy model with six answers and K = 2, not a result from the paper: KL(target ‖ average over pools) at T = ${T} for PoolDPP-Samp with proposal q = p, exact up to N = ${state.data.meta.exact_max_N} (filled points) and from ${state.data.meta.mc_pools.toLocaleString('en-US')} sampled pools beyond (open points), with the paper's bound log(1 + Var(Ẑ)/Z²). Here the measured KL falls about as 1/N${Math.abs(slope + 2) < 0.3 ? '²' : ''} (fitted slope ${slope.toFixed(2)} for N ≥ 32), ${Math.abs(slope + 2) < 0.3 ? 'faster than ' : 'compared with '}the bound's 1/N.`;
  }

  // ---------- events ----------
  rN.addEventListener('input', () => { state.ni = Number(rN.value); drawPool(); render(); });
  segT.wrap.addEventListener('change', (ev) => { state.T = Number(ev.target.value); drawPool(); render(); });
  segM.wrap.addEventListener('change', (ev) => { state.avg = ev.target.value === 'avg'; render(); });
  bNew.addEventListener('click', () => { state.seed = pool.seed + 1; drawPool(); render(); });

  const nearest = (clientX) => {
    const r = svg.getBoundingClientRect();
    const x = clientX - r.left;
    let best = 0, bd = 1e9;
    L.N_GRID.forEach((n, i) => { const dd = Math.abs(xs(n) - x); if (dd < bd) { bd = dd; best = i; } });
    return best;
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { if (state.data) renderChart(); }).observe(svg);
  svg.addEventListener('pointermove', (ev) => { state.hover = nearest(ev.clientX); renderChart(); });
  svg.addEventListener('pointerleave', () => { state.hover = null; renderChart(); });
  svg.addEventListener('blur', () => { state.hover = null; renderChart(); });
  svg.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    const cur = state.hover ?? state.ni;
    state.hover = Math.max(0, Math.min(L.N_GRID.length - 1, cur + (ev.key === 'ArrowRight' ? 1 : -1)));
    renderChart();
  });

  drawPool();
  render();
  fetch(DATA_URL).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => { state.data = d; render(); })
    .catch(() => { state.dataError = true; render(); });
}
