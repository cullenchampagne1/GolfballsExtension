import React, { useEffect, useRef, useState } from 'react';
import {
  FloatingPanel, ModalHeader,
  Btn, Kbd,
  KeyboardComposer, useComposerFilter, COMPOSER_TONE,
  Icon, I, useToast,
} from '../ui/index.js';
import {
  CALL_CATEGORY_OPTIONS,
  loadCallTemplates,
  subscribeToCallTemplates,
  getCategoryLabel,
  getCallCategoryTone,
  buildCustomTemplate,
} from '../lib/callLog.js';
import { useModalTopState } from '../lib/actionRegistry.js';

/* ───────────────────────────────────────────────────────────────
   CallLog — the redesigned, keyboard-first call logger.

   Replaces the preset grid + collapsible custom form with the shared
   KeyboardComposer (ui/components/KeyboardComposer.jsx) — the same
   one the Quick Task modal uses:

     • A filter bar over the rep's saved call templates (↑↓ walk, 1–9
       fire the Nth, Enter fires the top match).
     • Press / (or type a word like "inbound", "vm", or a category) and
       the bar grows into a keyboard-only composer. Category, Direction
       and a Voicemail flag become coloured chips via the / menu;
       Subject + Note are explicit fields; a live preview mirrors the
       activity log as it's built.

   Both paths fund the same onSubmit(template) prop, so the CRM
   activity-log POST (src/lib/callLog.js + submit pipeline) is
   unchanged. Category is the real CRM enum.

   Props
     contactName  string                 display name (header)
     contactType  'contact' | 'account'  (informational)
     phone        string                 number dialed; shown in subtitle
     onSubmit     (template) => Promise<{ ok, error? }>   REQUIRED
     onClosed     () => void
     bindClose    (fn) => void
─────────────────────────────────────────────────────────────── */

const Inbound  = (p) => <Icon {...p}><polyline points="7 17 17 7" /><polyline points="7 7 17 7 17 17" /></Icon>;
const Outbound = (p) => <Icon {...p}><polyline points="17 7 7 17" /><polyline points="17 17 7 17 7 7" /></Icon>;
const Voicemail = (p) => <Icon {...p}><circle cx="6" cy="14" r="3.2" /><circle cx="18" cy="14" r="3.2" /><path d="M6 17.2h12" /></Icon>;

const dirGlyph = (tpl) => (tpl.callVoicemail ? <Voicemail size={15} /> : tpl.callDirection === 1 ? <Inbound size={15} /> : <Outbound size={15} />);

/* Schema for the composer's / menu: real Category enum + Direction + a
   Voicemail flag. Tokens carry string ids (category / direction) and a
   boolean (vm) that map straight onto the call template shape. */
