import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { I, Icon } from '../icons.jsx';

const STORAGE_KEY = 'gbHelpChatStateV1';

const EMPTY_STATE = Object.freeze({
  version: 1,
  messages: [],
  active: null,
  unread: 0,
  lastError: null,
  notice: null,
  updatedAt: 0,
});

const QUICK_QUESTIONS = [
  'What can the toolkit help me do on this page?',
  'Where do I change a feature setting?',
  'Walk me through a common workflow.',
  'Help me troubleshoot something that is not working.',
];

const BackIcon = (p) => <Icon {...p}><path d="M19 12H5M12 19l-7-7 7-7" /></Icon>;
const ChatIcon = (p) => <Icon {...p}><path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4z" /><path d="M8 9h8M8 13h5" /></Icon>;
const StopIcon = (p) => <Icon {...p}><rect x="7" y="7" width="10" height="10" rx="1.5" /></Icon>;
const BookIcon = (p) => <Icon {...p}><path d="M4 19.5A2.5 2.5 0 016.5 17H20V4H6.5A2.5 2.5 0 004 6.5z" /><path d="M4 6.5v13M8 8h8" /></Icon>;
const ThumbUpIcon = (p) => <Icon {...p}><path d="M7 10v11H3V10zM7 19l3 2h7a2 2 0 002-1.6l1.5-7A2 2 0 0018.5 10H14l1-4a2.5 2.5 0 00-1-2.6L12 9l-5 4" /></Icon>;
const ThumbDownIcon = (p) => <Icon {...p}><path d="M7 14V3H3v11zM7 5l3-2h7a2 2 0 012 1.6l1.5 7a2 2 0 01-2 2.4H14l1 4a2.5 2.5 0 01-1 2.6L12 15l-5-4" /></Icon>;

function useHelpStyles() {
  useEffect(() => {
    if (document.getElementById('gb-help-companion-styles')) return;
    const style = document.createElement('style');
    style.id = 'gb-help-companion-styles';
    style.textContent = `
      @keyframes gb-help-orbit { to { transform: rotate(360deg); } }
      @keyframes gb-help-pulse { 0%,100% { opacity:.35; transform:scale(.78); } 50% { opacity:1; transform:scale(1); } }
      .gb-help-scroll { scrollbar-width: thin; scrollbar-color: var(--gb-border-default) transparent; }
      .gb-help-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
      .gb-help-scroll::-webkit-scrollbar-track { background: transparent; }
      .gb-help-scroll::-webkit-scrollbar-thumb { background: var(--gb-border-default); border-radius: 999px !important; }
      .gb-help-scroll::-webkit-scrollbar-thumb:hover { background: var(--gb-border-strong); }
      .gb-help-composer::placeholder { color: var(--gb-text-muted); opacity: 1; }
      .gb-help-composer::-webkit-scrollbar { width: 5px; }
      .gb-help-composer::-webkit-scrollbar-thumb { background: var(--gb-border-default); border-radius: 999px; }
      @media (prefers-reduced-motion: reduce) {
        .gb-help-motion, .gb-help-motion * { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; }
      }
    `;
    document.head.appendChild(style);
  }, []);
}

function runtimeMessage(payload) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(payload, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message || 'The extension worker is unavailable'));
          return;
        }
        if (!response?.ok) {
          const error = new Error(response?.error || 'The Help Companion request failed');
          error.status = Number(response?.status || 0);
          reject(error);
          return;
        }
        resolve(response);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function safeFeatureStates() {
  const out = {};
  const flags = window.__gbFeatureFlags;
  if (!flags || typeof flags !== 'object') return out;
  for (const [key, value] of Object.entries(flags).slice(0, 80)) {
    if (typeof value === 'boolean') out[String(key).slice(0, 100)] = value;
  }
  return out;
}

function helpContext(page, answerMode) {
  let extensionVersion = '';
  try { extensionVersion = chrome.runtime.getManifest()?.version || ''; } catch { /* */ }
  return {
    extension_version: String(extensionVersion).slice(0, 40),
    edition: (typeof __ADMIN__ !== 'undefined' && __ADMIN__) ? 'admin' : 'consumer',
    surface: 'actions-shelf',
    page_type: String(page || 'unknown').slice(0, 60),
    answer_mode: answerMode === 'technical' ? 'technical' : 'operator',
    feature_states: safeFeatureStates(),
    hidden_settings: [],
  };
}

