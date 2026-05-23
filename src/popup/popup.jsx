import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ensureTheme } from '../lib/theme.js';
import {
  Btn, Dropdown, Dot, Tag, KeyVal, SectionLabel, Field, Textarea,
  Spinner, I, T, sizeIcon, inputBaseStyle,
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
      if (cancelled) return;
      setTab(currentTab);
      setAllTemplates(tpls);
      setWatchList(data.watchList || []);
      setFlags(mergedFlags);

      if (tpls.length === 0) { setStage('empty'); return; }

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
    const pageType = pageInfo.pageType || 'other';
    if (pageType === 'order')   return allTemplates.filter((t) => t.type === 'order' || t.type === 'email' || !t.type);
    if (pageType === 'account' || pageType === 'contact') return allTemplates.filter((t) => t.type === 'account');
    return [];
  }, [allTemplates, pageInfo.pageType]);

  function renderMain(info, tpls = allTemplates) {
    setPageInfo(info);
    setMatchedIds(info.matchedTemplateIds || []);

    // Always go to main — action buttons (charge / watch / tasks / etc.) are
    // page-context driven, not template-driven, so they should stay visible
    // even when no template matches the current page type. The template
    // section in MainView shows its own "no matches" state when empty.
    const pageType = info.pageType || 'other';
    const visible =
      pageType === 'order'   ? tpls.filter((t) => t.type === 'order' || t.type === 'email' || !t.type) :
      (pageType === 'account' || pageType === 'contact') ? tpls.filter((t) => t.type === 'account') : [];

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
  }, [selectedId, tab, visibleTemplates]);

  /* ── listen for live flag changes (charge/orderEdit toggles, etc.) ── */
  useEffect(() => {
    if (!chrome?.runtime?.onMessage) return;
    const listener = (msg) => {
      if (msg.action === 'GB_FEATURE_FLAGS' && msg.flags) {
        setFlags((prev) => ({ ...prev, ...msg.flags }));
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  /* ── header openers ── */
  const openManager = () => { try { chrome.runtime.sendMessage({ action: 'openEditor' }); } catch {} };

  /* ── stage routes ── */
  if (stage === 'loading') return <Shell><LoadingState /></Shell>;
  if (stage === 'empty')   return <Shell onManage={openManager}><EmptyState onCreate={openManager} /></Shell>;

  const tpl = visibleTemplates.find((t) => t.id === selectedId);
  return (
    <>
      <Shell onManage={openManager}>
        <MainView
          templates={visibleTemplates}
          matchedIds={matchedIds}
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

function Shell({ children, onManage }) {
  return (
    <div style={{
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
    }}>
      <Header onManage={onManage} />
      <div style={{ padding: '14px 14px 14px', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

function Header({ onManage }) {
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
        <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', fontWeight: 500, marginTop: 1 }}>
          Golfballs.com
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
  onOpenWatchAdd, onOpenProof,
}) {
  // ── derived button states ──
  const canSend = !!(resolvedTo && resolvedTo.includes('@'));

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

  const watchAddDisabled = !(knownType && entityId);

  const watchCount = watchList.length;
  const watchHasCrit = watchList.some((i) => (Date.now() - i.addedAt) >= 6 * 3600000);

  const proofDisabled = !(knownType && (pageInfo.contactId || pageInfo.accountId || pageInfo.orderNo));

  // ── template dropdown options ──
  // Matched templates pinned to top; "matched" tag on the row label so the
  // user can spot which the page-rules engine pre-selected.
  const dropdownOptions = useMemo(() => {
    const matchedSet = new Set(matchedIds);
    const matched = templates.filter((t) => matchedSet.has(t.id));
    const rest    = templates.filter((t) => !matchedSet.has(t.id));
    return [...matched, ...rest].map((t) => ({
      id: t.id,
      label: t.name || 'Untitled',
      group: matchedSet.has(t.id) ? 'Matched' : 'All templates',
    }));
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
  const sendMode = (() => {
    if (!canSend) return null;
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* TEMPLATE — only when there are templates matching this page type */}
      {hasTemplates ? (
        <section>
          <SectionLabel>Template</SectionLabel>
          <Dropdown
            size="sm"
            value={selectedId}
            options={dropdownOptions}
            searchable={templates.length > 6}
            leading={<Dot tone={isMatched ? 'brand' : 'muted'} size={7} glow={isMatched} />}
            onChange={onSelect}
          />
        </section>
      ) : (
        <section>
          <SectionLabel>Template</SectionLabel>
          <div style={{
            fontSize: 11, color: 'var(--gb-text-muted)', lineHeight: 1.5,
            padding: '8px 10px',
            background: 'var(--gb-fill-subtle)',
            border: '1px dashed var(--gb-border-default)',
            borderRadius: 'var(--gb-r-md)',
          }}>
            No templates for this page type.
          </div>
        </section>
      )}

      {/* ACTIONS — order page only */}
      {(flags.chargeEnabled || flags.orderEditEnabled) && (
        <section>
          <SectionLabel>Actions</SectionLabel>
          <Stack>
            {flags.chargeEnabled && (
              <Btn full size="sm"
                variant={chargeReady ? 'tinted' : 'secondary'}
                status={isRefund ? 'error' : 'brand'}
                disabled={!chargeReady}
                icon={<I.card />}
                onClick={onCharge}>
                {chargeLabel}
              </Btn>
            )}
            {flags.orderEditEnabled && (
              <Btn full size="sm"
                disabled={!pageInfo.messageId}
                icon={<I.edit />}
                onClick={onOrderEdit}>
                Order Edit
              </Btn>
            )}
          </Stack>
        </section>
      )}

      {/* TRACKING — watch-list pair */}
      {flags.watchListEnabled && (
        <section>
          <SectionLabel>Tracking</SectionLabel>
          <Stack>
            <Btn full size="sm"
              disabled={watchAddDisabled}
              icon={<I.eye />}
              onClick={onOpenWatchAdd}>
              {WL_ENTITY[knownType ? pageType : 'order'].btn}
            </Btn>
            <Btn full size="sm"
              variant={watchHasCrit && watchCount > 0 ? 'tinted' : 'secondary'}
              status="error"
              icon={<Ic.watch />}
              iconRight={watchCount > 0
                ? <Tag tone={watchHasCrit ? 'error' : 'brand'} size="xs" pulse={watchHasCrit}>{watchCount > 99 ? '99+' : watchCount}</Tag>
                : null}
              onClick={onWatchListShow}>
              Watch List
            </Btn>
          </Stack>
        </section>
      )}

      {/* TOOLS */}
      {(flags.taskListEnabled || flags.crmSearchEnabled || flags.submitProofEnabled) && (
        <section>
          <SectionLabel>Tools</SectionLabel>
          <Stack>
            {flags.taskListEnabled && (
              <Btn full size="sm" icon={<Ic.checkbox />} onClick={onTaskList}>
                My Tasks
              </Btn>
            )}
            {flags.crmSearchEnabled && (
              <Btn full size="sm" icon={<I.search />} onClick={onCrmSearch}>
                CRM Search
              </Btn>
            )}
            {flags.submitProofEnabled && (
              <Btn full size="sm"
                disabled={proofDisabled}
                icon={<Ic.paperclip />}
                onClick={onOpenProof}>
                Submit Proof
              </Btn>
            )}
          </Stack>
        </section>
      )}

      {/* RESOLVED CONTEXT + PRIMARY SEND — only meaningful with a template */}
      {hasTemplates && (
        <>
          <section>
            <SectionLabel>Resolved</SectionLabel>
            {resolving ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--gb-text-muted)', fontSize: 11.5, padding: '4px 0' }}>
                <Spinner size={11} /> Resolving variables…
              </div>
            ) : (
              <div>
                <KeyVal k="To" v={resolvedTo || 'Not found'} tone={canSend ? 'ok' : 'error'} />
                {Object.entries(resolvedVars).map(([name, val]) => (
                  <KeyVal key={name} k={name} v={val ? String(val).slice(0, 40) : 'Not found'} tone={val ? 'default' : 'error'} />
                ))}
              </div>
            )}
          </section>

          <div style={{
            borderTop: '1px solid var(--gb-border-subtle)',
            paddingTop: 12,
          }}>
            <Btn
              full
              variant="primary"
              size="md"
              disabled={!canSend || resolving}
              icon={sendMode?.icon}
              onClick={onSend}>
              {sendMode?.label || 'Open in Outlook'}
            </Btn>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Stack: vertical row of buttons w/ consistent gap ─────────── */
function Stack({ children, gap = 6 }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap }}>{children}</div>;
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