function buildCallSchema() {
  const catOptions = CALL_CATEGORY_OPTIONS
    .filter((o) => o.id !== '0')
    .map((o) => ({ value: o.id, label: o.label, tone: getCallCategoryTone(o.id) }));
  const catMap = {};
  catOptions.forEach((o) => {
    catMap[o.label.toLowerCase()] = o.value;
    catMap[o.label.toLowerCase().split(/[ /]/)[0]] = o.value;
  });
  const DIR = { in: '1', inbound: '1', incoming: '1', out: '0', outbound: '0', outgoing: '0', call: '0' };
  const VM = new Set(['vm', 'voicemail', 'vmail']);
  const dot = (tone) => <span style={{ width: 7, height: 7, borderRadius: '50%', background: (COMPOSER_TONE[tone] || COMPOSER_TONE.neutral).solid, display: 'inline-block' }} />;

  return {
    filterPlaceholder: 'Filter call templates…   or / to compose',
    subjectPlaceholder: 'What was the call about?',
    requiredKey: 'category',
    fromTemplate: (tpl) => {
      const t = { direction: String(tpl.callDirection || 0) };
      if (tpl.callCategory) t.category = String(tpl.callCategory);
      if (tpl.callVoicemail) t.vm = true;
      return t;
    },
    tokenTypes: [
      {
        key: 'category', menuLabel: 'Category', options: catOptions, shorthand: (w) => catMap[w] || null,
        chip: (v) => ({ tone: getCallCategoryTone(v), label: getCategoryLabel(v) || 'Category', icon: dot(getCallCategoryTone(v)) }),
      },
      {
        key: 'direction', menuLabel: 'Direction', shorthand: (w) => DIR[w] || null,
        options: [
          { value: '0', label: 'Outbound', tone: 'brand', icon: <Outbound size={12} /> },
          { value: '1', label: 'Inbound', tone: 'brand', icon: <Inbound size={12} /> },
        ],
        chip: (v) => ({ tone: 'brand', label: v === '1' ? 'Inbound' : 'Outbound', icon: v === '1' ? <Inbound size={12} /> : <Outbound size={12} /> }),
      },
      {
        key: 'vm', menuLabel: 'Flag', shorthand: (w) => (VM.has(w) ? true : null),
        options: [{ value: true, label: 'Left voicemail', tone: 'warning', icon: <Voicemail size={12} /> }],
        chip: () => ({ tone: 'warning', label: 'Voicemail', icon: <Voicemail size={12} /> }),
      },
    ],
  };
}

