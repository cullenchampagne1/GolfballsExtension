import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FloatingPanel, ModalHeader, Btn, Kbd, EmptyState, StatusBadge,
  KeyboardComposer, useComposerFilter, COMPOSER_TONE, TYPE_ICONS, I, useToast,
} from '../ui/index.js';
import { useModalTopState } from '../lib/actionRegistry.js';
import {
  buildCustomOrderNote, loadOrderNoteTemplates, subscribeToOrderNoteTemplates,
} from '../lib/quickOrderNote.js';

/* ───────────────────────────────────────────────────────────────
   QuickOrderNote — keyboard-first modal for applying an order note.

   The same shared KeyboardComposer the Quick Task / Call Log modals
   use, wired to the rep's saved order-note templates: filter and fire
   a saved note, or press / to compose one with Audience and "Push
   order dates" chips (see buildNoteSchema) over an explicit
   Subject + Note. onSubmit(template) hands the note to the caller
   (ultimately lib/submitOrderNote.js → the order iframe).
─────────────────────────────────────────────────────────────── */

function buildNoteSchema(templates) {
  const audiences = [...new Set(templates.map((t) => String(t.audienceVal || '').trim()).filter(Boolean))];
  const dayValues = [...new Set([1, 2, 3, 5, 7, 14, ...templates.map((t) => t.daysOut).filter((n) => n != null)])]
    .map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 3650).sort((a, b) => a - b);
  return {
    filterPlaceholder: 'Filter quick notes…   or / to compose',
    subjectPlaceholder: 'What should the order note say?',
    requiredKey: null,
    fromTemplate: (tpl) => ({
      ...(tpl.audienceVal ? { audience: tpl.audienceVal } : {}),
      ...(tpl.daysOut != null ? { push: String(tpl.daysOut) } : {}),
    }),
    tokenTypes: [
      {
        key: 'audience', menuLabel: 'Audience',
        options: audiences.map((value) => ({ value, label: value, tone: 'info' })),
        shorthand: (word) => audiences.find((value) => value.toLowerCase() === word) || null,
        chip: (value) => ({ tone: 'info', label: value, icon: <I.user size={11} /> }),
      },
      {
        key: 'push', menuLabel: 'Push order dates',
        options: dayValues.map((days) => ({ value: String(days), label: days === 0 ? 'Today' : `+${days} days`, tone: 'warning' })),
        shorthand: (word) => /^\+?\d+d$/.test(word) ? word.replace(/\D/g, '') : null,
        chip: (value) => ({ tone: 'warning', label: Number(value) === 0 ? 'Push today' : `Push +${value}d`, icon: <I.clock size={11} /> }),
      },
    ],
  };
}