export function useHelpAssistant(page) {
  const [state, setState] = useState(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [transportError, setTransportError] = useState('');
  const [service, setService] = useState({ phase: 'idle', ready: null, checkedAt: 0, error: '' });

  const applyResponse = useCallback((response) => {
    if (response?.state) setState(response.state);
    setTransportError('');
    return response?.state;
  }, []);

  const refresh = useCallback(async () => {
    try {
      return applyResponse(await runtimeMessage({ action: 'helpAssistantGetState' }));
    } catch (error) {
      setTransportError(error?.message || 'Unable to load the help conversation');
      return null;
    } finally {
      setLoading(false);
    }
  }, [applyResponse]);

  useEffect(() => {
    let alive = true;
    refresh();
    const onStorage = (changes, area) => {
      if (!alive || area !== 'local' || !changes[STORAGE_KEY]) return;
      setState(changes[STORAGE_KEY].newValue || EMPTY_STATE);
      setLoading(false);
    };
    try { chrome.storage.onChanged.addListener(onStorage); } catch { /* */ }
    return () => {
      alive = false;
      try { chrome.storage.onChanged.removeListener(onStorage); } catch { /* */ }
    };
  }, [refresh]);

  const call = useCallback(async (payload) => {
    try {
      return applyResponse(await runtimeMessage(payload));
    } catch (error) {
      setTransportError(error?.message || 'The Help Companion request failed');
      throw error;
    }
  }, [applyResponse]);

  const checkStatus = useCallback(async ({ force = false } = {}) => {
    if (!force && service.checkedAt && Date.now() - service.checkedAt < 60_000) return service;
    setService((current) => ({ ...current, phase: 'checking', error: '' }));
    try {
      const response = await runtimeMessage({ action: 'helpAssistantStatus' });
      const ready = response?.status?.ready === true && response?.status?.completion?.available !== false;
      const next = { phase: ready ? 'ready' : 'unavailable', ready, checkedAt: Date.now(), error: ready ? '' : 'Completion service unavailable' };
      setService(next);
      return next;
    } catch (error) {
      const next = { phase: 'unavailable', ready: false, checkedAt: Date.now(), error: error?.message || 'Service unavailable' };
      setService(next);
      return next;
    }
  }, [service]);

  return {
    state,
    loading,
    transportError,
    service,
    refresh,
    checkStatus,
    send: (message, answerMode) => call({ action: 'helpAssistantSend', message, context: helpContext(page, answerMode) }),
    retry: (answerMode) => call({ action: 'helpAssistantRetry', context: helpContext(page, answerMode) }),
    cancel: () => call({ action: 'helpAssistantCancel' }),
    markRead: () => call({ action: 'helpAssistantMarkRead' }),
    clear: () => call({ action: 'helpAssistantClear' }),
    feedback: (runId, rating) => call({ action: 'helpAssistantFeedback', runId, rating }),
  };
}

function StatusDot({ phase, active }) {
  const effective = active ? 'active' : phase;
  const colors = {
    active: 'var(--gb-brand-label)',
    ready: 'var(--gb-success-fg)',
    checking: 'var(--gb-warning-fg)',
    unavailable: 'var(--gb-error-fg)',
    idle: 'var(--gb-text-muted)',
  };
  return <span aria-hidden style={{
    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
    background: colors[effective] || colors.idle,
    boxShadow: effective === 'active' ? '0 0 8px var(--gb-brand-label)' : 'none',
    animation: effective === 'active' ? 'gb-help-pulse 1.25s ease-in-out infinite' : 'none',
  }} />;
}

export function HelpCompanionEntry({ state = EMPTY_STATE, loading, onOpen }) {
  const active = !!state.active;
  const unread = Number(state.unread || 0);
  const hint = active
    ? 'Working in the background — you can keep browsing'
    : unread
      ? `${unread} new answer${unread === 1 ? '' : 's'} ready`
      : 'Ask how features work, where settings live, or what to try next';

  return (
    <motion.button
      type="button"
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.992 }}
      onClick={onOpen}
      aria-label={unread ? `Open AI Help Companion, ${unread} unread` : 'Open AI Help Companion'}
      style={{
        width: '100%', position: 'relative', overflow: 'hidden',
        display: 'grid', gridTemplateColumns: '34px 1fr auto', alignItems: 'center', gap: 10,
        padding: '9px 10px', marginBottom: 7,
        background: 'linear-gradient(112deg, var(--gb-brand-tint-medium), var(--gb-fill-subtle) 72%)',
        border: '1px solid var(--gb-brand-tint-border)', borderRadius: 'var(--gb-r-md)',
        color: 'var(--gb-text-primary)', cursor: 'pointer', textAlign: 'left',
        fontFamily: 'var(--gb-font-sans)',
        boxShadow: 'inset 0 1px 0 var(--gb-fill-faint)',
      }}
    >
      <span aria-hidden style={{
        position: 'absolute', width: 86, height: 86, borderRadius: '50%', right: -34, top: -58,
        background: 'radial-gradient(circle, var(--gb-brand-tint-strong), transparent 68%)', pointerEvents: 'none',
      }} />
      <span style={{
        width: 34, height: 34, borderRadius: 10, position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(145deg, var(--gb-brand), var(--gb-brand-dark))',
        color: 'var(--gb-text-on-brand)', border: '1px solid var(--gb-brand-border)',
        boxShadow: '0 6px 16px var(--gb-brand-tint-strong)',
      }}>
        <ChatIcon size={16} />
        {active && <span style={{ position: 'absolute', right: -2, bottom: -2, width: 8, height: 8, borderRadius: '50%', background: 'var(--gb-brand-label)', border: '2px solid var(--gb-surface-1)', animation: 'gb-help-pulse 1.2s ease-in-out infinite' }} />}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 750, letterSpacing: -0.15 }}>AI Help Companion</span>
          <span style={{
            padding: '1px 5px', borderRadius: 999, fontSize: 8.5, fontWeight: 800, letterSpacing: .55,
            textTransform: 'uppercase', color: 'var(--gb-brand-label)', background: 'var(--gb-brand-tint-medium)',
            border: '1px solid var(--gb-brand-tint-border)',
          }}>Help</span>
        </span>
        <span style={{ marginTop: 2, fontSize: 10.25, lineHeight: 1.35, fontWeight: 500, color: 'var(--gb-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {loading ? 'Loading your conversation…' : hint}
        </span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, position: 'relative' }}>
        {unread > 0 && (
          <span style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gb-brand)', color: 'var(--gb-text-on-brand)', fontSize: 10, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', boxShadow: '0 3px 10px var(--gb-brand-tint-strong)' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
        <I.chevr size={12} style={{ color: 'var(--gb-brand-label)' }} />
      </span>
    </motion.button>
  );
}

