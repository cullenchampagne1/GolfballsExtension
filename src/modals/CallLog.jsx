import React, { useEffect, useRef, useState } from 'react';
import {
  FloatingPanel, ModalHeader,
  Btn, Dropdown, Input, Textarea, Segmented, Field, SectionLabel,
  SwitchTag, CollapsibleSection,
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

   Layout (top to bottom):
     • Header — phone icon + "Log call" + contact/phone subtitle
     • Quick Log section — 3-column compact button grid (matches
       the legacy quick-action panel's density). Each cell is one
       enabled call_log noteTemplate.
     • Custom Log section — full-fidelity equivalent of the
       template editor. Direction switcher (full-width), Category
       dropdown (full-width), Subject + Description, Voicemail
       toggle (FeatureSpotlight, same component the editor uses),
       Next-step actions (StepsEditor, same component the editor
       uses).
     • Footer — tel: hint + Cancel / Save buttons

   Both paths pipe through the same `onSubmit(template)` prop so
   the CRM call doesn't have to branch.

   Props
     contactName  string                 display name (header)
     contactType  'contact' | 'account'  used by the caller for routing
     phone        string                 number dialed; shown in subtitle
     onSubmit     (template) => Promise<{ ok, error? }>   REQUIRED
     onClosed     () => void
     bindClose    (fn) => void
─────────────────────────────────────────────────────────────── */

/* Direction icons — inbound = arrow toward you, outbound = away.
   Matches NoteEditor.jsx's NIcons so a rep sees the same glyph
   on both surfaces. */
const Inbound  = (p) => (<Icon {...p}><polyline points="7 17 17 7"/><polyline points="7 7 17 7 17 17"/></Icon>);
const Outbound = (p) => (<Icon {...p}><polyline points="17 7 7 17"/><polyline points="17 17 7 17 7 7"/></Icon>);
/* Voicemail cassette — matches the legacy quick-action panel's icon. */
const Voicemail = (p) => (
  <Icon {...p}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <circle cx="8" cy="12" r="2" />
    <circle cx="16" cy="12" r="2" />
    <path d="M10 12h4" />
  </Icon>
);
/* Mic icon — same path NoteEditor.jsx uses for the voicemail
   FeatureSpotlight, kept inline here since it's the only consumer
   in this file. */
const MicIcon = (p) => (
  <Icon {...p}>
    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
    <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
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

  /* ── Preset templates ─────────────────────────────────────── */
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  /* ── Custom log form state ─────────────────────────────────── */
  const [direction, setDirection] = useState(0);   // 0 = Outbound default
  const [category, setCategory]   = useState(0);   // CRM enum id; 0 = unset
  const [subject, setSubject]     = useState('');
  const [body, setBody]           = useState('');
  const [voicemail, setVoicemail] = useState(false);
  const [savingCustom, setSavingCustom] = useState(false);

  const bindCloseRef = useRef(null);
  const handleBindClose = (fn) => {
    bindCloseRef.current = fn;
    if (bindClose) bindClose(fn);
  };
  const animatedClose = () => bindCloseRef.current?.();

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

  /* Preset click: submit immediately. Same toast on success/failure
     as the custom path so the rep gets uniform feedback. */
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
        maxHeight: '76vh', overflowY: 'auto',
      }}>
        {/* ── Quick log — 3-column compact button grid ────────
            Mirrors the density of the legacy in-page panel
            (src/vanilla/call-log-panel.js). Each cell is one
            template; click fires onPick straight to the CRM.
            Truncated label + IN/OUT meta is enough info for a
            rep who already knows their template names — the
            full category label is in the button's title attr
            for tooltip discovery. */}
        <div>
          <SectionLabel>Quick log</SectionLabel>
          {loading ? (
            <EmptyHint>Loading templates…</EmptyHint>
          ) : templates.length === 0 ? (
            <EmptyHint>
              No call templates configured. Open the Notes editor to add one.
            </EmptyHint>
          ) : (
            /* Scroll container — caps the section's vertical
               footprint so a rep with 20+ templates doesn't push
               the custom-log form off-screen. paddingRight keeps
               content from sliding under the scrollbar. 168px
               shows ~4 rows of 30px buttons before scrolling. */
            <div style={{
              maxHeight: 168,
              overflowY: 'auto',
              paddingRight: 4,
              marginTop: 6,
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 5,
              }}>
                {templates.map((tpl) => (
                  <PresetGridButton
                    key={tpl.id}
                    tpl={tpl}
                    busy={busyId === tpl.id}
                    disabled={anyBusy && busyId !== tpl.id}
                    onPick={() => handlePresetClick(tpl)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Custom log — collapsed by default ────────────
            Quick Log is the primary path (one-tap submit), so we
            keep it always-visible up top and tuck Custom Log into
            a collapsible section. Most reps use a preset; the
            minority who need an ad-hoc log expand this. The save
            button lives INSIDE the collapsed body so it doesn't
            clutter the modal footer when the form isn't visible. */}
        <CollapsibleSection
          icon={<I.edit />}
          title="Custom log"
          subtitle="No preset fits? Build a one-off entry."
          defaultOpen={false}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}>
            {/* Direction + Category share a row to save vertical
                space. Heights are forced to 28px so the bottoms
                align — Segmented size="sm" defaults to ~20px tall
                while Dropdown size="sm" is 28px (inputBaseStyle's
                heights map), so we explicitly stretch Segmented to
                match. alignItems:end on the grid handles the
                Field-label height variance (if one label wraps,
                the controls still bottom-align). */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'end' }}>
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
                  style={{ height: 28 }}
                />
              </Field>
              <Field label="Category" required>
                <Dropdown
                  size="sm"
                  searchable
                  value={String(category)}
                  options={CALL_CATEGORY_OPTIONS}
                  placeholder="Select category…"
                  onChange={(v) => setCategory(parseInt(v, 10) || 0)}
                />
              </Field>
            </div>

            {/* Subject input + inline Voicemail switch tag share
                the SAME row. The Input flexes to fill remaining
                width while the SwitchTag pins to the right at its
                natural size. Cuts a whole row out of the form
                versus stacking voicemail below. */}
            <Field label="Subject">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Input
                  size="sm"
                  value={subject}
                  onChange={setSubject}
                  placeholder="Brief subject for the activity log…"
                  style={{ flex: 1, minWidth: 0 }}
                />
                <SwitchTag
                  size="xs"
                  on={voicemail}
                  label="Voicemail"
                  icon={<MicIcon />}
                  onClick={() => setVoicemail((v) => !v)}
                />
              </div>
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

            {/* Save lives INSIDE the collapsible — it's only useful
                when the form is visible, and putting it here keeps
                the modal footer minimal (Cancel + tel: hint) when
                the rep is just picking a preset. */}
            <Btn
              size="sm"
              variant="primary"
              full
              icon={<I.send />}
              onClick={handleCustomSubmit}
              disabled={anyBusy}
            >
              {savingCustom ? 'Saving…' : 'Save custom log'}
            </Btn>
          </div>
        </CollapsibleSection>
      </div>

      {/* ── Footer — minimal now that Save lives inside the
            Custom Log collapsible. tel: hint left, Cancel right.
            Reps who just want to dismiss without logging hit
            Cancel (or the header close button); preset clicks
            auto-close on success. */}
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
        <Btn size="sm" variant="secondary" onClick={animatedClose} disabled={anyBusy}>Cancel</Btn>
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

/* A single 3-col-grid cell. Compact button styled like the legacy
   in-page quick-log buttons: icon + truncated name + tiny IN/OUT
   meta on the right. Busy state shows a spinner where the IN/OUT
   tag was so the cell width stays stable mid-submit. */
function PresetGridButton({ tpl, busy, disabled, onPick }) {
  const [hover, setHover] = useState(false);
  const dirLabel = tpl.callDirection === 1 ? 'IN' : 'OUT';
  const catLabel = getCategoryLabel(tpl.callCategory);
  const Glyph = tpl.callVoicemail ? Voicemail : I.phone;
  const inactive = disabled || busy;

  return (
    <button
      type="button"
      disabled={inactive}
      onClick={onPick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      /* title attr gives the rep the full category label + step
         hints on hover even though the cell itself is too narrow
         to render them inline. */
      title={[tpl.name, catLabel && `Category: ${catLabel}`, tpl.callVoicemail && 'Voicemail'].filter(Boolean).join('\n')}
      style={{
        display: 'grid',
        gridTemplateColumns: '14px 1fr auto',
        alignItems: 'center',
        gap: 6,
        height: 30,
        padding: '0 8px',
        background: hover && !inactive ? 'var(--gb-brand-tint-medium)' : 'var(--gb-brand-tint-soft)',
        border: '1px solid var(--gb-brand-tint-border)',
        color: 'var(--gb-brand-label)',
        borderRadius: 'var(--gb-r-sm)',
        cursor: inactive ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        textAlign: 'left',
        fontFamily: 'var(--gb-font-sans)',
        boxShadow: hover && !inactive ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
        transition: 'all var(--gb-anim-fast)',
        minWidth: 0,
      }}
    >
      <Glyph size={12} />
      <span style={{
        fontSize: 11, fontWeight: 600,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        minWidth: 0,
      }}>{tpl.name || 'Untitled'}</span>
      {busy ? (
        <RowSpinner />
      ) : (
        <span style={{
          fontSize: 8.5, fontWeight: 700, letterSpacing: 0.4,
          opacity: 0.75,
          flexShrink: 0,
        }}>{dirLabel}</span>
      )}
    </button>
  );
}

function RowSpinner() {
  return (
    <span style={{
      width: 10, height: 10, borderRadius: '50%',
      border: '1.5px solid currentColor',
      borderTopColor: 'transparent',
      animation: 'gb-spin .8s linear infinite',
      display: 'inline-block',
      flexShrink: 0,
    }} />
  );
}
