import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ensureTheme } from '../lib/theme.js';
import { useDevSettings } from '../lib/devSettings.js';
import {
  Btn, Dropdown, Dot, KeyVal, SectionLabel, Field, Textarea,
  Spinner, I, T, inputBaseStyle,
} from '../ui';

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
    try { chrome.tabs.sendMessage(tabId, msg, (resp) => resolve(resp)); }
    catch { resolve(null); }
  });

/* ============================================================
   TEMPLATE RENDERING HELPERS — preserved 1:1 from popup.js
============================================================ */

// Drop sentences containing unresolved variables that opted in to
// smart.conditional, so empty placeholders don't leak into the output.
// Mirrors `dropConditional` in content/variable-resolution.js — duplicated
// because popup runs in a separate context.
function dropConditional(text, defs, resolved) {
  if (!text || !defs) return text || '';
  let out = String(text);
  for (const [name, def] of Object.entries(defs)) {
    const smart = def && def.smart;
    if (!smart || !smart.conditional) continue;
    const val = resolved ? resolved[name] : '';
    if (val != null && String(val).length > 0) continue;
    const placeholder = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const scope = smart.conditionalScope || 'sentence';
    let rx;
    if (scope === 'paragraph') {
      rx = new RegExp(`[^\\n]*\\{\\{\\s*${placeholder}\\s*\\}\\}[^\\n]*(\\n\\n|\\n?$)`, 'g');
    } else if (scope === 'line') {
      rx = new RegExp(`[^\\n]*\\{\\{\\s*${placeholder}\\s*\\}\\}[^\\n]*\\n?`, 'g');
    } else {
      rx = new RegExp(`[^.!?\\n]*\\{\\{\\s*${placeholder}\\s*\\}\\}[^.!?\\n]*[.!?]?\\s*`, 'g');
    }
    out = out.replace(rx, '');
  }
  return out;
}

