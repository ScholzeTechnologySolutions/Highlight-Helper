(() => {
  if (window.__readingHighlighterLoaded) return;
  window.__readingHighlighterLoaded = true;

  // ---------------------------------------------------------------- config
  const STORE_KEY = 'reading-highlighter:v2';
  const TRANSITION = '120ms ease';

  // 5 high-visibility colors per mode.
  // dark  = bright/neon colors for dark pages
  // light = deep/saturated colors for light pages (all >= ~5:1 contrast on white)
  const PALETTES = {
    dark: [
      { name: 'Cyan',   hex: '#22d3ee' },
      { name: 'Pink',   hex: '#f472b6' },
      { name: 'Lime',   hex: '#a3e635' },
      { name: 'Amber',  hex: '#fbbf24' },
      { name: 'Violet', hex: '#a78bfa' }
    ],
    light: [
      { name: 'Blue',    hex: '#1d4ed8' },
      { name: 'Magenta', hex: '#be185d' },
      { name: 'Green',   hex: '#15803d' },
      { name: 'Orange',  hex: '#c2410c' },
      { name: 'Purple',  hex: '#6d28d9' }
    ]
  };

  // Categories in the order shown in the panel (Alt+1 ... Alt+8).
  // kind: inline | heading | block | image   (controls how it is painted)
  // def:  default palette index (same index in both modes)
  const CATS = [
    { id: 'link',     label: 'Hyperlinks',       kind: 'inline',  def: 0, sel: 'a[href]' },
    { id: 'heading',  label: 'Titles / Headings', kind: 'heading', def: 3, sel: 'h1,h2,h3,h4,h5,h6' },
    { id: 'text',     label: 'Text',             kind: 'block',   def: 4, needsText: true, sel: 'p,dd,dt,figcaption,td,th' },
    { id: 'image',    label: 'Images',           kind: 'image',   def: 2, sel: 'img' },
    { id: 'emphasis', label: 'Bold / Code',      kind: 'inline',  def: 1, sel: 'b,strong,code,pre,kbd,samp,var,mark' },
    { id: 'list',     label: 'List items',       kind: 'block',   def: 0, needsText: true, sel: 'li' },
    { id: 'quote',    label: 'Quotes',           kind: 'block',   def: 1, sel: 'blockquote' },
    { id: 'button',   label: 'Buttons',          kind: 'inline',  def: 4, sel: 'button,[role="button"]' }
  ];
  const CAT_BY_ID = Object.fromEntries(CATS.map(c => [c.id, c]));

  // If an element matches several categories, the first one here wins.
  const PRIORITY = ['link', 'button', 'image', 'emphasis', 'heading', 'quote', 'list', 'text'];

  const SKIP_SEL = [
    '#reading-highlighter-ui',
    'script', 'style', 'noscript', 'template',
    'textarea', 'input', 'select',
    'svg', 'canvas', 'video', 'audio', 'iframe',
    '[contenteditable="true"]',
    '.rh-skip'
  ].join(',');

  // ---------------------------------------------------------------- state
  let settings = null;
  let host = null;       // UI host element (shadow DOM)
  let ui = null;         // shadow root
  let mo = null;         // MutationObserver
  const tagged = new Set();

  // ---------------------------------------------------------------- settings
  function pageIsDark() {
    const parse = c => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    for (const el of [document.body, document.documentElement]) {
      const c = el && parse(getComputedStyle(el).backgroundColor);
      if (c && c.a > 0.5) return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) < 128;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function loadSettings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) {}
    const s = {
      enabled: saved.enabled !== false,
      panelOpen: saved.panelOpen !== false,
      mode: saved.mode === 'light' || saved.mode === 'dark'
        ? saved.mode
        : (pageIsDark() ? 'dark' : 'light'),
      on: {},
      colors: { dark: {}, light: {} }
    };
    CATS.forEach(c => {
      s.on[c.id] = saved.on && typeof saved.on[c.id] === 'boolean' ? saved.on[c.id] : true;
      ['dark', 'light'].forEach(m => {
        const v = saved.colors && saved.colors[m] && saved.colors[m][c.id];
        s.colors[m][c.id] = /^#[0-9a-f]{6}$/i.test(v || '') ? v : PALETTES[m][c.def].hex;
      });
    });
    return s;
  }

  function saveSettings() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (e) {}
  }

  // ---------------------------------------------------------------- helpers
  function collect(root, sel) {
    const out = Array.from(root.querySelectorAll(sel));
    if (root.nodeType === 1 && root.matches(sel)) out.unshift(root);
    return out;
  }

  function shouldSkip(el) {
    if (!el || el.nodeType !== 1) return true;
    if (el.closest(SKIP_SEL)) return true;
    const rect = el.getBoundingClientRect();
    return rect.width < 4 || rect.height < 4;
  }

  function hasDirectText(el) {
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.textContent.trim().length > 1) return true;
    }
    return !!el.querySelector('img, picture');
  }

  // ---------------------------------------------------------------- tagging
  function tag(el, cat) {
    if (el.hasAttribute('data-rh') || shouldSkip(el)) return;
    el.setAttribute('data-rh', cat.id);
    tagged.add(el);
  }

  function tagAll(root = document) {
    for (const id of PRIORITY) {
      if (!settings.on[id]) continue;
      const cat = CAT_BY_ID[id];
      collect(root, cat.sel).forEach(el => {
        if (cat.needsText && !hasDirectText(el)) return;
        tag(el, cat);
      });
    }
    updateCount();
  }

  function clearAll() {
    tagged.forEach(el => el.removeAttribute('data-rh'));
    tagged.clear();
    // Safety net for anything tagged before a reload of this script.
    document.querySelectorAll('[data-rh]').forEach(el => el.removeAttribute('data-rh'));
  }

  function retag() {
    clearAll();
    if (settings.enabled) tagAll(document);
    updateCount();
  }

  // ---------------------------------------------------------------- page styles
  function highlightCss() {
    let css = `[data-rh]{transition:background-color ${TRANSITION},box-shadow ${TRANSITION},color ${TRANSITION},outline-color ${TRANSITION};border-radius:3px}`;
    for (const c of CATS) {
      const v = `var(--rh-${c.id})`;
      const a = `[data-rh="${c.id}"]`;
      const mix = p => `color-mix(in srgb,${v} ${p}%,transparent)`;

      if (c.kind === 'inline') {
        css += `${a}{background-color:${mix(18)};color:${v}!important;padding:0 3px;box-decoration-break:clone;-webkit-box-decoration-break:clone}`;
        css += `${a}:hover{background-color:${mix(30)};box-shadow:0 0 0 2px ${mix(35)}}`;
      } else if (c.kind === 'heading') {
        css += `${a}{background-color:${mix(14)};color:${v}!important;box-shadow:inset 4px 0 0 ${mix(80)};padding:1px 4px 1px 8px;margin:-1px -4px -1px -8px;box-decoration-break:clone;-webkit-box-decoration-break:clone}`;
      } else if (c.kind === 'block') {
        css += `${a}{background-color:${mix(c.id === 'text' ? 8 : 11)};box-shadow:inset 3px 0 0 ${mix(55)};padding:1px 4px 1px 6px;margin:-1px -4px -1px -6px;box-decoration-break:clone;-webkit-box-decoration-break:clone}`;
      } else if (c.kind === 'image') {
        css += `${a}{outline:3px solid ${v}!important;outline-offset:1px;box-shadow:0 0 14px ${mix(55)}}`;
      }

      if (c.kind === 'inline' || c.kind === 'heading') {
        css += `:root[data-rh-mode="dark"] ${a}{text-shadow:0 0 7px ${mix(55)}}`;
      }
    }
    css += `[data-rh="link"]{text-decoration:none!important;border-bottom:1px solid var(--rh-link)}`;
    return css;
  }

  function injectStyles() {
    if (document.getElementById('reading-highlighter-style')) return;
    const s = document.createElement('style');
    s.id = 'reading-highlighter-style';
    s.textContent = highlightCss();
    document.head.appendChild(s);
  }

  function applyVars() {
    const root = document.documentElement;
    root.setAttribute('data-rh-mode', settings.mode);
    CATS.forEach(c => root.style.setProperty(`--rh-${c.id}`, settings.colors[settings.mode][c.id]));
  }

  function clearVars() {
    const root = document.documentElement;
    root.removeAttribute('data-rh-mode');
    CATS.forEach(c => root.style.removeProperty(`--rh-${c.id}`));
  }

  // ---------------------------------------------------------------- panel UI
  const UI_CSS = `
    :host { all: initial; }
    :host([data-mode="dark"]) {
      --bg: rgba(15,17,24,.94); --fg: #e5e7eb; --muted: #9ca3af;
      --line: rgba(255,255,255,.12); --chip: rgba(255,255,255,.06);
      --chip-h: rgba(255,255,255,.14); --accent: #22d3ee; --accent-fg: #06222a;
    }
    :host([data-mode="light"]) {
      --bg: rgba(255,255,255,.96); --fg: #111827; --muted: #6b7280;
      --line: rgba(0,0,0,.14); --chip: rgba(0,0,0,.05);
      --chip-h: rgba(0,0,0,.12); --accent: #1d4ed8; --accent-fg: #ffffff;
    }
    * { box-sizing: border-box; }
    .wrap {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      color: var(--fg); user-select: none;
    }
    button { font: inherit; color: inherit; cursor: pointer; }

    .launcher {
      width: 44px; height: 44px; border-radius: 50%;
      display: grid; place-items: center;
      background: var(--bg); border: 1px solid var(--line);
      box-shadow: 0 8px 24px rgba(0,0,0,.35);
      backdrop-filter: blur(10px) saturate(140%);
      -webkit-backdrop-filter: blur(10px) saturate(140%);
    }
    .launcher:hover { background: var(--chip-h); }
    .wrap.open .launcher { display: none; }
    .wrap:not(.open) .panel { display: none; }

    .panel {
      width: 340px; max-width: calc(100vw - 32px); max-height: calc(100vh - 32px);
      display: flex; flex-direction: column;
      background: var(--bg); border: 1px solid var(--line); border-radius: 14px;
      box-shadow: 0 12px 36px rgba(0,0,0,.4);
      backdrop-filter: blur(12px) saturate(140%);
      -webkit-backdrop-filter: blur(12px) saturate(140%);
      overflow: hidden;
    }
    header {
      display: flex; align-items: center; gap: 6px;
      padding: 10px 10px 8px 14px; border-bottom: 1px solid var(--line);
    }
    header strong { font-size: 13px; letter-spacing: .2px; flex: 1; }
    .icon {
      width: 26px; height: 26px; border-radius: 8px;
      border: 1px solid var(--line); background: var(--chip);
      display: grid; place-items: center; padding: 0; line-height: 1;
    }
    .icon:hover { background: var(--chip-h); }

    .master {
      display: flex; align-items: center; gap: 8px; padding: 8px 14px;
      border-bottom: 1px solid var(--line); cursor: pointer;
    }
    .master span { flex: 1; font-weight: 600; }
    kbd {
      font: 11px ui-monospace, SFMono-Regular, Menlo, monospace;
      padding: 1px 5px; border-radius: 5px; color: var(--muted);
      border: 1px solid var(--line); background: var(--chip);
    }

    .seg { display: flex; gap: 4px; padding: 8px 14px 4px; }
    .seg button {
      flex: 1; padding: 5px 8px; border-radius: 8px;
      border: 1px solid var(--line); background: var(--chip);
    }
    .seg button:hover { background: var(--chip-h); }
    .seg button[data-active="true"] {
      background: var(--accent); color: var(--accent-fg); border-color: transparent; font-weight: 600;
    }
    .hint { padding: 2px 14px 6px; color: var(--muted); font-size: 11px; }

    .rows { overflow-y: auto; padding: 2px 0 6px; }
    .panel.off .rows { opacity: .45; }
    .row { display: flex; align-items: center; gap: 8px; padding: 5px 14px; }
    .row:hover { background: var(--chip); }
    .chk { display: flex; align-items: center; gap: 7px; flex: 1; min-width: 0; cursor: pointer; }
    .chk .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; box-shadow: 0 0 0 1px var(--line); }
    .chk .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    input[type="checkbox"] { margin: 0; width: 15px; height: 15px; accent-color: var(--accent); cursor: pointer; }
    .sw { display: flex; gap: 4px; }
    .swatch {
      width: 16px; height: 16px; border-radius: 50%; padding: 0;
      border: 1px solid var(--line);
    }
    .swatch:hover { transform: scale(1.15); }
    .swatch.active { box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--fg); }
    .pick {
      width: 24px; height: 22px; padding: 0; border: 1px solid var(--line);
      border-radius: 6px; background: transparent; cursor: pointer;
    }

    footer {
      display: flex; align-items: center; gap: 6px;
      padding: 8px 14px; border-top: 1px solid var(--line);
    }
    footer .count { flex: 1; color: var(--muted); font-size: 11px; }
    footer button {
      padding: 3px 9px; border-radius: 8px; font-size: 12px;
      border: 1px solid var(--line); background: var(--chip);
    }
    footer button:hover { background: var(--chip-h); }
  `;

  const ICON_PEN = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>';

  function buildUI() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'reading-highlighter-ui';
    host.className = 'rh-skip';
    host.dataset.mode = settings.mode;
    ui = host.attachShadow({ mode: 'open' });

    ui.innerHTML = `
      <style>${UI_CSS}</style>
      <div class="wrap">
        <button class="launcher" data-act="open" title="Open Reading Highlighter (Alt+P)" aria-label="Open Reading Highlighter">${ICON_PEN}</button>
        <section class="panel" role="dialog" aria-label="Reading Highlighter">
          <header>
            <strong>Reading Highlighter</strong>
            <button class="icon" data-act="close" title="Close panel (Alt+P)" aria-label="Close panel">&#x2715;</button>
          </header>
          <label class="master" title="Toggle all highlighting (Alt+R)">
            <input type="checkbox" data-act="enabled">
            <span>Highlighting</span>
            <kbd>Alt+R</kbd>
          </label>
          <div class="seg">
            <button data-mode="light" title="Colors tuned for light pages">&#x2600; Light</button>
            <button data-mode="dark" title="Colors tuned for dark pages (Alt+M toggles)">&#x263E; Dark</button>
          </div>
          <div class="hint">Pick a swatch or the custom color box for each type.</div>
          <div class="rows"></div>
          <footer>
            <span class="count"></span>
            <button data-act="all">All</button>
            <button data-act="none">None</button>
            <button data-act="reset" title="Reset colors for the current mode">Reset colors</button>
          </footer>
        </section>
      </div>`;

    // rows
    const rows = ui.querySelector('.rows');
    CATS.forEach((c, i) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.dataset.id = c.id;
      row.innerHTML = `
        <label class="chk" title="Toggle ${c.label} (Alt+${i + 1})">
          <input type="checkbox">
          <span class="dot"></span>
          <span class="name">${c.label}</span>
        </label>
        <span class="sw"></span>
        <input class="pick" type="color" title="Custom color">`;
      row.querySelector('.chk input').addEventListener('change', () => toggleCategory(c.id));
      row.querySelector('.pick').addEventListener('input', e => setColor(c.id, e.target.value));
      rows.appendChild(row);
    });

    // controls
    ui.addEventListener('click', e => {
      const t = e.target.closest('[data-act],[data-mode]');
      if (!t) return;
      if (t.dataset.mode) return setMode(t.dataset.mode);
      switch (t.dataset.act) {
        case 'open':  setPanelOpen(true); break;
        case 'close': setPanelOpen(false); break;
        case 'all':   setAll(true); break;
        case 'none':  setAll(false); break;
        case 'reset': resetColors(); break;
      }
    });
    ui.querySelector('[data-act="enabled"]').addEventListener('change', e => setEnabled(e.target.checked));

    document.body.appendChild(host);
    refreshUI();
  }

  function paintRow(row) {
    const id = row.dataset.id;
    const mode = settings.mode;
    const cur = settings.colors[mode][id];
    row.querySelector('.chk input').checked = settings.on[id];
    row.querySelector('.dot').style.background = cur;
    const pick = row.querySelector('.pick');
    if (pick.value.toLowerCase() !== cur.toLowerCase()) pick.value = cur;

    const sw = row.querySelector('.sw');
    sw.innerHTML = '';
    PALETTES[mode].forEach(p => {
      const b = document.createElement('button');
      b.className = 'swatch' + (p.hex.toLowerCase() === cur.toLowerCase() ? ' active' : '');
      b.style.background = p.hex;
      b.title = p.name;
      b.setAttribute('aria-label', `${CAT_BY_ID[id].label}: ${p.name}`);
      b.addEventListener('click', () => setColor(id, p.hex));
      sw.appendChild(b);
    });
  }

  function refreshUI() {
    if (!ui) return;
    host.dataset.mode = settings.mode;
    ui.querySelector('.wrap').classList.toggle('open', settings.panelOpen);
    ui.querySelector('.panel').classList.toggle('off', !settings.enabled);
    ui.querySelector('[data-act="enabled"]').checked = settings.enabled;
    ui.querySelectorAll('.seg button').forEach(b => {
      b.dataset.active = String(b.dataset.mode === settings.mode);
    });
    ui.querySelectorAll('.row').forEach(paintRow);
    updateCount();
  }

  function updateCount() {
    if (!ui) return;
    const n = settings.enabled ? document.querySelectorAll('[data-rh]').length : 0;
    ui.querySelector('.count').textContent = settings.enabled ? `${n} highlighted` : 'Highlighting off';
  }

  // ---------------------------------------------------------------- actions
  function setPanelOpen(open) {
    settings.panelOpen = open;
    saveSettings();
    if (ui) ui.querySelector('.wrap').classList.toggle('open', open);
  }

  function togglePanel() { setPanelOpen(!settings.panelOpen); }

  function setEnabled(on) {
    settings.enabled = on;
    saveSettings();
    if (on) {
      injectStyles();
      applyVars();
      tagAll(document);
      startObserver();
    } else {
      stopObserver();
      clearAll();
      clearVars();
    }
    refreshUI();
  }

  function setMode(mode) {
    if (mode !== 'light' && mode !== 'dark') return;
    settings.mode = mode;
    saveSettings();
    if (settings.enabled) applyVars();
    refreshUI();
  }

  function setColor(id, hex) {
    settings.colors[settings.mode][id] = hex;
    saveSettings();
    if (settings.enabled) applyVars();
    const row = ui && ui.querySelector(`.row[data-id="${id}"]`);
    if (row) paintRow(row);
  }

  function resetColors() {
    CATS.forEach(c => { settings.colors[settings.mode][c.id] = PALETTES[settings.mode][c.def].hex; });
    saveSettings();
    if (settings.enabled) applyVars();
    refreshUI();
  }

  function toggleCategory(id) {
    settings.on[id] = !settings.on[id];
    saveSettings();
    const row = ui && ui.querySelector(`.row[data-id="${id}"]`);
    if (row) paintRow(row);
    retag();
  }

  function setAll(on) {
    CATS.forEach(c => { settings.on[c.id] = on; });
    saveSettings();
    refreshUI();
    retag();
  }

  // ---------------------------------------------------------------- observer
  function startObserver() {
    if (mo) return;
    const pending = new Set();
    let timer;
    mo = new MutationObserver(muts => {
      for (const m of muts) {
        m.addedNodes.forEach(n => {
          if (n.nodeType === 1 && n !== host) pending.add(n);
        });
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (settings.enabled) pending.forEach(n => { if (n.isConnected) tagAll(n); });
        pending.clear();
      }, 150);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (mo) { mo.disconnect(); mo = null; }
  }

  // ---------------------------------------------------------------- keys
  // Uses e.code so Alt combos also work on macOS (where Alt+R types a symbol).
  document.addEventListener('keydown', e => {
    if (!e.altKey || e.ctrlKey || e.metaKey || !settings) return;
    if (e.code === 'KeyR') { e.preventDefault(); setEnabled(!settings.enabled); return; }
    if (e.code === 'KeyP') { e.preventDefault(); togglePanel(); return; }
    if (e.code === 'KeyM') { e.preventDefault(); setMode(settings.mode === 'dark' ? 'light' : 'dark'); return; }
    const m = /^Digit([1-9])$/.exec(e.code);
    if (m && settings.enabled && CATS[+m[1] - 1]) {
      e.preventDefault();
      toggleCategory(CATS[+m[1] - 1].id);
    }
  });

  // ---------------------------------------------------------------- boot
  const boot = () => {
    settings = loadSettings();
    injectStyles();
    buildUI();
    if (settings.enabled) {
      applyVars();
      tagAll(document);
      startObserver();
    }
    refreshUI();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();