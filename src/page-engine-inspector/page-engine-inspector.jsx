import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence } from 'motion/react';
import { ensureTheme } from '../lib/theme.js';
import { sendBackgroundMessage } from '../lib/backgroundMessage.js';
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
  I,
  Input,
} from '../ui';

const REFRESH_INTERVAL_MS = 4_000;
const EXTENSION_PROTOCOL = 'chrome-extension:';

const CSS = `
  button { color: inherit; font: inherit; }
  .pei-toolbar { padding: 12px; display: flex; align-items: center; flex-wrap: wrap; gap: 10px; overflow: visible; }
  .pei-search { min-width: 240px; flex: 1; }
  .pei-segments { min-height: 32px; padding: 3px; display: inline-flex; gap: 2px; border: 1px solid var(--gb-border-default); border-radius: var(--gb-r-md); background: var(--gb-fill-faint); }
  .pei-segment { position: relative; min-height: 26px; padding: 0 10px; overflow: hidden; border: 0; border-radius: var(--gb-r-sm); cursor: pointer; color: var(--gb-text-muted); background: transparent; font-size: 9.5px; font-weight: 750; transition: color .16s ease, background-color .16s ease; }
  .pei-segment:hover { color: var(--gb-text-primary); }
  .pei-segment.active { color: var(--gb-brand-label); background: var(--gb-brand-tint-medium); }
  .pei-segment::after { content: ""; position: absolute; left: 22%; right: 22%; bottom: 1px; height: 2px; border-radius: 2px; opacity: 0; transform: scaleX(.5); background: currentColor; transition: opacity .16s ease, transform .2s ease; }
  .pei-segment.active::after { opacity: .55; transform: scaleX(1); }
  .pei-groups { padding: 12px; display: grid; gap: 9px; }
  .pei-group { overflow: hidden; border: 1px solid var(--gb-border-subtle); border-radius: var(--gb-r-lg); background: var(--gb-surface-1); transition: border-color .18s ease, box-shadow .18s ease; }
  .pei-group:hover { border-color: var(--gb-border-default); box-shadow: 0 5px 16px color-mix(in srgb,#000 7%,transparent); }
  .pei-group-summary { min-height: 42px; padding: 8px 12px; display: flex; align-items: center; gap: 9px; cursor: pointer; color: var(--gb-text-primary); background: linear-gradient(90deg,var(--gb-fill-faint),transparent); list-style: none; }
  .pei-group-summary::-webkit-details-marker { display: none; }
  .pei-group-chevron { transition: transform .16s ease; }
  details[open] > .pei-group-summary .pei-group-chevron { transform: rotate(90deg); }
  .pei-group-name { min-width: 0; flex: 1; font-family: var(--gb-font-mono); font-size: 10.5px; font-weight: 800; }
  .pei-group-meta { color: var(--gb-text-muted); font-size: 9px; font-variant-numeric: tabular-nums; }
  .pei-variable { border-top: 1px solid var(--gb-border-subtle); }
  .pei-variable-summary { min-height: 46px; padding: 8px 12px; display: grid; grid-template-columns: minmax(190px, .9fr) minmax(220px, 1.3fr) auto; align-items: center; gap: 14px; cursor: pointer; list-style: none; transition: background-color .16s ease, padding-left .16s ease; }
  .pei-variable-summary::-webkit-details-marker { display: none; }
  .pei-variable:hover > .pei-variable-summary { padding-left: 15px; background: var(--gb-fill-faint); }
  .pei-path { min-width: 0; overflow: hidden; color: var(--gb-text-primary); font-family: var(--gb-font-mono); font-size: 9.5px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
  .pei-preview { min-width: 0; overflow: hidden; color: var(--gb-text-secondary); font-family: var(--gb-font-mono); font-size: 9.5px; text-overflow: ellipsis; white-space: nowrap; }
  .pei-variable.empty .pei-preview { color: var(--gb-text-ghost); font-style: italic; }
  .pei-type { padding: 2px 6px; color: var(--gb-text-muted); border: 1px solid var(--gb-border-default); border-radius: var(--gb-r-pill); background: var(--gb-fill-faint); font-family: var(--gb-font-mono); font-size: 8px; }
  .pei-variable-detail { padding: 12px 14px; border-top: 1px solid var(--gb-border-subtle); background: var(--gb-surface-canvas); animation: pei-detail-in .18s ease-out; }
  .pei-variable-label { margin-bottom: 6px; color: var(--gb-text-muted); font-size: 9px; }
  .pei-code { margin: 0; overflow: auto; color: var(--gb-text-secondary); font-family: var(--gb-font-mono); font-size: 9.5px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
  .pei-raw { max-height: 490px; padding: 13px 14px; overflow: auto; }
  .pei-issues { padding: 12px; display: grid; gap: 7px; }
  .pei-issue { padding: 8px 10px; display: flex; align-items: flex-start; gap: 8px; color: var(--gb-warning-fg); border: 1px solid var(--gb-warning-tint-border); border-radius: var(--gb-r-md); background: var(--gb-warning-tint-soft); font-size: 10px; }
  @keyframes pei-detail-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
  @media (max-width: 720px) {
    .pei-variable-summary { grid-template-columns: minmax(130px, 1fr) minmax(120px, 1fr) auto; gap: 7px; }
  }
  @media (prefers-reduced-motion: reduce) { .pei-variable-detail { animation: none; } * { scroll-behavior: auto !important; } }
`;

