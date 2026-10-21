// --- CLAUDE RTL PATCH START ---
;(function () {
  if (typeof document === 'undefined' || globalThis.__claudeRtl) return;
  globalThis.__claudeRtl = true;

  const CODE = 'pre, code, .katex, .katex-display, mjx-container, math, [data-crtl-ui]';
  const BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, ul, ol, table, td, th, summary, figcaption';
  const INPUTS = '[contenteditable="true"], [contenteditable="true"] p, textarea';
  const FONT_B64 = '__FONT_B64__';
  const KEY = 'claude-rtl';
  const DEFAULTS = { enabled: true, force: false, font: 'vazir', custom: '', lineHeight: 0, lock: false, layout: null, keys: true };

  let wf; try { wf = require('electron').webFrame; } catch (_) {}
  let st = { ...DEFAULTS };
  // Read in start(): a preload runs before the page's origin exists, so localStorage throws here.
  const load = () => { try { st = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (_) {} };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (_) {} };

  // ---- CSS: constructable stylesheets are exempt from the page CSP and sort after Claude's own sheets ----
  const slots = {}, sheets = {};
  let cssMode = '';
  function adopt() {
    for (const sh of Object.values(sheets)) {
      if (!document.adoptedStyleSheets.includes(sh)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, sh];
    }
  }
  function setCss(name, css) {
    try {
      const sh = sheets[name] || (sheets[name] = new CSSStyleSheet());
      sh.replaceSync(css || '');
      adopt();
      cssMode = 'adopted';
      return;
    } catch (_) {}
    try {
      if (wf) {
        if (slots[name] != null) wf.removeCSS(slots[name]);
        slots[name] = css ? wf.insertCSS(css) : null;
        cssMode = 'insertCSS';
        return;
      }
    } catch (_) {}
    let el = slots[name];
    if (!el) { el = slots[name] = document.createElement('style'); (document.head || document.documentElement).appendChild(el); }
    el.textContent = css;
    cssMode = 'style-element';
  }

  const UI_CSS = `
    [data-crtl-ui] input[type=text], [data-crtl-ui] select { width: 100%; background: transparent; color: inherit; border: 1px solid var(--cds-border, color-mix(in srgb, currentColor 25%, transparent)); border-radius: 6px; padding: 3px 6px; font: inherit; }
    [data-crtl-ui] input[type=range] { width: 100%; }
    [data-crtl-ui] .crtl-actions { display: flex; gap: 6px; }
    [data-crtl-ui] .crtl-actions button { flex: 1; background: transparent; color: inherit; border: 1px solid var(--cds-border, color-mix(in srgb, currentColor 25%, transparent)); border-radius: 6px; padding: 3px 6px; font: inherit; cursor: pointer; }
    [data-crtl-ui] .crtl-actions button:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
    [data-crtl-ui] .crtl-sub { padding-block: 2px 8px; display: flex; flex-direction: column; gap: 6px; }
    ${CODE.replace(', [data-crtl-ui]', '')} { direction: ltr !important; unicode-bidi: isolate !important; text-align: left !important; }
    pre, code { font-family: var(--font-mono, ui-monospace, monospace) !important; }
  `;

  // Principled approach: extend Claude's own font families (anthropic-sans / anthropic-serif, which every
  // --font-* token resolves to) with a face for Arabic-script code points only. Descriptors must match
  // Claude's faces exactly, otherwise the browser treats ours as a separate face and ignores it.
  // Latin keeps Claude's font. If those families are ever renamed, fall back to the alias 'Claude RTL'.
  const RANGE = 'U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF, U+200C-200D';
  const OWN = /^"?anthropic-(sans|serif)"?$/;
  const TEXT = ':is([data-crtl], [dir="rtl"]) :not(pre, code, pre *, code *, .katex *)';
  let added = [], aliasMode = false, fontSeq = 0;

  function setStatus(msg) {
    const el = panel && panel.querySelector('[data-k="fontStatus"]');
    if (el) el.textContent = msg;
  }

  function buildCss() {
    if (!st.enabled) return setCss('dyn', '');
    const fam = aliasMode ? `font-family: 'Claude RTL', var(--font-ui, system-ui), system-ui, sans-serif !important;` : '';
    // Source of truth is Claude's token chain (.cds-root --cds-leading-prose -> .prose --_prose-leading -> line-height).
    // calc(N * 1em) keeps their calc(var(--_prose-leading) + .1875rem) heading math valid, which a bare number would break.
    const L = `calc(${st.lineHeight} * 1em)`;
    const lh = st.lineHeight ? `
      :is(.prose, [data-cds="Prose"]):has(:dir(rtl)) { --cds-leading-prose: ${L} !important; --_prose-leading: ${L} !important; line-height: ${L} !important; }
      :dir(rtl):not(pre, code, pre *, code *, .katex *, [data-crtl-ui] *) { line-height: ${st.lineHeight} !important; }` : '';
    setCss('dyn', `
      ${fam ? `[data-crtl], [dir="rtl"], ${INPUTS}, ${TEXT} { ${fam} }` : ''}
      ${lh}
      ${INPUTS} { unicode-bidi: plaintext; text-align: start; }`);
  }

  // FontFace objects (binary data / local()) avoid the page CSP that blocks @font-face URLs.
  async function applyFont() {
    const seq = ++fontSeq;
    for (const f of added) document.fonts.delete(f);
    added = [];
    setStatus('');
    const was = aliasMode; aliasMode = false;
    const name = st.custom.replace(/["'\\()]/g, '');
    const off = !st.enabled || st.font === 'none' || (st.font === 'custom' && !name) || typeof FontFace === 'undefined';
    if (!off) {
      try {
        const buf = st.font === 'vazir' ? Uint8Array.from(atob(FONT_B64), (c) => c.charCodeAt(0)).buffer : null;
        const src = () => buf ? buf.slice(0) : `local("${name}"), local("${name}-Regular")`;
        const combos = new Map();
        for (const f of document.fonts) {
          if (OWN.test(f.family)) combos.set([f.family, f.weight, f.style, f.stretch].join('|'), f);
        }
        const faces = [...combos.values()].map((f) => new FontFace(f.family.replace(/"/g, ''), src(),
          { weight: f.weight, style: f.style, stretch: f.stretch, unicodeRange: RANGE }));
        if (!faces.length) { aliasMode = true; faces.push(new FontFace('Claude RTL', src(), { weight: '100 900', unicodeRange: RANGE })); }
        await Promise.all(faces.map((f) => f.load()));
        if (seq !== fontSeq) return;
        faces.forEach((f) => document.fonts.add(f));
        added = faces;
        setStatus(aliasMode ? 'Font loaded (fallback mode)' : 'Font loaded');
      } catch (e) {
        if (seq === fontSeq) setStatus(`Font not found: ${st.font === 'custom' ? name : e.message}`);
      }
    }
    if (seq === fontSeq && was !== aliasMode) buildCss();
  }

  function applyCss() { buildCss(); return applyFont(); }

  // ---- direction marking (native dir attributes are left alone, except on inputs) ----
  const mode = () => (st.force ? 'rtl' : 'auto');

  function mark(root) {
    if (!st.enabled || root.nodeType !== 1 || root.closest('[data-crtl-ui]')) return;
    const sel = BLOCKS + ',' + INPUTS + (st.force ? ', .prose, [data-cds="Prose"]' : '');
    const els = root.matches(sel) ? [root] : [];
    els.push(...root.querySelectorAll(sel));
    for (const el of els) {
      if (el.closest(CODE)) continue;
      if (!el.hasAttribute('data-crtl')) {
        const native = el.hasAttribute('dir');
        if (native && !st.force && !el.matches(INPUTS)) continue;
        if (native) el.setAttribute('data-crtl-orig', el.getAttribute('dir'));
        el.setAttribute('data-crtl', '');
      }
      if (el.dir !== mode()) el.dir = mode();
    }
  }

  function unmark() {
    document.querySelectorAll('[data-crtl]').forEach((el) => {
      const orig = el.getAttribute('data-crtl-orig');
      if (orig != null) el.setAttribute('dir', orig); else el.removeAttribute('dir');
      el.removeAttribute('data-crtl'); el.removeAttribute('data-crtl-orig');
    });
  }

  function refresh() {
    save();
    applyCss();
    if (st.enabled) {
      document.querySelectorAll('[data-crtl]').forEach((el) => {
        const orig = el.getAttribute('data-crtl-orig');
        if (orig != null && !st.force && !el.matches(INPUTS)) {
          el.setAttribute('dir', orig); el.removeAttribute('data-crtl'); el.removeAttribute('data-crtl-orig');
        } else el.dir = mode();
      });
      mark(document.body);
    }
    else unmark();
    syncPanel();
  }

  // ---- UI: titlebar button + settings menu, markup copied from Claude's own menu ----
  const ROW = 'crtl-row cds-reset flex w-full items-center gap-xs compact:px-2 comfortable:px-2.5 py-[calc((var(--cds-h-control)-var(--cds-leading-body))/2)] rounded text-body font-normal font-control [--cds-shortcut-cap-ink:var(--cds-text-muted)] select-none outline-none focus-visible:outline-hidden data-[disabled]:opacity-disabled data-[disabled]:pointer-events-none data-[disabled]:focus-visible:shadow-focus text-primary data-[highlighted]:bg-fill-ghost-hover pb-[calc((var(--cds-h-control)-var(--cds-font-size-body)-var(--cds-leading-footnote)+var(--cds-font-size-footnote))/2)]';
  const MENU = 'cds-reset draggable-none group/menu-popup relative flex flex-col min-w-[128px] max-w-[320px] max-h-[var(--available-height)] bg-surface-3 shadow-panel text-body font-normal text-primary outline-none focus-visible:outline-hidden rounded-[calc(var(--cds-radius)+var(--cds-menu-gutter,calc(0.25rem*var(--cds-rem-scale,1))))] epitaxy-root break-words';
  const SCROLL = 'relative min-h-0 overflow-y-auto overflow-x-hidden scroll-fade-y rounded-[inherit] border-b-[length:var(--cds-ring-inner)] border-transparent forced-colors:border-b-0 p-[var(--cds-menu-gutter,0.25rem)]';
  const SWITCH = '<span inert=""><span data-unchecked="" role="switch" aria-checked="false" data-cds="Switch" data-size="xs" class="cds-reset relative inline-flex shrink-0 rounded-full border-0 outline-none focus-visible:outline-hidden bg-[var(--cds-switch-track)] hover:bg-[var(--cds-switch-track-hover)] data-[checked]:bg-fill-accent data-[checked]:hover:bg-fill-accent-hover data-[disabled]:opacity-disabled data-[disabled]:hover:bg-[var(--cds-switch-track)] data-[checked]:data-[disabled]:hover:bg-fill-accent focus-visible:shadow-focus forced-colors:border forced-colors:border-solid forced-colors:border-[color:CanvasText] forced-colors:data-[checked]:border-[color:Highlight] forced-colors:data-[checked]:!bg-[color:Highlight] h-[var(--cds-switch-h)] w-[calc(var(--cds-switch-h,1.25rem)*1.8)] p-[2px] forced-colors:p-px"><span data-unchecked="" class="block rounded-full bg-[var(--cds-switch-knob)] shadow-sm transition-transform duration-snap ease-overshoot motion-reduce:transition-none forced-colors:bg-[color:CanvasText] forced-colors:data-[checked]:bg-[color:HighlightText] size-[calc(var(--cds-switch-h,1.25rem)-4px)] data-[checked]:translate-x-[calc(var(--cds-switch-h,1.25rem)*0.8)]"></span></span></span>';
  const ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h11M3 12h7M3 18h11"/><path d="M21 8l-4 4 4 4"/></svg>';
  let panel = null, btn = null;

  const toggleRow = (key, label, hint) => `<div role="menuitemcheckbox" tabindex="-1" aria-checked="false" data-key="${key}" class="${ROW}"><span class="flex min-w-0 flex-1 flex-col"><span class="truncate">${label}</span><span class="break-words text-footnote text-muted">${hint}</span></span><span class="ms-md flex shrink-0 items-center gap-xs min-h-[1lh] self-start has-[[data-cds=Switch],[data-cds=Checkbox],[data-cds=Button]]:self-stretch">${SWITCH}</span></div>`;
  const SEP = '<div data-orientation="horizontal" role="separator" aria-orientation="horizontal" class="compact:mx-2 comfortable:mx-2.5 my-1 h-px bg-border"></div>';

  function buildPanel() {
    panel = document.createElement('div');
    panel.setAttribute('data-crtl-ui', ''); panel.setAttribute('data-open', ''); panel.setAttribute('role', 'presentation');
    panel.dir = 'ltr'; panel.className = 'crtl-panel';
    panel.style.cssText = 'position:fixed;top:0;left:0;z-index:120;--cds-layer-base:100;';
    panel.innerHTML = `<div data-side="bottom" data-align="end" data-open="" tabindex="-1" role="menu" data-cds-overlay="" data-cds="Menu" class="${MENU}" style="width:272px"><div class="${SCROLL}" data-cds-sheet-scroll="">
      ${toggleRow('enabled', 'Smart RTL', 'Auto-align Persian, Arabic, Hebrew · Alt+R')}
      ${toggleRow('force', 'Force RTL', 'Right-align everything')}
      ${SEP}
      <div class="crtl-sub compact:px-2 comfortable:px-2.5">
        <span class="text-footnote text-muted">RTL font</span>
        <select data-k="font"><option value="vazir">Vazirmatn (built in)</option><option value="custom">Installed font…</option><option value="none">Claude default</option></select>
        <input type="text" data-k="custom" placeholder="Font name, e.g. Dana-Regular" />
        <span class="text-footnote text-muted" data-k="fontStatus"></span>
        <span class="text-footnote text-muted">Line height <span data-k="lhLabel"></span></span>
        <input type="range" data-k="lineHeight" min="0" max="2.4" step="0.1" />
      </div>
      ${SEP}
      ${toggleRow('keys', 'Model & effort shortcuts', 'Alt+1–4 model · Alt+0,9,8,7,6,5 effort')}
      ${SEP}
      ${toggleRow('lock', 'Lock layout', 'Reopen saved panes and sizes in every session')}
      <div class="crtl-sub compact:px-2 comfortable:px-2.5">
        <div class="crtl-actions"><button type="button" data-act="save">Save current</button><button type="button" data-act="apply">Apply now</button></div>
        <span class="text-footnote text-muted" data-k="layoutStatus"></span>
      </div></div></div>`;
    panel.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (act) return act.dataset.act === 'save' ? saveLayout() : applyLayout();
      const row = e.target.closest('[data-key]');
      if (row) {
        st[row.dataset.key] = !st[row.dataset.key]; refresh();
        if (row.dataset.key === 'lock' && st.lock && st.layout) applyLayout();
      }
    });
    panel.addEventListener('mouseover', (e) => {
      const row = e.target.closest('[data-key]');
      panel.querySelectorAll('[data-highlighted]').forEach((r) => r !== row && r.removeAttribute('data-highlighted'));
      if (row) row.setAttribute('data-highlighted', '');
    });
    panel.addEventListener('mouseleave', () => panel.querySelectorAll('[data-highlighted]').forEach((r) => r.removeAttribute('data-highlighted')));
    panel.addEventListener('input', (e) => {
      const k = e.target.dataset.k; if (!k) return;
      st[k] = k === 'lineHeight' ? +e.target.value : e.target.value;
      refresh();
    });
    panel.hidden = true;
    document.body.appendChild(panel);
    syncPanel();
  }

  function syncPanel() {
    if (!panel) return;
    for (const row of panel.querySelectorAll('[data-key]')) {
      const on = !!st[row.dataset.key], sw = row.querySelector('[role=switch]');
      row.setAttribute('aria-checked', on); sw.setAttribute('aria-checked', on);
      row.toggleAttribute('data-unchecked', !on); row.toggleAttribute('data-checked', on);
      for (const n of [sw, sw.firstChild]) { n.toggleAttribute('data-checked', on); n.toggleAttribute('data-unchecked', !on); }
    }
    const q = (k) => panel.querySelector(`[data-k="${k}"]`);
    q('font').value = st.font; q('custom').hidden = st.font !== 'custom';
    q('custom').value = st.custom; q('lineHeight').value = st.lineHeight;
    q('lhLabel').textContent = st.lineHeight ? `(${st.lineHeight})` : '(default)';
  }

  function placePanel() {
    const r = btn.getBoundingClientRect(), w = panel.firstElementChild.offsetWidth;
    panel.style.transform = `translate(${Math.max(8, r.right - w)}px, ${r.bottom + 6}px)`;
  }

  function togglePanel(open) {
    if (!panel) buildPanel();
    open = open ?? panel.hidden;
    panel.hidden = !open;
    btn.setAttribute('aria-pressed', open);
    if (open) placePanel();
  }

  function ensureButton() {
    if (btn && btn.isConnected) return;
    const bar = document.querySelector('.epitaxy-titlebar-end');
    const tpl = bar && bar.querySelector('button[data-cds-icon-only][aria-pressed="false"]');
    if (!tpl) return;
    btn = tpl.cloneNode(true);
    for (const a of ['id', 'aria-keyshortcuts', 'data-base-ui-tooltip-trigger']) btn.removeAttribute(a);
    btn.setAttribute('data-crtl-ui', ''); btn.setAttribute('aria-label', 'RTL settings'); btn.title = 'RTL settings (Alt+R)';
    btn.setAttribute('aria-pressed', 'false');
    const icon = btn.querySelector('[data-cds="Icon"]');
    if (icon) icon.outerHTML = ICON; else btn.insertAdjacentHTML('beforeend', ICON);
    btn.addEventListener('click', (e) => { e.stopPropagation(); togglePanel(); });
    const anchor = bar.querySelector('button[aria-label="View options"]');
    anchor ? anchor.after(btn) : bar.append(btn);
  }

  // ---- Alt+1..4 pick a model, Alt+0/9/8/7/6/5 pick an effort, by driving Claude's own menus ----
  const MODELS = { Digit1: 'haiku', Digit2: 'sonnet', Digit3: 'opus', Digit4: 'fable' };
  const EFFORTS = { Digit0: /^low/i, Digit9: /^medium/i, Digit8: /^high/i, Digit7: /^(extra|x-?high)/i, Digit6: /^max/i, Digit5: /^ultra/i };

  function press(el) {
    const P = window.PointerEvent || MouseEvent;
    const o = { bubbles: true, cancelable: true, button: 0, view: window, pointerType: 'mouse', isPrimary: true };
    for (const t of ['pointerover', 'mouseover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      el.dispatchEvent(new (t.startsWith('pointer') ? P : MouseEvent)(t, o));
    }
  }

  // Base UI opens menus on pointer-down; a following click with detail 0 counts as a keyboard click and toggles it shut.
  function pressDown(el) {
    const P = window.PointerEvent || MouseEvent;
    const o = { bubbles: true, cancelable: true, button: 0, buttons: 1, view: window, pointerType: 'mouse', isPrimary: true };
    for (const t of ['pointerover', 'mouseover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      el.dispatchEvent(new (t.startsWith('pointer') ? P : MouseEvent)(t, o));
    }
  }

  async function openMenu(trig, menuSel) {
    if (trig.getAttribute('aria-expanded') !== 'true') {
      pressDown(trig);
      if (!(await waitFor(() => trig.getAttribute('aria-expanded') === 'true', 500))) press(trig);
    }
    return waitFor(menuSel);
  }

  function waitFor(fn, ms = 1200) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      (function tick() {
        const v = fn();
        if (v || performance.now() - t0 > ms) return resolve(v || null);
        requestAnimationFrame(tick);
      })();
    });
  }

  const modelTrigger = () => document.querySelector('[data-cds="ModelSelector"][aria-haspopup="menu"]');
  const closeMenus = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  async function openModelMenu() {
    const trig = modelTrigger();
    if (!trig) return null;
    return openMenu(trig, () => document.querySelector('[role="menu"][data-cds="ModelSelector"]'));
  }

  const usable = (el) => el && !el.hasAttribute('data-disabled') && el.getAttribute('aria-disabled') !== 'true';

  async function pickModel(family) {
    const menu = await openModelMenu();
    const item = menu && menu.querySelector(`[role="menuitemradio"][data-model-id*="${family}"]`);
    if (usable(item)) press(item); else closeMenus();
  }

  async function pickEffort(re) {
    const menu = await openModelMenu();
    const row = menu && [...menu.querySelectorAll('[role="menuitem"][aria-haspopup="menu"]')].find((r) => /^effort/i.test(r.textContent.trim()));
    if (!row) return closeMenus();
    press(row);
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true }));
    const item = await waitFor(() => [...document.querySelectorAll('[role="menu"] [role="menuitemradio"]')]
      .find((i) => !i.hasAttribute('data-model-id') && re.test(i.textContent.trim())));
    if (usable(item)) { press(item); closeMenus(); } else closeMenus();
  }

  // ---- Layout lock: reopen the same panes and split sizes in every session ----
  // Claude keeps pane layout per session in memory, so we drive its own controls: titlebar toggles,
  // the "Side chat" menu item, and the aria-valuenow splitters (role=separator, data-tile-divider).
  const PANES = ['Terminal', 'Changes', 'Browser', 'Files'];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const bar = () => document.querySelector('.epitaxy-titlebar-end');
  const paneBtn = (label) => bar() && bar().querySelector(`button[aria-label="${label}"]`);
  const dividers = () => [...document.querySelectorAll('[data-tile-divider]')];
  const pressed = (b) => b.getAttribute('aria-pressed') === 'true';

  function setLayoutStatus(msg) {
    const el = panel && panel.querySelector('[data-k="layoutStatus"]');
    if (el) el.textContent = msg;
  }

  async function sideChatItem() {
    const trig = document.querySelector('button[aria-label="View options"]');
    if (!trig) return null;
    return openMenu(trig, () => [...document.querySelectorAll('[role="menuitemcheckbox"]')].find((i) => /^side chat/i.test(i.textContent.trim())));
  }

  const sideChatOpen = () => dividers().some((d) => /side chat/i.test(d.getAttribute('aria-label') || ''));

  // Tries ⌘; first, then the View options menu (pointer, then keyboard). `trace` says which step failed.
  async function setSideChat(want, trace = []) {
    if (sideChatOpen() === want) return true;
    const key = (type, init) => document.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }));
    key('keydown', { key: ';', code: 'Semicolon', metaKey: true }); key('keyup', { key: ';', code: 'Semicolon', metaKey: true });
    if (await waitFor(() => sideChatOpen() === want, 600)) return true;
    trace.push('shortcut✗');
    const item = await sideChatItem();
    if (!item) { trace.push('menu✗'); closeMenus(); return false; }
    trace.push('menu✓');
    if ((item.getAttribute('aria-checked') === 'true') === want) { trace.push('item already ' + want); closeMenus(); return false; }
    press(item);
    if (await waitFor(() => sideChatOpen() === want, 800)) return true;
    trace.push('click✗');
    if (item.isConnected) {
      item.focus();
      for (const t of ['keydown', 'keyup']) item.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
      if (await waitFor(() => sideChatOpen() === want, 800)) return true;
      trace.push('enter✗');
    }
    closeMenus();
    return false;
  }

  // Claude persists each session's pane tree (columns, order, flex widths) here; we save and re-inject the whole tree.
  const STORE = 'epitaxy.sidePaneStore.v1';
  const activeSession = () => { try { return JSON.parse(localStorage.getItem('desktop-frame.paneStore.v1')).state.lastPrimaryCodeSession.id; } catch (_) { return null; } };
  const readTree = () => { try { return JSON.parse(localStorage.getItem(STORE)).state.tileLayout || null; } catch (_) { return null; } };

  function injectTree(tree) {
    try {
      const raw = localStorage.getItem(STORE), obj = JSON.parse(raw), id = activeSession();
      localStorage.setItem('claude-rtl-backup', raw); // previous value, in case an injection misbehaves
      obj.state.tileLayout = JSON.parse(JSON.stringify(tree));
      if (id && obj.state.tileLayoutBySession) obj.state.tileLayoutBySession[id] = JSON.parse(JSON.stringify(tree));
      const next = JSON.stringify(obj);
      localStorage.setItem(STORE, next);
      window.dispatchEvent(new StorageEvent('storage', { key: STORE, oldValue: raw, newValue: next, url: location.href, storageArea: localStorage }));
      return true;
    } catch (_) { return false; }
  }

  // Structure + rough widths, so tiny float noise does not trigger a reload.
  function treeSig(t) {
    const walk = (n) => (n.kind === 'tile' ? `${n.tileId}:${(+n.flex).toFixed(1)}` : `${n.direction}(${n.children.map(walk).join(',')})`);
    try { return walk(t.root); } catch (_) { return ''; }
  }

  async function saveLayout() {
    const panes = {};
    for (const l of PANES) { const b = paneBtn(l); if (b && b.hasAttribute('aria-pressed')) panes[l] = pressed(b); }
    if (!Object.keys(panes).length) return setLayoutStatus('Nothing to save: open a session first');
    panes['Side chat'] = sideChatOpen();
    const ds = dividers().map((d) => ({ label: d.getAttribute('aria-label'), value: +d.getAttribute('aria-valuenow') }));
    st.layout = { panes, dividers: ds, tree: readTree() };
    save();
    const open = Object.keys(panes).filter((k) => panes[k]);
    setLayoutStatus(`Saved: ${open.join(', ') || 'chat only'} · ${ds.length} splitter(s)${st.layout.tree ? ' · full tree' : ''}`);
  }

  // Returns {ok, how}. Tries the keyboard splitter pattern, then self-calibrating pointer drags.
  async function setDivider(label, target) {
    const find = () => dividers().find((d) => d.getAttribute('aria-label') === label);
    const val = () => +(find() ? find().getAttribute('aria-valuenow') : NaN);
    const near = () => Math.abs(val() - target) <= 1.5;
    if (!find()) return { ok: false, how: 'missing' };
    if (near()) return { ok: true, how: 'already' };
    const vert = find().getAttribute('aria-orientation') === 'vertical';
    const start = val();

    find().focus();
    for (let i = 0; i < 60 && !near(); i++) {
      const before = val(), up = target > before;
      const key = up ? (vert ? 'ArrowRight' : 'ArrowDown') : (vert ? 'ArrowLeft' : 'ArrowUp');
      find().dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }));
      await sleep(70);
      const after = val();
      if (after === before || (up ? after > target + 1.5 : after < target - 1.5)) break;
    }
    if (near()) return { ok: true, how: 'keys' };

    const P = window.PointerEvent || MouseEvent;
    const drag = async (px) => {
      const el = find(), r = el.getBoundingClientRect();
      const x0 = r.x + r.width / 2, y0 = r.y + r.height / 2;
      const at = (k) => (vert ? [x0 + (px * k) / 8, y0] : [x0, y0 + (px * k) / 8]);
      const fire = (t, [x, y]) => { try { el.dispatchEvent(new (t.startsWith('pointer') ? P : MouseEvent)(t, {
        bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: t.endsWith('up') ? 0 : 1,
        pointerId: 1, pointerType: 'mouse', isPrimary: true, view: window })); } catch (_) {} };
      fire('pointerdown', at(0)); fire('mousedown', at(0));
      for (let k = 1; k <= 8; k++) { fire('pointermove', at(k)); fire('mousemove', at(k)); await sleep(16); }
      fire('pointerup', at(8)); fire('mouseup', at(8));
      await sleep(150);
    };
    const probe = vert ? 40 : 30, v0 = val();
    await drag(probe);
    const perPx = (val() - v0) / probe; // percent per pixel, signed
    if (!perPx) return { ok: false, how: `no effect from keys or drag (${start}%)` };
    for (let i = 0; i < 3 && !near(); i++) await drag((target - val()) / perPx);
    return { ok: near(), how: `drag ${start}→${val()}` };
  }

  let applying = false;
  async function applyLayout() {
    const L = st.layout;
    if (!L || applying) return;
    applying = true;
    try {
      if (!(await waitFor(() => bar() && bar().querySelector('button[aria-pressed]'), 5000))) return setLayoutStatus('Titlebar not found');
      for (const [label, want] of Object.entries(L.panes)) {
        if (label === 'Side chat') continue;
        const b = paneBtn(label);
        if (b && b.hasAttribute('aria-pressed') && pressed(b) !== want) { press(b); await sleep(150); }
      }
      let sc = '';
      if (L.tree && treeSig(readTree()) !== treeSig(L.tree)) {
        // The app keeps its layout in memory and ignores storage events, so write the tree and reload once to adopt it.
        const tag = sessionKey();
        let last = '';
        try { last = sessionStorage.getItem('claude-rtl-reload') || ''; } catch (_) {}
        const [lastTag, lastAt] = [last.slice(0, last.lastIndexOf('@')), +last.slice(last.lastIndexOf('@') + 1)];
        if (lastTag === tag && Date.now() - lastAt < 20000) {
          setLayoutStatus('Reloaded, but Claude did not adopt the saved layout; used buttons instead');
        } else if (injectTree(L.tree)) {
          try { sessionStorage.setItem('claude-rtl-reload', `${tag}@${Date.now()}`); } catch (_) {}
          setLayoutStatus('Layout written · reloading…');
          return (globalThis.__claudeRtlReload || (() => location.reload()))();
        }
      }
      if (typeof L.panes['Side chat'] === 'boolean') {
        const trace = [];
        if (!(await setSideChat(L.panes['Side chat'], trace))) sc = ` · Side chat failed (${trace.join(' ')})`;
      }
      await sleep(500);
      // Claude may still be laying out (animations, late default sizes), so re-check and re-apply drifted splitters.
      const run = async () => {
        const out = [];
        for (const d of L.dividers) out.push([d.label, d.value, await setDivider(d.label, d.value)]);
        return out;
      };
      // Neighbouring splitters share a pane, so moving one shifts the ratio of the next; iterate until stable.
      const settled = () => L.dividers.every((d) => { const el = dividers().find((x) => x.getAttribute('aria-label') === d.label); return el && Math.abs(+el.getAttribute('aria-valuenow') - d.value) <= 1.5; });
      let res = await run();
      for (let i = 0; i < 5 && !settled(); i++) res = await run();
      for (let i = 0; i < 2; i++) {
        await sleep(1200);
        const drift = L.dividers.filter((d) => {
          const el = dividers().find((x) => x.getAttribute('aria-label') === d.label);
          return el && Math.abs(+el.getAttribute('aria-valuenow') - d.value) > 1.5;
        });
        if (!drift.length) break;
        res = await run();
      }
      const now = (l) => { const el = dividers().find((x) => x.getAttribute('aria-label') === l); return el ? Math.round(el.getAttribute('aria-valuenow')) : '?'; };
      const short = (l) => l.replace(/^Resize /, '').replace(/ and /g, '|');
      console.log('[claude-rtl] layout', res.map(([l, w, r]) => `${l}: want ${w}, now ${now(l)} (${r.how})`));
      const good = res.filter(([l, w]) => Math.abs(now(l) - w) <= 1.5).length;
      setLayoutStatus(`Applied · splitters ${good}/${res.length}${sc} · ` + res.map(([l, w]) => `${short(l)} ${now(l)}/${w}`).join(' · '));
    } finally { applying = false; }
  }

  // Claude records the active session id in its pane store; the URL alone may not change between sessions.
  let lastKey = '', applyTimer = 0;
  function sessionKey() {
    try { return (JSON.parse(localStorage.getItem('desktop-frame.paneStore.v1')).state.lastPrimaryCodeSession || {}).id + '|' + location.href; }
    catch (_) { return location.href; }
  }
  function checkSession() {
    const k = sessionKey();
    if (k === lastKey) return;
    lastKey = k;
    if (st.enabled && st.lock && st.layout) { clearTimeout(applyTimer); applyTimer = setTimeout(applyLayout, 700); }
  }

  // ---- boot ----
  function start() {
    load();
    setCss('ui', UI_CSS);
    applyCss();
    mark(document.body);
    ensureButton();
    checkSession();
    addEventListener('load', () => setTimeout(applyFont, 1500));

    let queue = new Set(), raf = 0;
    new MutationObserver((muts) => {
      for (const m of muts) m.addedNodes.forEach((n) => n.nodeType === 1 && queue.add(n));
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; const q = queue; queue = new Set(); q.forEach(mark); ensureButton(); checkSession(); try { adopt(); } catch (_) {} });
    }).observe(document.body, { childList: true, subtree: true });

    document.addEventListener('click', (e) => {
      if (e.isTrusted && panel && !panel.hidden && !e.target.closest('[data-crtl-ui]')) togglePanel(false);
    }, true);
    addEventListener('resize', () => panel && !panel.hidden && placePanel());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && e.isTrusted && panel && !panel.hidden) togglePanel(false);
      if (st.keys && e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && (MODELS[e.code] || EFFORTS[e.code])) {
        e.preventDefault();
        MODELS[e.code] ? pickModel(MODELS[e.code]) : pickEffort(EFFORTS[e.code]);
      }
      if (e.altKey && e.code === 'KeyR') { e.preventDefault(); st.enabled = !st.enabled; refresh(); }
      // Persian layout: Shift+2 yields "٬" instead of "@".
      if (st.enabled && e.shiftKey && e.code === 'Digit2' && e.key === '٬' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        document.execCommand('insertText', false, '@');
      }
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
// --- CLAUDE RTL PATCH END ---
