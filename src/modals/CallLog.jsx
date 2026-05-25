import React, { useEffect, useRef, useState } from 'react';
import {
  FloatingPanel, ModalHeader,
  Btn, Dropdown, Input, Textarea, Segmented, Field, SectionLabel,
  I, Icon, useToast,
} from '../ui/index.js';
import {
  CALL_CATEGORY_OPTIONS,
  CALL_DIRECTION_OPTIONS,
  loadCallTemplates,
  subscribeToCallTemplates,
  getCategoryLabel,
  buildCustomTemplate,
} from '../lib/callLog.js';

/* ───────────────────────────────────────────────────────────────
   CallLog — quick-action modal for logging an outbound (or
   inbound) sales call.

   The presets at the top come straight from the user's
   `noteTemplates` (subType === 'call_log', enabled !== false),
   the same list the rep edits in the Notes editor. Clicking a
   preset fires the parent's `onSubmit(template)` — which is
   wired to the CRM activity-log POST (Page=272) in production,
   or mocked in the playground.

   The "Custom log" section below is for cases where no preset
   fits. It exposes the SAME fields a saved template has:
     • Direction  (Outbound / Inbound)
     • Category   (CRM enum picker — same 25 options as the editor)
     • Subject    (activity subject)
     • Description (activity body)
     • Voicemail flag

   Save builds a synthetic template (`custom-<ts>` id, otherwise
   shape-identical to a stored template) and runs it through the
   same `onSubmit` pipe so the CRM call doesn't care whether the
   activity came from a preset or a one-off.

   Props
     contactName  string         — display name (header + log target)
     contactType  'contact' | 'account'
     phone        string         — number being dialed; shown for confirmation
     onSubmit     (template) => Promise<{ ok, error? }>
                                  — REQUIRED. Submits a template to the CRM.
                                    Same fn is called for preset clicks +
                                    custom saves; the caller decides where
                                    the bytes go.
     onClosed     () => void     — fires after the close animation finishes
     bindClose    (fn) => void   — exposes the animated-close fn to parent
─────────────────────────────────────────────────────────────── */

/* Direction-icon helpers. Inbound = the curving arrow pointing TO
   you, outbound = away from you. Matches the convention in
   src/pages/NoteEditor.jsx's NIcons map so users see the same
   glyph in the editor + the modal. */
const Inbound  = (p) => (<Icon {...p}><polyline points="7 17 17 7"/><polyline points="7 7 17 7 17 17"/></Icon>);
const Outbound = (p) => (<Icon {...p}><polyline points="17 7 7 17"/><polyline points="17 17 7 17 7 7"/></Icon>);
/* Voicemail cassette — matches the legacy quick-action panel icon so a
   rep recognizes "this preset is a voicemail one" at a glance. */
const Voicemail = (p) => (
  <Icon {...p}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <circle cx="8" cy="12" r="2" />
    <circle cx="16" cy="12" r="2" />
    <path d="M10 12h4" />
  </Icon>
);