function InlineText({ text }) {
  const parts = String(text || '').split(/(`[^`]+`)/g);
  return parts.map((part, index) => (
    part.startsWith('`') && part.endsWith('`')
      ? <code key={index} style={{ padding: '1px 4px', borderRadius: 4, background: 'var(--gb-fill-medium)', border: '1px solid var(--gb-border-subtle)', color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-mono)', fontSize: '.92em' }}>{part.slice(1, -1)}</code>
      : <React.Fragment key={index}>{part}</React.Fragment>
  ));
}

function AnswerText({ text }) {
  const blocks = String(text || '').split(/\n{2,}/).filter(Boolean);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {blocks.map((block, index) => {
        const lines = block.split('\n').filter(Boolean);
        const list = lines.length > 0 && lines.every((line) => /^\s*(?:[-*]|\d+[.)])\s+/.test(line));
        if (list) return (
          <ul key={index} style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {lines.map((line, lineIndex) => <li key={lineIndex}><InlineText text={line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, '')} /></li>)}
          </ul>
        );
        return <p key={index} style={{ margin: 0, whiteSpace: 'pre-wrap' }}><InlineText text={block} /></p>;
      })}
    </div>
  );
}

function TinyButton({ selected, label, title, onClick, children }) {
  return (
    <button type="button" title={title || label} aria-label={label} onClick={onClick} style={{
      minWidth: 27, height: 25, padding: children ? '0 8px' : 0, borderRadius: 7,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
      background: selected ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-subtle)',
      color: selected ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
      border: `1px solid ${selected ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-subtle)'}`,
      fontFamily: 'var(--gb-font-sans)', fontSize: 10, fontWeight: 700, cursor: 'pointer',
      transition: 'all var(--gb-anim-fast)',
    }}>{children}</button>
  );
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(String(text || ''));
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = String(text || '');
      area.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch { return false; }
  }
}

