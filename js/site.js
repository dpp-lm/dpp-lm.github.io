// Page shell: widget mounting, math, copy button, nav highlight, theme toggle.

function mountWidget(el) {
  if (el.dataset.mounted) return Promise.resolve();
  el.dataset.mounted = '1';
  const name = el.dataset.widget;
  return import('./w-' + name + '.js')
    .then((m) => m.mount(el))
    .catch((err) => {
      console.warn('Widget failed to load:', name, err);
      if (name === 'hero') { el.hidden = true; el.parentElement.classList.add('is-empty'); return; }
      el.textContent = '';
      const p = document.createElement('p');
      p.className = 'widget-error';
      p.textContent = 'This figure could not be loaded.';
      el.appendChild(p);
    })
    .then(() => { el.dataset.ready = '1'; renderMath(); });
}

const later = (fn) => ('requestIdleCallback' in window
  ? requestIdleCallback(fn, { timeout: 300 })
  : setTimeout(fn, 30));

function initWidgets() {
  const all = [...document.querySelectorAll('.widget[data-widget]')];
  const hero = all.filter((e) => e.dataset.widget === 'hero');
  const rest = all.filter((e) => e.dataset.widget !== 'hero');
  let touched = false;
  for (const ev of ['wheel', 'touchmove', 'keydown', 'pointerdown']) {
    window.addEventListener(ev, () => { touched = true; }, { once: true, passive: true });
  }
  Promise.all(hero.map(mountWidget)).then(() => {
    let i = 0;
    const step = () => {
      if (i >= rest.length) {
        const h = location.hash;
        const t = h.length > 1 ? document.getElementById(decodeURIComponent(h.slice(1))) : null;
        if (t && !touched) requestAnimationFrame(() => t.scrollIntoView({ behavior: 'instant' }));
        return;
      }
      mountWidget(rest[i++]).then(() => later(step));
    };
    later(step);
  });
}

function renderMath() {
  if (typeof window.renderMathInElement !== 'function') return;
  try {
    window.renderMathInElement(document.body, {
      delimiters: [
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false,
    });
  } catch (e) { console.warn('KaTeX failed', e); }
}

function initMath() {
  if (typeof window.renderMathInElement === 'function') { renderMath(); return; }
  window.addEventListener('load', renderMath);
}

function initCopy() {
  const btn = document.getElementById('copy-btn');
  const code = document.getElementById('bibtex');
  if (!btn || !code) return;
  btn.addEventListener('click', async () => {
    const text = code.textContent;
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const r = document.createRange();
      r.selectNodeContents(code);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      try { document.execCommand('copy'); } catch (e2) {}
      s.removeAllRanges();
    }
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1800);
  });
}

function initNav() {
  const links = [...document.querySelectorAll('.nav-links a')];
  const secs = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const bar = document.querySelector('.nav-links');
  let current = null;
  function update() {
    const y = window.innerHeight * 0.3;
    let active = null;
    for (const s of secs) if (s.getBoundingClientRect().top <= y) active = s;
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) active = secs[secs.length - 1];
    if (active === current) return;
    current = active;
    for (const a of links) {
      const on = active && a.getAttribute('href') === '#' + active.id;
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      if (on && bar.scrollWidth > bar.clientWidth) {
        const l = a.offsetLeft - bar.offsetLeft, r = l + a.offsetWidth;
        if (l < bar.scrollLeft) bar.scrollLeft = Math.max(0, l - 12);
        else if (r > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = r - bar.clientWidth + 12;
      }
    }
  }
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}

function initTheme() {
  const btns = [...document.querySelectorAll('.theme-btn')];
  const root = document.documentElement;
  const order = [null, 'light', 'dark'];
  const names = { null: 'system', light: 'light', dark: 'dark' };
  let i = Math.max(0, order.indexOf(root.getAttribute('data-theme')));
  function apply() {
    const t = order[i];
    if (t) root.setAttribute('data-theme', t); else root.removeAttribute('data-theme');
    for (const btn of btns) {
      btn.textContent = 'Theme: ' + names[t];
      btn.setAttribute('aria-label', 'Color theme: ' + names[t] + '. Activate to change.');
    }
    try { if (t) localStorage.setItem('theme', t); else localStorage.removeItem('theme'); } catch (e) {}
  }
  for (const btn of btns) btn.addEventListener('click', () => { i = (i + 1) % order.length; apply(); });
  apply();
}

initTheme();
initNav();
initCopy();
initMath();
initWidgets();