export function QuickOrderNote({ orderId = '', onSubmit, onClosed, bindClose }) {
  const toast = useToast();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [flashId, setFlashId] = useState(null);
  const composerRef = useRef(null);
  const schema = useMemo(() => buildNoteSchema(templates), [templates]);
  const f = useComposerFilter(templates, { getText: (t) => `${t.audienceVal || ''} ${t.daysOut ?? ''}` });
  const closeRef = useRef(null);
  const handleBindClose = (fn) => { closeRef.current = fn; bindClose?.(fn); };
  const close = () => closeRef.current?.();

  useEffect(() => {
    let alive = true;
    loadOrderNoteTemplates().then((rows) => { if (alive) { setTemplates(rows); setLoading(false); } });
    const unsub = subscribeToOrderNoteTemplates((rows) => { if (alive) setTemplates(rows); });
    return () => { alive = false; unsub(); };
  }, []);

  useEffect(() => {
    const id = setTimeout(() => composerRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, []);

  const apply = async (template) => {
    if (!template || busy) return;
    if (!template.subject && !template.body) {
      toast?.warning?.(`“${template.name || 'Untitled'}” has no subject or body`);
      return;
    }
    if (!onSubmit) { toast?.error?.('Order-note submit is not wired up'); return; }
    setFlashId(template.id);
    setTimeout(() => setFlashId((id) => id === template.id ? null : id), 650);
    setBusy(true);
    try {
      const result = await onSubmit(template);
      if (result?.ok) {
        toast?.success?.(`Order note applied: ${template.name || template.subject}`, { duration: 2400 });
        close();
      } else {
        toast?.error?.(`Couldn't apply note: ${result?.error || 'unknown error'}`);
        setBusy(false);
      }
    } catch (error) {
      toast?.error?.(`Couldn't apply note: ${error?.message || error}`);
      setBusy(false);
    }
  };

  const compose = ({ tokens, subject, body }) => apply(buildCustomOrderNote({
    subject,
    body,
    audienceVal: tokens.audience || '',
    daysOut: tokens.push == null ? null : Number(tokens.push),
  }));

  const customize = (template) => composerRef.current?.loadTemplate(template);
  const modalVisible = useModalTopState('quick-order-note', 'Quick Order Note');

  const renderList = (ff) => (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px 8px' }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Order notes</span>
        {!!templates.length && <span style={{ fontSize: 10, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>{ff.results.length} of {templates.length}</span>}
      </div>
      {loading ? <ListHint>Loading templates…</ListHint>
        : !templates.length ? <BuildPrompt text="No order-note templates yet." onBuild={() => composerRef.current?.startCompose()} />
        : !ff.results.length ? <BuildPrompt text="No quick note matches." onBuild={() => composerRef.current?.startCompose()} />
        : ff.results.map((template, index) => (
          <NoteRow key={template.id || index} template={template} hotkey={index + 1}
            active={ff.active === index} flashing={flashId === template.id}
            rowRef={(el) => { ff.rowRefs.current[index] = el; }} onFocus={() => ff.setActive(index)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.shiftKey) { event.preventDefault(); customize(template); return; }
              ff.onRowKey(event, index, apply);
            }}
            onClick={() => apply(template)} onCustomize={() => customize(template)} />
        ))}
    </div>
  );

  return (
    <FloatingPanel width={480} backdrop visible={modalVisible} onClose={onClosed} bindClose={handleBindClose}>
      <ModalHeader icon={<TYPE_ICONS.note />} title="Apply order note" subtitle={orderId ? `Order #${orderId}` : 'Current order'} />
      <div style={{ display: 'flex', flexDirection: 'column', height: 'min(72vh, 600px)' }}
        onKeyDown={(event) => {
          if (event.key === '/') {
            const tag = (event.target.tagName || '').toLowerCase();
            if (tag !== 'input' && tag !== 'textarea') { event.preventDefault(); composerRef.current?.openMenu(); return; }
          }
          f.onContainerKey(event, apply);
        }}>
        <KeyboardComposer ref={composerRef} schema={schema} f={f} onLog={compose}
          onFilterEnter={apply} renderList={renderList} contact={orderId ? `Order #${orderId}` : 'Current order'}
          composeTitle="Composing an order note" subjectLabel="Subject" noteLabel="Note"
          saveLabel="Apply note" leadIcon={<TYPE_ICONS.note size={15} />}
          previewFooterMeta={<span>applies now</span>} previewReadyLabel="ready"
          previewNeedLabel="ready" previewUntitled="Untitled order note" />
      </div>
      <div style={{ padding: 12, borderTop: '1px solid var(--gb-border-subtle)', background: 'var(--gb-surface-2)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--gb-text-muted)' }}>Build a note</span><Kbd>/</Kbd>
        <span style={{ fontSize: 10.5, color: 'var(--gb-text-ghost)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Kbd>↑↓</Kbd> move · <Kbd>↵</Kbd> apply</span>
        <span style={{ flex: 1 }} />
        <Btn size="sm" variant="secondary" onClick={close} disabled={busy}>Cancel</Btn>
      </div>
    </FloatingPanel>
  );
}

function NoteRow({ template, hotkey, active, flashing, rowRef, onFocus, onKeyDown, onClick, onCustomize }) {
  const [hover, setHover] = useState(false);
  const lit = hover || active;
  const tone = template.daysOut != null ? COMPOSER_TONE.warning : COMPOSER_TONE.info;
  const secondary = template.subject && template.subject !== template.name ? template.subject : template.body;
  return (
    <button type="button" ref={rowRef} className={`clr-row${flashing ? ' clr-row-flash' : ''}`}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={onFocus}
      onKeyDown={onKeyDown} onClick={onClick}
      style={{ position: 'relative', outline: 'none', display: 'grid', gridTemplateColumns: '24px 22px 1fr auto', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: '10px 12px 10px 13px', background: active ? tone.bgMed : hover ? tone.bg : 'transparent', border: '1px solid', borderColor: active ? tone.bd : 'transparent', borderRadius: 'var(--gb-r-md)', cursor: 'pointer', fontFamily: 'var(--gb-font-sans)', '--clr-flash': tone.solid }}>
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 7, bottom: 7, width: 3, borderRadius: 3, background: tone.solid, transform: active ? 'scaleY(1)' : hover ? 'scaleY(.4)' : 'scaleY(0)', opacity: active ? 1 : hover ? .55 : 0 }} />
      <StatusBadge active={active} tone={tone}>{hotkey}</StatusBadge>
      <span style={{ display: 'flex', color: tone.fg }}><TYPE_ICONS.note size={15} /></span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--gb-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{template.name || 'Untitled'}</span>
        {!!secondary && <span style={{ display: 'block', fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{secondary}</span>}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span role="button" tabIndex={-1} title="Customise · ⇧↵" onClick={(event) => { event.stopPropagation(); onCustomize(); }}
          style={{ width: 24, height: 24, borderRadius: 'var(--gb-r-sm)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', color: 'var(--gb-text-tertiary)', cursor: 'pointer', opacity: lit ? 1 : 0, pointerEvents: lit ? 'auto' : 'none' }}><I.edit size={12} /></span>
        {!!template.audienceVal && <Pill tone={COMPOSER_TONE.info}>{template.audienceVal}</Pill>}
        {template.daysOut != null && <Pill tone={COMPOSER_TONE.warning}>+{template.daysOut}d</Pill>}
      </span>
    </button>
  );
}

const Pill = ({ tone, children }) => <span style={{ padding: '2px 7px', borderRadius: 'var(--gb-r-pill)', background: tone.bg, color: tone.fg, border: `1px solid ${tone.bd}`, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{children}</span>;
const ListHint = ({ children }) => <div style={{ padding: '14px 10px', fontSize: 11.5, color: 'var(--gb-text-muted)', textAlign: 'center', fontStyle: 'italic' }}>{children}</div>;
const BuildPrompt = ({ onBuild, text }) => <EmptyState icon={<I.edit size={20} />} title={text}><button type="button" className="clr-focusable clr-no-lift" onClick={onBuild} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', borderRadius: 'var(--gb-r-md)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}><I.plus size={13} /> Build a custom note <Kbd>↵</Kbd></button></EmptyState>;