function AssistantMessage({ message, onAction, onFeedback, isLast, onSuggestion }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: .2, ease: [0.2, .8, .2, 1] }}
      style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr)', gap: 9, alignItems: 'start' }}
    >
      <div style={{ width: 28, height: 28, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gb-text-on-brand)', background: 'linear-gradient(145deg, var(--gb-brand), var(--gb-brand-dark))', border: '1px solid var(--gb-brand-border)', boxShadow: '0 5px 14px var(--gb-brand-tint-strong)' }}>
        <I.sparkle size={13} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ padding: '10px 12px', borderRadius: '4px 13px 13px 13px', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)', color: 'var(--gb-text-secondary)', fontSize: 11.75, fontWeight: 500, lineHeight: 1.58, overflowWrap: 'anywhere', boxShadow: 'inset 0 1px 0 var(--gb-fill-faint)' }}>
          <AnswerText text={message.text} />

          {message.steps?.length > 0 && (
            <div style={{ marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--gb-border-subtle)', display: 'flex', flexDirection: 'column', gap: 7 }}>
              {message.steps.map((step, index) => (
                <div key={index} style={{ display: 'grid', gridTemplateColumns: '19px minmax(0,1fr)', gap: 7, alignItems: 'start' }}>
                  <span style={{ width: 19, height: 19, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gb-brand-tint-medium)', color: 'var(--gb-brand-label)', border: '1px solid var(--gb-brand-tint-border)', fontFamily: 'var(--gb-font-mono)', fontSize: 9, fontWeight: 800 }}>{index + 1}</span>
                  <span><InlineText text={step.text} /></span>
                </div>
              ))}
            </div>
          )}

          {message.warning && (
            <div style={{ marginTop: 10, padding: '7px 8px', display: 'flex', gap: 7, alignItems: 'flex-start', borderRadius: 8, color: 'var(--gb-warning-fg)', background: 'var(--gb-warning-tint-soft)', border: '1px solid var(--gb-warning-tint-border)', fontSize: 10.5, lineHeight: 1.45 }}>
              <I.alert size={12} style={{ marginTop: 1 }} /><span>{message.warning}</span>
            </div>
          )}
        </div>

        {message.actions?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
            {message.actions.map((action, index) => (
              <button key={`${action.type}-${index}`} type="button" onClick={() => onAction(action)} style={{
                height: 27, padding: '0 9px', display: 'inline-flex', alignItems: 'center', gap: 6,
                borderRadius: 8, background: 'var(--gb-brand-tint-medium)', color: 'var(--gb-brand-label)',
                border: '1px solid var(--gb-brand-tint-border)', fontFamily: 'var(--gb-font-sans)',
                fontSize: 10.25, fontWeight: 700, cursor: 'pointer',
              }}>
                {action.type === 'open_guide' ? <BookIcon size={11} /> : action.type === 'open_settings' ? <I.cog size={11} /> : <I.copy size={11} />}
                {action.label}
              </button>
            ))}
          </div>
        )}

        {message.citations?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
            {message.citations.map((citation) => (
              <button key={citation.id} type="button" disabled={!citation.guideRoute} title={citation.excerpt || citation.source || citation.title} onClick={() => citation.guideRoute && onAction({ type: 'open_guide', target: citation.guideRoute, label: citation.title })} style={{
                maxWidth: '100%', height: 24, padding: '0 7px', display: 'inline-flex', alignItems: 'center', gap: 5,
                borderRadius: 7, background: 'transparent', color: citation.guideRoute ? 'var(--gb-text-tertiary)' : 'var(--gb-text-muted)',
                border: '1px solid var(--gb-border-subtle)', fontFamily: 'var(--gb-font-sans)', fontSize: 9.5, fontWeight: 650,
                cursor: citation.guideRoute ? 'pointer' : 'default', opacity: citation.guideRoute ? 1 : .75,
              }}>
                <BookIcon size={10} /><span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{citation.title}</span>
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 7 }}>
          <TinyButton label="Copy answer" title="Copy answer" onClick={() => onAction({ type: 'copy_text', target: message.text, label: 'Copy answer' })}><I.copy size={10} /></TinyButton>
          <span style={{ width: 1, height: 14, background: 'var(--gb-border-subtle)', margin: '0 1px' }} />
          <TinyButton label="Helpful" title="Helpful" selected={message.feedback === 'helpful'} onClick={() => onFeedback(message.runId, 'helpful')}><ThumbUpIcon size={10} /></TinyButton>
          <TinyButton label="Not helpful" title="Not helpful" selected={message.feedback === 'not_helpful'} onClick={() => onFeedback(message.runId, 'not_helpful')}><ThumbDownIcon size={10} /></TinyButton>
          {message.needsMoreEvidence && <span style={{ marginLeft: 3, fontSize: 9.25, color: 'var(--gb-warning-fg)', fontWeight: 650 }}>Limited evidence</span>}
        </div>

        {isLast && message.suggestedQuestions?.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
            {message.suggestedQuestions.slice(0, 3).map((question, index) => (
              <button key={index} type="button" onClick={() => onSuggestion(question)} style={{
                width: 'fit-content', maxWidth: '100%', padding: '6px 9px', borderRadius: 9,
                display: 'inline-flex', alignItems: 'center', gap: 6, textAlign: 'left',
                background: 'var(--gb-fill-faint)', color: 'var(--gb-text-secondary)',
                border: '1px solid var(--gb-border-subtle)', fontFamily: 'var(--gb-font-sans)',
                fontSize: 10.25, fontWeight: 600, lineHeight: 1.35, cursor: 'pointer',
              }}><I.chevr size={10} style={{ color: 'var(--gb-brand-label)' }} />{question}</button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function UserMessage({ message }) {
  return (
    <motion.div initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .18 }} style={{ display: 'flex', justifyContent: 'flex-end', paddingLeft: 48 }}>
      <div style={{ maxWidth: '88%', padding: '9px 11px', borderRadius: '13px 4px 13px 13px', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-text-primary)', fontSize: 11.75, fontWeight: 550, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', boxShadow: 'inset 0 1px 0 var(--gb-fill-faint)' }}>
        {message.text}
      </div>
    </motion.div>
  );
}

function ThinkingMessage({ status }) {
  const copy = status === 'submitting' ? 'Sending your question' : status === 'queued' ? 'Queued securely' : 'Reading the toolkit knowledge';
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 9, alignItems: 'center' }}>
      <div style={{ width: 28, height: 28, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gb-text-on-brand)', background: 'linear-gradient(145deg, var(--gb-brand), var(--gb-brand-dark))', border: '1px solid var(--gb-brand-border)' }}><I.sparkle size={13} /></div>
      <div style={{ width: 'fit-content', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, borderRadius: '4px 12px 12px 12px', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)', color: 'var(--gb-text-muted)', fontSize: 10.5, fontWeight: 600 }}>
        <span style={{ display: 'inline-flex', gap: 3 }}>
          {[0, 1, 2].map((i) => <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--gb-brand-label)', animation: `gb-help-pulse 1.1s ease-in-out ${i * .16}s infinite` }} />)}
        </span>
        {copy}
      </div>
    </motion.div>
  );
}

function EmptyConversation({ loading, pageLabel, onQuestion, compact }) {
  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gb-text-muted)', fontSize: 11, fontWeight: 600 }}>
      <span style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--gb-border-default)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-help-orbit .8s linear infinite', marginRight: 8 }} />
      Restoring your conversation…
    </div>
  );
  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '20px 20px 10px' }}>
      <div style={{ width: 46, height: 46, borderRadius: 15, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gb-text-on-brand)', background: 'linear-gradient(145deg, var(--gb-brand), var(--gb-brand-dark))', border: '1px solid var(--gb-brand-border)', boxShadow: '0 12px 28px var(--gb-brand-tint-strong)' }}>
        <ChatIcon size={21} />
        <span style={{ position: 'absolute', inset: -7, borderRadius: 20, border: '1px solid var(--gb-brand-tint-border)', opacity: .45 }} />
      </div>
      <h3 style={{ margin: '16px 0 0', color: 'var(--gb-text-primary)', fontSize: 17, lineHeight: 1.2, letterSpacing: -.35 }}>How can I help?</h3>
      <p style={{ margin: '6px 0 0', maxWidth: 390, color: 'var(--gb-text-muted)', fontSize: 11, lineHeight: 1.55, fontWeight: 500 }}>
        Ask about extension features, settings, shortcuts, or a workflow{pageLabel ? ` while you are on ${pageLabel}` : ''}. Answers are grounded in the installed toolkit guide and source.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(2, minmax(0,1fr))', gap: 7, marginTop: 17 }}>
        {QUICK_QUESTIONS.map((question, index) => (
          <motion.button key={question} type="button" whileHover={{ y: -1, borderColor: 'var(--gb-brand-tint-border)' }} whileTap={{ scale: .99 }} onClick={() => onQuestion(question)} style={{ minHeight: 54, padding: '8px 9px', display: 'flex', alignItems: 'flex-start', gap: 7, borderRadius: 10, textAlign: 'left', background: index === 0 ? 'var(--gb-brand-tint-soft)' : 'var(--gb-fill-subtle)', color: 'var(--gb-text-secondary)', border: `1px solid ${index === 0 ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-subtle)'}`, fontFamily: 'var(--gb-font-sans)', fontSize: 10.25, lineHeight: 1.38, fontWeight: 600, cursor: 'pointer' }}>
            <I.sparkle size={10} style={{ color: 'var(--gb-brand-label)', marginTop: 2 }} />
            <span>{question}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function ModeSwitch({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Answer detail" style={{ position: 'relative', height: 24, padding: 2, display: 'inline-grid', gridTemplateColumns: '1fr 1fr', gap: 1, borderRadius: 8, background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)' }}>
      {['operator', 'technical'].map((mode) => (
        <button key={mode} type="button" role="radio" aria-checked={value === mode} onClick={() => onChange(mode)} style={{ position: 'relative', zIndex: 1, height: 18, padding: '0 7px', border: 0, background: 'transparent', color: value === mode ? 'var(--gb-text-primary)' : 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-sans)', fontSize: 8.75, fontWeight: 750, cursor: 'pointer', transition: 'color var(--gb-anim-fast)' }}>
          {value === mode && <motion.span layoutId="gb-help-mode" transition={{ type: 'spring', stiffness: 440, damping: 34 }} style={{ position: 'absolute', inset: 0, zIndex: -1, borderRadius: 5.5, background: 'var(--gb-fill-medium)', border: '1px solid var(--gb-border-default)', boxShadow: '0 1px 4px rgba(0,0,0,.15)' }} />}
          {mode === 'operator' ? 'How-to' : 'Technical'}
        </button>
      ))}
    </div>
  );
}

export function HelpCompanionPanel({ client, onBack, pageLabel, compact = false }) {
  useHelpStyles();
  const reduceMotion = useReducedMotion();
  const [draft, setDraft] = useState('');
  const [answerMode, setAnswerMode] = useState('operator');
  const [focus, setFocus] = useState(false);
  const [clearArmed, setClearArmed] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const stickToBottom = useRef(true);
  const state = client.state || EMPTY_STATE;
  const messages = state.messages || [];
  const active = state.active;

  useEffect(() => {
    client.checkStatus();
  }, []); // status is intentionally checked once when the chat destination opens

  useEffect(() => {
    if (state.unread > 0) client.markRead().catch(() => {});
  }, [state.unread]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottom.current) return;
    requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' }));
  }, [messages.length, active?.status, state.lastError?.message]);

  const submit = useCallback(async (value = draft) => {
    const message = String(value || '').trim();
    if (!message || active || localBusy) return;
    setDraft('');
    setLocalBusy(true);
    stickToBottom.current = true;
    try { await client.send(message, answerMode); }
    catch { setDraft(message); }
    finally {
      setLocalBusy(false);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [draft, active, localBusy, answerMode, client]);

  const handleAction = useCallback(async (action) => {
    const type = action?.type;
    const target = String(action?.target || '');
    if (type === 'open_guide') {
      const hash = target.startsWith('#') ? target : `#${target.replace(/^\/+/, '')}`;
      chrome.runtime.sendMessage({ action: 'openGuide', hash });
      return;
    }
    if (type === 'open_settings') {
      chrome.runtime.sendMessage({ action: 'openEditor', openSettings: true, settingsTarget: target });
      window.__gbToast?.info?.('Opening extension settings', { duration: 1800 });
      return;
    }
    if (type === 'show_shortcut' || type === 'copy_text') {
      const copied = await copyText(target);
      window.__gbToast?.[copied ? 'success' : 'error']?.(copied ? (type === 'show_shortcut' ? 'Shortcut copied' : 'Copied') : 'Could not copy', { duration: 1700 });
    }
  }, []);

  const handleFeedback = useCallback(async (runId, rating) => {
    try { await client.feedback(runId, rating); }
    catch { window.__gbToast?.error?.('Could not save feedback', { duration: 1800 }); }
  }, [client]);

  const serviceLabel = active
    ? active.status === 'queued' ? 'Queued' : 'Thinking'
    : client.service.phase === 'checking' ? 'Checking'
      : client.service.phase === 'ready' ? 'Ready'
        : client.service.phase === 'unavailable' ? 'Unavailable' : 'Help assistant';

  const resizeComposer = (event) => {
    const el = event.currentTarget;
    el.style.height = '0px';
    el.style.height = `${Math.min(104, Math.max(20, el.scrollHeight))}px`;
  };

  return (
    <div className="gb-help-motion" style={{ width: '100%', height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', background: 'linear-gradient(155deg, var(--gb-surface-modal), var(--gb-surface-1))' }}>
      <header style={{ minHeight: 54, padding: '8px 10px', display: 'grid', gridTemplateColumns: '32px 1fr auto', alignItems: 'center', gap: 9, flexShrink: 0, borderBottom: '1px solid var(--gb-border-subtle)', background: 'color-mix(in srgb, var(--gb-surface-modal) 88%, transparent)', backdropFilter: 'var(--gb-blur-medium)', WebkitBackdropFilter: 'var(--gb-blur-medium)' }}>
        <button type="button" onClick={onBack} title="Back to actions" aria-label="Back to actions" style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gb-fill-subtle)', color: 'var(--gb-text-secondary)', border: '1px solid var(--gb-border-subtle)', cursor: 'pointer' }}><BackIcon size={13} /></button>
        <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 30, height: 30, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gb-text-on-brand)', background: 'linear-gradient(145deg, var(--gb-brand), var(--gb-brand-dark))', border: '1px solid var(--gb-brand-border)', boxShadow: '0 6px 15px var(--gb-brand-tint-strong)' }}><ChatIcon size={14} /></div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.25, lineHeight: 1.15, fontWeight: 780, color: 'var(--gb-text-primary)', letterSpacing: -.12 }}>Help Companion</div>
            <div title={client.service.error || serviceLabel} style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 5, color: client.service.phase === 'unavailable' && !active ? 'var(--gb-error-fg)' : 'var(--gb-text-muted)', fontSize: 9.5, lineHeight: 1, fontWeight: 650 }}>
              <StatusDot phase={client.service.phase} active={!!active} />{serviceLabel}
              {active && <span style={{ opacity: .7 }}>· safe to close</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!compact && <ModeSwitch value={answerMode} onChange={setAnswerMode} />}
          <button type="button" disabled={!!active || messages.length === 0} onClick={() => setClearArmed((value) => !value)} title="Clear conversation" aria-label="Clear conversation" style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: clearArmed ? 'var(--gb-error-tint-soft)' : 'var(--gb-fill-subtle)', color: clearArmed ? 'var(--gb-error-fg)' : 'var(--gb-text-muted)', border: `1px solid ${clearArmed ? 'var(--gb-error-tint-border)' : 'var(--gb-border-subtle)'}`, cursor: active || messages.length === 0 ? 'not-allowed' : 'pointer', opacity: active || messages.length === 0 ? .45 : 1 }}><I.trash size={11} /></button>
        </div>
      </header>

      <AnimatePresence>
        {clearArmed && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ margin: '7px 9px 0', padding: '7px 8px 7px 10px', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 9, background: 'var(--gb-error-tint-soft)', border: '1px solid var(--gb-error-tint-border)', color: 'var(--gb-error-fg)', fontSize: 10.25, fontWeight: 650 }}>
              <span style={{ flex: 1 }}>Clear this conversation?</span>
              <button type="button" onClick={() => setClearArmed(false)} style={{ height: 24, padding: '0 7px', borderRadius: 6, background: 'transparent', color: 'var(--gb-text-secondary)', border: '1px solid var(--gb-border-default)', fontSize: 9.5, fontWeight: 700, cursor: 'pointer' }}>Keep</button>
              <button type="button" onClick={async () => { await client.clear(); setClearArmed(false); }} style={{ height: 24, padding: '0 8px', borderRadius: 6, background: 'var(--gb-error-fg)', color: 'var(--gb-text-on-brand)', border: '1px solid var(--gb-error-fg)', fontSize: 9.5, fontWeight: 750, cursor: 'pointer' }}>Clear</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main
        ref={scrollRef}
        className="gb-help-scroll"
        onScroll={(event) => {
          const el = event.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 70;
        }}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', padding: messages.length ? '13px 12px 16px' : 0 }}
      >
        {messages.length === 0 && !active
          ? <EmptyConversation loading={client.loading} pageLabel={pageLabel} compact={compact} onQuestion={(question) => { setDraft(question); requestAnimationFrame(() => textareaRef.current?.focus()); }} />
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {messages.map((message, index) => message.role === 'user'
                ? <UserMessage key={message.id || index} message={message} />
                : <AssistantMessage key={message.id || index} message={message} isLast={index === messages.length - 1} onAction={handleAction} onFeedback={handleFeedback} onSuggestion={(question) => { setDraft(question); requestAnimationFrame(() => textareaRef.current?.focus()); }} />)}
              {active && <ThinkingMessage status={active.status} />}
              {(state.notice && !active) && <div style={{ alignSelf: 'center', padding: '4px 8px', borderRadius: 999, background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)', color: 'var(--gb-text-muted)', fontSize: 9.5, fontWeight: 650 }}>{state.notice}</div>}
              {state.lastError && !active && (
                <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} style={{ marginLeft: 37, padding: '9px 10px', borderRadius: 10, background: 'var(--gb-error-tint-soft)', border: '1px solid var(--gb-error-tint-border)', color: 'var(--gb-error-fg)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <I.alert size={13} style={{ marginTop: 1 }} />
                  <div style={{ flex: 1, minWidth: 0, fontSize: 10.5, lineHeight: 1.45, fontWeight: 600 }}>{state.lastError.message}</div>
                  {state.lastError.retryMessage && <button type="button" onClick={async () => { setLocalBusy(true); try { await client.retry(answerMode); } finally { setLocalBusy(false); } }} disabled={localBusy} style={{ height: 25, padding: '0 8px', borderRadius: 7, background: 'var(--gb-error-fg)', color: 'var(--gb-text-on-brand)', border: 0, fontSize: 9.5, fontWeight: 750, cursor: localBusy ? 'wait' : 'pointer' }}>Retry</button>}
                </motion.div>
              )}
              {client.transportError && <div style={{ marginLeft: 37, color: 'var(--gb-error-fg)', fontSize: 10, fontWeight: 600 }}>{client.transportError}</div>}
            </div>
          )}
      </main>

      <footer style={{ padding: '8px 9px 9px', flexShrink: 0, borderTop: '1px solid var(--gb-border-subtle)', background: 'color-mix(in srgb, var(--gb-surface-modal) 92%, transparent)', backdropFilter: 'var(--gb-blur-medium)', WebkitBackdropFilter: 'var(--gb-blur-medium)' }}>
        {compact && <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '0 2px 6px' }}><ModeSwitch value={answerMode} onChange={setAnswerMode} /></div>}
        {active && <div style={{ margin: '0 3px 6px', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--gb-text-muted)', fontSize: 9.25, fontWeight: 600 }}><I.sparkle size={9} style={{ color: 'var(--gb-brand-label)' }} />You can return to Actions — the reply will keep running and show as unread.</div>}
        <div style={{ minHeight: 42, padding: '7px 7px 7px 10px', display: 'flex', alignItems: 'flex-end', gap: 7, borderRadius: 12, background: 'var(--gb-fill-subtle)', border: `1px solid ${focus ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'}`, boxShadow: focus ? '0 0 0 3px var(--gb-brand-tint-soft), inset 0 1px 0 var(--gb-fill-faint)' : 'inset 0 1px 0 var(--gb-fill-faint)', transition: 'border-color var(--gb-anim-fast), box-shadow var(--gb-anim-fast)' }}>
          <textarea
            ref={textareaRef}
            className="gb-help-composer"
            value={draft}
            rows={1}
            maxLength={4000}
            disabled={!!active || localBusy}
            placeholder={active ? 'Waiting for the current answer…' : 'Ask about the Golfballs Toolkit…'}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            onChange={(event) => { setDraft(event.target.value); resizeComposer(event); }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
            style={{ flex: 1, minWidth: 0, height: 20, maxHeight: 104, resize: 'none', overflowY: 'auto', overflowX: 'hidden', padding: 0, background: 'transparent', color: 'var(--gb-text-primary)', border: 0, outline: 0, fontFamily: 'var(--gb-font-sans)', fontSize: 11.5, fontWeight: 520, lineHeight: '20px', opacity: active ? .62 : 1 }}
          />
          <motion.button
            type="button"
            whileTap={{ scale: .92 }}
            disabled={!active && (!draft.trim() || localBusy)}
            onClick={() => active ? client.cancel().catch((error) => window.__gbToast?.error?.(error?.message || 'Could not cancel', { duration: 2000 })) : submit()}
            title={active ? 'Cancel response' : 'Send question'}
            aria-label={active ? 'Cancel response' : 'Send question'}
            style={{ width: 29, height: 29, flexShrink: 0, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? 'var(--gb-fill-medium)' : 'linear-gradient(145deg, var(--gb-brand), var(--gb-brand-dark))', color: active ? 'var(--gb-text-secondary)' : 'var(--gb-text-on-brand)', border: `1px solid ${active ? 'var(--gb-border-default)' : 'var(--gb-brand-border)'}`, cursor: !active && (!draft.trim() || localBusy) ? 'not-allowed' : 'pointer', opacity: !active && (!draft.trim() || localBusy) ? .42 : 1, boxShadow: active ? 'none' : '0 5px 13px var(--gb-brand-tint-strong)' }}
          >
            {active ? <StopIcon size={11} /> : <I.send size={12} />}
          </motion.button>
        </div>
        <div style={{ minHeight: 15, padding: '4px 3px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, color: 'var(--gb-text-muted)', fontSize: 8.5, lineHeight: 1.25, fontWeight: 550 }}>
          <span>Grounded help · no browser or customer data is sent</span>
          <span style={{ fontFamily: 'var(--gb-font-mono)', opacity: draft.length > 3200 ? 1 : .55 }}>{draft.length > 3200 ? `${draft.length}/4000` : '↵ send · ⇧↵ line'}</span>
        </div>
      </footer>
    </div>
  );
}