export function CallLog({
  contactName = 'Contact',
  contactType = 'contact',
  phone = '',
  onSubmit,
  onClosed,
  bindClose,
}) {
  const toast = useToast();

  /* ── Preset templates loaded from storage ──────────────────────── */
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  /* busyId = the id of the template row currently submitting; used to
     show a spinner on that row and disable siblings so a frantic rep
     can't fire two CRM POSTs from one modal session. */
  const [busyId, setBusyId] = useState(null);

  /* ── Custom log form state ─────────────────────────────────────── */
  const [direction, setDirection] = useState(0);   // 0 = Outbound (default)
  const [category, setCategory]   = useState(0);   // CRM enum id; 0 = unset
  const [subject, setSubject]     = useState('');
  const [body, setBody]           = useState('');
  const [voicemail, setVoicemail] = useState(false);
  const [savingCustom, setSavingCustom] = useState(false);

  /* FloatingPanel animated-close bridge — lets internal handlers run
     the proper close transition rather than unmounting outright. */
  const bindCloseRef = useRef(null);
  const handleBindClose = (fn) => {
    bindCloseRef.current = fn;
    if (bindClose) bindClose(fn);
  };
  const animatedClose = () => bindCloseRef.current?.();

  /* Load templates on mount + subscribe to live edits. If the rep
     edits their templates in the Notes editor while the modal is
     open, the list updates without remount. */
  useEffect(() => {
    let alive = true;
    loadCallTemplates().then((t) => {
      if (!alive) return;
      setTemplates(t);
      setLoading(false);
    });
    const unsub = subscribeToCallTemplates((next) => { if (alive) setTemplates(next); });
    return () => { alive = false; unsub(); };
  }, []);

  /* Pick a preset — submit it to the CRM via onSubmit, toast the
     outcome, close on success. Guarded so a misconfigured template
     (no category) gets a clear error instead of a CRM rejection. */
  const handlePresetClick = async (tpl) => {
    if (busyId) return;
    if (!tpl.callCategory) {
      toast?.error?.(`"${tpl.name}" has no category. Open Note Templates and pick one.`);
      return;
    }
    if (!onSubmit) {
      toast?.error?.('Call-log submit is not wired up');
      return;
    }
    setBusyId(tpl.id);
    try {
      const result = await onSubmit(tpl);
      if (result?.ok) {
        toast?.success?.(`Logged: ${tpl.name}`, { duration: 2200 });
        animatedClose();
      } else {
        toast?.error?.(`Couldn't log call: ${result?.error || 'unknown error'}`);
        setBusyId(null);
      }
    } catch (err) {
      toast?.error?.(`Couldn't log call: ${err?.message || err}`);
      setBusyId(null);
    }
  };

  /* Submit the custom form. Builds a synthetic template with the
     same shape stored templates have so the onSubmit handler doesn't
     have to branch — it just sees a Template and POSTs it. */
  const handleCustomSubmit = async () => {
    if (savingCustom || busyId) return;
    if (!category) {
      toast?.warning?.('Pick a category before saving');
      return;
    }
    if (!subject.trim() && !body.trim()) {
      toast?.warning?.('Add a subject or description');
      return;
    }
    if (!onSubmit) {
      toast?.error?.('Call-log submit is not wired up');
      return;
    }
    setSavingCustom(true);
    const synthetic = buildCustomTemplate({
      subject, body,
      callDirection: direction,
      callCategory: category,
      callVoicemail: voicemail,
    });
    try {
      const result = await onSubmit(synthetic);
      if (result?.ok) {
        toast?.success?.('Call logged', { duration: 2200 });
        animatedClose();
      } else {
        toast?.error?.(`Couldn't log call: ${result?.error || 'unknown error'}`);
        setSavingCustom(false);
      }
    } catch (err) {
      toast?.error?.(`Couldn't log call: ${err?.message || err}`);
      setSavingCustom(false);
    }
  };

  const anyBusy = !!busyId || savingCustom;

  return (
    <FloatingPanel
      width={480}
      backdrop
      draggable
      onClose={onClosed}
      bindClose={handleBindClose}
    >
      <ModalHeader
        icon={<I.phone />}
        title="Log call"
        subtitle={`${contactName}${phone ? ' · ' + phone : ''}`}
      />

      <div style={{
        padding: 14,
        display: 'flex', flexDirection: 'column', gap: 14,
        maxHeight: '72vh', overflowY: 'auto',
      }}>
        {/* ── Quick log — rows pulled from noteTemplates ──── */}
        <div>
          <SectionLabel>Quick log</SectionLabel>
          {loading ? (
            <EmptyHint>Loading templates…</EmptyHint>
          ) : templates.length === 0 ? (
            <EmptyHint>
              No call templates configured. Open the Notes editor to add one.
            </EmptyHint>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
              {templates.map((tpl) => (
                <PresetRow
                  key={tpl.id}
                  tpl={tpl}
                  busy={busyId === tpl.id}
                  disabled={anyBusy && busyId !== tpl.id}
                  onPick={() => handlePresetClick(tpl)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── "or" divider ─────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          color: 'var(--gb-text-muted)',
          fontSize: 9.5, fontWeight: 700, letterSpacing: 1,
          textTransform: 'uppercase',
        }}>
          <span style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />
          <span>or custom</span>
          <span style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />
        </div>

        {/* ── Custom log — same fields a saved template has ── */}
        <div>
          <SectionLabel>Custom log</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="Direction">
                <Segmented
                  size="sm"
                  value={String(direction)}
                  onChange={(v) => setDirection(parseInt(v, 10) | 0)}
                  options={CALL_DIRECTION_OPTIONS.map((o) => ({
                    ...o,
                    icon: o.id === '1' ? <Inbound /> : <Outbound />,
                  }))}
                  full
                />
              </Field>
              <Field label="Category" required>
                <Dropdown
                  size="sm" searchable
                  value={String(category)}
                  options={CALL_CATEGORY_OPTIONS}
                  placeholder="Select category…"
                  onChange={(v) => setCategory(parseInt(v, 10) || 0)}
                />
              </Field>
            </div>

            <Field label="Subject">
              <Input
                size="sm"
                value={subject}
                onChange={setSubject}
                placeholder="Brief subject for the activity log…"
              />
            </Field>

            <Field label="Description">
              <Textarea
                value={body}
                onChange={setBody}
                placeholder="What happened on the call…"
                rows={4}
                resize="vertical"
              />
            </Field>

            {/* Voicemail toggle — small inline pill, same flag the
                CRM expects on the Page=272 form (`Voicemail=on`). */}
            <VoicemailToggle on={voicemail} onChange={setVoicemail} />
          </div>
        </div>
      </div>

      {/* ── Footer — left: phone context, right: actions ─── */}
      <div style={{
        padding: 12,
        borderTop: '1px solid var(--gb-border-subtle)',
        background: 'var(--gb-surface-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <span style={{
          fontSize: 10.5, color: 'var(--gb-text-muted)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {phone ? `Dialed ${phone} via tel:` : 'No phone — log only'}
        </span>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <Btn size="sm" variant="secondary" onClick={animatedClose} disabled={anyBusy}>Cancel</Btn>
          <Btn size="sm" variant="primary"   onClick={handleCustomSubmit} disabled={anyBusy}>
            {savingCustom ? 'Saving…' : 'Save custom log'}
          </Btn>
        </div>
      </div>
    </FloatingPanel>
  );
}

/* ── Helpers / sub-components ─────────────────────────────── */

function EmptyHint({ children }) {
  return (
    <div style={{
      padding: '12px 10px', marginTop: 6,
      fontSize: 11, color: 'var(--gb-text-muted)',
      background: 'var(--gb-fill-subtle)',
      border: '1px dashed var(--gb-border-default)',
      borderRadius: 'var(--gb-r-sm)',
      textAlign: 'center', fontStyle: 'italic',
    }}>{children}</div>
  );
}

/* Single preset row. Shows the template's:
     • voicemail-or-phone icon tile (left)
     • template name + category-label hint (middle)
     • direction tag (IN / OUT) + chevron-or-spinner (right)

   Disabled state dims + blocks clicks when a sibling row is mid-
   submit. Busy state replaces the chevron with a spinner so the
   rep sees which row is firing. */
function PresetRow({ tpl, busy, disabled, onPick }) {
  const [hover, setHover] = useState(false);
  const dirLabel = tpl.callDirection === 1 ? 'IN' : 'OUT';
  const catLabel = getCategoryLabel(tpl.callCategory);
  const Glyph = tpl.callVoicemail ? Voicemail : I.phone;

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onPick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '28px 1fr auto 14px',
        alignItems: 'center',
        gap: 9,
        padding: '8px 10px',
        background: hover && !disabled && !busy ? 'var(--gb-fill-soft)' : 'transparent',
        border: '1px solid ' + (hover && !disabled && !busy ? 'var(--gb-border-default)' : 'transparent'),
        borderRadius: 'var(--gb-r-sm)',
        cursor: (disabled || busy) ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        textAlign: 'left',
        fontFamily: 'var(--gb-font-sans)',
        transition: 'background var(--gb-anim-fast), border-color var(--gb-anim-fast)',
      }}
    >
      <span style={{
        width: 28, height: 28, borderRadius: 'var(--gb-r-sm)',
        background: 'var(--gb-brand-tint-soft)',
        border: '1px solid var(--gb-brand-tint-border)',
        color: 'var(--gb-brand-label)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Glyph size={13} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{
          fontSize: 12.5, fontWeight: 600,
          color: 'var(--gb-text-primary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{tpl.name || 'Untitled'}</span>
        {catLabel && (
          <span style={{
            fontSize: 10.5, color: 'var(--gb-text-muted)', fontWeight: 500,
            marginTop: 1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{catLabel}{tpl.callVoicemail ? ' · voicemail' : ''}</span>
        )}
      </span>
      <span style={{
        fontSize: 9, fontWeight: 700, letterSpacing: 0.4,
        textTransform: 'uppercase',
        padding: '1px 6px',
        borderRadius: 999,
        background: 'var(--gb-fill-subtle)',
        border: '1px solid var(--gb-border-default)',
        color: 'var(--gb-text-tertiary)',
      }}>{dirLabel}</span>
      <span style={{
        color: hover && !disabled && !busy ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
        display: 'flex',
      }}>
        {busy ? <RowSpinner /> : <I.chevr size={11} />}
      </span>
    </button>
  );
}

function RowSpinner() {
  return (
    <span style={{
      width: 12, height: 12, borderRadius: '50%',
      border: '2px solid var(--gb-brand-label)',
      borderTopColor: 'transparent',
      animation: 'gb-spin .8s linear infinite',
      display: 'inline-block',
    }} />
  );
}

/* Inline voicemail toggle — a small pill that flips its tint when
   on. Avoids the heavier FeatureSpotlight component used in the
   editor since the modal already has plenty of form elements. */
function VoicemailToggle({ on, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      style={{
        alignSelf: 'flex-start',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 10px',
        background: on ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-1)',
        border: '1px solid ' + (on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
        color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
        borderRadius: 'var(--gb-r-sm)',
        fontSize: 11, fontWeight: 600,
        cursor: 'pointer',
        transition: 'all var(--gb-anim-fast)',
      }}
    >
      <Voicemail size={11} />
      <span>Left voicemail</span>
      {on && <I.check size={10} />}
    </button>
  );
}
