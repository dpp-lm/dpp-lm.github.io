import { bindRange } from './ui-range.js';
import { repeatedWords, markSegments, makePool, windowIndices, select, describe, fmt, tFromPos, posFromT, seedFor, distinctDots, T_RANGE, K_RANGE } from './w-samples-lib.js';

const BASE = new URL('../data/samples/', import.meta.url);
const LABELS = { gift: 'Birthday gift', city: 'City', firstdate: 'First date', dinner: 'Dinner', story: 'Story opening' };
const DEFAULT_T = { sample: 0.8, map: 10 };
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const sv = (tag, attrs, cls) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (cls) e.setAttribute('class', cls); return e; };
const fmtT = (mode, T) => (mode === 'map' ? (T >= 100 ? T.toFixed(0) : T.toFixed(1)) : T.toFixed(2));

export function mount(root) {
  root.classList.add('w-samples');
  const S = { index: null, prompt: 0, K: 5, counter: 0, sampleCounter: 0, mode: 'map', pos: { sample: posFromT('sample', DEFAULT_T.sample), map: posFromT('map', DEFAULT_T.map) }, pools: {}, view: null };
  const uid = 'wsm' + Math.random().toString(36).slice(2, 7);

  root.innerHTML = `
    <div class="w-samples-head">
      <div class="chips" role="group" aria-label="Prompt" data-prompts></div>
      <div class="w-samples-step" role="group" aria-label="Number of answers K">
        <span class="fig-label">Answers K</span>
        <button type="button" class="btn-icon" data-k="-1" aria-label="Fewer answers">−</button>
        <output class="fig-num" data-kval aria-live="polite"></output>
        <button type="button" class="btn-icon" data-k="1" aria-label="More answers">+</button>
      </div>
    </div>
    <p class="w-samples-prompt" data-ptext></p>
    <div class="w-samples-mapwrap" data-mapwrap>
      <svg class="w-samples-map" role="img" aria-label="Map of the 200 pool draws with the two selections marked" data-map></svg>
      <div class="w-samples-tip" role="tooltip" data-tip hidden></div>
    </div>
    <p class="w-samples-strip" data-strip aria-live="polite">Tap a dot or marker to read its answer.</p>
    <div class="legend w-samples-legend" data-legend></div>
    <p class="w-samples-mapcap fig-note">Each dot is one draw, placed by a 2-D projection (PCA) of its embedding.</p>
    <div class="w-samples-markrow">
      <span class="fig-note"><span class="w-samples-rep">Marked</span> words appear in most of the list's answers.</span>
    </div>
    <div class="w-samples-cols">
      <section class="w-samples-col w-samples-anc" aria-labelledby="${uid}-h1">
        <div class="w-samples-ctl"><h3 class="fig-h" id="${uid}-h1" data-h1></h3><button type="button" data-draw>Draw again</button></div>
        <p class="w-samples-metrics" data-met="anc"></p>
        <div data-panel="anc"></div>
      </section>
      <section class="w-samples-col w-samples-pdpp" aria-labelledby="${uid}-h2">
        <div class="w-samples-ctl"><h3 class="fig-h" id="${uid}-h2" data-h2></h3></div>
        <div class="w-samples-ctl">
          <div class="seg" role="group" aria-label="Mode">
            <button type="button" data-mode="map" title="PoolDPP-MAP: the set of largest determinant, chosen greedily from the pool">PoolDPP-MAP (most likely set)</button>
            <button type="button" data-mode="sample" title="PoolDPP-Samp: a random set drawn from the K-DPP on the pool">PoolDPP-Samp (random set)</button>
          </div>
          <button type="button" data-again hidden>Sample again</button>
        </div>
        <div class="w-samples-trow">
          <label for="${uid}-t" class="fig-label">Global temperature T</label>
          <span class="fig-note" data-tmin></span>
          <input id="${uid}-t" type="range" min="0" max="1000" step="1" data-t>
          <span class="fig-note" data-tmax></span>
          <output class="fig-num w-samples-tval" for="${uid}-t" data-tval></output>
        </div>
        <p class="w-samples-tnote fig-note" data-tnote></p>
        <p class="w-samples-metrics" data-met="pdpp"></p>
        <div data-panel="pdpp"></div>
      </section>
    </div>
    <p class="w-samples-legend-note fig-note">Diversity is the log-determinant of the Gram matrix of the K selected embeddings. Quality is the mean log-probability of the K answers under the model.</p>
    <p class="w-samples-caption fig-note" data-caption></p>
    <p class="w-samples-link"><a href="/demo/">Try your own prompt in the live demo</a></p>
    <p class="w-samples-err" role="alert" data-err hidden></p>`;
  const $ = (s) => root.querySelector(s);
  bindRange($('[data-t]'));
  const segP = $('[data-prompts]');

  function buildPrompts() {
    segP.textContent = '';
    S.index.forEach((p, i) => { const b = el('button', null, LABELS[p.id] || p.id); b.type = 'button'; b.dataset.p = i; segP.append(b); });
  }
  async function getPool(i) {
    if (S.pools[i]) return S.pools[i];
    const p = S.index[i];
    const [j, g] = await Promise.all([fetch(new URL(p.pool, BASE)).then((r) => r.json()), fetch(new URL(p.gram, BASE)).then((r) => r.arrayBuffer())]);
    const pool = makePool(j, g);
    pool.dots = distinctDots(pool.texts);
    return (S.pools[i] = pool);
  }

  // ---- linking between list rows and map markers
  function highlight(kind, a, on) {
    root.querySelectorAll(`[data-kind="${kind}"][data-a="${a}"]`).forEach((n) => n.classList.toggle('hl', on));
  }
  const tip = $('[data-tip]'), wrap = $('[data-mapwrap]'), strip = $('[data-strip]');
  const STRIP_DEFAULT = 'Tap a dot or marker to read its answer.';
  const isCoarse = () => window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  // Floating tooltip on desktop, never over the hovered marker: it sits above or below with a clear gap.
  function showTip(text, x, y, r) {
    tip.textContent = text; tip.hidden = false;
    const W = wrap.clientWidth, H = wrap.clientHeight, w = tip.offsetWidth, h = tip.offsetHeight, gap = r + 8;
    tip.style.left = Math.max(4, Math.min(W - w - 4, x - w / 2)) + 'px';
    const above = y - gap - h, below = y + gap;
    tip.style.top = Math.max(4, Math.min(H - h - 4, above >= 4 ? above : below)) + 'px';
  }
  const hideTip = () => { tip.hidden = true; };
  function describeNode(n) {
    const p = S.view.pool, i = +n.dataset.i;
    let txt = p.texts[i];
    if (n.dataset.n > 1) txt += ` (${n.dataset.n} identical draws)`;
    if (!n.dataset.kind) return 'Pool draw: ' + txt;
    const own = n.dataset.kind === 'anc' ? 'Independent sample' : 'PoolDPP pick';
    let head = `${own} ${+n.dataset.a + 1}`;
    if (n.dataset.twin != null) head += `, also ${n.dataset.kind === 'anc' ? 'PoolDPP pick' : 'independent sample'} ${+n.dataset.twin + 1}`;
    return head + ': ' + txt;
  }

  function renderMap() {
    const v = S.view; if (!v) return;
    const svg = $('[data-map]'), W = Math.round(wrap.clientWidth), H = 300;
    if (W < 10) return;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.textContent = '';
    const { pool } = v, { x, y } = pool.proj, pad = 30;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < pool.N; i++) { x0 = Math.min(x0, x[i]); x1 = Math.max(x1, x[i]); y0 = Math.min(y0, y[i]); y1 = Math.max(y1, y[i]); }
    const sc = Math.min((W - 2 * pad) / Math.max(1e-9, x1 - x0), (H - 2 * pad) / Math.max(1e-9, y1 - y0));
    const cx = (W - sc * (x1 - x0)) / 2, cy = (H - sc * (y1 - y0)) / 2;
    const px = (i) => cx + sc * (x[i] - x0), py = (i) => H - (cy + sc * (y[i] - y0));
    const gDots = sv('g');
    for (const d of pool.dots) {
      const c = sv('circle', { cx: px(d.i).toFixed(1), cy: py(d.i).toFixed(1), r: (2.4 + 0.7 * Math.log(d.count)).toFixed(2) }, 'w-samples-dot');
      c.dataset.i = d.i; c.dataset.n = d.count; gDots.append(c);
    }
    svg.append(gDots);

    // Markers. A pick and an independent sample with the same string sit side by side (half a marker each).
    const textsOf = (set) => set.map((i) => pool.texts[i]);
    const ta = textsOf(v.ind.set), tp = textsOf(v.dp.set);
    const twinOfAnc = ta.map((t) => tp.indexOf(t)), twinOfPd = tp.map((t) => ta.indexOf(t));
    const items = [];
    v.ind.set.forEach((idx, a) => items.push({ kind: 'anc', a, idx, twin: twinOfAnc[a], X: px(idx) + (twinOfAnc[a] >= 0 ? -7 : 0), Y: py(idx) }));
    v.dp.set.forEach((idx, a) => items.push({ kind: 'pd', a, idx, twin: twinOfPd[a], X: px(idx) + (twinOfPd[a] >= 0 ? 7 : 0), Y: py(idx) }));
    // Label placement: four diagonal offsets, least overlap with markers and earlier labels; otherwise a leader line.
    const R = 10, LW = 9, LH = 13, placed = [];
    const ov = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    const box = (cx_, cy_) => ({ x0: cx_ - LW / 2, x1: cx_ + LW / 2, y0: cy_ - LH / 2, y1: cy_ + LH / 2 });
    const markerBoxes = items.map((m) => ({ x0: m.X - R, x1: m.X + R, y0: m.Y - R, y1: m.Y + R }));
    const score = (b, self) => {
      let s_ = 0;
      markerBoxes.forEach((mb, k) => { if (k !== self) s_ += ov(b, mb); });
      for (const q of placed) s_ += ov(b, q) * 2;
      if (b.x0 < 0) s_ += (-b.x0) * 20; if (b.x1 > W) s_ += (b.x1 - W) * 20; if (b.y0 < 0) s_ += (-b.y0) * 20; if (b.y1 > H) s_ += (b.y1 - H) * 20;
      return s_;
    };
    const order = { anc: [[-1, -1], [1, -1], [-1, 1], [1, 1]], pd: [[1, 1], [-1, 1], [1, -1], [-1, -1]] };
    const d1 = 12, d2 = 26, dirs8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    items.forEach((m, k) => {
      let best = null;
      for (const [dx, dy] of order[m.kind]) { const c = [m.X + dx * d1, m.Y + dy * d1]; const sc_ = score(box(...c), k); if (!best || sc_ < best.s) best = { s: sc_, c, leader: false }; }
      if (best.s > 0) {
        for (const [dx, dy] of dirs8) { const n = Math.hypot(dx, dy), c = [m.X + dx / n * d2, m.Y + dy / n * d2]; const sc_ = score(box(...c), k) + 1; if (sc_ < best.s) best = { s: sc_, c, leader: true, d: [dx / n, dy / n] }; }
      }
      m.label = best; placed.push(box(...best.c));
    });
    const gm = sv('g');
    for (const kind of ['anc', 'pd']) {
      for (const m of items.filter((q) => q.kind === kind)) {
        const g = sv('g', { transform: `translate(${m.X.toFixed(1)} ${m.Y.toFixed(1)})`, tabindex: 0, role: 'img', 'aria-label': describeNode({ dataset: { kind, a: m.a, i: m.idx, twin: m.twin >= 0 ? m.twin : undefined } }) }, `w-samples-mk w-samples-mk-${kind}`);
        Object.assign(g.dataset, { kind, a: m.a, i: m.idx }); if (m.twin >= 0) g.dataset.twin = m.twin;
        const lx = m.label.c[0] - m.X, ly = m.label.c[1] - m.Y;
        if (m.label.leader) g.append(sv('line', { x1: (m.label.d[0] * 9).toFixed(1), y1: (m.label.d[1] * 9).toFixed(1), x2: (lx - m.label.d[0] * 5).toFixed(1), y2: (ly - m.label.d[1] * 5).toFixed(1) }, 'w-samples-leader'));
        g.append(kind === 'anc' ? sv('circle', { r: 8 }, 'w-samples-shape') : sv('rect', { x: -6.5, y: -6.5, width: 13, height: 13, transform: 'rotate(45)' }, 'w-samples-shape'));
        const t = sv('text', { x: lx.toFixed(1), y: ly.toFixed(1), 'text-anchor': 'middle', 'dominant-baseline': 'central' }, 'w-samples-mlab');
        t.textContent = m.a + 1; g.append(t); gm.append(g);
      }
    }
    svg.append(gm);
  }

  function mapEvents() {
    const svg = $('[data-map]');
    const over = (e) => {
      const n = e.target.closest('.w-samples-dot, .w-samples-mk'); if (!n) return;
      if (n.dataset.kind) highlight(n.dataset.kind, n.dataset.a, true);
      const txt = describeNode(n);
      if (isCoarse()) { strip.textContent = txt; return; }
      const r = wrap.getBoundingClientRect(), shape = n.querySelector('.w-samples-shape') || n, b = shape.getBoundingClientRect();
      showTip(txt, b.left + b.width / 2 - r.left, b.top + b.height / 2 - r.top, Math.max(b.width, b.height) / 2);
    };
    const out = (e) => {
      const n = e.target.closest('.w-samples-mk'); if (n) highlight(n.dataset.kind, n.dataset.a, false);
      if (!isCoarse()) hideTip();
    };
    svg.addEventListener('pointerover', over); svg.addEventListener('pointerout', out);
    svg.addEventListener('focusin', over); svg.addEventListener('focusout', out);
    svg.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') over(e); });
    document.addEventListener('pointerdown', (e) => { if (!wrap.contains(e.target) && !isCoarse()) hideTip(); });
  }

  function panel(host, d, pool, kind) {
    host.textContent = '';
    const rep = repeatedWords(d.set.map((i) => pool.texts[i]), S.index[S.prompt].prompt);
    const ol = el('ol', 'w-samples-list');
    d.set.forEach((idx, a) => {
      const li = el('li'); li.dataset.a = a; li.dataset.kind = kind;
      const num = el('span', 'w-samples-num', String(a + 1));
      const body = el('div', 'w-samples-body');
      const txt = el('button', 'w-samples-text btn-plain'); txt.type = 'button';
      for (const seg of markSegments(pool.texts[idx], rep)) {
        if (seg.mark) txt.append(el('span', 'w-samples-rep', seg.t)); else txt.append(document.createTextNode(seg.t));
      }
      txt.setAttribute('aria-expanded', 'false');
      txt.addEventListener('click', () => { const o = li.classList.toggle('open'); txt.setAttribute('aria-expanded', String(o)); });
      body.append(txt);
      if (d.same[a] >= 0) body.append(el('span', 'w-samples-dup', `same as ${d.same[a] + 1}`));
      li.append(num, body); ol.append(li);
      li.addEventListener('pointerenter', () => highlight(kind, a, true));
      li.addEventListener('pointerleave', () => highlight(kind, a, false));
      li.addEventListener('focusin', () => highlight(kind, a, true));
      li.addEventListener('focusout', () => highlight(kind, a, false));
    });
    host.append(ol);
  }
  function metrics(kind, d) {
    const p = $(`[data-met="${kind}"]`); p.textContent = '';
    const a = el('span', 'w-samples-met', 'Diversity '); a.title = 'Log-determinant of the Gram matrix of the K selected embeddings. Higher is more diverse.';
    a.append(el('b', 'fig-num', fmt(d.diversity, 2)), ' ', el('span', 'fig-note', '(higher is more diverse)'));
    if (d.diversity === -Infinity) a.append(el('span', 'w-samples-dupnote', ' contains a duplicate'));
    const b = el('span', 'w-samples-met', 'Quality '); b.title = 'Mean log-probability of the K answers under the model. Higher is more likely.';
    b.append(el('b', 'fig-num', fmt(d.quality, 2)), ' ', el('span', 'fig-note', '(higher is more likely)'));
    p.append(a, el('span', 'w-samples-sep', ' \u00b7 '), b);
  }

  function legend(mode) {
    const lg = $('[data-legend]');
    const name = mode === 'map' ? 'PoolDPP-MAP pick' : 'PoolDPP-Samp pick';
    lg.innerHTML = `<span class="legend-item"><svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true"><circle r="3" class="w-samples-dot"/></svg>One of the 200 draws</span>
      <span class="legend-item"><svg width="20" height="20" viewBox="-10 -10 20 20" aria-hidden="true"><circle r="8" class="w-samples-shape w-samples-lg-anc"/></svg>Independent sample</span>
      <span class="legend-item"><svg width="20" height="20" viewBox="-10 -10 20 20" aria-hidden="true"><rect x="-7" y="-7" width="14" height="14" transform="rotate(45)" class="w-samples-shape w-samples-lg-pd"/></svg>${name}</span>`;
  }

  async function render() {
    if (!S.index) return;
    let pool;
    try { pool = await getPool(S.prompt); } catch (e) { const er = $('[data-err]'); er.hidden = false; er.textContent = 'The sample data could not be loaded.'; return; }
    const K = S.K, N = pool.N, mode = S.mode, T = tFromPos(mode, S.pos[mode]);
    const ind = describe(pool, windowIndices(S.counter, K, N));
    const dp = describe(pool, select(pool, { mode, T, K, seed: seedFor(S.prompt, K, S.sampleCounter) }));
    panel($('[data-panel="anc"]'), ind, pool, 'anc');
    panel($('[data-panel="pdpp"]'), dp, pool, 'pd');
    metrics('anc', ind); metrics('pdpp', dp);
    S.view = { pool, ind, dp };
    renderMap(); legend(mode); hideTip(); strip.textContent = STRIP_DEFAULT;
    $('[data-h1]').textContent = `${K} independent samples`;
    $('[data-h2]').textContent = `PoolDPP picks ${K} from the same ${N} draws`;
    $('[data-kval]').textContent = K;
    $('[data-ptext]').textContent = S.index[S.prompt].prompt;
    const p = S.index[S.prompt];
    $('[data-caption]').textContent = `${N} draws at local temperature T′ = ${p.Tprime.toFixed(1)}. Embeddings: Qwen3-Embedding-0.6B.`;
  }

  function syncControls() {
    const mode = S.mode, r = T_RANGE[mode];
    segP.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.p === S.prompt)));
    root.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    const t = $('[data-t]'); t.value = Math.round(S.pos[mode] * 1000);
    const T = tFromPos(mode, S.pos[mode]);
    $('[data-tval]').textContent = fmtT(mode, T);
    t.setAttribute('aria-valuetext', `T = ${fmtT(mode, T)}`);
    $('[data-tmin]').textContent = String(r.min); $('[data-tmax]').textContent = String(r.max);
    $('[data-again]').hidden = mode === 'map';
    $('[data-tnote]').textContent = mode === 'map' ? 'Low T keeps the most likely answers. High T ignores likelihood and picks the most different ones.' : 'Low T concentrates on likely answers. High T spreads the random set.';
    root.classList.toggle('is-map', mode === 'map');
    root.querySelector('[data-k="-1"]').disabled = S.K <= K_RANGE.min;
    root.querySelector('[data-k="1"]').disabled = S.K >= K_RANGE.max;
  }
  let raf = 0;
  const update = () => { syncControls(); cancelAnimationFrame(raf); raf = requestAnimationFrame(render); };

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !root.contains(b)) return;
    if (b.dataset.p != null) { S.prompt = +b.dataset.p; S.counter = 0; S.sampleCounter = 0; update(); }
    else if (b.dataset.k) { S.K = Math.max(K_RANGE.min, Math.min(K_RANGE.max, S.K + +b.dataset.k)); update(); }
    else if (b.dataset.mode) { S.mode = b.dataset.mode; update(); }
    else if ('draw' in b.dataset) { S.counter++; update(); }
    else if ('again' in b.dataset) { S.sampleCounter++; update(); }
  });
  $('[data-t]').addEventListener('input', (e) => { S.pos[S.mode] = e.target.value / 1000; update(); });
  mapEvents();
  let lastW = 0;
  if (window.ResizeObserver) new ResizeObserver(() => { const w = wrap.clientWidth; if (w !== lastW) { lastW = w; renderMap(); } }).observe(wrap);

  fetch(new URL('index.json', BASE)).then((r) => r.json()).then((idx) => { S.index = idx; buildPrompts(); update(); })
    .catch(() => { const er = $('[data-err]'); er.hidden = false; er.textContent = 'The sample data could not be loaded.'; });
  syncControls();
}
