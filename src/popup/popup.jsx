import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ensureTheme } from '../lib/theme.js';
import { useDevSettings } from '../lib/devSettings.js';
import { filterLocalEmailTemplates } from '../lib/emailTemplateCapabilities.js';
import { loadCredentials } from '../lib/credentials.js';
import { isPowerAutomateUrl } from '../lib/security.js';
import { dropConditional, renderTemplate } from '../lib/variableResolution.js';
import { htmlToPlainText } from '../lib/emailSender.js';
import { popupFeatures } from '../lib/features/featureRegistry.js';
import { loadFeatureConfig, normalizeFeatureConfig, featureShowsInPopup, FEATURE_CONFIG_KEY } from '../lib/features/featureConfig.js';
import {
  Btn, Dropdown, TemplatePicker, Dot, Tag, KeyVal, SectionLabel, Field, Textarea,
  Spinner, I, T, inputBaseStyle, ToastHost,
} from '../ui';
import { trackDocumentSurface } from '../lib/usageTelemetry.js';

/* Registry features that already have a bespoke popup button above (charge/
   order-edit/proof aren't registry features). We don't duplicate these in the
   data-driven Tools section — we only gate their existing buttons on the
   feature's popup surface config. */
const POPUP_FEATURES = popupFeatures();
// Registry features with a bespoke popup button above (rich state / order
// context) — gated on their popup surface but not duplicated in Tools.
const BESPOKE_POPUP_KEYS = new Set(['taskListEnabled', 'crmSearchEnabled', 'watchListEnabled', 'notificationsEnabled', 'orderEditEnabled', 'imagePreviewEnabled']);
const popIcon = (name) => { const C = I[name] || I.bolt; return <C />; };

/* ───────────────────────────────────────────────────────────────
   popup.jsx — React port of popup.html / popup.js.

   The whole popup is one self-contained IIFE bundle, built into
   react-dist/popup/popup.js. The HTML host (popup.html) is a
   thin shell that mounts <PopupApp /> into #popup-root.

   Restructured layout (sectioned vertical, full-width buttons):

     ┌─── Header (icon · title · Manage button) ────────┐
     │ TEMPLATE  ─ dropdown + send button               │
     │ ACTIONS   ─ Charge · Order Edit                  │
     │ TRACKING  ─ Watch · Watch List                   │
     │ TOOLS     ─ Tasks · CRM Search · Submit Proof    │
     │ RESOLVED  ─ KeyVal rows for To + each var        │
     │ Footer (primary Send button)                     │
     └──────────────────────────────────────────────────┘

   Modals (Watch-add + Submit-Proof) render inline inside the
   320px popup window per the design call.
─────────────────────────────────────────────────────────────── */

/* ============================================================
   STORAGE & MESSAGING HELPERS
============================================================ */

const storageGet = (keys) =>
  new Promise((resolve) => {
    try { chrome.storage.local.get(keys, resolve); }
    catch { resolve({}); }
  });
const storageSet = (obj) => {
  try { chrome.storage.local.set(obj); } catch { /* no chrome */ }
};
const tabsQueryActive = () =>
  new Promise((resolve) => {
    try { chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0] || null)); }
    catch { resolve(null); }
  });
const sendMessage = (tabId, msg) =>
  new Promise((resolve) => {
    if (tabId == null) { resolve(null); return; }
    try {
      chrome.tabs.sendMessage(tabId, msg, (resp) => {
        // Read lastError so Chrome doesn't log "Unchecked runtime.lastError:
        // Could not establish connection. Receiving end does not exist." when
        // the tab has no content script (restricted page, blank tab, or the
        // script hasn't loaded yet).
        void chrome.runtime.lastError;
        resolve(resp);
      });
    } catch { resolve(null); }
  });

