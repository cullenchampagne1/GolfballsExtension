import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import { filterLocalEmailTemplates } from '../lib/emailTemplateCapabilities.js';
import {
  buildEmailCreationPreview,
  templatesForEmailPreview,
} from '../lib/emailCreationPreview.js';
import { parseTemplateValue, TemplatePicker } from '../ui/components/TemplatePicker.jsx';
import { Btn, EmailHtmlView, I, Spinner } from '../ui';

const EXTENSION_PROTOCOL = 'chrome-extension:';
const REFRESH_INTERVAL_MS = 5_000;
const CONTENT_SCRIPT_FILES = [
  'theme.js',
  'src/vanilla/smart-detection.js',
  'react-dist/vanilla/page-engine.js',
  'src/vanilla/variable-resolution.js',
  'src/vanilla/usage-report.js',
  'src/vanilla/modals/modal-chrome.js',
  'src/vanilla/modals/charge-modal.js',
  'src/vanilla/modals/order-edit-modal.js',
  'src/vanilla/page-utils.js',
  'react-dist/content/email-preview.js',
  'react-dist/content/watch-list.js',
  'react-dist/content/actions-shelf.js',
  'react-dist/content/calendar.js',
  'src/vanilla/main.js',
];

const CSS = `
  button { color: inherit; font: inherit; }
  .ecp-app { width:100%; height:100%; display:flex; flex-direction:column; color:var(--gb-text-secondary); background:var(--gb-surface-canvas); font-family:var(--gb-font-sans); font-size:12px; line-height:1.45; }
  .ecp-header { min-height:68px; padding:12px 18px; display:flex; align-items:center; gap:12px; border-bottom:1px solid var(--gb-border-default); background:var(--gb-surface-1); }
  .ecp-mark { width:38px; height:38px; flex:0 0 auto; display:grid; place-items:center; color:var(--gb-brand-label); border:1px solid var(--gb-brand-tint-border); border-radius:var(--gb-r-lg); background:var(--gb-brand-tint-medium); }
  .ecp-title-wrap { min-width:0; flex:1; }
  .ecp-title { color:var(--gb-text-primary); font-size:15px; font-weight:850; letter-spacing:-.25px; }
  .ecp-subtitle { margin-top:2px; color:var(--gb-text-muted); font-size:10px; }
  .ecp-preview-only { display:inline-flex; align-items:center; gap:6px; padding:5px 8px; color:var(--gb-brand-label); border:1px solid var(--gb-brand-tint-border); border-radius:var(--gb-r-pill); background:var(--gb-brand-tint-soft); font-size:9px; font-weight:850; letter-spacing:.5px; text-transform:uppercase; }
  .ecp-main { flex:1; min-height:0; overflow:auto; padding:16px 18px 26px; scrollbar-width:thin; scrollbar-color:var(--gb-border-strong) transparent; }
  .ecp-shell { width:100%; display:grid; gap:12px; }
  .ecp-card { min-width:0; overflow:hidden; border:1px solid var(--gb-border-default); border-radius:var(--gb-r-xl); background:var(--gb-surface-1); box-shadow:0 3px 12px rgba(0,0,0,.08); }
  .ecp-source { padding:12px 14px; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:12px; align-items:center; }
  .ecp-source-title { overflow:hidden; color:var(--gb-text-primary); font-size:13px; font-weight:800; text-overflow:ellipsis; white-space:nowrap; }
  .ecp-source-url { margin-top:3px; overflow:hidden; color:var(--gb-text-muted); font-family:var(--gb-font-mono); font-size:9px; text-overflow:ellipsis; white-space:nowrap; }
  .ecp-badges { margin-top:7px; display:flex; flex-wrap:wrap; gap:5px; }
  .ecp-badge { min-height:20px; padding:2px 7px; display:inline-flex; align-items:center; color:var(--gb-text-tertiary); border:1px solid var(--gb-border-default); border-radius:var(--gb-r-pill); background:var(--gb-fill-faint); font-size:9px; font-weight:750; }
  .ecp-badge.brand { color:var(--gb-brand-label); border-color:var(--gb-brand-tint-border); background:var(--gb-brand-tint-soft); }
  .ecp-controls { padding:12px; display:grid; grid-template-columns:minmax(240px,1fr) auto; gap:10px; align-items:start; overflow:visible; }
  .ecp-picker-label { margin:0 0 6px 2px; color:var(--gb-text-muted); font-size:8.5px; font-weight:800; letter-spacing:.55px; text-transform:uppercase; }
  .ecp-panel-head { min-height:42px; padding:9px 12px; display:flex; align-items:center; justify-content:space-between; gap:10px; border-bottom:1px solid var(--gb-border-subtle); background:var(--gb-fill-faint); }
  .ecp-panel-title { color:var(--gb-text-primary); font-size:12px; font-weight:800; }
  .ecp-panel-meta { color:var(--gb-text-muted); font-size:9px; }
  .ecp-fields { border-bottom:1px solid var(--gb-border-subtle); }
  .ecp-field { min-height:38px; padding:8px 12px; display:grid; grid-template-columns:62px minmax(0,1fr); gap:10px; align-items:start; border-top:1px solid var(--gb-border-subtle); }
  .ecp-field:first-child { border-top:0; }
  .ecp-field-label { padding-top:1px; color:var(--gb-text-muted); font-size:9px; font-weight:800; letter-spacing:.45px; text-transform:uppercase; }
  .ecp-field-value { min-width:0; color:var(--gb-text-primary); font-size:11px; overflow-wrap:anywhere; }
  .ecp-field-value.empty { color:var(--gb-text-ghost); font-style:italic; }
  .ecp-body { width:100%; min-height:430px; padding:0 20px; background:var(--gb-surface-1); }
  .ecp-vars { max-height:360px; padding:10px; overflow:auto; display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:8px; }
  .ecp-var { min-width:0; padding:9px 10px; display:grid; gap:5px; border:1px solid var(--gb-border-subtle); border-radius:var(--gb-r-md); background:var(--gb-fill-faint); }
  .ecp-var-head { min-width:0; display:flex; align-items:center; gap:6px; }
  .ecp-var-dot { width:6px; height:6px; flex:0 0 auto; border-radius:50%; background:var(--gb-text-ghost); }
  .ecp-var.resolved .ecp-var-dot { background:var(--gb-success-fg); box-shadow:0 0 0 3px var(--gb-success-tint-soft); }
  .ecp-var.pending .ecp-var-dot { background:var(--gb-brand-label); box-shadow:0 0 0 3px var(--gb-brand-tint-soft); }
  .ecp-var-name { min-width:0; overflow:hidden; color:var(--gb-text-primary); font-family:var(--gb-font-mono); font-size:9.5px; font-weight:750; text-overflow:ellipsis; white-space:nowrap; }
  .ecp-var-value { color:var(--gb-text-secondary); font-family:var(--gb-font-mono); font-size:9px; white-space:pre-wrap; overflow-wrap:anywhere; }
  .ecp-var.pending .ecp-var-value { color:var(--gb-brand-label); }
  .ecp-var.empty .ecp-var-value { color:var(--gb-text-ghost); font-style:italic; }
  .ecp-state { min-height:260px; padding:42px 22px; display:grid; place-items:center; align-content:center; gap:10px; color:var(--gb-text-muted); text-align:center; }
  .ecp-state-icon { width:42px; height:42px; display:grid; place-items:center; border:1px solid var(--gb-border-default); border-radius:50%; background:var(--gb-fill-faint); }
  .ecp-state-title { color:var(--gb-text-primary); font-size:13px; font-weight:800; }
  .ecp-state-copy { max-width:470px; font-size:10.5px; line-height:1.55; }
  .ecp-error { padding:9px 12px; display:flex; align-items:flex-start; gap:7px; color:var(--gb-danger-fg); border-top:1px solid var(--gb-danger-tint-border); background:var(--gb-danger-tint-soft); font-size:10px; }
  @media (max-width:760px) { .ecp-controls { grid-template-columns:1fr; } .ecp-body { padding:0 14px; } }
`;

