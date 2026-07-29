/* ───────────────────────────────────────────────────────────────
   skinEngine.js — the extension's CSS override / "skin" engine.

   The design system already exposes ~120 `--gb-*` custom properties
   that every component reads through inline `var(--gb-*)` styles. CSS
   custom properties INHERIT through shadow-DOM boundaries from
   documentElement, so overriding those variables at the document root
   re-skins every surface at once — custom pages (shadow DOM), modals,
   the popup, and the settings panel — with no per-root work.

   That covers colors and, once the shared primitives read skin tokens
   (`--gb-app-bg`, `--gb-card-bg`, `--gb-card-blur`, `--gb-card-shadow`,
   `--gb-card-radius`, `--gb-modal-*`, …), the whole LOOK: gradient
   backgrounds, frosted-glass blocks, radii, shadows. A skin is:

     { vars: { '--gb-...': 'value', ... },   // variable overrides
       css:  'raw css string' }              // optional class-level CSS

   `vars` are set on documentElement (inherit everywhere). `css` is the
   BetterDiscord-style escape hatch — arbitrary rules targeting the
   `gb-*` class names on primitives; because raw rules do NOT cross a
   shadow boundary, the engine injects the css into document.head AND
   every registered shadow root (custom pages/modals register on mount).

   A skin persists to chrome.storage.local.gbSkin; storage.onChanged
   propagates a change to every context (popup + all content scripts +
   shadow pages) so one call re-skins the entire product live.
─────────────────────────────────────────────────────────────── */

export const SKIN_STORAGE_KEY = 'gbSkin';
const CSS_STYLE_ID = '__gb-skin-css';

/* Roots (ShadowRoots) that want the raw-css layer injected. Document is
   always handled directly. A plain Set (not WeakSet) so we can iterate;
   registerSkinRoot returns a disposer that removes the entry. */
const _roots = new Set();
let _current = { vars: {}, css: '' };
let _appliedVarKeys = [];

/** Coerce any input to the canonical { vars, css } skin shape. Pure. */
export function normalizeSkin(skin) {
  const vars = {};
  const src = (skin && typeof skin === 'object' && skin.vars && typeof skin.vars === 'object') ? skin.vars : {};
  for (const [k, v] of Object.entries(src)) {
    // Only accept our own custom-property namespace, and only string/number values.
    if (typeof k === 'string' && k.startsWith('--gb-') && (typeof v === 'string' || typeof v === 'number')) {
      vars[k] = String(v);
    }
  }
  const css = (skin && typeof skin.css === 'string') ? skin.css : '';
  return { vars, css };
}

/** Given the previously-applied var keys and the next var map, return the
 *  keys that must be REMOVED from the root (present before, gone now). Pure —
 *  the core of a clean re-apply that never leaves stale overrides behind. */
export function staleVarKeys(prevKeys, nextVars) {
  const next = new Set(Object.keys(nextVars || {}));
  return (prevKeys || []).filter((k) => !next.has(k));
}

function styleHost(root) {
  // Document → <head>; ShadowRoot → the root itself.
  if (root === (typeof document !== 'undefined' ? document : null)) {
    return document.head || document.documentElement;
  }
  return root; // ShadowRoot appends <style> children directly
}

function findStyle(root, id) {
  try {
    if (root && typeof root.querySelector === 'function') return root.querySelector(`#${id}`);
  } catch { /* invalid root */ }
  return null;
}

function injectCss(root, css) {
  if (!root) return;
  const host = styleHost(root);
  if (!host) return;
  let el = findStyle(root, CSS_STYLE_ID);
  if (!css) { if (el) el.remove(); return; }
  if (!el) {
    el = (root.ownerDocument || document).createElement('style');
    el.id = CSS_STYLE_ID;
    host.appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;
}

/** Set the skin's variable overrides on documentElement, first clearing any
 *  overrides from the previous skin so nothing stale lingers. */
function applyVars(vars) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const k of staleVarKeys(_appliedVarKeys, vars)) root.style.removeProperty(k);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  _appliedVarKeys = Object.keys(vars);
}

/** Apply a skin to THIS context (does not persist — see setSkin). */
export function applySkin(skin) {
  _current = normalizeSkin(skin);
  applyVars(_current.vars);
  injectCss(typeof document !== 'undefined' ? document : null, _current.css);
  for (const root of _roots) injectCss(root, _current.css);
}

/** The skin currently applied in this context. */
export function currentSkin() {
  return { vars: { ..._current.vars }, css: _current.css };
}