// A tab we can inject into / message. Content scripts can't run on chrome://,
// edge://, extension pages, the Web Store, view-source, blank tabs, etc.; the
// popup can be opened over any of them, so guard before touching them.
const isInjectableTab = (tab) => !!(tab && tab.url && /^https?:\/\//i.test(tab.url));

// Client-side access gate (FAIL-OPEN). The service worker writes
// gbRuntimeState.{o,s} from the /client/health check: o=0 means access was
// explicitly revoked, and a verify stamp (s) older than 48h means we couldn't
// re-confirm within the grace window. Either closes the popup with a notice.
// Missing/unreadable state → ALLOW, so this can never hard-lock the popup the
// way the old gate bricked the whole extension. A determined reverse-engineer
// can strip this check; it exists to stop the ~90% of revoked users who won't.
const ACCESS_GRACE_MS = 48 * 60 * 60 * 1000;
const accessAllowed = (st, now = Date.now()) => {
  if (!st || typeof st !== 'object') return true;      // no state yet → optimistic
  if (!(st.o === 1 || st.o === true)) return false;    // explicitly revoked
  const stamp = Number(st.s) || 0;
  return !stamp || (now - stamp) < ACCESS_GRACE_MS;    // 48h offline grace
};
const readAccessState = () => new Promise((resolve) => {
  try { chrome.storage.local.get('gbRuntimeState', (d) => resolve((d && d.gbRuntimeState) || null)); }
  catch { resolve(null); }
});

/* ============================================================
   TEMPLATE RENDERING HELPERS — preserved 1:1 from popup.js
============================================================ */

/* Thin wrapper around the shared renderTemplate so the popup picks
   up OR-block syntax (`{{a|b}}`) and the conditional-drop behavior
   without diverging from the bulk path. The `defs` arg keeps the
   smart.conditional sentence/line/paragraph drop working as before. */
function renderStr(str, vars, defs) {
  return renderTemplate(str, vars, defs);
}

/* ============================================================
   WATCH-LIST ENTITY METADATA
============================================================ */

const WL_ENTITY = {
  order: {
    btn: 'Watch Order',
    title: 'Watch Order',
    field: 'Order #',
    placeholder: 'What needs attention on this order?',
    icon: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  },
  contact: {
    btn: 'Watch Contact',
    title: 'Watch Contact',
    field: 'Contact ID',
    placeholder: 'What needs attention for this contact?',
    icon: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  },
  account: {
    btn: 'Watch Account',
    title: 'Watch Account',
    field: 'Account ID',
    placeholder: 'What needs attention for this account?',
    icon: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  },
};

/* ============================================================
   LOCAL ICONS — small one-offs not in the DS registry
============================================================ */

const Ic = {
  watch:    (p) => <svg width={p.size||14} height={p.size||14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  checkbox: (p) => <svg width={p.size||14} height={p.size||14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  paperclip: (p) => <svg width={p.size||14} height={p.size||14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>,
  reply:    (p) => <svg width={p.size||14} height={p.size||14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>,
  upload:   (p) => <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>,
  file:     (p) => <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
};

/* ============================================================
   ROOT COMPONENT
============================================================ */

function PopupApp() {
  // ── load state ──
  const [stage, setStage] = useState('loading');   // 'loading' | 'empty' | 'main'
  const [tab, setTab] = useState(null);
  const [storedTemplates, setStoredTemplates] = useState([]); // enabled, non-case local templates before policy projection
  const [pageInfo, setPageInfo] = useState({});
  const [flags, setFlags] = useState({});
  // Per-feature surface config (which surfaces each feature shows on). Defaults
  // (all surfaces on) until loaded so no button flashes off on first paint.
  const [featureCfg, setFeatureCfg] = useState(() => normalizeFeatureConfig({}));
  const [paConfigured, setPaConfigured] = useState(false);
  const [watchList, setWatchList] = useState([]);
  const [notifications, setNotifications] = useState([]);

  // ── dev settings — live-subscribed so every toggle reflects instantly ──
  // Single hook covers every devSettings knob this popup reads (ignore-context
  // bools, forceMatchedCount, etc.). The hook handles storage.onChanged so we
  // never need a manual subscription here.
  const [devSettings] = useDevSettings();
  const allTemplates = useMemo(
    () => filterLocalEmailTemplates(storedTemplates, devSettings),
    [storedTemplates, devSettings],
  );
  const ignorePageContext = !!devSettings['popup.ignorePageContext'];
  const ignoreCharge      = !!devSettings['popup.ignoreContext.charge'];
  const ignoreOrderEdit   = !!devSettings['popup.ignoreContext.orderEdit'];
  const ignoreWatch       = !!devSettings['popup.ignoreContext.watch'];
  const ignoreProof       = !!devSettings['popup.ignoreContext.submitProof'];
  const forceMatchedCount = Math.max(0, Math.floor(devSettings['popup.forceMatchedCount'] || 0));

  // ── selected template + resolved data ──
  const [selectedId, setSelectedId] = useState(null);
  // True once the user has manually picked a template — stops the
  // auto-matcher from yanking the selection out from under them when a
  // phase-2 (variable-driven) match later resolves. Reset on each page load.
  const userPickedRef = useRef(false);
  // When the selected template has variations and the user explicitly
  // picked one, this is its id. Null = use the parent template's own
  // subject/body. Parent / variation pick logic lives in MainView; we
  // track it up here so onSend can resolve the right content.
  const [selectedVariationId, setSelectedVariationId] = useState(null);
  const [matchedIds, setMatchedIds] = useState([]);
  // Templates whose match depends on variable (code) conditions still
  // resolving — phase 2. Each id clears as its resolveMatch settles.
  const [resolvingIds, setResolvingIds] = useState([]);
  const [resolvedVars, setResolvedVars] = useState({});
  const [resolvedTo, setResolvedTo] = useState('');
  const [resolving, setResolving] = useState(false);
  // Names of variables still resolving (the slow code chain). The fast
  // pass clears To + sync vars immediately; only these keep spinning.
  const [pendingVars, setPendingVars] = useState([]);
  const [toPending, setToPending] = useState(false);

  // ── inline modal state ──
  const [watchModalOpen, setWatchModalOpen] = useState(false);

  /* ── initial load: tab → templates/watchList/flags → probe content scripts → getPageInfo ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const currentTab = await tabsQueryActive();
      if (cancelled || !currentTab) return;
      // Access gate: if this installation is revoked / past the 48h grace, show
      // the paused notice instead of the toolkit. Fail-open (accessAllowed
      // returns true on any missing/unreadable state).
      if (!accessAllowed(await readAccessState())) { if (!cancelled) setStage('revoked'); return; }
      await new Promise((res) => {
        try { chrome.storage.local.set({ orderTabId: currentTab.id }, res); }
        catch { res(); }
      });

      const data = await storageGet([
        'templates', 'watchList', 'featureFlags', 'gbNotifications',
      ]);
      const credentials = await loadCredentials();
      const tpls = (data.templates || []).filter((t) => t.enabled !== false && t.type !== 'case');
      const mergedFlags = {
        chargeEnabled: true, orderEditEnabled: true, imagePreviewEnabled: true,
        taskListEnabled: true, crmSearchEnabled: true, watchListEnabled: true,
        notificationsEnabled: true, salesFantasyEnabled: false,
        ...(data.featureFlags || {}),
      };
      // Read ignorePageContext directly from storage on init so we can branch
      // before kicking off the content-script probe. The useDevSettings hook
      // takes over for live updates after this.
      const initialDev = await new Promise((res) => {
        try { chrome.storage.local.get('devSettings', (d) => res(d.devSettings || {})); }
        catch { res({}); }
      });
      const ignoreCtx = !!initialDev['popup.ignorePageContext'];
      const usableTpls = filterLocalEmailTemplates(tpls, initialDev);
      if (cancelled) return;
      setTab(currentTab);
      setStoredTemplates(tpls);
      setWatchList(data.watchList || []);
      setNotifications(data.gbNotifications || []);
      setFlags(mergedFlags);
      loadFeatureConfig().then((c) => { if (!cancelled) setFeatureCfg(c); });
      setPaConfigured(isPowerAutomateUrl(credentials.powerAutomateUrl));

      if (usableTpls.length === 0) { setStage('empty'); return; }

      // Dev escape hatch — skip page-script probing and variable resolution.
      // Templates list still populates because visibleTemplates returns ALL
      // order/account templates when ignoreCtx is on.
      if (ignoreCtx) { renderMain({ pageType: '__all__' }, usableTpls); return; }

      // Opened over a non-web tab (chrome://extensions where it's tested, a
      // blank tab, the Web Store…): content scripts can't run there, so don't
      // probe/inject/message it. Render without page context instead of hanging
      // on the loading stage — this also silences the "Cannot access chrome://
      // and edge:// URLs" scripting errors.
      if (!isInjectableTab(currentTab)) { renderMain({ pageType: 'other' }, usableTpls); return; }

      // Probe whether all content scripts are fully live in this tab.
      // Checks both the ready flag (set by main.js) AND the existence of the
      // watchlist function (from watchlist-modal.js) to catch any partial-load
      // scenarios where main.js ran but a dependency failed.
      const probeResults = await new Promise((res) => {
        try {
          chrome.scripting.executeScript(
            { target: { tabId: currentTab.id },
              func: () => !!window.__gbContentReady && typeof __gbShowWatchListModal === 'function' },
            (r) => { void chrome.runtime.lastError; res(r); },
          );
        } catch { res(null); }
      });
      const alreadyLoaded = probeResults?.[0]?.result === true;

      const askForPageInfo = async () => {
        const info = await sendMessage(currentTab.id, {
          action: 'getPageInfo',
          templates: usableTpls.map((t) => ({
            id: t.id, rules: t.rules, type: t.type,
            accountConditions: t.accountConditions || [],
          })),
        });
        if (cancelled) return;
        renderMain(info || {}, usableTpls);
        // Matching is fully synchronous now — no phase-2 variable resolution.
        // Variables (which can fetch orders / hit the catalog) resolve ONLY
        // when a template is clicked, via the streaming resolver above.
      };

      if (alreadyLoaded) {
        askForPageInfo();
      } else {
        // First open on a fresh page load — inject the full bundle once.
        try {
          chrome.scripting.executeScript(
            { target: { tabId: currentTab.id },
              files: [
                'theme.js',
                'src/vanilla/smart-detection.js',
                'react-dist/vanilla/page-engine.js',
                'src/vanilla/variable-resolution.js',
                'src/vanilla/usage-report.js', 'src/vanilla/modals/modal-chrome.js',
                'src/vanilla/modals/charge-modal.js', 'src/vanilla/modals/order-edit-modal.js',
                'src/vanilla/page-utils.js', 'react-dist/content/email-preview.js',
                'react-dist/content/watch-list.js',
                'react-dist/content/actions-shelf.js', 'react-dist/content/calendar.js',
                'src/vanilla/main.js',
              ] },
            () => { void chrome.runtime.lastError; askForPageInfo(); },
          );
        } catch { askForPageInfo(); }
      }
    })().catch(() => {
      // Never leave the popup stuck on the blank 'loading' stage: if init throws
      // (storage, credentials, messaging…), fall back to a rendered state so the
      // UI and the Manage button are always usable.
      if (!cancelled) { try { renderMain({ pageType: 'other' }); } catch { setStage('empty'); } }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── narrow templates to those relevant for this page type ── */
  const visibleTemplates = useMemo(() => {
    if (ignorePageContext) {
      // Show every order + account/contact template, no matter the page.
      return allTemplates.filter((t) =>
        t.type === 'order' || t.type === 'email' || !t.type || t.type === 'account');
    }
    const pageType = pageInfo.pageType || 'other';
    if (pageType === 'order')   return allTemplates.filter((t) => t.type === 'order' || t.type === 'email' || !t.type);
    if (pageType === 'account' || pageType === 'contact') return allTemplates.filter((t) => t.type === 'account');
    return [];
  }, [allTemplates, pageInfo.pageType, ignorePageContext]);

  function renderMain(info, tpls = allTemplates) {
    setPageInfo(info);
    setMatchedIds(info.matchedTemplateIds || []);
    setResolvingIds(info.pendingTemplateIds || []);

    // Always go to main — action buttons (charge / watch / tasks / etc.) are
    // page-context driven, not template-driven, so they should stay visible
    // even when no template matches the current page type. The template
    // section in MainView shows its own "no matches" state when empty.
    const pageType = info.pageType || 'other';
    const ignore = pageType === '__all__';
    const visible = ignore
      ? tpls.filter((t) => t.type === 'order' || t.type === 'email' || !t.type || t.type === 'account')
      : pageType === 'order'
        ? tpls.filter((t) => t.type === 'order' || t.type === 'email' || !t.type)
        : (pageType === 'account' || pageType === 'contact')
          ? tpls.filter((t) => t.type === 'account')
          : [];

    const matched = info.matchedTemplateIds || [];
    const initial = matched.find((id) => visible.some((t) => t.id === id)) || visible[0]?.id || null;
    userPickedRef.current = false;   // fresh page → let the auto-matcher drive
    setSelectedId(initial);
    setSelectedVariationId(null);
    setStage('main');
  }

  /* Auto-select the first template that MATCHES the page. Runs whenever
     matchedIds changes — crucially after phase 2 resolves variable-driven
     (pending) matches, which the initial render in renderMain can't see
     (they're not in info.matchedTemplateIds yet). Without this, a template
     whose rules use variables never auto-selects and the popup sticks on
     visible[0] ("Abandoned Cart"). Skips once the user has picked manually. */
  useEffect(() => {
    if (userPickedRef.current || stage !== 'main') return;
    const firstMatched = visibleTemplates.find((t) => matchedIds.includes(t.id));
    if (firstMatched && firstMatched.id !== selectedId) setSelectedId(firstMatched.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedIds, visibleTemplates, stage]);

  /* ── resolve variables whenever the selected template changes ── */
  useEffect(() => {
    if (!selectedId || !tab) return;
    const tpl = visibleTemplates.find((t) => t.id === selectedId);
    if (!tpl) return;
    // ignorePageContext mode: skip the round-trip — variables will be unmatched
    // because the page isn't a GB page (or the content script isn't present).
    if (ignorePageContext) {
      const empty = Object.fromEntries(Object.keys(tpl.vars || {}).map((k) => [k, '']));
      setResolvedVars(empty);
      setResolvedTo('');
      setResolving(false);
      setPendingVars([]);
      setToPending(false);
      return;
    }

    /* Streaming resolution. Open a port to the page's resolver; it sends
       one message per variable AS IT RESOLVES (in dependency order, so the
       simple/fast blocks land first), plus the recipient up front. Each row
       clears its own spinner the moment its value arrives — no waiting for
       the whole batch. Falls back to a one-shot message if the port can't
       open (e.g. the content script isn't injected). */
    const allVars = tpl.vars || {};
    const toField = tpl.toField || { type: 'auto' };

    setResolving(true);
    setResolvedVars({});
    setResolvedTo('');
    setToPending(true);
    // Variables named with a leading underscore are "plumbing" (the order
    // blob, the matched product object) — they resolve and chain but are
    // hidden from the popup, so only clean display values show.
    setPendingVars(Object.keys(allVars).filter((n) => !n.startsWith('_')));

    let cancelled = false;
    let port = null;
    try { port = chrome.tabs.connect(tab.id, { name: 'gbResolveStream' }); } catch { port = null; }

    if (!port) {
      sendMessage(tab.id, { action: 'resolveVars', vars: allVars, toField }).then((r) => {
        if (cancelled) return;
        setResolvedVars(r?.resolved || {});
        setResolvedTo(r?.toEmail || '');
        setToPending(false); setPendingVars([]); setResolving(false);
      });
      return () => { cancelled = true; };
    }

    port.onMessage.addListener((msg) => {
      if (cancelled || !msg) return;
      if (msg.kind === 'to') {
        setResolvedTo(msg.value || '');
        setToPending(false);
      } else if (msg.kind === 'var') {
        setResolvedVars((prev) => ({ ...prev, [msg.name]: msg.value }));
        setPendingVars((prev) => prev.filter((n) => n !== msg.name));
      } else if (msg.kind === 'done') {
        setResolvedVars(msg.resolved || {});
        setResolvedTo(msg.toEmail || '');
        setToPending(false); setPendingVars([]); setResolving(false);
        try { port.disconnect(); } catch {}
      } else if (msg.kind === 'error') {
        setToPending(false); setPendingVars([]); setResolving(false);
        try { port.disconnect(); } catch {}
      }
    });
    try { port.postMessage({ action: 'resolveVarsStream', vars: allVars, toField }); } catch {}

    return () => { cancelled = true; try { port && port.disconnect(); } catch {} };
  }, [selectedId, tab, visibleTemplates, ignorePageContext]);

  /* ── live-sync feature flags + watchList + templates from storage ──
     The popup window isn't a tab, so the GB_FEATURE_FLAGS runtime broadcast
     from saveFlags() never reaches it. Subscribe to storage.onChanged
     directly so every write — flags, watchlist, even template edits —
     reflects instantly while the popup is open.

     Defaults match the init-load merge above so flipping any flag off
     produces the same shape as if it had never been written. */
  useEffect(() => {
    if (!chrome?.storage?.onChanged) return;
    const listener = (changes, area) => {
      if (area !== 'local') return;
      if (changes.featureFlags) {
        const next = changes.featureFlags.newValue || {};
        setFlags({
          chargeEnabled: true, orderEditEnabled: true, imagePreviewEnabled: true,
          taskListEnabled: true, crmSearchEnabled: true, watchListEnabled: true,
          notificationsEnabled: true, salesFantasyEnabled: false,
          ...next,
        });
      }
      if (changes[FEATURE_CONFIG_KEY]) setFeatureCfg(normalizeFeatureConfig(changes[FEATURE_CONFIG_KEY].newValue || {}));
      if (changes.watchList) setWatchList(changes.watchList.newValue || []);
      if (changes.gbNotifications) setNotifications(changes.gbNotifications.newValue || []);
      if (changes.templates) {
        const next = (changes.templates.newValue || [])
          .filter((t) => t.enabled !== false && t.type !== 'case');
        setStoredTemplates(next);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  /* ── header openers ── */
  const openManager = () => {
    try {
      chrome.runtime.sendMessage(
        { action: 'openEditor', sourceTabId: Number.isInteger(tab?.id) ? tab.id : null },
        () => void chrome.runtime.lastError,
      );
    } catch {}
  };

  const openSalesFantasy = () => {
    try {
      chrome.runtime.sendMessage(
        { action: 'openSalesFantasy' },
        () => void chrome.runtime.lastError,
      );
    } catch {}
  };

  /* ── stage routes ── */
  // templateCount in the header reflects the user's total enabled templates
  // (not the page-filtered subset), so it's a stable "how many templates do
  // I have" indicator regardless of what tab the popup opened over.
  const templateCount = allTemplates.length;
  // Email-templates UI off → the popup doesn't need to reserve room for a
  // dropdown, so we let Chrome shrink it to whatever height the button stack
  // naturally takes. On → minHeight reserves enough room that the dropdown
  // always has somewhere to land beneath the trigger.
  const emailTemplatesOn = flags.emailTemplatesEnabled !== false;
  const shellMinHeight = emailTemplatesOn ? 340 : 0;
  if (stage === 'loading') return <Shell templateCount={templateCount} minHeight={shellMinHeight}><LoadingState /></Shell>;
  if (stage === 'empty')   return <Shell templateCount={templateCount} minHeight={shellMinHeight} onManage={openManager}><EmptyState onCreate={openManager} salesFantasyEnabled={flags.salesFantasyEnabled === true} onOpenSalesFantasy={openSalesFantasy} /></Shell>;
  if (stage === 'revoked') return <Shell templateCount={0} minHeight={shellMinHeight}><RevokedNotice /></Shell>;

  const tpl = visibleTemplates.find((t) => t.id === selectedId);

  // Dev knob — force the first N templates into the matched set so the
  // "matched" styling can be tested without a real page match. Union with
  // the actual matchedIds (the real one wins when both fire).
  const effectiveMatchedIds = (() => {
    if (forceMatchedCount <= 0) return matchedIds;
    const forced = visibleTemplates.slice(0, forceMatchedCount).map((t) => t.id);
    return Array.from(new Set([...matchedIds, ...forced]));
  })();

  return (
    <>
      <Shell templateCount={templateCount} minHeight={shellMinHeight} onManage={openManager}>
        <MainView
          templates={visibleTemplates}
          matchedIds={effectiveMatchedIds}
          resolvingIds={resolvingIds}
          selectedId={selectedId}
          onSelect={setSelectedId}
          selectedVariationId={selectedVariationId}
          onSelectVariation={setSelectedVariationId}
          tpl={tpl}
          resolving={resolving}
          pendingVars={pendingVars}
          toPending={toPending}
          resolvedVars={resolvedVars}
          resolvedTo={resolvedTo}
          pageInfo={pageInfo}
          flags={flags}
          featureCfg={featureCfg}
          paConfigured={paConfigured}
          watchList={watchList}
          notifications={notifications}
          tab={tab}
          ignoreCharge={ignoreCharge}
          ignoreOrderEdit={ignoreOrderEdit}
          ignoreWatch={ignoreWatch}
          ignoreProof={ignoreProof}
          ignorePageContext={ignorePageContext}
          onOpenWatchAdd={() => setWatchModalOpen(true)}
          onOpenSalesFantasy={openSalesFantasy}
          onOpenProof={() => {
            if (!tab) return;
            const orderId    = pageInfo.orderNo   || '';
            const customerId = pageInfo.contactId || pageInfo.accountId || '';
            // Fire-and-forget: the content-script handler returns true
            // without sendResponse, so awaiting hangs the popup. Closing
            // immediately lets the modal mount unobstructed on the host page.
            chrome.tabs.sendMessage(tab.id, { action: 'showImagePreview', orderId, customerId }, () => void chrome.runtime.lastError);
            window.close();
          }}
        />
      </Shell>

      <AnimatePresence>
        {watchModalOpen && (
          <WatchAddModal
            pageInfo={pageInfo}
            tab={tab}
            onClose={() => setWatchModalOpen(false)}
            onAdded={(entry) => {
              const next = [...watchList, entry];
              setWatchList(next);
              storageSet({ watchList: next });
              setWatchModalOpen(false);
            }}
          />
        )}
      </AnimatePresence>

    </>
  );
}

/* ============================================================
   SHELL — header + scrollable body
============================================================ */

function Shell({ children, onManage, templateCount, minHeight = 340 }) {
  // The Chrome popup frame is drawn by the OS before React mounts — there's
  // an unavoidable brief moment where the window is visible but blank.
  // A small fade + scale on the entire content fills that void so the popup
  // feels like it "settles in" rather than snapping. transformOrigin: top
  // matches the user's mental model (popup grows down from the toolbar icon).
  //
  // `minHeight` is conditional on emailTemplatesEnabled — when off, the popup
  // shrinks to button-stack height; when on, it reserves dropdown room.
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.34, 1.4, 0.64, 1] }}
      style={{
        width: 320, minHeight,
        display: 'flex', flexDirection: 'column',
        background: 'var(--gb-surface-canvas)',
        color: 'var(--gb-text-secondary)',
        fontFamily: 'var(--gb-font-sans)',
        borderRight: '1px solid var(--gb-border-subtle)',
        borderBottom: '1px solid var(--gb-border-subtle)',
        overflow: 'hidden',
        position: 'relative',
        boxSizing: 'border-box',
        transformOrigin: 'top center',
      }}
    >
      <Header onManage={onManage} templateCount={templateCount} />
      {/* The body is itself a flex column with flex:1 so MainView can use
          margin-top:auto on its bottom section to push any extra height
          (created by the popup's min-height when few buttons are visible)
          INTO the gap between the dropdown/buttons and the Send button —
          not into a dead zone at the very bottom. */}
      <div style={{
        flex: 1,
        padding: '14px 14px 14px',
        /* Body stays overflow:hidden so MainView's `flex:1,
           minHeight:0` wrapper can use `margin-top:auto` to pin
           Send to the bottom without the resolved-info + Send
           rows getting squashed by `flex-shrink` competition
           inside a scrollable body. The picker handles its own
           overflow via the `listMaxHeight` prop — its option
           list scrolls internally when variations expand past
           the cap, leaving the surrounding stack stable. */
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        {children}
      </div>
    </motion.div>
  );
}

function Header({ onManage, templateCount }) {
  return (
    <div style={{
      padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: 10,
      background: 'var(--gb-surface-1)',
      borderBottom: '1px solid var(--gb-border-subtle)',
      flexShrink: 0,
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 'var(--gb-r-md)',
        background: 'var(--gb-brand-tint-medium)',
        border: '1px solid var(--gb-brand-tint-border)',
        color: 'var(--gb-brand-label)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <I.mail size={15} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)',
          letterSpacing: -0.1,
        }}>
          Email Templates
        </div>
        <div style={{
          fontSize: 10, color: 'var(--gb-text-muted)', fontWeight: 500, marginTop: 1,
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <span>Golfballs.com</span>
          {typeof templateCount === 'number' && (
            <>
              <span style={{
                width: 2, height: 2, borderRadius: '50%',
                background: 'currentColor', opacity: 0.6, flexShrink: 0,
              }} />
              <span>{templateCount} template{templateCount === 1 ? '' : 's'}</span>
            </>
          )}
        </div>
      </div>
      {onManage && (
        <Btn size="sm" icon={<I.cog />} onClick={onManage}>Manage</Btn>
      )}
    </div>
  );
}

/* ============================================================
   STAGE — LOADING
============================================================ */

function LoadingState() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      color: 'var(--gb-text-muted)', fontSize: 12, fontWeight: 500, padding: '8px 0',
    }}>
      <Spinner size={12} /> Scanning page…
    </div>
  );
}

/* ============================================================
   STAGE — REVOKED (access paused)
============================================================ */

function RevokedNotice() {
  return (
    <div style={{ textAlign: 'center', padding: '28px 16px', color: 'var(--gb-text-muted)', fontSize: 12, lineHeight: 1.7 }}>
      <div style={{
        width: 38, height: 38, margin: '0 auto 10px',
        borderRadius: 'var(--gb-r-md)',
        background: 'var(--gb-fill-subtle)',
        border: '1px solid var(--gb-border-default)',
        color: 'var(--gb-text-tertiary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <I.cog size={17} />
      </div>
      <div style={{ color: 'var(--gb-text-primary)', fontSize: 12.5, fontWeight: 700, marginBottom: 3 }}>
        Access paused
      </div>
      <div>This installation isn’t currently authorized.<br />Contact your administrator if this is unexpected.</div>
    </div>
  );
}

/* ============================================================
   STAGE — EMPTY
============================================================ */

function EmptyState({ onCreate, salesFantasyEnabled = false, onOpenSalesFantasy }) {
  return (
    <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--gb-text-muted)', fontSize: 12, lineHeight: 1.7 }}>
      {salesFantasyEnabled && (
        <div style={{ marginBottom: 18 }}>
          <SalesFantasyButton onClick={onOpenSalesFantasy} />
        </div>
      )}
      <div style={{
        width: 38, height: 38, margin: '0 auto 10px',
        borderRadius: 'var(--gb-r-md)',
        background: 'var(--gb-fill-subtle)',
        border: '1px solid var(--gb-border-default)',
        color: 'var(--gb-text-tertiary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <I.mail size={17} />
      </div>
      <div style={{ color: 'var(--gb-text-primary)', fontSize: 12.5, fontWeight: 700, marginBottom: 3 }}>
        No templates yet
      </div>
      Open the manager to create your first template.
      <div style={{ marginTop: 12 }}>
        <Btn variant="primary" size="sm" icon={<I.plus />} onClick={onCreate}>
          New Template
        </Btn>
      </div>
    </div>
  );
}

/* Start from the normal secondary action surface, then add a restrained inner
   brand glow. The icon + EVENT badge carry the event identity without turning
   the entire row into a loud campaign-colored block. */
function SalesFantasyButton({ onClick }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -1, filter: 'brightness(1.03)' }}
      whileTap={{ y: 0, scale: 0.99 }}
      transition={{ duration: 0.14 }}
      aria-label="Open Sales Fantasy event"
      style={{
        width: '100%', minHeight: 32, padding: '4px 8px',
        display: 'flex', alignItems: 'center', gap: 8,
        borderRadius: 'var(--gb-r-md)', cursor: 'pointer',
        border: '1px solid var(--gb-border-default)',
        background: 'linear-gradient(180deg, var(--gb-fill-subtle) 36%, color-mix(in srgb, var(--gb-brand-label) 11%, var(--gb-fill-subtle)) 100%)',
        boxShadow: '0 3px 8px rgba(0,0,0,.14), inset 0 1px 0 var(--gb-fill-faint), inset 0 -10px 16px color-mix(in srgb, var(--gb-brand-label) 9%, transparent)',
        color: 'var(--gb-text-secondary)', fontFamily: 'var(--gb-font-sans)',
      }}
    >
      <span style={{
        width: 20, height: 20, borderRadius: 6, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--gb-brand-label)', background: 'var(--gb-brand-tint-soft)',
        border: '1px solid var(--gb-brand-tint-border)',
      }}>
        <I.sparkle size={12} />
      </span>
      <span style={{ flex: 1, textAlign: 'left', fontSize: 11.5, fontWeight: 700, letterSpacing: -.05 }}>
        Sales Fantasy
      </span>
      <span style={{
        padding: '3px 6px', borderRadius: 999, flexShrink: 0,
        color: 'var(--gb-brand-label)', background: 'var(--gb-brand-tint-soft)',
        border: '1px solid var(--gb-brand-tint-border)',
        fontSize: 7.5, fontWeight: 850, letterSpacing: .75, lineHeight: 1.2,
      }}>
        EVENT
      </span>
    </motion.button>
  );
}

/* ============================================================
   STAGE — MAIN
============================================================ */

/* Loading value shown in a KeyVal row while resolution is in flight.
   `code` rows (which may await server calls) read as brand-tinted
   "running code…" so the rep can see which variables are still
   executing during page validation. */
function LoadingVal({ code }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11,
      color: code ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
    }}>
      <Spinner size={9} />
      {code ? 'running code…' : 'resolving…'}
    </span>
  );
}

function MainView({
  templates, matchedIds, resolvingIds = [], selectedId, onSelect,
  pendingVars = [], toPending = false,
  selectedVariationId, onSelectVariation,
  tpl,
  resolving, resolvedVars, resolvedTo, pageInfo, flags, featureCfg = {}, paConfigured, watchList, notifications = [], tab,
  ignoreCharge, ignoreOrderEdit, ignoreWatch, ignoreProof, ignorePageContext,
  onOpenWatchAdd, onOpenProof, onOpenSalesFantasy,
}) {
  // ── derived button states ──
  // hasRecipient = real recipient resolved by content scripts. Required for
  // mailto/reply-file modes (the email needs a To address baked in) but not
  // strictly required for PA modes (the flow can resolve recipient server-side)
  // or for dev "ignore page context" mode where we never even ran resolution.
  //
  // canSend = should the Send button actually fire? Gates on having a template
  // selected, plus a recipient unless we're in a mode that doesn't need one.
  const hasRecipient = !!(resolvedTo && resolvedTo.includes('@'));
  const canSend = !!tpl && (hasRecipient || ignorePageContext);

  const pageType = pageInfo.pageType || 'other';
  const knownType = (pageType === 'order' || pageType === 'contact' || pageType === 'account');
  const entityId =
    pageType === 'order' ? (pageInfo.orderNo || '') :
    pageType === 'contact' ? (pageInfo.contactId || '') :
    pageType === 'account' ? (pageInfo.accountId || '') : '';

  // Charge button: tinted brand (charge) or error (refund) depending on diff
  const orderTotal  = pageInfo.pageOrderTotal  || 0;
  const chargeTotal = pageInfo.pageChargeTotal || 0;
  const diff = orderTotal - chargeTotal;
  const chargeReady = !!pageInfo.orderNo && Math.abs(diff) >= 0.005;
  const isRefund    = chargeReady && diff < 0;
  const chargeLabel =
    !pageInfo.orderNo          ? 'Charge Card' :
    !chargeReady               ? 'Charge Card' :
    isRefund                   ? `Refund  ($${Math.abs(diff).toFixed(2)})` :
                                 `Charge Card  ($${diff.toFixed(2)})`;

  // Per-button context-ignore dev knobs collapse the disabled state so the
  // button always renders enabled; clicking still fires the same message (the
  // content-script handler is responsible for failing softly).
  const chargeDisabledReal    = !chargeReady;
  const orderEditDisabledReal = !pageInfo.messageId;
  const watchAddDisabledReal  = !(knownType && entityId);

  const chargeDisabled    = ignoreCharge    ? false : chargeDisabledReal;
  const orderEditDisabled = ignoreOrderEdit ? false : orderEditDisabledReal;
  const watchAddDisabled  = ignoreWatch     ? false : watchAddDisabledReal;

  /* Active items only — completed entries shouldn't pad the pill
     badge or trip the "critical" highlight. The WatchList modal
     stores `done: true` on completed rows. */
  const watchCount = watchList.filter((i) => !i.done).length;
  const watchHasCrit = watchList.some((i) => !i.done && (Date.now() - i.addedAt) >= 6 * 3600000);
  const notifCount = notifications.filter((n) => n && n.status === 'unread').length;

  const proofDisabledReal = !(knownType && (pageInfo.contactId || pageInfo.accountId || pageInfo.orderNo));
  const proofDisabled = ignoreProof ? false : proofDisabledReal;

  /* Composite value the shared TemplatePicker reads/writes — same
     shape the legacy Dropdown used so the onChange `::` split is
     unchanged. Empty string when nothing's picked so the picker
     shows its placeholder row. */
  const dropdownValue = selectedVariationId
    ? `${selectedId}::${selectedVariationId}`
    : (selectedId || '');
  const onTemplatePickerChange = (id) => {
    if (typeof id === 'string' && id.includes('::')) {
      const [parentId, variationId] = id.split('::');
      onSelect(parentId);
      onSelectVariation(variationId);
      return;
    }
    onSelect(id);
    onSelectVariation(null);
  };

  // ── action handlers ──
  const onCharge = async () => {
    if (!tab) return;
    const resp = await sendMessage(tab.id, { action: 'getPageInfo' });
    if (!resp) { alert('Cannot read order data. Please ensure you are on an order page and refresh.'); return; }
    const pageTotal = resp.pageOrderTotal || 0;
    const chargedTotal = resp.pageChargeTotal || 0;
    const d = pageTotal - chargedTotal;
    await sendMessage(tab.id, {
      action: 'showChargeModal',
      context: {
        orderId: resp.orderNo, userId: resp.userId,
        pageTotal, captured: chargedTotal, apiOrderTotal: pageTotal,
        diffAmount: d, isRefund: d < -0.005, isZeroDiff: Math.abs(d) < 0.005,
        chargeRows: resp.pageChargeRows || [],
      },
    });
    window.close();
  };

  const onOrderEdit = async () => {
    if (!tab) return;
    await sendMessage(tab.id, { action: 'showOrderEditModal' });
    window.close();
  };

  const onTaskList = async () => {
    if (!tab) return;
    await sendMessage(tab.id, { action: 'showTaskListModal' });
    window.close();
  };

  const onCrmSearch = async () => {
    if (!tab) return;
    await sendMessage(tab.id, { action: 'showCrmSearchModal' });
    window.close();
  };

  const onWatchListShow = async () => {
    if (!tab) return;
    await sendMessage(tab.id, { action: 'showWatchListModal' });
    window.close();
  };

  const onNotifications = async () => {
    if (!tab) return;
    await sendMessage(tab.id, { action: 'showNotificationsModal' });
    window.close();
  };

  /* ── data-driven launchers (Tools section) ──
     Show a feature's popup button when its master flag is on, its popup
     surface is enabled, and the current page is in scope. Launch by asking
     the content script to run the feature: a safe no-arg global for
     standalone tools, or the registered shelf action for page-contextual
     ones (find-phone, copy-ids, …). */
  // The popup is global: a feature shows in the popup whenever it's enabled and
  // its popup surface is on — independent of the page (the shelf owns page/link
  // scoping, not the popup).
  const popupShows = (key) => flags[key] !== false && featureShowsInPopup(featureCfg[key]);
  const launchFeature = async (f) => {
    if (!tab) return;
    const shelf = f.surfaces?.shelf;
    if (shelf?.global) await sendMessage(tab.id, { action: 'GB_LAUNCH_GLOBAL', global: shelf.global });
    else if (shelf?.actions?.[0]) await sendMessage(tab.id, { action: 'GB_RUN_SHELF_ACTION', id: shelf.actions[0].id });
    window.close();
  };
  const toolFeatures = POPUP_FEATURES.filter((f) => !BESPOKE_POPUP_KEYS.has(f.key) && popupShows(f.key));

  /* Resolve the subject/body for this send. Picks the variation (a pinned
     saved one, a uniform random roll across [original, …saved] when the
     template has variations and nothing is pinned, or the parent) and
     renders each field with the resolved vars + smart options. Shared by
     Send and Copy so both produce identical content. */
  const buildSendContent = () => {
    const variations = Array.isArray(tpl?.variations) ? tpl.variations : [];
    const pinnedSaved = variations.find((v) => v.id === selectedVariationId);
    let variation = pinnedSaved || null;
    if (!pinnedSaved && !selectedVariationId && variations.length > 0) {
      const idx = Math.floor(Math.random() * (variations.length + 1));
      variation = idx === 0 ? null : variations[idx - 1];
    }
    const subject = renderStr(variation?.subject || tpl.subject, resolvedVars, tpl.vars);
    const rawBody = renderStr(variation?.body    || tpl.body,    resolvedVars, tpl.vars);
    return {
      subject,
      rawBody,
      plainBody: htmlToPlainText(rawBody),
      variationId: variation?.id || '__original',
    };
  };

  /* Copy the formatted email to the clipboard as BOTH rich HTML and plain
     text, so pasting into Outlook / Gmail / a doc keeps the formatting.
     Only offered in Outlook mode (PA off) — see the footer. */
  const onCopy = async () => {
    if (!tpl || !canSend) return;
    const { rawBody, plainBody } = buildSendContent();
    /* Show feedback on the ACTIVE PAGE, not in the popup window (which is
       tiny and about to lose focus). Falls back to the popup's own toast
       if there's no active tab to message. */
    const notify = (tone, message, opts) => {
      if (tab) sendMessage(tab.id, { action: 'showToast', tone, message, opts });
      else window.__gbToast?.[tone]?.(message, opts);
    };
    try {
      if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html':  new Blob([rawBody],   { type: 'text/html'  }),
            'text/plain': new Blob([plainBody], { type: 'text/plain' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plainBody);
      }
      notify('success', 'Copied — paste keeps formatting', { duration: 1800 });
    } catch (e) {
      notify('error', `Couldn't copy: ${e?.message || 'clipboard blocked'}`, { duration: 3000 });
    }
  };

  const onSend = async () => {
    if (!tpl || !canSend || !tab) return;
    /* Three selection paths land here:
         1. selectedVariationId pins a real saved variation  →
            use that one's subject/body (each field falls back
            to the parent's when omitted).
         2. selectedVariationId is the synthetic Variation 1
            sentinel (ORIGINAL_VARIATION_ID = '__original') OR
            null, AND the template has variations  →  random
            mode: roll one slot uniformly across [original, …
            variations] at send time. ORIGINAL_VARIATION_ID is
            treated as null in the find() above (no matching
            saved variation) so this branch catches both cases.
         3. No variations on the template  →  always parent body.
       The random roll is uniform — the popup is a single-send
       surface so there's no slider UX for weighting. */
    const { subject, rawBody, variationId } = buildSendContent();

    // tpl.replyMode drives behavior for ALL template types:
    // 'reply'      → find prior email, thread the reply (file or PA)
    // 'standalone' → fresh email (file or PA)
    const replyMode = tpl.replyMode || 'standalone';
    /* One content-page delivery boundary now handles BOTH transports. It
       waits for PA success (or a successful Outlook handoff) before creating
       the selected task and running the selected custom action. Keeping the
       follow-up ids on the template record also makes this exact message work
       for every non-case template type. */
    sendMessage(tab.id, {
      action: 'sendEmailTemplate',
      to: resolvedTo,
      subject,
      htmlBody: rawBody,
      variationId,
      replyMode: tpl.replyMode || replyMode,
      template: {
        id: tpl.id || '',
        name: tpl.name || '',
        replyMode: tpl.replyMode || replyMode,
        senderAccount: tpl.senderAccount || '',
        senderRandomize: !!tpl.senderRandomize,
        presetTaskId: tpl.presetTaskId || '',
        followUpActionId: tpl.followUpActionId || '',
      },
      context: {
        contactId: pageInfo.contactId || '',
        accountId: pageInfo.accountId || '',
        email: resolvedTo,
      },
    });
    window.close();
  };

  // ── send button mode → icon/label
  // Derived from the selected template's replyMode + PA flags, regardless of
  // whether canSend is true — that way the button shows the right label even
  // when it's disabled (e.g. "Reply in Outlook" stays visible during loading
  // rather than flashing back to the default "Open in Outlook").
  const sendMode = (() => {
    if (!tpl) return null;
    const replyMode = tpl?.replyMode || 'standalone';
    const isReply = replyMode === 'reply';
    /* paReady MUST match the predicate the shared delivery path uses
       (both the toggle AND the URL). Otherwise
       the button advertises "Send" while clicking it falls through
       to the mailto path, which surprises the user.

       Coerce both reads through Boolean explicitly — older storage
       writes could land non-canonical values (e.g. the legacy
       directSend migration wrote `1` instead of `true`), and JS's
       `&&` returns the FIRST falsy or LAST truthy value, so even
       though `!!('1')` is true we want to be explicit so the
       predicate reads identically here and in onSend regardless
       of where the value came from. */
    const paOn  = flags.powerAutomateEnabled === true;
    const paReady = paOn && paConfigured;
    if (paReady && isReply)  return { icon: <I.send />,  label: 'Reply' };
    if (paReady)             return { icon: <I.send />,  label: 'Send' };
    if (isReply)             return { icon: <Ic.reply />, label: 'Reply in Outlook' };
    return { icon: <I.send />, label: 'Open in Outlook' };
  })();

  const hasTemplates = templates.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      {/* ── TOP SECTION ─ template dropdown + all action buttons ──
         No `gap` on the column so each <Reveal> can animate its own
         marginTop on exit. Without that, flex `gap` snaps to zero only
         after the child unmounts, breaking the collapse transition.
         flex-shrink:0 keeps it from squishing when the popup is short. */}
      <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

        {/* Template label + dropdown / empty pill — gated on emailTemplatesEnabled.
            Turning off Email Templates collapses this entire block so the popup
            becomes a pure action-launcher (charge / watch / tasks / etc.). */}
        <AnimatePresence initial={false}>
          {flags.emailTemplatesEnabled && (
            <Reveal key="template-block" gap={0}>
              <SectionLabel divider={false} style={{ marginBottom: 2 }}>Template</SectionLabel>
              {hasTemplates ? (
                /* Shared TemplatePicker (mode='random' — selecting
                   a parent with variations means "pick one at
                   random at send time"; selecting Variation 1
                   pins the original; selecting any other variation
                   pins that one). Matched templates are grouped
                   under a "Matched on this page" header with brand-
                   glow dots; the rest sits under "All templates".
                   The picker opens inline inside the popup body so
                   Chrome's popup auto-resize no longer races a
                   flying menu.

                   listMaxHeight is tighter than the EmailRunner
                   default (360) so the expanding option list fits
                   inside the popup body without the host shell's
                   overflow:hidden clipping the bottom rows. 220
                   leaves visible room for the action buttons + the
                   resolved-info block + Send beneath the picker. */
                <TemplatePicker
                  mode="random"
                  templates={templates}
                  matchedIds={matchedIds}
                  resolvingIds={resolvingIds}
                  value={dropdownValue}
                  onChange={onTemplatePickerChange}
                  placeholder="Pick a template"
                  listMaxHeight={220}
                />
              ) : (
                <div style={{
                  fontSize: 11, color: 'var(--gb-text-muted)', lineHeight: 1.5,
                  padding: '8px 10px',
                  background: 'var(--gb-fill-subtle)',
                  border: '1px dashed var(--gb-border-default)',
                  borderRadius: 'var(--gb-r-md)',
                }}>
                  No templates for this page type.
                </div>
              )}
            </Reveal>
          )}
        </AnimatePresence>

        {/* Action stack — matches original popup order:
            Charge → Order Edit → Watch + Watch List row → Tasks → CRM Search → Submit Proof.
            Each wrapped in <Reveal> so flipping its feature flag collapses
            the height + opacity with siblings sliding to fill the gap. */}
        <AnimatePresence initial={false}>
          {flags.salesFantasyEnabled === true && (
            <Reveal key="sales-fantasy">
              <SalesFantasyButton onClick={onOpenSalesFantasy} />
            </Reveal>
          )}
          {flags.chargeEnabled && (
            <Reveal key="charge">
              <Btn full size="sm"
                variant={chargeReady ? 'tinted' : 'secondary'}
                status={isRefund ? 'error' : 'brand'}
                disabled={chargeDisabled}
                icon={<I.card />}
                onClick={onCharge}>
                {chargeLabel}
              </Btn>
            </Reveal>
          )}
          {popupShows('orderEditEnabled') && (
            <Reveal key="orderEdit">
              <Btn full size="sm"
                disabled={orderEditDisabled}
                icon={<I.edit />}
                onClick={onOrderEdit}>
                Order Edit
              </Btn>
            </Reveal>
          )}
          {popupShows('watchListEnabled') && (
            <Reveal key="watch">
              <div style={{ display: 'flex', gap: 6 }}>
                <Btn size="sm"
                  disabled={watchAddDisabled}
                  icon={<I.eye />}
                  onClick={onOpenWatchAdd}
                  style={{ flex: 1, minWidth: 0, width: 'auto' }}>
                  {WL_ENTITY[knownType ? pageType : 'order'].btn}
                </Btn>
                <Btn size="sm"
                  variant={watchHasCrit && watchCount > 0 ? 'tinted' : 'secondary'}
                  status="error"
                  icon={<Ic.watch />}
                  badge={watchCount}
                  badgeTone={watchHasCrit ? 'error' : 'brand'}
                  badgePulse={watchHasCrit}
                  onClick={onWatchListShow}
                  style={{ flex: 1, minWidth: 0, width: 'auto' }}>
                  Watch List
                </Btn>
              </div>
            </Reveal>
          )}
          {popupShows('taskListEnabled') && (
            <Reveal key="tasks">
              <Btn full size="sm" icon={<Ic.checkbox />} onClick={onTaskList}>My Tasks</Btn>
            </Reveal>
          )}
          {popupShows('crmSearchEnabled') && (
            <Reveal key="crmSearch">
              <Btn full size="sm" icon={<I.search />} onClick={onCrmSearch}>CRM Search</Btn>
            </Reveal>
          )}
          {popupShows('notificationsEnabled') && (
            <Reveal key="notifications">
              <Btn full size="sm" icon={<I.alert />} onClick={onNotifications} badge={notifCount} badgeTone="brand">Notifications</Btn>
            </Reveal>
          )}
          {popupShows('imagePreviewEnabled') && (
            <Reveal key="proof">
              <Btn full size="sm"
                disabled={proofDisabled}
                icon={<Ic.paperclip />}
                onClick={onOpenProof}>
                Submit Proof
              </Btn>
            </Reveal>
          )}
          {/* Data-driven launchers — every other popup-surfaced feature that
              applies to this page. Registry-sourced, so new features appear
              here automatically once they declare a popup surface. */}
          {toolFeatures.length > 0 && (
            <Reveal key="tools-label">
              <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--gb-text-muted)', padding: '2px 2px 0' }}>Tools</div>
            </Reveal>
          )}
          {toolFeatures.map((f) => (
            <Reveal key={f.key}>
              <Btn full size="sm" icon={popIcon(f.icon)} onClick={() => launchFeature(f)}>
                {f.surfaces.popupLabel || f.surfaces.shelf?.actions?.[0]?.label || f.name}
              </Btn>
            </Reveal>
          ))}
        </AnimatePresence>
      </div>

      {/* ── BOTTOM SECTION ─ resolved info + hairline + send button ──
         Sits directly under the last visible button. The popup's minHeight
         (340 when email templates are on, 0 when off) means any extra
         height is just empty popup below the send button — better than
         opening a yawning gap between the buttons and the resolved info.

         Gated on emailTemplatesEnabled — when off, the whole block (resolved
         info + hr + send button) collapses away so the popup is buttons-only. */}
      <div style={{ flexShrink: 0, paddingTop: 12 }}>
        <AnimatePresence initial={false}>
          {flags.emailTemplatesEnabled && (
            <Reveal key="send-block" gap={14}>
              {hasTemplates && (
                /* Per-variable progressive state. To + the sync vars paint as
                   soon as the fast pass returns; only the still-pending code
                   chain keeps a spinner (code vars get the "running code…"
                   tag). Rows reconcile in place (same keys) as values land. */
                <div>
                  <KeyVal k="To"
                    v={toPending
                        ? <LoadingVal />
                        : (resolvedTo || <Tag tone="error" size="xs">Not found</Tag>)}
                    tone={toPending ? 'default' : (hasRecipient ? 'ok' : 'error')} />
                  {Object.entries(tpl?.vars || {}).filter(([name]) => !name.startsWith('_')).map(([name, def]) => {
                    const pending = pendingVars.includes(name);
                    const val = resolvedVars[name];
                    return (
                      <KeyVal key={name} k={name}
                        v={pending
                            ? <LoadingVal code={def?.type === 'code'} />
                            : (val ? String(val).slice(0, 40) : <Tag tone="error" size="xs">Not found</Tag>)}
                        tone={pending ? 'default' : (val ? 'default' : 'error')} />
                    );
                  })}
                </div>
              )}

              <hr style={{ border: 0, borderTop: '1px solid var(--gb-border-subtle)', margin: '10px 0' }} />

              {(() => {
                /* Direct-send (PA on + URL) shows just Send. In Outlook
                   mode we pair "Open in Outlook" with a Copy button that
                   puts the formatted email on the clipboard. */
                const paReady = !!flags.powerAutomateEnabled && paConfigured;
                const sendBtn = (
                  <Btn
                    full={paReady}
                    style={paReady ? undefined : { flex: 1 }}
                    variant="primary"
                    size="md"
                    disabled={!hasTemplates || !canSend || resolving}
                    icon={sendMode?.icon || <I.send />}
                    onClick={onSend}>
                    {sendMode?.label || 'Open in Outlook'}
                  </Btn>
                );
                if (paReady) return sendBtn;
                return (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {sendBtn}
                    <Btn
                      variant="secondary"
                      size="md"
                      disabled={!hasTemplates || !canSend || resolving}
                      icon={<I.copy />}
                      onClick={onCopy}
                      title="Copy the formatted email — paste keeps formatting">
                      Copy
                    </Btn>
                  </div>
                );
              })()}
            </Reveal>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * Reveal — collapses height + opacity + top-margin on exit, mirrors on enter.
 * Drop-in wrapper for any conditionally-rendered child inside an
 * <AnimatePresence>. Uses a 6px top margin to replace the gap that the
 * parent flex column had to give up (gap is not animatable per-child).
 *
 * `initial: false` on the parent AnimatePresence makes the first render
 * paint instantly, but flipping a flag at runtime triggers the animation.
 *
 * overflow:hidden is required *during* the height animation so contents
 * don't bleed outside the collapsing box — but once settled at full
 * height we flip to overflow:visible so children with intentional bleed
 * (Btn badges, tooltips, popovers) aren't clipped. onAnimationStart
 * resets to hidden on every transition; onAnimationComplete only relaxes
 * when the entry animation finishes.
 */
function Reveal({ children, gap = 6 }) {
  // Default 'visible' because the parent <AnimatePresence initial={false}>
  // skips the entry animation on first mount — so onAnimationComplete
  // wouldn't fire and overflow would stick on 'hidden' forever, clipping
  // intentional bleed-out children (Btn badges, popovers, etc.).
  // onAnimationStart re-clamps to 'hidden' the moment an exit transition
  // begins so the height collapse still clips properly.
  const [overflow, setOverflow] = useState('visible');
  return (
    <motion.div
      initial={{ height: 0, opacity: 0, marginTop: 0 }}
      animate={{ height: 'auto', opacity: 1, marginTop: gap }}
      exit={{ height: 0, opacity: 0, marginTop: 0 }}
      transition={T.base}
      onAnimationStart={() => setOverflow('hidden')}
      onAnimationComplete={(target) => {
        // Only relax overflow when settling at the "open" state, never on exit.
        if (target && target.opacity === 1) setOverflow('visible');
      }}
      style={{ overflow }}
    >
      {children}
    </motion.div>
  );
}

/* ============================================================
   WATCH-ADD MODAL — bottom-sheet style, inline inside popup
============================================================ */

function WatchAddModal({ pageInfo, tab, onClose, onAdded }) {
  const pageType = pageInfo.pageType || 'other';
  const knownType = (pageType === 'order' || pageType === 'contact' || pageType === 'account')
    ? pageType : 'order';
  const meta = WL_ENTITY[knownType];

  const entityId =
    knownType === 'order' ? (pageInfo.orderNo || '') :
    knownType === 'contact' ? (pageInfo.contactId || '') :
    knownType === 'account' ? (pageInfo.accountId || '') : '';

  const [reason, setReason] = useState('');
  const [error, setError] = useState(false);
  const taRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => taRef.current?.focus(), 290);
    return () => clearTimeout(t);
  }, []);

  // Esc closes; Enter (no shift) submits
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = () => {
    const r = reason.trim();
    if (!r) { setError(true); taRef.current?.focus(); return; }
    onAdded({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      orderId: entityId,
      orderUrl: tab?.url || '',
      entityType: knownType,
      reason: r,
      addedAt: Date.now(),
    });
  };

  const Icon = meta.icon;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={T.fast}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'absolute', inset: 0, zIndex: 600,
        background: 'var(--gb-backdrop)',
        backdropFilter: 'var(--gb-backdrop-blur)',
        WebkitBackdropFilter: 'var(--gb-backdrop-blur)',
        display: 'flex', alignItems: 'flex-end',
      }}>
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={T.bounce}
        style={{
          width: '100%',
          background: 'var(--gb-surface-modal)',
          borderTop: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-xl) var(--gb-r-xl) 0 0',
          boxShadow: '0 -10px 44px rgba(0,0,0,.6)',
          overflow: 'hidden',
        }}>
        <div style={{ width: 32, height: 3, borderRadius: 2, background: 'var(--gb-fill-strong)', margin: '9px auto 0' }} />
        <div style={{
          padding: '10px 14px 11px',
          display: 'flex', alignItems: 'center', gap: 8,
          borderBottom: '1px solid var(--gb-border-subtle)',
        }}>
          <span style={{ color: 'var(--gb-brand-label)', display: 'flex' }}>
            <Icon size={13} />
          </span>
          <div style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>
            {meta.title}
          </div>
          <Btn size="xs" variant="ghost" icon={<I.close />} onClick={onClose} />
        </div>
        <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label={meta.field}>
            <input
              value={entityId || '—'} disabled
              style={{ ...inputBaseStyle({ size: 'sm' }), opacity: 0.6, cursor: 'default' }}
            />
          </Field>
          <Field label="Reason" required error={error ? 'Required' : undefined}>
            <Textarea
              nativeRef={taRef}
              value={reason}
              onChange={(v) => { setReason(v); if (error) setError(false); }}
              placeholder={meta.placeholder}
              rows={3}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            />
          </Field>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <Btn size="sm" onClick={onClose}>Cancel</Btn>
            <Btn
              size="sm"
              variant="primary"
              icon={<Icon size={12} />}
              onClick={submit}
              style={{ flex: 1, minWidth: 0 }}
            >
              Add to Watch List
            </Btn>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}


/* ============================================================
   MOUNT
============================================================ */

ensureTheme();

function mount() {
  const host = document.getElementById('popup-root');
  if (!host) return;
  host.setAttribute('data-gb-scale', 'popup');
  // The toolbar popup is the one surface every installation opens; `popup` is
  // its own kind so the Adoption block can separate it from the in-page work.
  trackDocumentSurface('Toolbar Popup', 'popup');
  createRoot(host).render(
    <ToastHost>
      <PopupApp />
    </ToastHost>,
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