function isExtensionTab(tab) {
  try { return new URL(tab?.url || '').protocol === EXTENSION_PROTOCOL; }
  catch { return false; }
}

function isInjectableTab(tab) {
  return !!(tab && Number.isInteger(tab.id) && /^https?:\/\//i.test(tab.url || ''));
}

function queryTabs(query) {
  return new Promise((resolve) => {
    try { chrome.tabs.query(query, (tabs) => resolve(chrome.runtime.lastError ? [] : (tabs || []))); }
    catch { resolve([]); }
  });
}

function getTab(tabId) {
  return new Promise((resolve) => {
    try { chrome.tabs.get(tabId, (tab) => resolve(chrome.runtime.lastError ? null : tab)); }
    catch { resolve(null); }
  });
}

function getCurrentWindow() {
  return new Promise((resolve) => {
    try { chrome.windows.getCurrent((win) => resolve(chrome.runtime.lastError ? null : win)); }
    catch { resolve(null); }
  });
}

function storageGet(keys) {
  return new Promise((resolve) => {
    try { chrome.storage.local.get(keys, (data) => resolve(data || {})); }
    catch { resolve({}); }
  });
}

function sendMessage(tabId, message) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        void chrome.runtime.lastError;
        resolve(response || null);
      });
    } catch { resolve(null); }
  });
}

