import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion } from 'motion/react';
import { ensureTheme } from '../lib/theme.js';
import { sendBackgroundMessage } from '../lib/backgroundMessage.js';
import { Btn, I, Input } from '../ui';

const REFRESH_INTERVAL_MS = 4_000;
const EXTENSION_PROTOCOL = 'chrome-extension:';

const CSS = `
  button { color: inherit; font: inherit; }
  .pei-app {
    width: 100%; height: 100%; min-width: 0; display: flex; flex-direction: column;
    color: var(--gb-text-secondary); background: var(--gb-surface-canvas);
    font-family: var(--gb-font-sans); font-size: 12px; line-height: 1.45;
  }
  .pei-header {
    flex: 0 0 auto; min-height: 68px; padding: 12px 18px; display: flex;
    align-items: center; gap: 12px; border-bottom: 1px solid var(--gb-border-default);
    background: var(--gb-surface-1);
  }
  .pei-mark {
    width: 38px; height: 38px; flex: 0 0 auto; display: grid; place-items: center;
    color: var(--gb-brand-label); border: 1px solid var(--gb-brand-tint-border);
    border-radius: var(--gb-r-lg); background: var(--gb-brand-tint-medium);
  }
  .pei-header-copy { min-width: 0; flex: 1; }
  .pei-title { color: var(--gb-text-primary); font-size: 15px; font-weight: 850; letter-spacing: -.25px; }
  .pei-subtitle { margin-top: 2px; color: var(--gb-text-muted); font-size: 10px; }
  .pei-live {
    display: inline-flex; align-items: center; gap: 6px; padding: 5px 8px;
    color: var(--gb-success-fg); border: 1px solid var(--gb-success-tint-border);
    border-radius: var(--gb-r-pill); background: var(--gb-success-tint-soft);
    font-size: 9px; font-weight: 850; letter-spacing: .55px; text-transform: uppercase;
  }
  .pei-live-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; animation: pei-pulse 1.8s ease-in-out infinite; }
  .pei-main { flex: 1; min-height: 0; overflow: auto; padding: 16px 18px 26px; scrollbar-width: thin; scrollbar-color: var(--gb-border-strong) transparent; }
  .pei-main::-webkit-scrollbar { width: 8px; }
  .pei-main::-webkit-scrollbar-thumb { border: 2px solid transparent; border-radius: 99px; background: var(--gb-border-strong); background-clip: padding-box; }
  .pei-shell { width: 100%; max-width: 980px; margin: 0 auto; display: grid; gap: 12px; }
  .pei-card { min-width: 0; overflow: hidden; border: 1px solid var(--gb-border-default); border-radius: var(--gb-r-xl); background: var(--gb-surface-1); box-shadow: 0 3px 12px rgba(0, 0, 0, .1); }
  .pei-source { padding: 13px 14px; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; }
  .pei-source-main { min-width: 0; }
  .pei-source-title { overflow: hidden; color: var(--gb-text-primary); font-size: 13px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
  .pei-source-url { margin-top: 3px; overflow: hidden; color: var(--gb-text-muted); font-family: var(--gb-font-mono); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
  .pei-badges { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 5px; }
  .pei-badge { display: inline-flex; align-items: center; gap: 4px; min-height: 20px; padding: 2px 7px; color: var(--gb-text-tertiary); border: 1px solid var(--gb-border-default); border-radius: var(--gb-r-pill); background: var(--gb-fill-faint); font-size: 9px; font-weight: 750; }
  .pei-badge.brand { color: var(--gb-brand-label); border-color: var(--gb-brand-tint-border); background: var(--gb-brand-tint-soft); }
  .pei-source-time { color: var(--gb-text-muted); font-size: 9px; white-space: nowrap; text-align: right; }
  .pei-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .pei-stat { min-width: 0; padding: 11px 12px; border: 1px solid var(--gb-border-default); border-radius: var(--gb-r-lg); background: var(--gb-surface-1); }
  .pei-stat-label { color: var(--gb-text-muted); font-size: 8.5px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; }
  .pei-stat-value { margin-top: 4px; overflow: hidden; color: var(--gb-text-primary); font-size: 17px; font-weight: 850; letter-spacing: -.35px; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .pei-toolbar { padding: 10px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .pei-search { min-width: 180px; flex: 1; }
  .pei-segments { padding: 3px; display: inline-flex; gap: 2px; border: 1px solid var(--gb-border-default); border-radius: var(--gb-r-md); background: var(--gb-fill-faint); }
  .pei-segment { min-height: 24px; padding: 0 8px; border: 0; border-radius: var(--gb-r-sm); cursor: pointer; color: var(--gb-text-muted); background: transparent; font-size: 9.5px; font-weight: 750; transition: color .16s ease, background-color .16s ease; }
  .pei-segment:hover { color: var(--gb-text-primary); }
  .pei-segment.active { color: var(--gb-brand-label); background: var(--gb-brand-tint-medium); }
  .pei-panel-head { min-height: 42px; padding: 9px 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; border-bottom: 1px solid var(--gb-border-subtle); background: var(--gb-fill-faint); }
  .pei-panel-title { color: var(--gb-text-primary); font-size: 12px; font-weight: 800; }
  .pei-panel-count { color: var(--gb-text-muted); font-size: 9px; font-variant-numeric: tabular-nums; }
  .pei-groups { padding: 8px; display: grid; gap: 6px; }
  .pei-group { overflow: hidden; border: 1px solid var(--gb-border-subtle); border-radius: var(--gb-r-lg); background: var(--gb-surface-1); }
  .pei-group-summary { min-height: 37px; padding: 7px 10px; display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--gb-text-primary); background: var(--gb-fill-faint); list-style: none; }
  .pei-group-summary::-webkit-details-marker { display: none; }
  .pei-group-chevron { transition: transform .16s ease; }
  details[open] > .pei-group-summary .pei-group-chevron { transform: rotate(90deg); }
  .pei-group-name { min-width: 0; flex: 1; font-family: var(--gb-font-mono); font-size: 10.5px; font-weight: 800; }
  .pei-group-meta { color: var(--gb-text-muted); font-size: 9px; font-variant-numeric: tabular-nums; }
  .pei-variable { border-top: 1px solid var(--gb-border-subtle); }
  .pei-variable-summary { min-height: 43px; padding: 7px 10px; display: grid; grid-template-columns: minmax(160px, .9fr) minmax(170px, 1.2fr) auto; align-items: center; gap: 12px; cursor: pointer; list-style: none; }
  .pei-variable-summary::-webkit-details-marker { display: none; }
  .pei-variable:hover > .pei-variable-summary { background: var(--gb-fill-faint); }
  .pei-path { min-width: 0; overflow: hidden; color: var(--gb-text-primary); font-family: var(--gb-font-mono); font-size: 9.5px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
  .pei-preview { min-width: 0; overflow: hidden; color: var(--gb-text-secondary); font-family: var(--gb-font-mono); font-size: 9.5px; text-overflow: ellipsis; white-space: nowrap; }
  .pei-variable.empty .pei-preview { color: var(--gb-text-ghost); font-style: italic; }
  .pei-type { padding: 2px 6px; color: var(--gb-text-muted); border: 1px solid var(--gb-border-default); border-radius: var(--gb-r-pill); background: var(--gb-fill-faint); font-family: var(--gb-font-mono); font-size: 8px; }
  .pei-variable-detail { padding: 10px; border-top: 1px solid var(--gb-border-subtle); background: var(--gb-surface-canvas); }
  .pei-variable-label { margin-bottom: 6px; color: var(--gb-text-muted); font-size: 9px; }
  .pei-code { margin: 0; overflow: auto; color: var(--gb-text-secondary); font-family: var(--gb-font-mono); font-size: 9.5px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
  .pei-raw { max-height: 490px; padding: 13px 14px; overflow: auto; }
  .pei-state { padding: 42px 22px; display: grid; place-items: center; gap: 10px; color: var(--gb-text-muted); text-align: center; }
  .pei-state-icon { width: 42px; height: 42px; display: grid; place-items: center; color: var(--gb-text-tertiary); border: 1px solid var(--gb-border-default); border-radius: 50%; background: var(--gb-fill-faint); }
  .pei-state-title { color: var(--gb-text-primary); font-size: 13px; font-weight: 800; }
  .pei-state-copy { max-width: 470px; font-size: 10.5px; line-height: 1.55; }
  .pei-issues { padding: 9px 12px; display: grid; gap: 5px; }
  .pei-issue { display: flex; align-items: flex-start; gap: 7px; color: var(--gb-warning-fg); font-size: 10px; }
  @keyframes pei-pulse { 0%, 100% { opacity: .55; transform: scale(.9); } 50% { opacity: 1; transform: scale(1); } }
  @media (max-width: 720px) {
    .pei-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .pei-variable-summary { grid-template-columns: minmax(130px, 1fr) minmax(120px, 1fr) auto; gap: 7px; }
  }
  @media (prefers-reduced-motion: reduce) { .pei-live-dot { animation: none; } * { scroll-behavior: auto !important; } }
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
  return (
    <section className="pei-card pei-source">
      <div className="pei-source-main">
        <div className="pei-source-title">{page.title || snapshot?.tab?.title || 'Active browser tab'}</div>
        <div className="pei-source-url" title={page.url || snapshot?.tab?.url}>{page.url || snapshot?.tab?.url || 'No URL available'}</div>
        <div className="pei-badges">
          <span className={`pei-badge ${page.schemaId ? 'brand' : ''}`}>{page.schemaId || 'No schema'}</span>
          <span className="pei-badge">{page.pageType || 'unknown page'}</span>
          {ids.map(([key, value]) => <span className="pei-badge" key={key}>{key} · {String(value)}</span>)}
        </div>
      </div>
      <div className="pei-source-time">{displayTime(snapshot?.inspectedAt)}<br />Tab {snapshot?.tab?.id ?? '—'}</div>
    </section>
  );
}

function Stats({ snapshot }) {
  const variables = snapshot?.variables || [];
  const issues = (snapshot?.errors?.length || 0) + (snapshot?.warnings?.length || 0);
  const values = [
    ['Schema', snapshot?.page?.schemaId || 'None'],
    ['Variables', variables.length],
    ['Resolved', variables.filter((item) => item.present).length],
    ['Issues', issues],
  ];
  return <div className="pei-stats">{values.map(([label, value]) => <div className="pei-stat" key={label}><div className="pei-stat-label">{label}</div><div className="pei-stat-value" title={String(value)}>{value}</div></div>)}</div>;
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
  return <div className="pei-state"><span className="pei-state-icon">{error ? <I.alert size={19} /> : <I.search size={19} />}</span><div className="pei-state-title">{title}</div><div className="pei-state-copy">{copy}</div></div>;
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
    <><style>{CSS}</style><div className="pei-app" data-gb-ui-root>
      <header className="pei-header"><span className="pei-mark"><I.code size={18} /></span><div className="pei-header-copy"><div className="pei-title">Page Engine Inspector</div><div className="pei-subtitle">Live extraction follows the active browser tab</div></div><span className="pei-live"><span className="pei-live-dot" />Live</span></header>
      <main className="pei-main"><div className="pei-shell">
        <SourceCard snapshot={snapshot || { tab: sourceTab }} />
        {snapshot && <Stats snapshot={snapshot} />}
        <section className="pei-card pei-toolbar">
          <div className="pei-search"><Input size="sm" value={query} onChange={setQuery} placeholder="Search paths, labels, types, or values…" leading={<I.search size={11} />} /></div>
          <div className="pei-segments" aria-label="Value filter">{[['all', 'All'], ['resolved', 'Resolved'], ['empty', 'Empty']].map(([id, label]) => <button type="button" className={`pei-segment ${filter === id ? 'active' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(id)} key={id}>{label}</button>)}</div>
          <div className="pei-segments" aria-label="Inspector view">{[['variables', 'Variables'], ['raw', 'Raw JSON']].map(([id, label]) => <button type="button" className={`pei-segment ${view === id ? 'active' : ''}`} aria-pressed={view === id} onClick={() => setView(id)} key={id}>{label}</button>)}</div>
          <Btn size="sm" variant="secondary" icon={<I.refresh />} onClick={() => sourceTabRef.current && inspectTab(sourceTabRef.current)}>Refresh</Btn>
          <Btn size="sm" variant="tinted" status="brand" icon={copied ? <I.check /> : <I.copy />} onClick={copySnapshot} disabled={!snapshot}>{copied ? 'Copied' : 'Copy'}</Btn>
        </section>
        <AnimatePresence mode="wait" initial={false}>
          <motion.section className="pei-card" key={loading ? 'loading' : error ? 'error' : unsupported ? 'unsupported' : view} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .16 }}>
            {loading ? <EmptyState title="Reading the active tab" copy="Running a fresh Page Engine extraction against the visible CRM document." />
              : error ? <EmptyState error title="Inspector could not read this tab" copy={error} />
                : unsupported ? <EmptyState title="No Page Engine context on this tab" copy="Switch to a Golfballs Contact, Account, Order, or Opportunity page. This window will follow the active tab automatically." />
                  : view === 'raw' ? <><div className="pei-panel-head"><div className="pei-panel-title">Raw extracted context</div><div className="pei-panel-count">Fresh document snapshot</div></div><pre className="pei-code pei-raw">{jsonValue(snapshot?.data)}</pre></>
                    : <><div className="pei-panel-head"><div className="pei-panel-title">Resolved variables</div><div className="pei-panel-count">{visibleVariables.length} of {snapshot?.variables?.length || 0}</div></div><VariablesPanel variables={visibleVariables} /></>}
          </motion.section>
        </AnimatePresence>
        {!!issues.length && <section className="pei-card"><div className="pei-panel-head"><div className="pei-panel-title">Extraction issues</div><div className="pei-panel-count">{issues.length}</div></div><div className="pei-issues">{issues.map((issue, index) => <div className="pei-issue" key={`${index}-${String(issue)}`}><I.alert size={11} /><span>{typeof issue === 'string' ? issue : jsonValue(issue)}</span></div>)}</div></section>}
      </div></main>
    </div></>
  );
}

ensureTheme();
createRoot(document.getElementById('page-engine-inspector-root')).render(<Inspector />);