/** Register a ShadowRoot (or any node with querySelector/appendChild) so the
 *  raw-css layer is injected into it now and on every future skin change.
 *  Returns a disposer. Variables need no registration — they inherit from
 *  documentElement across the shadow boundary. */
export function registerSkinRoot(root) {
  if (!root || _roots.has(root)) return () => {};
  _roots.add(root);
  injectCss(root, _current.css);
  return () => { _roots.delete(root); const el = findStyle(root, CSS_STYLE_ID); if (el) el.remove(); };
}

/* ── storage (chrome-guarded) ─────────────────────────────────── */

export function loadSkin() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(SKIN_STORAGE_KEY, (d) => resolve(d && d[SKIN_STORAGE_KEY] ? normalizeSkin(d[SKIN_STORAGE_KEY]) : null));
    } catch { resolve(null); }
  });
}

/** Persist + apply. storage.onChanged carries it to every other context. */
export function setSkin(skin) {
  const norm = skin ? normalizeSkin(skin) : null;
  applySkin(norm || { vars: {}, css: '' });
  try { chrome.storage.local.set({ [SKIN_STORAGE_KEY]: norm }); } catch { /* not an extension context */ }
  return norm;
}

export function clearSkin() { return setSkin(null); }

/* Temp test path: window globals so a skin can be loaded from the console or a
   bridge without any Settings UI yet. `__gbApplySkin` persists + goes live
   everywhere via storage.onChanged. The RevStack skin is registered by the
   boot code (registerNamedSkin) so `__gbLoadSkin('revstack')` works. */
const _named = new Map();
export function registerNamedSkin(name, skin) { _named.set(String(name), normalizeSkin(skin)); }

/* Cross-world command bridge. The skin globals below live on the ISOLATED
   content-script window, so a plain page DevTools console (MAIN world) can't
   see them. A `gb-skin-command` CustomEvent, however, crosses the world
   boundary (both share the DOM + event target), so from the page console OR a
   MAIN-world bridge you can run:
     dispatchEvent(new CustomEvent('gb-skin-command',{detail:{op:'named',name:'revstack'}}))
   No page-world script is injected (nothing for a host CSP to block). */
let _cmdBound = false;
function bindCommandBridge() {
  if (_cmdBound || typeof window === 'undefined') return;
  _cmdBound = true;
  window.addEventListener('gb-skin-command', (e) => {
    const d = (e && e.detail) || {};
    try {
      if (d.op === 'clear') clearSkin();
      else if (d.op === 'named') { const s = _named.get(String(d.name)); if (s) setSkin(s); else console.warn(`[gb skin] unknown skin "${d.name}"`); }
      else if (d.op === 'apply') setSkin(d.skin);
    } catch { /* ignore malformed command */ }
  });
}

function installGlobals() {
  if (typeof window === 'undefined') return;
  bindCommandBridge();
  window.__gbApplySkin = (skin) => setSkin(skin);
  window.__gbClearSkin = () => clearSkin();
  window.__gbCurrentSkin = () => currentSkin();
  window.__gbListSkins = () => [..._named.keys()];
  // Exposed for the vanilla custom-page loader (no ES imports there) to register
  // its shadow root for the raw-css layer. Vars reach the shadow via inheritance
  // regardless; this is only for class-level override CSS.
  window.__gbRegisterSkinRoot = (root) => registerSkinRoot(root);
  window.__gbLoadSkin = (name) => {
    const s = _named.get(String(name));
    if (!s) { console.warn(`[gb skin] unknown skin "${name}". Available: ${[..._named.keys()].join(', ') || '(none)'}`); return null; }
    return setSkin(s);
  };
}

/**
 * Boot the skin engine for THIS context: install the console globals, apply the
 * saved skin, and keep this context in sync when the skin changes elsewhere.
 * Call once per page / content script (alongside ensureTheme).
 */
let _booted = false;
export function ensureSkin() {
  if (typeof document === 'undefined') return;
  installGlobals();               // idempotent — just reassigns the globals
  if (_booted) return;            // one storage listener + one initial load per context
  _booted = true;
  loadSkin().then((s) => { if (s) applySkin(s); });
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[SKIN_STORAGE_KEY]) {
        applySkin(changes[SKIN_STORAGE_KEY].newValue || { vars: {}, css: '' });
      }
    });
  } catch { /* no chrome.storage — nothing to sync */ }
}
