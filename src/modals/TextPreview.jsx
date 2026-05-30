import React, { useState, useCallback, useMemo } from 'react';
import { FloatingPanel, IconBtn, Tag, I, Icon } from '../ui/index.js';
import { CategorizeRail } from '../ui/components/CategorizeRail.jsx';
import { categorySections } from '../lib/caseMatch.js';
import { useModalTopState } from '../lib/actionRegistry.js';

/* ───────────────────────────────────────────────────────────────
   TextPreview — read-only chat-transcript viewer (React port of the
   "Chat Preview" design + the legacy src/vanilla/modals/text-preview.js).

   Renders the parsed transcript (visitor / agent / system / link /
   note bubbles from lib/parseChat.js) on the left. In CASE mode the
   SAME categorize rail the email modal uses appears on the right —
   minus the reply template dropdown + send (no topSlot). A Case /
   Notes header toggle flips the rail on and off.

   Props
     transcript   { caseId, subject?, title?, messages[] }
     defaultCase  open in case mode (rail shown)
     recommended  [{ category, subcategory, label? }] for the ✦ rail
     applyState   null | 'saving' | { category, subcategory }
     onApplyCategory(category, subcategory)
     onClosed, bindClose
─────────────────────────────────────────────────────────────── */

const ChatIcon = (p) => <Icon {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Icon>;

/* Initials avatar in a hue-stable circle (the parser exposes no
   colour, so the hue is hashed from the name — stable per sender). */
function Avatar({ name, hue = 110, size = 28 }) {
  const initials = (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%',
      background: `oklch(0.30 0.07 ${hue})`, color: `oklch(0.86 0.10 ${hue})`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', letterSpacing: -0.3,
      flexShrink: 0, border: '1px solid color-mix(in srgb, currentColor 30%, transparent)',
    }}>{initials}</span>
  );
}

function hueFromName(name) {
  if (!name) return 110;
  if (/^visitor$/i.test(name)) return 200;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return 60 + (Math.abs(h) % 220);
}

function ChatBubble({ msg, prev }) {
  if (msg.kind === 'system') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />
        <span style={{
          padding: '3px 10px', borderRadius: 'var(--gb-r-pill)',
          background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)',
          fontSize: 10, fontWeight: 600, letterSpacing: 0.3, color: 'var(--gb-text-muted)',
          fontFamily: 'var(--gb-font-mono)', whiteSpace: 'nowrap',
        }}>{msg.body}{msg.time ? ` · ${msg.time}` : ''}</span>
        <div style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />
      </div>
    );
  }

  if (msg.kind === 'link') {
    const url = (msg.body.match(/https?:\/\/\S+/) || [''])[0];
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />
        <a href={url || '#'} target="_blank" rel="noopener noreferrer" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
          background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)',
          color: 'var(--gb-brand-label)', borderRadius: 'var(--gb-r-pill)',
          fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, fontFamily: 'var(--gb-font-mono)',
          textDecoration: 'none', whiteSpace: 'nowrap',
        }}><I.bolt size={10} /> View full transcript on SnapEngage</a>
        <div style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />
      </div>
    );
  }

  if (msg.kind === 'note') {
    return (
      <div style={{
        margin: '10px 0', padding: '9px 12px',
        background: 'var(--gb-warning-tint-soft)', border: '1px solid var(--gb-warning-tint-border)',
        borderRadius: 'var(--gb-r-md)', fontSize: 12, lineHeight: 1.55, color: 'var(--gb-text-secondary)',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--gb-warning-fg)', marginRight: 8 }}>Note</span>
        {msg.body}
      </div>
    );
  }

  const isAgent = msg.kind === 'agent';
  const hue = hueFromName(msg.name);
  const samePrev = prev && prev.kind === msg.kind && prev.name === msg.name && prev.kind !== 'system' && prev.kind !== 'link' && prev.kind !== 'note';

  return (
    <div style={{ display: 'flex', flexDirection: isAgent ? 'row-reverse' : 'row', gap: 10, marginTop: samePrev ? 2 : 12, maxWidth: '100%' }}>
      <div style={{ width: 28, flexShrink: 0 }}>{!samePrev && <Avatar name={msg.name} hue={hue} size={28} />}</div>
      <div style={{ maxWidth: 'min(76%, 560px)', display: 'flex', flexDirection: 'column', alignItems: isAgent ? 'flex-end' : 'flex-start' }}>
        {!samePrev && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 10.5, color: 'var(--gb-text-muted)', marginBottom: 3 }}>
            <span style={{ fontWeight: 700, color: 'var(--gb-text-secondary)' }}>{msg.name}</span>
            <span style={{ fontFamily: 'var(--gb-font-mono)' }}>{msg.time}</span>
          </div>
        )}
        <div style={{
          padding: '9px 14px', fontSize: 12.5, lineHeight: 1.55,
          borderRadius: isAgent
            ? `var(--gb-r-md) var(--gb-r-md) ${samePrev ? 'var(--gb-r-md)' : 'var(--gb-r-xs)'} var(--gb-r-md)`
            : `var(--gb-r-md) var(--gb-r-md) var(--gb-r-md) ${samePrev ? 'var(--gb-r-md)' : 'var(--gb-r-xs)'}`,
          background: isAgent ? 'color-mix(in srgb, var(--gb-brand-label) 10%, var(--gb-surface-1))' : 'var(--gb-surface-2)',
          border: '1px solid ' + (isAgent ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-subtle)'),
          color: 'var(--gb-text-primary)', boxShadow: '0 2px 8px -4px rgba(0,0,0,.25)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>{msg.body}</div>
      </div>
    </div>
  );
}