function isExtensionTab(tab) {
  try { return new URL(tab?.url || '').protocol === EXTENSION_PROTOCOL; }
  catch { return false; }
}

function queryTabs(query) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.query(query, (tabs) => resolve(chrome.runtime.lastError ? [] : (tabs || [])));
    } catch { resolve([]); }
  });
}

function getTab(tabId) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.get(tabId, (tab) => resolve(chrome.runtime.lastError ? null : (tab || null)));
    } catch { resolve(null); }
  });
}

function getCurrentWindow() {
  return new Promise((resolve) => {
    try {
      chrome.windows.getCurrent((win) => resolve(chrome.runtime.lastError ? null : (win || null)));
    } catch { resolve(null); }
  });
}

function groupVariables(variables) {
  const groups = new Map();
  for (const variable of variables) {
    const group = variable.path.match(/^([^.[\]]+)/)?.[1] || 'other';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(variable);
  }
  return [...groups.entries()];
}

function jsonValue(value) {
  try { return JSON.stringify(value, null, 2); }
  catch { return String(value); }
}

function displayTime(value) {
  if (!Number.isFinite(Number(value))) return 'Waiting for snapshot';
  return `Updated ${new Date(Number(value)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;
}

function SourceCard({ snapshot }) {
  const page = snapshot?.page || {};
  const ids = Object.entries(snapshot?.ids || {}).filter(([, value]) => value != null && String(value).trim());
  return <DeveloperContext
    title={page.title || snapshot?.tab?.title || 'Active browser tab'}
    url={page.url || snapshot?.tab?.url || 'No URL available'}
    pills={<><DeveloperPill tone={page.schemaId ? 'brand' : 'neutral'}>{page.schemaId || 'No schema'}</DeveloperPill><DeveloperPill>{page.pageType || 'unknown page'}</DeveloperPill>{ids.map(([key, value]) => <DeveloperPill key={key}>{key} · {String(value)}</DeveloperPill>)}</>}
    meta={<><span>{displayTime(snapshot?.inspectedAt)}</span><DeveloperPill>Tab {snapshot?.tab?.id ?? '—'}</DeveloperPill></>}
  />;
}

function Stats({ snapshot }) {
  const variables = snapshot?.variables || [];
  const issues = (snapshot?.errors?.length || 0) + (snapshot?.warnings?.length || 0);
  const values = [
    { label: 'Schema', value: snapshot?.page?.schemaId || 'None', detail: 'Active extraction contract' },
    { label: 'Variables', value: variables.length, detail: 'Available schema paths' },
    { label: 'Resolved', value: variables.filter((item) => item.present).length, detail: 'Present on this record' },
    { label: 'Issues', value: issues, detail: issues ? 'Review extraction notices' : 'Extraction is clean' },
  ];
  return <DeveloperMetrics items={values} />;
}

function VariablesPanel({ variables }) {
  const groups = groupVariables(variables);
  if (!variables.length) return <EmptyState title="No matching variables" copy="Adjust the search or resolved-value filter to show Page Engine fields." />;
  return (
    <div className="pei-groups">
      {groups.map(([name, entries]) => (
        <details className="pei-group" open key={name}>
          <summary className="pei-group-summary"><span className="pei-group-chevron"><I.chevr size={10} /></span><span className="pei-group-name">{name}</span><span className="pei-group-meta">{entries.filter((item) => item.present).length}/{entries.length} resolved</span></summary>
          {entries.map((variable) => (
            <details className={`pei-variable ${variable.present ? '' : 'empty'}`} key={variable.path}>
              <summary className="pei-variable-summary" title={variable.path}><span className="pei-path">{variable.path}</span><span className="pei-preview">{variable.preview}</span><span className="pei-type">{variable.type}</span></summary>
              <div className="pei-variable-detail"><div className="pei-variable-label">{variable.label} · {variable.present ? 'Resolved live' : 'Not present on this record'}</div><pre className="pei-code">{jsonValue(variable.value)}</pre></div>
            </details>
          ))}
        </details>
      ))}
    </div>
  );
}

function EmptyState({ title, copy, error = false }) {
  return <DeveloperState icon={error ? <I.alert size={19} /> : <I.search size={19} />} title={title} copy={copy} />;
}

function Inspector() {
  const [sourceTab, setSourceTab] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('variables');
  const [copied, setCopied] = useState(false);
  const inspectorWindowId = useRef(null);
  const sourceTabRef = useRef(null);
  const requestSequence = useRef(0);

  const inspectTab = useCallback(async (tab, { silent = false } = {}) => {
    if (!tab || !Number.isInteger(tab.id) || isExtensionTab(tab)) return;
    sourceTabRef.current = tab;
    setSourceTab(tab);
    const sequence = ++requestSequence.current;
    if (!silent) setLoading(true);
    setError('');
    try {
      const result = await sendBackgroundMessage('pageEngineDebugSnapshot', { tabId: tab.id });
      if (sequence !== requestSequence.current) return;
      setSnapshot(result);
    } catch (caught) {
      if (sequence !== requestSequence.current) return;
      setError(caught?.message || 'Unable to inspect the active tab.');
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, []);

  const selectActiveSource = useCallback(async (windowId = null) => {
    const tabs = await queryTabs(windowId === null ? { active: true } : { active: true, windowId });
    const candidates = tabs
      .filter((tab) => tab.windowId !== inspectorWindowId.current && !isExtensionTab(tab))
      .sort((left, right) => Number(right.lastAccessed || 0) - Number(left.lastAccessed || 0));
    if (candidates[0]) await inspectTab(candidates[0]);
  }, [inspectTab]);

  useEffect(() => {
    let mounted = true;
    getCurrentWindow().then((win) => {
      if (!mounted) return;
      inspectorWindowId.current = win?.id ?? null;
      selectActiveSource();
    });

    const activated = async ({ tabId, windowId }) => {
      if (windowId === inspectorWindowId.current) return;
      const tab = await getTab(tabId);
      if (tab && !isExtensionTab(tab)) inspectTab(tab);
    };
    const updated = (tabId, changeInfo, tab) => {
      if (tabId !== sourceTabRef.current?.id) return;
      if (changeInfo.status === 'complete' || typeof changeInfo.url === 'string') inspectTab(tab);
    };
    const removed = (tabId) => {
      if (tabId === sourceTabRef.current?.id) {
        sourceTabRef.current = null;
        setSourceTab(null);
        selectActiveSource();
      }
    };
    const focused = (windowId) => {
      if (windowId < 0 || windowId === inspectorWindowId.current) return;
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

  const visibleVariables = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (snapshot?.variables || []).filter((variable) => {
      if (filter === 'resolved' && !variable.present) return false;
      if (filter === 'empty' && variable.present) return false;
      if (!needle) return true;
      return [variable.path, variable.label, variable.type, variable.preview]
        .some((value) => String(value || '').toLowerCase().includes(needle));
    });
  }, [filter, query, snapshot]);

  const copySnapshot = useCallback(async () => {
    if (!snapshot) return;
    try {
      await navigator.clipboard.writeText(jsonValue(snapshot));
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    } catch { setCopied(false); }
  }, [snapshot]);

  const issues = [...(snapshot?.errors || []), ...(snapshot?.warnings || [])];
  const unsupported = snapshot && snapshot.supported === false;
  return (
    <><style>{CSS}</style><DeveloperWorkspace icon={<I.code size={19} />} title="Page Engine Inspector" subtitle="Live schema extraction follows the active CRM tab" status="Live extraction">
      <DeveloperStack>
        <SourceCard snapshot={snapshot || { tab: sourceTab }} />
        {snapshot && <Stats snapshot={snapshot} />}
        <DeveloperCard className="pei-toolbar" delay={.1}>
          <div className="pei-search"><Input size="sm" value={query} onChange={setQuery} placeholder="Search paths, labels, types, or values…" leading={<I.search size={11} />} /></div>
          <div className="pei-segments" aria-label="Value filter">{[['all', 'All'], ['resolved', 'Resolved'], ['empty', 'Empty']].map(([id, label]) => <button type="button" className={`pei-segment ${filter === id ? 'active' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(id)} key={id}>{label}</button>)}</div>
          <div className="pei-segments" aria-label="Inspector view">{[['variables', 'Variables'], ['raw', 'Raw JSON']].map(([id, label]) => <button type="button" className={`pei-segment ${view === id ? 'active' : ''}`} aria-pressed={view === id} onClick={() => setView(id)} key={id}>{label}</button>)}</div>
          <Btn size="sm" variant="secondary" icon={<I.refresh />} onClick={() => sourceTabRef.current && inspectTab(sourceTabRef.current)}>Refresh</Btn>
          <Btn size="sm" variant="tinted" status="brand" icon={copied ? <I.check /> : <I.copy />} onClick={copySnapshot} disabled={!snapshot}>{copied ? 'Copied' : 'Copy'}</Btn>
        </DeveloperCard>
        <AnimatePresence mode="wait" initial={false}>
          <DeveloperCard key={loading ? 'loading' : error ? 'error' : unsupported ? 'unsupported' : view} exit={{ opacity: 0, y: -6 }}>
            {loading ? <EmptyState title="Reading the active tab" copy="Running a fresh Page Engine extraction against the visible CRM document." />
              : error ? <EmptyState error title="Inspector could not read this tab" copy={error} />
                : unsupported ? <EmptyState title="No Page Engine context on this tab" copy="Switch to a Golfballs Contact, Account, Order, or Opportunity page. This window will follow the active tab automatically." />
                  : view === 'raw' ? <><DeveloperPanelHeader title="Raw extracted context" subtitle="The complete Page Engine data contract for this record" meta="Fresh document snapshot" /><pre className="pei-code pei-raw">{jsonValue(snapshot?.data)}</pre></>
                    : <><DeveloperPanelHeader title="Resolved variables" subtitle="Expand any row to inspect its exact typed value" meta={`${visibleVariables.length} of ${snapshot?.variables?.length || 0}`} /><VariablesPanel variables={visibleVariables} /></>}
          </DeveloperCard>
        </AnimatePresence>
        {!!issues.length && <DeveloperCard delay={.14}><DeveloperPanelHeader title="Extraction issues" subtitle="Warnings returned by the active schema" meta={issues.length} /><div className="pei-issues">{issues.map((issue, index) => <div className="pei-issue" key={`${index}-${String(issue)}`}><I.alert size={11} /><span>{typeof issue === 'string' ? issue : jsonValue(issue)}</span></div>)}</div></DeveloperCard>}
      </DeveloperStack>
    </DeveloperWorkspace></>
  );
}

ensureTheme();
createRoot(document.getElementById('page-engine-inspector-root')).render(<Inspector />);