export function CallLog({
  contactName = 'Contact',
  contactType = 'contact',
  phone = '',
  onSubmit,
  onClosed,
  bindClose,
}) {
  void contactType;
  const toast = useToast();
  const schema = React.useMemo(() => buildCallSchema(), []);

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [flashId, setFlashId] = useState(null);

  const composerRef = useRef(null);
  const f = useComposerFilter(templates, { getText: (t) => getCategoryLabel(t.callCategory) });

  const bindCloseRef = useRef(null);
  const handleBindClose = (fn) => { bindCloseRef.current = fn; if (bindClose) bindClose(fn); };
  const animatedClose = () => bindCloseRef.current?.();

  const modalVisible = useModalTopState('call-log', 'Call Log');

  useEffect(() => {
    let alive = true;
    loadCallTemplates().then((t) => { if (!alive) return; setTemplates(t); setLoading(false); });
    const unsub = subscribeToCallTemplates((next) => { if (alive) setTemplates(next); });
    return () => { alive = false; unsub(); };
  }, []);

  useEffect(() => {
    const id = setTimeout(() => composerRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, []);

  const fireTemplate = async (tpl) => {
    if (!tpl || busy) return;
    if (!tpl.callCategory) {
      toast?.error?.(`"${tpl.name}" has no category. Open Note Templates and pick one.`);
      return;
    }
    if (!onSubmit) { toast?.error?.('Call-log submit is not wired up'); return; }
    setFlashId(tpl.id); setTimeout(() => setFlashId((id) => (id === tpl.id ? null : id)), 650);
    setBusy(true);
    try {
      const result = await onSubmit(tpl);
      if (result?.ok) { toast?.success?.(`Logged: ${tpl.name}`, { duration: 2200 }); animatedClose(); }
      else { toast?.error?.(`Couldn't log call: ${result?.error || 'unknown error'}`); setBusy(false); }
    } catch (err) { toast?.error?.(`Couldn't log call: ${err?.message || err}`); setBusy(false); }
  };

  const logComposed = async ({ tokens, subject, body }) => {
    if (busy) return;
    if (!onSubmit) { toast?.error?.('Call-log submit is not wired up'); return; }
    const synthetic = buildCustomTemplate({
      subject, body,
      callDirection: parseInt(tokens.direction ?? '0', 10) || 0,
      callCategory: parseInt(tokens.category, 10) || 0,
      callVoicemail: !!tokens.vm,
    });
    setBusy(true);
    try {
      const result = await onSubmit(synthetic);
      if (result?.ok) { toast?.success?.('Call logged', { duration: 2200 }); animatedClose(); }
      else { toast?.error?.(`Couldn't log call: ${result?.error || 'unknown error'}`); setBusy(false); }
    } catch (err) { toast?.error?.(`Couldn't log call: ${err?.message || err}`); setBusy(false); }
  };

  const customise = (tpl) => composerRef.current?.loadTemplate({ ...tpl, subject: tpl.subject || tpl.name, body: tpl.body || '' });

  const renderList = (ff) => (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px 8px' }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Quick log</span>
        {templates.length > 0 && <span style={{ fontSize: 10, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>{ff.results.length} of {templates.length}</span>}
      </div>
      {loading ? (
        <ListHint>Loading templates…</ListHint>
      ) : templates.length === 0 ? (
        <BuildPrompt onBuild={() => composerRef.current?.openMenu()} text="No call templates yet." />
      ) : ff.results.length === 0 ? (
        <BuildPrompt onBuild={() => composerRef.current?.openMenu()} text="No template matches." />
      ) : (
        ff.results.map((tpl, i) => (
          <CommandRow
            key={tpl.id} tpl={tpl} hotkey={i + 1}
            isActive={ff.active === i} flashing={flashId === tpl.id}
            rowRef={(el) => (ff.rowRefs.current[i] = el)}
            onFocus={() => ff.setActive(i)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); customise(tpl); return; }
              if (e.key === 'Tab') return;
              ff.onRowKey(e, i, fireTemplate);
            }}
            onClick={() => fireTemplate(tpl)}
            onCustomise={customise}
          />
        ))
      )}
    </div>
  );

  return (
    <FloatingPanel
      width={480}
      backdrop
      draggable
      visible={modalVisible}
      onClose={onClosed}
      bindClose={handleBindClose}
    >
      <ModalHeader
        icon={<I.phone />}
        title="Log call"
        subtitle={`${contactName}${phone ? ' · ' + phone : ''}`}
      />

      <div
        style={{ display: 'flex', flexDirection: 'column', height: 'min(72vh, 600px)' }}
        onKeyDown={(e) => {
          if (e.key === '/') {
            const tag = (e.target.tagName || '').toLowerCase();
            if (tag !== 'input' && tag !== 'textarea') { e.preventDefault(); composerRef.current?.openMenu(); return; }
          }
          f.onContainerKey(e, fireTemplate);
        }}
      >
        <KeyboardComposer
          ref={composerRef}
          schema={schema}
          f={f}
          onLog={logComposed}
          onFilterEnter={fireTemplate}
          renderList={renderList}
          contact={contactName}
          composeTitle="Composing a custom log"
          subjectLabel="Subject"
          noteLabel="Note"
          saveLabel="Save"
          leadIcon={<I.phone size={15} />}
          previewFooterMeta={<span>logs now</span>}
          previewReadyLabel="ready"
          previewNeedLabel="needs category"
          previewUntitled="Untitled call"
        />
      </div>

      <div style={{
        padding: 12,
        borderTop: '1px solid var(--gb-border-subtle)',
        background: 'var(--gb-surface-2)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {phone ? `Dialed ${phone} via tel:` : 'Log a call'}
        </span>
        <Kbd>/</Kbd>
        <span style={{ fontSize: 10.5, color: 'var(--gb-text-ghost)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Kbd>↑↓</Kbd> move · <Kbd>↵</Kbd> log
        </span>
        <span style={{ flex: 1 }} />
        <Btn size="sm" variant="secondary" onClick={animatedClose} disabled={busy}>Cancel</Btn>
      </div>
    </FloatingPanel>
  );
}

/* ── Preset row — scannable: hotkey · dir glyph · name/subject · category. */
function CommandRow({ tpl, hotkey, isActive, flashing, rowRef, onFocus, onKeyDown, onClick, onCustomise }) {
  const [hover, setHover] = useState(false);
  const lit = hover || isActive;
  const tone = COMPOSER_TONE[getCallCategoryTone(tpl.callCategory)] || COMPOSER_TONE.neutral;
  const catLabel = getCategoryLabel(tpl.callCategory);
  const secondary = (tpl.subject && tpl.subject !== tpl.name) ? tpl.subject : (tpl.body || '');

  return (
    <button
      type="button" ref={rowRef} className={`clr-row${flashing ? ' clr-row-flash' : ''}`}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onKeyDown={onKeyDown} onFocus={onFocus} onClick={onClick}
      style={{
        position: 'relative', outline: 'none', display: 'grid', gridTemplateColumns: '24px 22px 1fr auto',
        alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: '10px 12px 10px 13px',
        background: isActive ? tone.bgMed : hover ? tone.bg : 'transparent',
        border: '1px solid', borderColor: isActive ? tone.bd : 'transparent',
        borderRadius: 'var(--gb-r-md)', cursor: 'pointer', fontFamily: 'var(--gb-font-sans)',
        transition: 'background .15s ease, border-color .15s ease', '--clr-flash': tone.solid,
      }}
    >
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 7, bottom: 7, width: 3, borderRadius: 3, background: tone.solid, transform: isActive ? 'scaleY(1)' : hover ? 'scaleY(.4)' : 'scaleY(0)', opacity: isActive ? 1 : hover ? 0.55 : 0, boxShadow: isActive ? `0 0 8px ${tone.solid}` : 'none', transition: 'transform .2s cubic-bezier(.34,1.4,.64,1), opacity .18s ease' }} />
      <span style={{ display: 'flex', justifyContent: 'center' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 17, height: 17, padding: '0 4px', borderRadius: 4, fontSize: 9.5, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', background: isActive ? tone.bgMed : 'var(--gb-fill-inverse-medium)', border: `1px solid ${isActive ? tone.bd : 'var(--gb-border-default)'}`, color: isActive ? tone.fg : 'var(--gb-text-tertiary)', transition: 'all .15s' }}>{hotkey}</span>
      </span>
      <span style={{ display: 'flex', justifyContent: 'center', color: tone.fg }}>{dirGlyph(tpl)}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--gb-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tpl.name || 'Untitled'}</span>
        {secondary && <span style={{ display: 'block', fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{secondary}</span>}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span role="button" tabIndex={-1} title="Customise · ⇧↵" onClick={(e) => { e.stopPropagation(); onCustomise(tpl); }}
          style={{ width: 24, height: 24, borderRadius: 'var(--gb-r-sm)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', color: 'var(--gb-text-tertiary)', cursor: 'pointer', opacity: lit ? 1 : 0, transform: lit ? 'none' : 'translateX(4px)', pointerEvents: lit ? 'auto' : 'none', transition: 'opacity .15s, transform .15s' }}><I.edit size={12} /></span>
        {tpl.callVoicemail && <Voicemail size={13} style={{ color: COMPOSER_TONE.warning.fg, flexShrink: 0 }} />}
        {catLabel && <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: 'var(--gb-r-pill)', background: tone.bg, color: tone.fg, border: `1px solid ${tone.bd}`, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{catLabel}</span>}
      </span>
    </button>
  );
}

function ListHint({ children }) {
  return <div style={{ padding: '14px 10px', fontSize: 11.5, color: 'var(--gb-text-muted)', textAlign: 'center', fontStyle: 'italic' }}>{children}</div>;
}

function BuildPrompt({ onBuild, text }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '24px 16px', textAlign: 'center' }}>
      <I.search size={20} style={{ color: 'var(--gb-text-ghost)' }} />
      <div style={{ fontSize: 12, color: 'var(--gb-text-tertiary)', fontWeight: 600 }}>{text}</div>
      <button type="button" className="clr-focusable clr-no-lift" onClick={onBuild}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', borderRadius: 'var(--gb-r-md)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
        <I.plus size={13} /> Build a custom log <Kbd>↵</Kbd>
      </button>
    </div>
  );
}