function Transcript({ messages }) {
  const visibleCount = messages.filter((m) => m.kind === 'visitor' || m.kind === 'agent').length;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>
        <span>Conversation</span>
        <span style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />
        <span style={{ fontFamily: 'var(--gb-font-mono)', letterSpacing: 0, textTransform: 'none', color: 'var(--gb-text-tertiary)', fontWeight: 600 }}>
          {visibleCount} message{visibleCount === 1 ? '' : 's'} parsed
        </span>
      </div>
      {messages.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--gb-text-muted)', fontSize: 12, marginTop: 40 }}>No transcript or notes found for this case.</div>
      ) : messages.map((msg, i) => <ChatBubble key={i} msg={msg} prev={messages[i - 1]} />)}
      {messages.length > 0 && (
        <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--gb-text-ghost)', justifyContent: 'center' }}>
          <span style={{ width: 24, height: 1, background: 'var(--gb-border-subtle)' }} />
          <span>End of transcript</span>
          <span style={{ width: 24, height: 1, background: 'var(--gb-border-subtle)' }} />
        </div>
      )}
    </div>
  );
}

function HeaderBar({ transcript, showCaseBadge, viewMode, onViewModeChange, onClose }) {
  return (
    <div style={{ padding: '14px 22px', background: 'var(--gb-fill-inverse-strong)', borderBottom: '1px solid var(--gb-border-default)', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
      <div style={{ width: 36, height: 36, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <ChatIcon size={15} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 14.5, fontWeight: 800, letterSpacing: -0.2, color: 'var(--gb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 660 }}>{transcript.title || 'Live Chat Transcript'}</span>
          <Tag size="xs" tone="neutral">READ-ONLY</Tag>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--gb-font-mono)' }}>
          {showCaseBadge && transcript.caseId && (
            <span style={{ padding: '1px 7px', borderRadius: 4, background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }}>{transcript.caseId}</span>
          )}
          {transcript.subject
            ? <span style={{ color: 'var(--gb-text-secondary)', fontFamily: 'var(--gb-font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{transcript.subject}</span>
            : <span style={{ fontFamily: 'var(--gb-font-sans)' }}>No subject on the source row</span>}
        </div>
      </div>
      <IconBtn size="sm" variant="ghost" icon={<I.copy />} tooltip="Copy transcript" />
      {viewMode && onViewModeChange && (
        <div style={{ display: 'inline-flex', alignItems: 'center', padding: 3, gap: 2, background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', flexShrink: 0 }}>
          {[{ id: 'case', label: 'Case' }, { id: 'notes', label: 'Notes' }].map((m) => {
            const on = viewMode === m.id;
            return (
              <button key={m.id} type="button" onClick={() => onViewModeChange(m.id)} style={{
                padding: '0 10px', height: 24, border: 'none', cursor: 'pointer',
                background: on ? 'var(--gb-brand-tint-medium)' : 'transparent',
                color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)',
                fontSize: 11, fontWeight: 700, letterSpacing: 0.3, fontFamily: 'var(--gb-font-sans)', borderRadius: 'var(--gb-r-sm)',
              }}>{m.label}</button>
            );
          })}
        </div>
      )}
      <IconBtn size="md" icon={<I.close />} onClick={onClose} />
    </div>
  );
}

export function TextPreview({
  transcript = { messages: [] },
  defaultCase = false,
  recommended = [],
  applyState,
  onApplyCategory,
  onClosed,
  bindClose,
}) {
  const [viewMode, setViewMode] = useState(defaultCase ? 'case' : 'notes');
  const isCase = viewMode === 'case';
  const [focused, setFocused] = useState(null);
  const sections = useMemo(() => categorySections(), []);
  const applied = applyState && applyState.category ? applyState : null;

  const closeRef = React.useRef(null);
  const requestClose = () => closeRef.current?.();

  const apply = useCallback((category, subcategory) => onApplyCategory?.(category, subcategory), [onApplyCategory]);

  const modalVisible = useModalTopState('text-preview', 'Chat Preview');
  const messages = transcript.messages || [];

  return (
    <FloatingPanel
      draggable={false}
      backdrop
      width={isCase ? 1280 : 880}
      maxHeight={900}
      visible={modalVisible}
      onClose={onClosed}
      bindClose={(fn) => { closeRef.current = fn; bindClose?.(fn); }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: 'min(840px, calc(100vh - 48px))', background: 'var(--gb-surface-canvas)', color: 'var(--gb-text-secondary)', overflow: 'hidden' }}>
        <HeaderBar
          transcript={transcript}
          showCaseBadge={isCase}
          viewMode={defaultCase ? viewMode : null}
          onViewModeChange={defaultCase ? setViewMode : null}
          onClose={requestClose}
        />

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* LEFT — transcript */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: isCase ? '1px solid var(--gb-border-default)' : 'none' }}>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '18px 22px 28px' }}>
              <Transcript messages={messages} />
            </div>
            <div style={{ padding: '9px 18px', borderTop: '1px solid var(--gb-border-default)', background: 'var(--gb-surface-1)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, fontSize: 11, color: 'var(--gb-text-muted)' }}>
              <Tag size="xs" tone="neutral">VIEW ONLY</Tag>
              <span>{messages.filter((m) => m.kind === 'visitor' || m.kind === 'agent').length} parsed messages · replies happen in SnapEngage</span>
              <div style={{ flex: 1 }} />
              {transcript.caseId && <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 10.5 }}>{transcript.caseId}</span>}
            </div>
          </div>

          {/* RIGHT — the SAME categorize rail as the email modal, minus
              the reply dropdown + send (no topSlot). */}
          {isCase && (
            <CategorizeRail
              sections={sections}
              recommended={recommended}
              applied={applied}
              focused={focused}
              onFocus={setFocused}
              onApply={apply}
            />
          )}
        </div>
      </div>
    </FloatingPanel>
  );
}
