import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { motion } from 'motion/react';
import { ensureTheme } from '../lib/theme.js';
import { filterLocalEmailTemplates } from '../lib/emailTemplateCapabilities.js';
import {
  buildEmailCreationPreview,
  templatesForEmailPreview,
} from '../lib/emailCreationPreview.js';
import { parseTemplateValue, TemplatePicker } from '../ui/components/TemplatePicker.jsx';
import { isValuelessOp, OPS_BY_TYPE } from '../lib/matchEngine.js';
import {
  Btn,
  DeveloperCard,
  DeveloperContext,
  DeveloperMetrics,
  DeveloperPanelHeader,
  DeveloperPill,
  DeveloperStack,
  DeveloperState,
  DeveloperWorkspace,
  EmailHtmlView,
  I,
  Spinner,
} from '../ui';

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
  .ecp-controls { overflow:visible; }
  .ecp-picker-shell { padding:14px; overflow:visible; }
  .ecp-fields { border-bottom:1px solid var(--gb-border-subtle); background:linear-gradient(90deg,var(--gb-fill-faint),transparent 72%); }
  .ecp-field { min-height:44px; padding:10px 14px; display:grid; grid-template-columns:68px minmax(0,1fr); gap:12px; align-items:start; border-top:1px solid var(--gb-border-subtle); }
  .ecp-field:first-child { border-top:0; }
  .ecp-field-label { padding-top:1px; color:var(--gb-text-muted); font-size:9px; font-weight:800; letter-spacing:.45px; text-transform:uppercase; }
  .ecp-field-value { min-width:0; color:var(--gb-text-primary); font-size:11px; line-height:1.5; overflow-wrap:anywhere; }
  .ecp-field-value.empty { color:var(--gb-text-ghost); font-style:italic; }
  .ecp-body { width:100%; min-height:460px; padding:4px 24px 12px; background:var(--gb-surface-1); }
  .ecp-vars { max-height:380px; padding:12px; overflow:auto; display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:9px; }
  .ecp-var { min-width:0; min-height:58px; padding:10px 11px; display:grid; align-content:center; gap:6px; border:1px solid var(--gb-border-subtle); border-radius:var(--gb-r-lg); background:linear-gradient(145deg,var(--gb-fill-faint),transparent); transition:border-color .18s ease,background-color .18s ease,transform .18s ease,box-shadow .18s ease; }
  .ecp-var:hover { transform:translateY(-1px); border-color:var(--gb-border-default); box-shadow:0 5px 14px color-mix(in srgb,#000 7%,transparent); }
  .ecp-var-head { min-width:0; display:flex; align-items:center; gap:6px; }
  .ecp-var-dot { width:6px; height:6px; flex:0 0 auto; border-radius:50%; background:var(--gb-text-ghost); }
  .ecp-var.resolved .ecp-var-dot { background:var(--gb-success-fg); box-shadow:0 0 0 3px var(--gb-success-tint-soft); }
  .ecp-var.pending .ecp-var-dot { background:var(--gb-brand-label); box-shadow:0 0 0 3px var(--gb-brand-tint-soft); }
  .ecp-var-name { min-width:0; overflow:hidden; color:var(--gb-text-primary); font-family:var(--gb-font-mono); font-size:9.5px; font-weight:800; text-overflow:ellipsis; white-space:nowrap; }
  .ecp-var-value { color:var(--gb-text-secondary); font-family:var(--gb-font-mono); font-size:9px; line-height:1.5; white-space:pre-wrap; overflow-wrap:anywhere; }
  .ecp-var.pending .ecp-var-value { color:var(--gb-brand-label); }
  .ecp-var.empty .ecp-var-value { color:var(--gb-text-ghost); font-style:italic; }
  .ecp-error { padding:11px 13px; display:flex; align-items:flex-start; gap:8px; color:var(--gb-danger-fg); border-color:var(--gb-danger-tint-border); background:var(--gb-danger-tint-soft); font-size:10px; }
  .ecp-rules { padding:12px 14px; display:flex; flex-direction:column; gap:8px; }
  .ecp-rule-join { display:flex; align-items:center; gap:8px; }
  .ecp-rule-join::before, .ecp-rule-join::after { content:""; flex:1; height:1px; background:var(--gb-border-subtle); }
  .ecp-rule-join-chip { padding:2px 8px; color:var(--gb-text-tertiary); border:1px solid var(--gb-border-default); border-radius:var(--gb-r-pill); background:var(--gb-fill-faint); font-family:var(--gb-font-mono); font-size:8.5px; font-weight:800; letter-spacing:.5px; }
  .ecp-rule-group { border:1px solid var(--gb-border-subtle); border-radius:var(--gb-r-lg); background:var(--gb-fill-faint); overflow:hidden; }
  .ecp-rule-group.pass { border-color:var(--gb-success-tint-border); background:var(--gb-success-tint-soft); }
  .ecp-rule-group.fail { border-color:var(--gb-danger-tint-border); background:var(--gb-danger-tint-soft); }
  .ecp-rule-group-head { padding:8px 11px; display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .ecp-rule-group-name { display:flex; align-items:center; gap:7px; color:var(--gb-text-primary); font-size:10px; font-weight:800; }
  .ecp-rule-group-joiner { color:var(--gb-text-muted); font-family:var(--gb-font-mono); font-size:8.5px; font-weight:700; letter-spacing:.4px; }
  .ecp-rule-verdict { display:inline-flex; align-items:center; gap:4px; font-size:8.5px; font-weight:850; letter-spacing:.4px; text-transform:uppercase; }
  .ecp-rule-verdict.pass { color:var(--gb-success-fg); }
  .ecp-rule-verdict.fail { color:var(--gb-danger-fg); }
  .ecp-rule-conds { padding:0 11px 9px; display:flex; flex-direction:column; gap:5px; }
  .ecp-rule-cond { min-width:0; padding:6px 9px; display:flex; align-items:center; gap:7px; border:1px solid var(--gb-border-subtle); border-radius:var(--gb-r-md); background:var(--gb-surface-1); }
  .ecp-rule-cond-icon { flex:0 0 auto; display:grid; place-items:center; }
  .ecp-rule-cond-icon.pass { color:var(--gb-success-fg); }
  .ecp-rule-cond-icon.fail { color:var(--gb-danger-fg); }
  .ecp-rule-cond-text { min-width:0; overflow:hidden; color:var(--gb-text-secondary); font-family:var(--gb-font-mono); font-size:9px; text-overflow:ellipsis; white-space:nowrap; }
  @media (max-width:760px) { .ecp-body { padding:0 14px 10px; } }
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

const ALL_OPS = [...OPS_BY_TYPE.string, ...OPS_BY_TYPE.number, ...OPS_BY_TYPE.date];
function opLabel(op) {
  return ALL_OPS.find((o) => o.id.toLowerCase() === String(op || '').toLowerCase())?.label || op || '?';
}
function conditionLabel(cond) {
  const subject = cond.source === 'var' ? `var:${cond.ref}` : cond.source === 'dom' ? `dom:${cond.ref}` : cond.ref || '(unset)';
  const not = cond.not ? 'not ' : '';
  const value = isValuelessOp(cond.op) ? '' : ` "${cond.value ?? ''}"`;
  return `${subject} ${not}${opLabel(cond.op)}${value}`;
}

function State({ title, copy, loading = false }) {
  return <DeveloperState icon={loading ? <Spinner size={16} /> : <I.mail size={18} />} title={title} copy={copy} />;
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
  const matchedTemplateCount = matchedIds.filter((id) => visibleTemplates.some((template) => template.id === id)).length;
  const matchDetail = selectedTemplate ? pageInfo.matchDetails?.[selectedTemplate.id] : null;
  const selectedMatched = matchDetail ? matchDetail.result : matchedIds.includes(selectedId);
  const supportedPage = ['order', 'account', 'contact'].includes(pageInfo.pageType);
  const metrics = [
    { label: 'Compatible', value: visibleTemplates.length, detail: 'Templates for this page type' },
    { label: 'Matched', value: matchedTemplateCount, detail: 'Rule matches on this record' },
    { label: 'Variables', value: `${resolvedVariableCount}/${variableNames.length}`, detail: resolving ? `${pendingVars.length} still resolving` : 'Resolved for this template' },
    { label: 'Preview state', value: resolving ? 'Running' : preview ? 'Ready' : 'Waiting', detail: 'No email will be created' },
  ];
  return <><style>{CSS}</style><DeveloperWorkspace icon={<I.mail size={19} />} title="Email Creation Preview" subtitle="Run curated templates against the active CRM record without creating a message" status="Preview only" statusTone="brand">
    <DeveloperStack>
      <DeveloperContext
        title={sourceTab?.title || 'Waiting for an active CRM page'}
        url={sourceTab?.url || 'Switch to a Golfballs Contact, Account, or Order page.'}
        pills={<><DeveloperPill tone={supportedPage ? 'brand' : 'neutral'}>{pageInfo.pageType || 'unknown page'}</DeveloperPill>{pageInfo.orderNo && <DeveloperPill>Order · {pageInfo.orderNo}</DeveloperPill>}{pageInfo.contactId && <DeveloperPill>Contact · {pageInfo.contactId}</DeveloperPill>}{pageInfo.accountId && <DeveloperPill>Account · {pageInfo.accountId}</DeveloperPill>}</>}
        meta={<DeveloperPill>Tab {sourceTab?.id ?? '—'}</DeveloperPill>}
        action={<Btn size="sm" variant="secondary" icon={<I.refresh />} onClick={() => sourceTabRef.current && inspectTab(sourceTabRef.current)}>Refresh page</Btn>}
      />
      <DeveloperMetrics items={metrics} />
      <DeveloperCard className="ecp-controls" delay={.1}><DeveloperPanelHeader title="Template and variation" subtitle="Choose the exact saved content to resolve against this page" meta={`${matchedTemplateCount} matched`} /><div className="ecp-picker-shell"><TemplatePicker mode="single" templates={visibleTemplates} matchedIds={matchedIds} value={selectedValue} onChange={setSelectedValue} placeholder={loadingPage ? 'Reading page…' : 'Pick a template'} initialOpen={false} floating={false} listMaxHeight={330} disabled={loadingPage || !visibleTemplates.length} /></div></DeveloperCard>
      {error && <DeveloperCard className="ecp-error"><I.alert size={12} /><span>{error}</span></DeveloperCard>}
      {loadingPage ? <DeveloperCard><State loading title="Reading the active page" copy="Loading the same page context used by normal email creation." /></DeveloperCard>
        : !supportedPage ? <DeveloperCard><State title="No email context on this tab" copy="Switch to a Golfballs Contact, Account, or Order page. This preview window will follow the active tab automatically." /></DeveloperCard>
          : !selectedTemplate ? <DeveloperCard><State title="No compatible templates" copy="Create or enable a template for this page type, then it will appear here automatically." /></DeveloperCard>
            : <>
              <DeveloperCard className="ecp-rules-card" delay={.11}>
                <DeveloperPanelHeader
                  title="Matching rules"
                  subtitle="Every logical group and condition this template's match rules evaluated"
                  meta={<span className={`ecp-rule-verdict ${selectedMatched ? 'pass' : 'fail'}`}>{selectedMatched ? <I.check size={11} /> : <I.close size={11} />}{selectedMatched ? 'Matched' : 'Not matched'}</span>}
                />
                <div className="ecp-rules">
                  {matchDetail && matchDetail.groups.length
                    ? matchDetail.groups.map((group, index) => (
                      <React.Fragment key={index}>
                        {index > 0 && <div className="ecp-rule-join"><span className="ecp-rule-join-chip">{matchDetail.outerJoiner}</span></div>}
                        <div className={`ecp-rule-group ${group.result ? 'pass' : 'fail'}`}>
                          <div className="ecp-rule-group-head">
                            <span className="ecp-rule-group-name">Group {String.fromCharCode(65 + index)} <span className="ecp-rule-group-joiner">({group.joiner} of {group.conditions.length})</span></span>
                            <span className={`ecp-rule-verdict ${group.result ? 'pass' : 'fail'}`}>{group.result ? <I.check size={10} /> : <I.close size={10} />}{group.result ? 'Passed' : 'Failed'}</span>
                          </div>
                          <div className="ecp-rule-conds">{group.conditions.map((cond, ci) => (
                            <div className="ecp-rule-cond" key={ci}>
                              <span className={`ecp-rule-cond-icon ${cond.result ? 'pass' : 'fail'}`}>{cond.result ? <I.check size={11} /> : <I.close size={11} />}</span>
                              <span className="ecp-rule-cond-text" title={conditionLabel(cond)}>{conditionLabel(cond)}</span>
                            </div>
                          ))}</div>
                        </div>
                      </React.Fragment>
                    ))
                    : <State
                        title={matchDetail ? 'No match rules on this template' : 'Legacy rule format'}
                        copy={matchDetail ? 'This template has no match conditions, so it matches every compatible page.' : 'This template uses the older flat rule list, which has no logical groups to break down.'}
                      />}
                </div>
              </DeveloperCard>
              <DeveloperCard delay={.12}><DeveloperPanelHeader title="Formatted email" subtitle={selectedTemplate.name || 'Selected template'} meta={resolving ? 'Resolving live context…' : 'Ready · no message created'} /><div className="ecp-fields"><div className="ecp-field"><span className="ecp-field-label">To</span><span className={`ecp-field-value ${preview?.to ? '' : 'empty'}`}>{preview?.to || (resolving ? 'Resolving…' : 'No recipient resolved')}</span></div><div className="ecp-field"><span className="ecp-field-label">Subject</span><span className={`ecp-field-value ${preview?.subject ? '' : 'empty'}`}>{preview?.subject || (resolving ? 'Resolving…' : 'Empty subject')}</span></div></div><div className="ecp-body">{preview?.htmlBody ? <EmailHtmlView html={preview.htmlBody} style={{ width: '100%', border: 'none', borderRadius: 0, background: 'transparent' }} /> : <State loading={resolving} title={resolving ? 'Formatting email' : 'Empty email body'} copy={resolving ? 'Variables appear as each resolver finishes.' : 'This template produced no formatted body for the current page.'} />}</div></DeveloperCard>
              <DeveloperCard className="ecp-context" delay={.15}><DeveloperPanelHeader title="Matched variables" subtitle="Exact values inserted into the selected template" meta={resolving ? `${resolvedVariableCount} resolved · ${pendingVars.length} resolving` : `${resolvedVariableCount} of ${variableNames.length} resolved`} /><div className="ecp-vars">{variableNames.length ? variableNames.map((name, index) => {
                const pending = pendingVars.includes(name);
                const value = resolvedVars[name];
                const hasValue = value != null && String(value).length > 0;
                return <motion.div className={`ecp-var ${pending ? 'pending' : hasValue ? 'resolved' : 'empty'}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .22, delay: Math.min(index * .025, .2) }} key={name}><div className="ecp-var-head"><span className="ecp-var-dot" /><span className="ecp-var-name" title={name}>{name}</span></div><div className="ecp-var-value">{pending ? 'resolving…' : displayValue(value)}</div></motion.div>;
              }) : <State title="No template variables" copy="This template only uses static content and the resolved recipient." />}</div></DeveloperCard>
            </>}
    </DeveloperStack>
  </DeveloperWorkspace></>;
}

ensureTheme();
createRoot(document.getElementById('email-creation-preview-root')).render(<EmailCreationPreview />);