function executeScript(details) {
  return new Promise((resolve) => {
    try {
      chrome.scripting.executeScript(details, (result) => {
        const error = chrome.runtime.lastError?.message || '';
        resolve({ result: result || null, error });
      });
    } catch (error) { resolve({ result: null, error: error?.message || 'Script injection failed.' }); }
  });
}

async function ensureEmailResolver(tab) {
  if (!isInjectableTab(tab)) throw new Error('Switch to a Golfballs CRM web page to preview an email.');
  const probe = await executeScript({
    target: { tabId: tab.id },
    func: () => !!window.__gbContentReady,
  });
  if (probe.result?.[0]?.result === true) return;
  const injected = await executeScript({ target: { tabId: tab.id }, files: CONTENT_SCRIPT_FILES });
  if (injected.error) throw new Error(`Unable to load the email resolver on this page: ${injected.error}`);
}

function displayValue(value) {
  if (value == null || value === '') return '(empty)';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); }
  catch { return String(value); }
}

function State({ title, copy, loading = false }) {
  return <div className="ecp-state"><span className="ecp-state-icon">{loading ? <Spinner size={16} /> : <I.mail size={18} />}</span><div className="ecp-state-title">{title}</div><div className="ecp-state-copy">{copy}</div></div>;
}

function EmailCreationPreview() {
  const [storedTemplates, setStoredTemplates] = useState([]);
  const [devSettings, setDevSettings] = useState({});
  const [sourceTab, setSourceTab] = useState(null);
  const [pageInfo, setPageInfo] = useState({});
  const [selectedValue, setSelectedValue] = useState('');
  const [resolvedVars, setResolvedVars] = useState({});
  const [resolvedTo, setResolvedTo] = useState('');
  const [pendingVars, setPendingVars] = useState([]);
  const [loadingPage, setLoadingPage] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState('');
  const previewWindowId = useRef(null);
  const sourceTabRef = useRef(null);
  const requestSequence = useRef(0);

  const templates = useMemo(
    () => filterLocalEmailTemplates(storedTemplates, devSettings),
    [storedTemplates, devSettings],
  );
  const visibleTemplates = useMemo(
    () => templatesForEmailPreview(templates, pageInfo.pageType),
    [templates, pageInfo.pageType],
  );
  const [selectedId, selectedVariationId] = useMemo(
    () => parseTemplateValue(selectedValue),
    [selectedValue],
  );
  const selectedTemplate = visibleTemplates.find((template) => template.id === selectedId) || null;
  const preview = useMemo(
    () => buildEmailCreationPreview(selectedTemplate, selectedVariationId, resolvedVars, resolvedTo),
    [selectedTemplate, selectedVariationId, resolvedVars, resolvedTo],
  );

  useEffect(() => {
    let mounted = true;
    storageGet(['templates', 'devSettings']).then((data) => {
      if (!mounted) return;
      setStoredTemplates((data.templates || []).filter((template) => template.enabled !== false && template.type !== 'case'));
      setDevSettings(data.devSettings || {});
    });
    const changed = (changes, area) => {
      if (area !== 'local') return;
      if (changes.templates) setStoredTemplates((changes.templates.newValue || []).filter((template) => template.enabled !== false && template.type !== 'case'));
      if (changes.devSettings) setDevSettings(changes.devSettings.newValue || {});
    };
    chrome.storage.onChanged.addListener(changed);
    return () => { mounted = false; chrome.storage.onChanged.removeListener(changed); };
  }, []);

  const inspectTab = useCallback(async (tab, { silent = false } = {}) => {
    if (!tab || isExtensionTab(tab)) return;
    sourceTabRef.current = tab;
    setSourceTab(tab);
    const sequence = ++requestSequence.current;
    if (!silent) setLoadingPage(true);
    setError('');
    try {
      await ensureEmailResolver(tab);
      const info = await sendMessage(tab.id, {
        action: 'getPageInfo',
        templates: templates.map((template) => ({
          id: template.id,
          rules: template.rules,
          type: template.type,
          accountConditions: template.accountConditions || [],
        })),
      });
      if (sequence !== requestSequence.current) return;
      if (!info) throw new Error('The active page did not return email context. Refresh the CRM page and try again.');
      setPageInfo(info);
    } catch (caught) {
      if (sequence !== requestSequence.current) return;
      setPageInfo({});
      setError(caught?.message || 'Unable to read the active page.');
    } finally {
      if (sequence === requestSequence.current) setLoadingPage(false);
    }
  }, [templates]);

  const selectActiveSource = useCallback(async (windowId = null) => {
    const tabs = await queryTabs(windowId === null ? { active: true } : { active: true, windowId });
    const candidates = tabs
      .filter((tab) => tab.windowId !== previewWindowId.current && !isExtensionTab(tab))
      .sort((left, right) => Number(right.lastAccessed || 0) - Number(left.lastAccessed || 0));
    if (candidates[0]) await inspectTab(candidates[0]);
  }, [inspectTab]);

  useEffect(() => {
    let mounted = true;
    getCurrentWindow().then((win) => {
      if (!mounted) return;
      previewWindowId.current = win?.id ?? null;
      selectActiveSource();
    });
    const activated = async ({ tabId, windowId }) => {
      if (windowId === previewWindowId.current) return;
      const tab = await getTab(tabId);
      if (tab && !isExtensionTab(tab)) inspectTab(tab);
    };
    const updated = (tabId, changeInfo, tab) => {
      if (tabId !== sourceTabRef.current?.id) return;
      if (changeInfo.status === 'complete' || typeof changeInfo.url === 'string') inspectTab(tab);
    };
    const removed = (tabId) => {
      if (tabId !== sourceTabRef.current?.id) return;
      sourceTabRef.current = null;
      setSourceTab(null);
      selectActiveSource();
    };
    const focused = (windowId) => {
      if (windowId < 0 || windowId === previewWindowId.current) return;
      selectActiveSource(windowId);
    };
    chrome.tabs.onActivated.addListener(activated);
    chrome.tabs.onUpdated.addListener(updated);
    chrome.tabs.onRemoved.addListener(removed);
    chrome.windows.onFocusChanged.addListener(focused);
    const interval = setInterval(() => {
      if (sourceTabRef.current) inspectTab(sourceTabRef.current, { silent: true });
    }, REFRESH_INTERVAL_MS);
    return () => {
      mounted = false;
      clearInterval(interval);
      chrome.tabs.onActivated.removeListener(activated);
      chrome.tabs.onUpdated.removeListener(updated);
      chrome.tabs.onRemoved.removeListener(removed);
      chrome.windows.onFocusChanged.removeListener(focused);
    };
  }, [inspectTab, selectActiveSource]);

  useEffect(() => {
    if (!visibleTemplates.length) { setSelectedValue(''); return; }
    if (visibleTemplates.some((template) => template.id === selectedId)) return;
    const matched = pageInfo.matchedTemplateIds || [];
    const initial = visibleTemplates.find((template) => matched.includes(template.id)) || visibleTemplates[0];
    setSelectedValue(initial.id);
  }, [pageInfo.matchedTemplateIds, selectedId, visibleTemplates]);

  useEffect(() => {
    if (!selectedTemplate || !sourceTab?.id) {
      setResolvedVars({}); setResolvedTo(''); setPendingVars([]); setResolving(false);
      return undefined;
    }
    const vars = selectedTemplate.vars || {};
    const toField = selectedTemplate.toField || { type: 'auto' };
    let cancelled = false;
    let port = null;
    setResolvedVars({});
    setResolvedTo('');
    setPendingVars(Object.keys(vars));
    setResolving(true);
    setError('');
    const finish = (result) => {
      if (cancelled) return;
      setResolvedVars(result?.resolved || {});
      setResolvedTo(result?.toEmail || '');
      setPendingVars([]);
      setResolving(false);
    };
    try { port = chrome.tabs.connect(sourceTab.id, { name: 'gbResolveStream' }); }
    catch { port = null; }
    if (!port) {
      sendMessage(sourceTab.id, { action: 'resolveVars', vars, toField }).then(finish);
      return () => { cancelled = true; };
    }
    port.onMessage.addListener((message) => {
      if (cancelled || !message) return;
      if (message.kind === 'to') setResolvedTo(message.value || '');
      else if (message.kind === 'var') {
        setResolvedVars((previous) => ({ ...previous, [message.name]: message.value }));
        setPendingVars((previous) => previous.filter((name) => name !== message.name));
      } else if (message.kind === 'done') {
        finish(message);
        try { port.disconnect(); } catch {}
      } else if (message.kind === 'error') {
        setError(message.error || 'A template variable could not be resolved.');
        finish(message);
        try { port.disconnect(); } catch {}
      }
    });
    try { port.postMessage({ action: 'resolveVarsStream', vars, toField }); }
    catch { sendMessage(sourceTab.id, { action: 'resolveVars', vars, toField }).then(finish); }
    return () => { cancelled = true; try { port?.disconnect(); } catch {} };
  }, [selectedTemplate, sourceTab?.id]);

  const variableNames = Object.keys(selectedTemplate?.vars || {});
  const resolvedVariableCount = variableNames.filter((name) => {
    const value = resolvedVars[name];
    return !pendingVars.includes(name) && value != null && String(value).length > 0;
  }).length;
  const matchedIds = pageInfo.matchedTemplateIds || [];
  const supportedPage = ['order', 'account', 'contact'].includes(pageInfo.pageType);
  return <><style>{CSS}</style><div className="ecp-app" data-gb-ui-root>
    <header className="ecp-header"><span className="ecp-mark"><I.mail size={18} /></span><div className="ecp-title-wrap"><div className="ecp-title">Email Creation Preview</div><div className="ecp-subtitle">Select a template to run it against the active CRM page</div></div><span className="ecp-preview-only"><I.eye size={11} />Preview only · nothing sends</span></header>
    <main className="ecp-main"><div className="ecp-shell">
      <section className="ecp-card ecp-source"><div><div className="ecp-source-title">{sourceTab?.title || 'Waiting for an active CRM page'}</div><div className="ecp-source-url" title={sourceTab?.url}>{sourceTab?.url || 'Switch to a Golfballs Contact, Account, or Order page.'}</div><div className="ecp-badges"><span className={`ecp-badge ${supportedPage ? 'brand' : ''}`}>{pageInfo.pageType || 'unknown page'}</span>{pageInfo.orderNo && <span className="ecp-badge">Order · {pageInfo.orderNo}</span>}{pageInfo.contactId && <span className="ecp-badge">Contact · {pageInfo.contactId}</span>}{pageInfo.accountId && <span className="ecp-badge">Account · {pageInfo.accountId}</span>}<span className="ecp-badge">Tab {sourceTab?.id ?? '—'}</span></div></div><Btn size="sm" variant="secondary" icon={<I.refresh />} onClick={() => sourceTabRef.current && inspectTab(sourceTabRef.current)}>Refresh page</Btn></section>
      <section className="ecp-card ecp-controls"><div><div className="ecp-picker-label">Template and variation</div><TemplatePicker mode="single" templates={visibleTemplates} matchedIds={matchedIds} value={selectedValue} onChange={setSelectedValue} placeholder={loadingPage ? 'Reading page…' : 'Pick a template'} initialOpen={false} floating={false} listMaxHeight={330} disabled={loadingPage || !visibleTemplates.length} /></div><div className="ecp-badges"><span className="ecp-badge">{visibleTemplates.length} compatible</span><span className="ecp-badge brand">{matchedIds.filter((id) => visibleTemplates.some((template) => template.id === id)).length} matched</span></div></section>
      {error && <section className="ecp-card ecp-error"><I.alert size={12} /><span>{error}</span></section>}
      {loadingPage ? <section className="ecp-card"><State loading title="Reading the active page" copy="Loading the same page context used by normal email creation." /></section>
        : !supportedPage ? <section className="ecp-card"><State title="No email context on this tab" copy="Switch to a Golfballs Contact, Account, or Order page. This preview window will follow the active tab automatically." /></section>
          : !selectedTemplate ? <section className="ecp-card"><State title="No compatible templates" copy="Create or enable a template for this page type, then it will appear here automatically." /></section>
            : <>
              <section className="ecp-card"><div className="ecp-panel-head"><div className="ecp-panel-title">Formatted email</div><div className="ecp-panel-meta">{resolving ? 'Resolving live context…' : 'Ready · no message created'}</div></div><div className="ecp-fields"><div className="ecp-field"><span className="ecp-field-label">To</span><span className={`ecp-field-value ${preview?.to ? '' : 'empty'}`}>{preview?.to || (resolving ? 'Resolving…' : 'No recipient resolved')}</span></div><div className="ecp-field"><span className="ecp-field-label">Subject</span><span className={`ecp-field-value ${preview?.subject ? '' : 'empty'}`}>{preview?.subject || (resolving ? 'Resolving…' : 'Empty subject')}</span></div></div><div className="ecp-body">{preview?.htmlBody ? <EmailHtmlView html={preview.htmlBody} style={{ width: '100%', border: 'none', borderRadius: 0, background: 'transparent' }} /> : <State loading={resolving} title={resolving ? 'Formatting email' : 'Empty email body'} copy={resolving ? 'Variables appear as each resolver finishes.' : 'This template produced no formatted body for the current page.'} />}</div></section>
              <section className="ecp-card ecp-context"><div className="ecp-panel-head"><div className="ecp-panel-title">Matched variables</div><div className="ecp-panel-meta">{resolving ? `${resolvedVariableCount} resolved · ${pendingVars.length} resolving` : `${resolvedVariableCount} of ${variableNames.length} resolved`}</div></div><div className="ecp-vars">{variableNames.length ? variableNames.map((name) => {
                const pending = pendingVars.includes(name);
                const value = resolvedVars[name];
                const hasValue = value != null && String(value).length > 0;
                return <div className={`ecp-var ${pending ? 'pending' : hasValue ? 'resolved' : 'empty'}`} key={name}><div className="ecp-var-head"><span className="ecp-var-dot" /><span className="ecp-var-name" title={name}>{name}</span></div><div className="ecp-var-value">{pending ? 'resolving…' : displayValue(value)}</div></div>;
              }) : <State title="No template variables" copy="This template only uses static content and the resolved recipient." />}</div></section>
            </>}
    </div></main>
  </div></>;
}

ensureTheme();
createRoot(document.getElementById('email-creation-preview-root')).render(<EmailCreationPreview />);