function renderStr(str, vars, defs) {
  const text = defs ? dropConditional(str, defs, vars) : (str || '');
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

function buildMailto(to, subject, body) {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// Convert template HTML → Outlook-friendly plain text for mailto links.
function toPlainText(html) {
  if (!html) return '';
  let text = html.replace(/<br\s*\/?>\s*<\/p>/gi, '</p>');
  text = text.replace(/<br\s*\/?>/gi, '\r\n')
             .replace(/<\/p>/gi, '\r\n\r\n')
             .replace(/<\/li>/gi, '\r\n')
             .replace(/<\/[ou]l>/gi, '\r\n');
  text = text.replace(/<[^>]+>/g, '');
  const decoder = document.createElement('textarea');
  decoder.innerHTML = text;
  return decoder.value.replace(/(\r\n|\n){3,}/g, '\r\n\r\n').trim();
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
  const [allTemplates, setAllTemplates] = useState([]);  // all enabled, non-case templates (full list, pre page-filter)
  const [pageInfo, setPageInfo] = useState({});
  const [flags, setFlags] = useState({});
  const [watchList, setWatchList] = useState([]);

  // ── dev settings — live-subscribed so every toggle reflects instantly ──
  // Single hook covers every devSettings knob this popup reads (ignore-context
  // bools, forceMatchedCount, etc.). The hook handles storage.onChanged so we
  // never need a manual subscription here.
  const [devSettings] = useDevSettings();
  const ignorePageContext = !!devSettings['popup.ignorePageContext'];
  const ignoreCharge      = !!devSettings['popup.ignoreContext.charge'];
  const ignoreOrderEdit   = !!devSettings['popup.ignoreContext.orderEdit'];
  const ignoreWatch       = !!devSettings['popup.ignoreContext.watch'];
  const ignoreProof       = !!devSettings['popup.ignoreContext.submitProof'];
  const forceMatchedCount = Math.max(0, Math.floor(devSettings['popup.forceMatchedCount'] || 0));

  // ── selected template + resolved data ──
  const [selectedId, setSelectedId] = useState(null);
  const [matchedIds, setMatchedIds] = useState([]);
  const [resolvedVars, setResolvedVars] = useState({});
  const [resolvedTo, setResolvedTo] = useState('');
  const [resolving, setResolving] = useState(false);

  // ── inline modal state ──
  const [watchModalOpen, setWatchModalOpen] = useState(false);
  const [proofModalOpen, setProofModalOpen] = useState(false);

  /* ── initial load: tab → templates/watchList/flags → probe content scripts → getPageInfo ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const currentTab = await tabsQueryActive();
      if (cancelled || !currentTab) return;
      await new Promise((res) => {
        try { chrome.storage.local.set({ orderTabId: currentTab.id }, res); }
        catch { res(); }
      });

      const data = await storageGet(['templates', 'watchList', 'featureFlags']);
      const tpls = (data.templates || []).filter((t) => t.enabled !== false && t.type !== 'case');
      const mergedFlags = {
        chargeEnabled: true, orderEditEnabled: true, submitProofEnabled: true,
        taskListEnabled: true, crmSearchEnabled: true, watchListEnabled: true,
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
      if (cancelled) return;
      setTab(currentTab);
      setAllTemplates(tpls);
      setWatchList(data.watchList || []);
      setFlags(mergedFlags);

      if (tpls.length === 0) { setStage('empty'); return; }

      // Dev escape hatch — skip page-script probing and variable resolution.
      // Templates list still populates because visibleTemplates returns ALL
      // order/account templates when ignoreCtx is on.
      if (ignoreCtx) { renderMain({ pageType: '__all__' }, tpls); return; }

      // Probe whether all content scripts are fully live in this tab.
      // Checks both the ready flag (set by main.js) AND the existence of the
      // watchlist function (from watchlist-modal.js) to catch any partial-load
      // scenarios where main.js ran but a dependency failed.
      const probeResults = await new Promise((res) => {
        try {
          chrome.scripting.executeScript(
            { target: { tabId: currentTab.id },
              func: () => !!window.__gbContentReady && typeof __gbShowWatchListModal === 'function' },
            res,
          );
        } catch { res(null); }
      });
      const alreadyLoaded = probeResults?.[0]?.result === true;

      const askForPageInfo = async () => {
        const info = await sendMessage(currentTab.id, {
          action: 'getPageInfo',
          templates: tpls.map((t) => ({
            id: t.id, rules: t.rules, type: t.type,
            accountConditions: t.accountConditions || [],
          })),
        });
        if (cancelled) return;
        renderMain(info || {}, tpls);
      };

      if (alreadyLoaded) {
        askForPageInfo();
      } else {
        // First open on a fresh page load — inject the full bundle once.
        try {
          chrome.scripting.executeScript(
            { target: { tabId: currentTab.id },
              files: [
                'theme.js', 'libs/flatpickr.js', 'content/notifications.js',
                'content/calendar.js', 'content/smart-detection.js',
                'content/variable-resolution.js', 'content/logo-extractor.js',
                'content/charge-modal.js', 'content/order-edit-modal.js',
                'content/email-preview.js', 'content/page-utils.js',
                'content/watchlist-modal.js', 'content/crm-query-builder.js',
                'content/main.js',
              ] },
            askForPageInfo,
          );
        } catch { askForPageInfo(); }
      }
    })();
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
    setSelectedId(initial);
    setStage('main');
  }

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
      return;
    }
    setResolving(true);
    setResolvedVars({});
    setResolvedTo('');
    sendMessage(tab.id, {
      action: 'resolveVars',
      vars: tpl.vars || {},
      toField: tpl.toField || { type: 'auto' },
    }).then((result) => {
      setResolvedVars(result?.resolved || {});
      setResolvedTo(result?.toEmail || '');
      setResolving(false);
    });
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
          chargeEnabled: true, orderEditEnabled: true, submitProofEnabled: true,
          taskListEnabled: true, crmSearchEnabled: true, watchListEnabled: true,
          ...next,
        });
      }
      if (changes.watchList) setWatchList(changes.watchList.newValue || []);
      if (changes.templates) {
        const next = (changes.templates.newValue || [])
          .filter((t) => t.enabled !== false && t.type !== 'case');
        setAllTemplates(next);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  /* ── header openers ── */
  const openManager = () => { try { chrome.runtime.sendMessage({ action: 'openEditor' }); } catch {} };

  /* ── stage routes ── */
  // templateCount in the header reflects the user's total enabled templates
  // (not the page-filtered subset), so it's a stable "how many templates do
  // I have" indicator regardless of what tab the popup opened over.
  const templateCount = allTemplates.length;
  if (stage === 'loading') return <Shell templateCount={templateCount}><LoadingState /></Shell>;
  if (stage === 'empty')   return <Shell templateCount={templateCount} onManage={openManager}><EmptyState onCreate={openManager} /></Shell>;

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
      <Shell templateCount={templateCount} onManage={openManager}>
        <MainView
          templates={visibleTemplates}
          matchedIds={effectiveMatchedIds}
          selectedId={selectedId}
          onSelect={setSelectedId}
          tpl={tpl}
          resolving={resolving}
          resolvedVars={resolvedVars}
          resolvedTo={resolvedTo}
          pageInfo={pageInfo}
          flags={flags}
          watchList={watchList}
          tab={tab}
          ignoreCharge={ignoreCharge}
          ignoreOrderEdit={ignoreOrderEdit}
          ignoreWatch={ignoreWatch}
          ignoreProof={ignoreProof}
          ignorePageContext={ignorePageContext}
          onOpenWatchAdd={() => setWatchModalOpen(true)}
          onOpenProof={() => setProofModalOpen(true)}
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

      <AnimatePresence>
        {proofModalOpen && (
          <ProofModal
            pageInfo={pageInfo}
            tab={tab}
            onClose={() => setProofModalOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ============================================================
   SHELL — header + scrollable body
============================================================ */

function Shell({ children, onManage, templateCount }) {
  // The Chrome popup frame is drawn by the OS before React mounts — there's
  // an unavoidable brief moment where the window is visible but blank.
  // A small fade + scale on the entire content fills that void so the popup
  // feels like it "settles in" rather than snapping. transformOrigin: top
  // matches the user's mental model (popup grows down from the toolbar icon).
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.34, 1.4, 0.64, 1] }}
      style={{
        width: 320, minHeight: 340,
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
   STAGE — EMPTY
============================================================ */

function EmptyState({ onCreate }) {
  return (
    <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--gb-text-muted)', fontSize: 12, lineHeight: 1.7 }}>
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

/* ============================================================
   STAGE — MAIN
============================================================ */

function MainView({
  templates, matchedIds, selectedId, onSelect, tpl,
  resolving, resolvedVars, resolvedTo, pageInfo, flags, watchList, tab,
  ignoreCharge, ignoreOrderEdit, ignoreWatch, ignoreProof, ignorePageContext,
  onOpenWatchAdd, onOpenProof,
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

  const watchCount = watchList.length;
  const watchHasCrit = watchList.some((i) => (Date.now() - i.addedAt) >= 6 * 3600000);

  const proofDisabledReal = !(knownType && (pageInfo.contactId || pageInfo.accountId || pageInfo.orderNo));
  const proofDisabled = ignoreProof ? false : proofDisabledReal;

  // ── template dropdown options ──
  // Matched templates pin to the top of a single flat list with a brand
  // left-accent — same vocabulary as the rest of the design system's list
  // surfaces. No group header needed: the accent reads as "this one matched
  // the page rules" at a glance without spending a whole section.
  //
  // Templates with 2+ variations get a quiet count chip in the trailing slot
  // (muted text on the menu background) so it informs without competing with
  // the label or the accent.
  const dropdownOptions = useMemo(() => {
    const matchedSet = new Set(matchedIds);
    const matched = templates.filter((t) => matchedSet.has(t.id));
    const rest    = templates.filter((t) => !matchedSet.has(t.id));
    return [...matched, ...rest].map((t) => {
      const varN = (t.variations || []).length;
      return {
        id: t.id,
        label: t.name || 'Untitled',
        accent: matchedSet.has(t.id) ? 'brand' : undefined,
        trailing: varN > 1
          ? <span style={{
              fontSize: 9, fontWeight: 600, color: 'var(--gb-text-muted)',
              fontVariantNumeric: 'tabular-nums', letterSpacing: 0.2,
            }}>{varN}×</span>
          : null,
      };
    });
  }, [templates, matchedIds]);

  const isMatched = matchedIds.includes(selectedId);

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

  const onSend = async () => {
    if (!tpl || !canSend || !tab) return;
    const subject  = renderStr(tpl.subject, resolvedVars, tpl.vars);
    const rawBody  = renderStr(tpl.body, resolvedVars, tpl.vars);
    const plainBody = toPlainText(rawBody);

    // tpl.replyMode drives behavior for ALL template types:
    // 'reply'      → find prior email, thread the reply (file or PA)
    // 'standalone' → fresh email (file or PA)
    const replyMode = tpl.replyMode || 'standalone';
    const isReply = replyMode === 'reply';
    const paReady = !!(flags.replyWithTemplateEnabled && flags.powerAutomateUrl);

    let mode = 'mailto';
    if (paReady && isReply)  mode = 'pa-reply';
    else if (paReady)        mode = 'pa-send';
    else if (isReply)        mode = 'reply-file';

    if (mode === 'pa-send' || mode === 'pa-reply') {
      // Fire-and-close — PA is async, flow handles delivery.
      sendMessage(tab.id, {
        action: 'sendViaPA',
        replyMode: tpl.replyMode || replyMode,
        templateHtml: rawBody,
        templateSubject: subject,
        contactEmail: resolvedTo,
        paUrl: flags.powerAutomateUrl,
      });
      window.close();
    } else if (mode === 'reply-file') {
      const resp = await sendMessage(tab.id, {
        action: 'replyWithTemplate',
        templateHtml: rawBody,
        templateSubject: subject,
        contactEmail: resolvedTo,
      });
      if (resp?.fallbackToMailto) {
        try { chrome.tabs.create({ url: buildMailto(resolvedTo, subject, plainBody), active: false }); } catch {}
      }
    } else {
      try { chrome.tabs.create({ url: buildMailto(resolvedTo, subject, plainBody), active: false }); } catch {}
    }

    // Preset task (all modes)
    if (tpl.presetTaskId && (pageInfo.contactId || pageInfo.accountId)) {
      sendMessage(tab.id, {
        action: 'executePresetTask',
        taskId: tpl.presetTaskId,
        contactId: pageInfo.contactId || pageInfo.accountId || '',
        employeeId: pageInfo.userId || '0',
      });
    }
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
    const paReady = !!(flags.replyWithTemplateEnabled && flags.powerAutomateUrl);
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
                <Dropdown
                  size="sm"
                  value={selectedId}
                  options={dropdownOptions}
                  searchable={templates.length > 6}
                  leading={<Dot tone={isMatched ? 'brand' : 'muted'} size={7} glow={isMatched} />}
                  onChange={onSelect}
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
          {flags.orderEditEnabled && (
            <Reveal key="orderEdit">
              <Btn full size="sm"
                disabled={orderEditDisabled}
                icon={<I.edit />}
                onClick={onOrderEdit}>
                Order Edit
              </Btn>
            </Reveal>
          )}
          {flags.watchListEnabled && (
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
          {flags.taskListEnabled && (
            <Reveal key="tasks">
              <Btn full size="sm" icon={<Ic.checkbox />} onClick={onTaskList}>My Tasks</Btn>
            </Reveal>
          )}
          {flags.crmSearchEnabled && (
            <Reveal key="crmSearch">
              <Btn full size="sm" icon={<I.search />} onClick={onCrmSearch}>CRM Search</Btn>
            </Reveal>
          )}
          {flags.submitProofEnabled && (
            <Reveal key="proof">
              <Btn full size="sm"
                disabled={proofDisabled}
                icon={<Ic.paperclip />}
                onClick={onOpenProof}>
                Submit Proof
              </Btn>
            </Reveal>
          )}
        </AnimatePresence>
      </div>

      {/* ── BOTTOM SECTION ─ resolved info + hairline + send button ──
         marginTop:auto pushes this block to the bottom of the popup body,
         so any extra height left over by a short button stack appears as
         empty space between the dropdown and the resolved section — not
         dangling beneath the send button.

         Gated on emailTemplatesEnabled — when off, the whole block (resolved
         info + hr + send button) collapses away so the popup is buttons-only. */}
      <div style={{ marginTop: 'auto', flexShrink: 0 }}>
        <AnimatePresence initial={false}>
          {flags.emailTemplatesEnabled && (
            <Reveal key="send-block" gap={14}>
              {hasTemplates && (
                resolving ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--gb-text-muted)', fontSize: 11.5, padding: '4px 0' }}>
                    <Spinner size={11} /> Resolving variables…
                  </div>
                ) : (
                  <div>
                    <KeyVal k="To" v={resolvedTo || 'Not found'} tone={hasRecipient ? 'ok' : 'error'} />
                    {Object.entries(resolvedVars).map(([name, val]) => (
                      <KeyVal key={name} k={name} v={val ? String(val).slice(0, 40) : 'Not found'} tone={val ? 'default' : 'error'} />
                    ))}
                  </div>
                )
              )}

              <hr style={{ border: 0, borderTop: '1px solid var(--gb-border-subtle)', margin: '10px 0' }} />

              <Btn
                full
                variant="primary"
                size="md"
                disabled={!hasTemplates || !canSend || resolving}
                icon={sendMode?.icon || <I.send />}
                onClick={onSend}>
                {sendMode?.label || 'Open in Outlook'}
              </Btn>
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
 */
function Reveal({ children, gap = 6 }) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0, marginTop: 0 }}
      animate={{ height: 'auto', opacity: 1, marginTop: gap }}
      exit={{ height: 0, opacity: 0, marginTop: 0 }}
      transition={T.base}
      style={{ overflow: 'hidden' }}
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
            <Btn full size="sm" variant="primary" icon={<Icon size={12} />} onClick={submit}>
              Add to Watch List
            </Btn>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ============================================================
   SUBMIT-PROOF MODAL — full-screen overlay inside popup
============================================================ */

function ProofModal({ pageInfo, tab, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reps, setReps] = useState([]);
  const [artists, setArtists] = useState([]);
  const [existingProofs, setExistingProofs] = useState([]);

  const [file, setFile] = useState(null);
  const [thumb, setThumb] = useState(null);
  const [name, setName] = useState('');
  const [orderId, setOrderId] = useState(pageInfo.orderNo || '');
  const [contactId] = useState(pageInfo.contactId || pageInfo.accountId || '');
  const [rep, setRep] = useState('');
  const [artist, setArtist] = useState('');
  const [status, setStatus] = useState('1');
  const [logoType, setLogoType] = useState('Ball');
  const [notes, setNotes] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const fileRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Load live rep/artist dropdowns + existing proofs.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const html = await fetch(
          `https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=128${contactId ? '&customerID=' + contactId : ''}`,
          { credentials: 'include' },
        ).then((r) => r.text());
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const scrape = (id) => Array.from(doc.getElementById(id)?.options || []).map((o) => ({ val: o.value, txt: o.text.trim() }));
        const liveReps    = scrape('ctl00_DropDownSalesRep');
        const liveArtists = scrape('ctl00_DropDownArtist');

        let proofs = [];
        if (contactId) {
          try {
            const crmHtml = await fetch(
              `https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=240&customerID=${contactId}`,
              { credentials: 'include' },
            ).then((r) => r.text());
            const cDoc = new DOMParser().parseFromString(crmHtml, 'text/html');
            for (const row of cDoc.querySelectorAll('tr')) {
              const cells = row.querySelectorAll('td');
              if (cells.length < 5) continue;
              const anchor = cells[4].querySelector('a[href*="logoProofing"]');
              const img    = cells[4].querySelector('img');
              if (!anchor || !img) continue;
              const m = (anchor.getAttribute('href') || '').match(/logoGUID=([a-f0-9-]+)/i);
              if (!m) continue;
              const guid = m[1];
              let pName = '';
              for (let i = 0; i <= 3 && !pName; i++) {
                const tx = cells[i]?.textContent.trim();
                if (tx && tx.length > 2) pName = tx;
              }
              proofs.push({
                name: pName || anchor.textContent.trim() || `Proof ${guid.slice(0, 8)}`,
                proofLink: `https://www.golfballs.com/golfballs/logoProofing/?logoGUID=${guid}`,
                thumbUrl: `https://d1tp32r8b76g0z.cloudfront.net/logo/${guid.slice(0, 2)}/${guid}-150.jpg`,
                status: cells[3]?.textContent.trim() || '',
              });
            }
          } catch { /* proofs not critical */ }
        }

        if (cancelled) return;
        setReps(liveReps);
        setArtists(liveArtists);
        setExistingProofs(proofs);
        setLoading(false);
      } catch (e) {
        if (!cancelled) { setError('Failed to load form data.'); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [contactId]);

  const pickFile = (f) => {
    if (!f) return;
    setFile(f);
    setName((prev) => prev || f.name.replace(/\.[^.]+$/, ''));
    if (f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setThumb(e.target.result);
      reader.readAsDataURL(f);
    } else {
      setThumb(null);
    }
  };

  const submit = async () => {
    if (!file || !name.trim() || !tab) return;
    // Hand off to content-script proof handler — same protocol as old popup.js
    await sendMessage(tab.id, {
      action: 'showSubmitProofModal',
      orderId, customerId: contactId,
      liveReps: reps, liveArtists: artists,
      existingProofs,
    });
    window.close();
  };

  const fmt = (b) => {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1024 / 1024).toFixed(1) + ' MB';
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={T.fast}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'absolute', inset: 0, zIndex: 700,
        background: 'var(--gb-backdrop)',
        backdropFilter: 'var(--gb-backdrop-blur)',
        WebkitBackdropFilter: 'var(--gb-backdrop-blur)',
        display: 'flex', alignItems: 'stretch',
      }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={T.bounce}
        style={{
          width: '100%',
          background: 'var(--gb-surface-canvas)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
        {/* Header */}
        <div style={{
          padding: '12px 14px',
          background: 'var(--gb-surface-1)',
          borderBottom: '1px solid var(--gb-border-subtle)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: 'var(--gb-r-md)',
            background: 'var(--gb-brand-tint-medium)',
            border: '1px solid var(--gb-brand-tint-border)',
            color: 'var(--gb-brand-label)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Ic.paperclip size={14} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Submit Proof</div>
            <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: 1 }}>
              {loading ? 'Loading context…' : (orderId ? `Order #${orderId}` : 'No order context')}
            </div>
          </div>
          <Btn size="xs" variant="ghost" icon={<I.close />} onClick={onClose}>Close</Btn>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Drop zone / preview */}
          {!file ? (
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault(); setDragOver(false);
                const f = e.dataTransfer.files?.[0]; if (f) pickFile(f);
              }}
              style={{
                border: `2px dashed ${dragOver ? 'var(--gb-brand-label)' : 'var(--gb-brand-tint-border)'}`,
                borderRadius: 'var(--gb-r-lg)',
                padding: '22px 16px',
                textAlign: 'center', cursor: 'pointer',
                transition: 'all .18s',
                background: dragOver ? 'var(--gb-brand-tint-medium)' : 'var(--gb-brand-tint-soft)',
              }}>
              <div style={{ color: 'var(--gb-brand-label)', marginBottom: 6, display: 'flex', justifyContent: 'center' }}>
                <Ic.upload size={26} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>
                Drop file here or click to browse
              </div>
              <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: 3 }}>
                PNG, JPG, PDF, AI, EPS, PSD — any proof file
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf,.ai,.eps,.psd,.png,.jpg,.jpeg,.gif,.svg"
                style={{ display: 'none' }}
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
            </div>
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'var(--gb-surface-2)', borderRadius: 'var(--gb-r-md)',
              padding: '9px 12px', border: '1px solid var(--gb-border-subtle)',
            }}>
              {thumb ? (
                <img src={thumb} alt="" style={{
                  width: 44, height: 44, borderRadius: 'var(--gb-r-sm)', objectFit: 'contain',
                  background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)',
                }} />
              ) : (
                <div style={{
                  width: 44, height: 44, borderRadius: 'var(--gb-r-sm)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)',
                  color: 'var(--gb-text-muted)',
                }}>
                  <Ic.file size={20} />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12, fontWeight: 600, color: 'var(--gb-text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{file.name}</div>
                <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: 1 }}>{fmt(file.size)}</div>
              </div>
              <Btn size="xs" variant="ghost" icon={<I.close />} onClick={() => { setFile(null); setThumb(null); }} title="Remove" />
            </div>
          )}

          {loading ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 11, color: 'var(--gb-text-muted)',
            }}>
              <Spinner size={12} /> Loading sales reps &amp; artists…
            </div>
          ) : (
            <>
              <Field label="Proof Name" required>
                <input
                  value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Acme Corp Logo Proof"
                  style={inputBaseStyle({ size: 'sm' })}
                />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Field label="Order ID">
                  <input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="N/A" style={inputBaseStyle({ size: 'sm' })} />
                </Field>
                <Field label="Contact ID">
                  <input value={contactId} disabled style={{ ...inputBaseStyle({ size: 'sm' }), opacity: 0.6 }} />
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Field label="Sales Rep">
                  <Dropdown size="sm" value={rep} placeholder="Select…" options={reps.map((r) => ({ id: r.val, label: r.txt }))} onChange={setRep} searchable />
                </Field>
                <Field label="Artist">
                  <Dropdown size="sm" value={artist} placeholder="Select…" options={artists.map((a) => ({ id: a.val, label: a.txt }))} onChange={setArtist} searchable />
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Field label="Status">
                  <Dropdown size="sm" value={status} options={[
                    { id: '1', label: 'New' }, { id: '2', label: 'In Progress' },
                    { id: '3', label: 'Approved' }, { id: '4', label: 'Revision' },
                  ]} onChange={setStatus} />
                </Field>
                <Field label="Logo Type">
                  <Dropdown size="sm" value={logoType} options={['Ball','Box','Bag','Other'].map((v) => ({ id: v, label: v }))} onChange={setLogoType} />
                </Field>
              </div>
              <Field label="Notes">
                <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes for the art team" style={inputBaseStyle({ size: 'sm' })} />
              </Field>
              {error && (
                <div style={{
                  fontSize: 11, color: 'var(--gb-error-fg)',
                  background: 'var(--gb-error-tint-soft)',
                  border: '1px solid var(--gb-error-tint-border)',
                  borderRadius: 'var(--gb-r-sm)', padding: '6px 10px',
                }}>{error}</div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 14px',
          background: 'var(--gb-surface-1)',
          borderTop: '1px solid var(--gb-border-subtle)',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          <div style={{ flex: 1, fontSize: 10, color: 'var(--gb-text-muted)' }} />
          <Btn size="sm" onClick={onClose}>Cancel</Btn>
          <Btn size="sm" variant="primary" icon={<I.send />} disabled={!file || !name.trim() || loading} onClick={submit}>
            Submit
          </Btn>
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
  createRoot(host).render(<PopupApp />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
