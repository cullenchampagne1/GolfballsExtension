import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import {
  Btn, IconBtn, Tag, Dot,
  Input, Textarea, Dropdown, Field,
  SwitchTag,
  Callout, SectionLabel, Card,
  BodyVar,
  I, Icon,
} from '../ui/index.js';

/* ─────────────────────────────────────────────────────────────
   editor-notes.jsx — React editor for QUICK-NOTE templates.

   Mounts into #ed-note-form, listens for window.__gbOpenNote(tpl),
   auto-saves via window.__gbSaveNote(tpl). No save button — same
   debounced auto-save pattern as editor-templates.jsx.

   Layout matches the "Notes Editor" design handoff:
     header (icon + title + tags + actions) → subtype pill switcher
     → per-subtype callout → subtype panel.
───────────────────────────────────────────────────────────── */

/* ── Icons (only the design-specific ones — rest come from I) */
const NIcons = {
  note:    (p) => <Icon {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></Icon>,
  task:    (p) => <Icon {...p}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></Icon>,
  phone:   (p) => <Icon {...p}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.9.37 1.77.71 2.6a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.48-1.28a2 2 0 012.11-.45c.83.34 1.7.58 2.6.71A2 2 0 0122 16.92z"/></Icon>,
  spark:   (p) => <Icon {...p}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></Icon>,
  clock:   (p) => <Icon {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></Icon>,
  cal:     (p) => <Icon {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></Icon>,
  inbound: (p) => <Icon {...p}><polyline points="7 17 17 7"/><polyline points="7 7 17 7 17 17"/></Icon>,
  outbound:(p) => <Icon {...p}><polyline points="17 7 7 17"/><polyline points="17 17 7 17 7 7"/></Icon>,
  mic:     (p) => <Icon {...p}><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></Icon>,
};

/* ── Subtype metadata: matches backup/editor.js shape so saved
       tpl.subType values round-trip without translation. Each carries
       its own short callout copy describing where the subtype's
       buttons appear in the broader extension. */
const SUBTYPES = {
  note: {
    label: 'Note',
    icon: <NIcons.note />,
    surface: 'Order pages',
    callout: <>Note templates appear as quick-action buttons next to the <strong style={{ color: 'var(--gb-text-secondary)' }}>Add</strong> button on order pages. Clicking auto-fills + submits.</>,
  },
  task: {
    label: 'Task',
    icon: <NIcons.task />,
    surface: 'Contact + Account pages',
    callout: <>Task templates appear as one-click buttons on the <strong style={{ color: 'var(--gb-text-secondary)' }}>Contact</strong> and <strong style={{ color: 'var(--gb-text-secondary)' }}>Account</strong> pages. Clicking creates the task in the CRM immediately.</>,
  },
  call_log: {
    label: 'Call Log',
    icon: <NIcons.phone />,
    surface: 'Contact pages',
    callout: <>Call log templates appear in the <strong style={{ color: 'var(--gb-text-secondary)' }}>Quick Log</strong> panel on contact pages. Clicking pre-fills + submits a call log without leaving the page.</>,
  },
  opportunity: {
    label: 'Opportunity',
    icon: <NIcons.spark />,
    surface: 'Coming soon',
    disabled: true,
    callout: <>Opportunity templates will let you create CRM opportunities from a single click. This subtype is reserved — UI lands once the feature ships.</>,
  },
};

const PRIORITY_OPTIONS = [
  { id: '1', label: 'High' },
  { id: '2', label: 'Medium' },
  { id: '3', label: 'Low' },
];

const CALL_DIRECTION_OPTIONS = [
  { id: '0', label: 'Outbound' },
  { id: '1', label: 'Inbound' },
];

/* CRM enum IDs ported verbatim from legacy editor.html. */
const CALL_CATEGORY_OPTIONS = [
  { id: '0',  label: 'Select' },
  { id: '1',  label: 'Product Question' },
  { id: '2',  label: 'Order Status' },
  { id: '3',  label: 'Place Order' },
  { id: '5',  label: 'Transfer' },
  { id: '16', label: 'Order Payment' },
  { id: '17', label: 'Turnaround Time' },
  { id: '18', label: 'Art' },
  { id: '21', label: 'Prior Year Followup' },
  { id: '27', label: 'Returning VoiceMail' },
  { id: '29', label: 'Tournament Lead' },
  { id: '30', label: 'Form Lead Followup' },
  { id: '35', label: 'General Question' },
  { id: '36', label: 'Order Issues' },
  { id: '37', label: 'CSR Backup' },
  { id: '39', label: 'Discovery' },
  { id: '40', label: 'Opportunity' },
  { id: '41', label: 'Returns/Reprints' },
  { id: '49', label: 'Charge Error' },
  { id: '50', label: 'Fraud Inquiry' },
  { id: '51', label: 'International Orders' },
  { id: '52', label: 'Profanity' },
  { id: '53', label: 'Order Change' },
  { id: '54', label: 'Cancelation' },
  { id: '55', label: 'Website Concerns' },
];

/* ── Variable-chip insert helper ─────────────────────────────
   Tracks the last-focused input + caret so chip clicks insert the
   token at the right spot. Mirrors the legacy `wireNoteChips` flow
   but with the chip rendered via the design system's BodyVar so it
   reads the same as inline variable chips elsewhere.

   The component is field-scoped: pass the input's native ref +
   current value + setter; chip click splices the token at caret. */
function VarChips({ targets = ['date', 'time'], nativeEl, value, onChange }) {
  function insert(name) {
    const token = `{{${name}}}`;
    const el = nativeEl?.current;
    if (!el || typeof el.selectionStart !== 'number') {
      // Fallback: append if we don't know the caret.
      onChange((value || '') + token);
      return;
    }
    const start = el.selectionStart;
    const end   = el.selectionEnd;
    const next  = (value || '').slice(0, start) + token + (value || '').slice(end);
    onChange(next);
    // Restore focus + caret position after React re-renders.
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      try { el.setSelectionRange(pos, pos); } catch (_) {}
    });
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5 }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--gb-text-muted)' }}>
        Insert
      </span>
      {targets.map((name) => (
        <span
          key={name}
          onClick={() => insert(name)}
          style={{ cursor: 'pointer' }}
          title={`Insert {{${name}}}`}
        >
          <BodyVar v={{ name, status: 'ok', smart: {} }} size="sm" onOpenSmart={() => insert(name)} />
        </span>
      ))}
    </div>
  );
}

/* ── Call-log step rows: numbered pill + input + delete; trailing
       dashed "Add step N/4" when there's room. */
function StepsEditor({ steps, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 20, height: 20, borderRadius: 5, flexShrink: 0,
            background: s ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-subtle)',
            border: '1px solid ' + (s ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
            color: s ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 800, fontFamily: 'var(--gb-font-mono)',
          }}>
            {i + 1}
          </div>
          <Input
            value={s}
            placeholder={i === 0 ? 'e.g. Send follow-up email' : 'Optional next step…'}
            size="sm"
            onChange={(v) => {
              const next = [...steps];
              next[i] = v;
              onChange(next);
            }}
            style={{ flex: 1 }}
          />
          <IconBtn size="sm" icon={<I.trash />} danger
            onClick={() => onChange(steps.filter((_, j) => j !== i))} />
        </div>
      ))}
      {steps.length < 4 && (
        <Btn variant="dashed" size="sm" icon={<I.plus />} full
          onClick={() => onChange([...steps, ''])}>
          Add step {steps.length + 1}/4
        </Btn>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   SUBTYPE PANELS — each owns its own native refs so chip clicks
   can know where to insert.
════════════════════════════════════════════════════════════ */

function NotePanel({ data, set }) {
  const subjectRef = useRef(null);
  const bodyRef    = useRef(null);
  return (
    <>
      <SectionLabel>Button</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        <Field label="Button label" required>
          <Input
            size="sm"
            value={data.name}
            placeholder="e.g. Proof Requested"
            leading={<NIcons.note />}
            onChange={(v) => set({ name: v })}
          />
        </Field>
        <Field label="Audience value" hint="Must match an Audience dropdown option exactly.">
          <Input
            size="sm"
            value={data.audienceVal}
            placeholder="e.g. Custom Logo"
            onChange={(v) => set({ audienceVal: v })}
          />
        </Field>
      </div>

      <SectionLabel>Note content</SectionLabel>
      <div style={{ marginBottom: 10 }}>
        <Field label="Subject">
          <Input
            size="sm"
            nativeRef={subjectRef}
            value={data.subject}
            placeholder="e.g. Art Update"
            onChange={(v) => set({ subject: v })}
          />
        </Field>
        <VarChips
          nativeEl={subjectRef}
          value={data.subject}
          onChange={(v) => set({ subject: v })}
        />
      </div>
      <div style={{ marginBottom: 14 }}>
        <Field label="Body">
          <Textarea
            nativeRef={bodyRef}
            value={data.body}
            placeholder="e.g. Proof Requested {{date}}"
            rows={4}
            resize="vertical"
            onChange={(v) => set({ body: v })}
          />
        </Field>
        <VarChips
          nativeEl={bodyRef}
          value={data.body}
          onChange={(v) => set({ body: v })}
        />
      </div>

      <SectionLabel>Automation</SectionLabel>
      <Card padding={11}>
        {/* Single inline row: icon · label · input · unit · tail hint. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 'var(--gb-r-sm)', flexShrink: 0,
            background: 'var(--gb-brand-tint-medium)',
            color: 'var(--gb-brand-label)',
            border: '1px solid var(--gb-brand-tint-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <NIcons.cal size={13} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)' }}>
              Push dates forward
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>
              Auto-shifts Approval and Commitment dates when clicked.
            </div>
          </div>
          <Input
            size="sm" mono
            value={data.daysOut == null ? '' : String(data.daysOut)}
            placeholder="0"
            onChange={(v) => {
              const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
              set({ daysOut: isNaN(n) || n < 0 ? null : n });
            }}
            style={{ width: 64, flexShrink: 0 }}
          />
          <span style={{ fontSize: 11, color: 'var(--gb-text-tertiary)', flexShrink: 0 }}>days</span>
        </div>
      </Card>
    </>
  );
}

function TaskPanel({ data, set }) {
  const subjectRef = useRef(null);
  const priorityLabel = (PRIORITY_OPTIONS.find((p) => p.id === String(data.priority ?? 2)) || PRIORITY_OPTIONS[1]).label;
  const priorityTone  = priorityLabel === 'High' ? 'error' : priorityLabel === 'Low' ? 'muted' : 'warning';
  return (
    <>
      <SectionLabel>Button + Subject</SectionLabel>
      <div style={{ marginBottom: 8 }}>
        <Field label="Button label" required hint="Short label on the quick-create button.">
          <Input
            size="sm"
            value={data.name}
            placeholder="e.g. Follow Up"
            leading={<NIcons.task />}
            onChange={(v) => set({ name: v })}
          />
        </Field>
      </div>
      <div style={{ marginBottom: 10 }}>
        <Field label="Task subject" hint="The actual task name created in the CRM.">
          <Input
            size="sm"
            nativeRef={subjectRef}
            value={data.subject}
            placeholder="e.g. Follow up on quote sent {{date}}"
            onChange={(v) => set({ subject: v })}
          />
        </Field>
        <VarChips
          nativeEl={subjectRef}
          value={data.subject}
          onChange={(v) => set({ subject: v })}
        />
      </div>
      <div style={{ marginBottom: 14 }}>
        <Field label="Description">
          <Textarea
            value={data.body}
            placeholder="Optional detail about what this task involves…"
            rows={3}
            resize="vertical"
            onChange={(v) => set({ body: v })}
          />
        </Field>
      </div>

      <SectionLabel>Details</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <Field label="Priority">
          <Dropdown
            size="sm"
            value={String(data.priority ?? 2)}
            options={PRIORITY_OPTIONS}
            onChange={(v) => set({ priority: parseInt(v, 10) || 2 })}
          />
        </Field>
        <Field label="Due (days out)" hint="From today">
          <Input
            size="sm" mono
            value={data.daysOut == null ? '' : String(data.daysOut)}
            placeholder="0"
            onChange={(v) => {
              const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
              set({ daysOut: isNaN(n) || n < 0 ? null : n });
            }}
          />
        </Field>
        <Field label="Category ID" hint="CRM internal · 0 = Other">
          <Input
            size="sm" mono
            value={String(data.categoryId ?? 0)}
            placeholder="0"
            onChange={(v) => set({ categoryId: parseInt(v.replace(/[^0-9]/g, ''), 10) || 0 })}
          />
        </Field>
      </div>

      {/* Priority preview row — same dashed card from the design. */}
      <Card padding={10} style={{ background: 'var(--gb-fill-subtle)', borderStyle: 'dashed' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 11 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--gb-text-muted)' }}>
            Preview
          </span>
          <Dot tone={priorityTone} glow />
          <span style={{ color: 'var(--gb-text-tertiary)' }}>{priorityLabel}</span>
          <NIcons.clock size={11} style={{ color: 'var(--gb-text-muted)', marginLeft: 6 }} />
          <span style={{ color: 'var(--gb-text-tertiary)' }}>
            Due {data.daysOut ? `in ${data.daysOut}d` : 'today'}
          </span>
        </div>
      </Card>
    </>
  );
}

function CallLogPanel({ data, set }) {
  const subjectRef = useRef(null);
  const bodyRef    = useRef(null);

  // Steps are stored as callStep1..4 on the template (legacy shape) but
  // edited here as an array for ergonomic add/remove. We normalize on
  // mount and emit back the four fields.
  const initialSteps = [data.callStep1, data.callStep2, data.callStep3, data.callStep4].filter(Boolean);
  const [steps, setSteps] = useState(initialSteps.length ? initialSteps : ['']);
  useEffect(() => {
    set({
      callStep1: steps[0] || '',
      callStep2: steps[1] || '',
      callStep3: steps[2] || '',
      callStep4: steps[3] || '',
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.join('')]);

  return (
    <>
      <SectionLabel>Button</SectionLabel>
      <div style={{ marginBottom: 14 }}>
        <Field label="Button label" required hint="Shown on the quick-log button on contact pages.">
          <Input
            size="sm"
            value={data.name}
            placeholder="e.g. Promo Follow-Up"
            leading={<NIcons.phone />}
            onChange={(v) => set({ name: v })}
          />
        </Field>
      </div>

      <SectionLabel>Call details</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <Field label="Direction">
          {/* Inline pill-segmented control matching the design's
              Outbound/Inbound switcher. Two options, narrow space. */}
          <div style={{
            display: 'flex', gap: 4, padding: 2,
            background: 'var(--gb-fill-inverse-medium)',
            border: '1px solid var(--gb-border-default)',
            borderRadius: 'var(--gb-r-md)',
            height: 32,
          }}>
            {[
              { id: '0', label: 'Outbound', icon: <NIcons.outbound /> },
              { id: '1', label: 'Inbound',  icon: <NIcons.inbound /> },
            ].map((o) => {
              const active = String(data.callDirection ?? 0) === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => set({ callDirection: parseInt(o.id, 10) })}
                  style={{
                    flex: 1, padding: '0 9px', borderRadius: 5,
                    background: active ? 'var(--gb-brand-tint-medium)' : 'transparent',
                    color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 11, fontWeight: 600,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  }}
                >
                  {React.cloneElement(o.icon, { size: 11 })}
                  {o.label}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Category">
          <Dropdown
            size="sm" searchable
            value={String(data.callCategory ?? 0)}
            options={CALL_CATEGORY_OPTIONS}
            onChange={(v) => set({ callCategory: parseInt(v, 10) || 0 })}
          />
        </Field>
      </div>

      {/* Voicemail toggle — full-row spotlight: the card itself tints
          brand-green when active so the on-state reads at a glance,
          matching the xs SwitchTag pattern from the header. */}
      <div
        onClick={() => set({ callVoicemail: !data.callVoicemail })}
        style={{
          marginBottom: 14, padding: 10,
          borderRadius: 'var(--gb-r-md)',
          background: data.callVoicemail ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-1)',
          border: '1px solid ' + (data.callVoicemail ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
          display: 'flex', alignItems: 'center', gap: 9,
          cursor: 'pointer', userSelect: 'none',
          transition: 'background 140ms ease, border-color 140ms ease',
        }}
      >
        <NIcons.mic size={13} style={{ color: data.callVoicemail ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)' }} />
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 12, fontWeight: 600,
            color: data.callVoicemail ? 'var(--gb-brand-label)' : 'var(--gb-text-primary)',
          }}>
            Left voicemail
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>
            Logs the call with a voicemail flag.
          </div>
        </div>
        <SwitchTag
          size="xs"
          on={!!data.callVoicemail}
          label={data.callVoicemail ? 'Voicemail' : 'No voicemail'}
          onClick={(e) => { e.stopPropagation(); set({ callVoicemail: !data.callVoicemail }); }}
        />
      </div>

      <SectionLabel>Content</SectionLabel>
      <div style={{ marginBottom: 8 }}>
        <Field label="Subject">
          <Input
            size="sm"
            nativeRef={subjectRef}
            value={data.subject}
            placeholder="e.g. Bridgestone & Srixon Promo Follow-Up"
            onChange={(v) => set({ subject: v })}
          />
        </Field>
        <VarChips
          nativeEl={subjectRef}
          value={data.subject}
          onChange={(v) => set({ subject: v })}
        />
      </div>
      <div style={{ marginBottom: 14 }}>
        <Field label="Description">
          <Textarea
            nativeRef={bodyRef}
            value={data.body}
            placeholder="e.g. Called to discuss current promotions…"
            rows={3}
            resize="vertical"
            onChange={(v) => set({ body: v })}
          />
        </Field>
        <VarChips
          nativeEl={bodyRef}
          value={data.body}
          onChange={(v) => set({ body: v })}
        />
      </div>

      <SectionLabel>
        Next-step actions
        <span style={{ fontSize: 10, color: 'var(--gb-text-muted)', fontWeight: 500, textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>
          up to 4
        </span>
      </SectionLabel>
      <StepsEditor steps={steps} onChange={setSteps} />
    </>
  );
}

function OpportunityPanel() {
  return (
    <div style={{
      padding: 28,
      background: 'var(--gb-fill-subtle)',
      border: '1px dashed var(--gb-border-default)',
      borderRadius: 'var(--gb-r-md)',
      textAlign: 'center',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 'var(--gb-r-md)',
        background: 'var(--gb-brand-tint-medium)',
        border: '1px solid var(--gb-brand-tint-border)',
        color: 'var(--gb-brand-label)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 10px',
      }}>
        <NIcons.spark size={16} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>
        Opportunity templates · coming soon
      </div>
      <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 4, lineHeight: 1.5, maxWidth: 380, margin: '4px auto 0' }}>
        Create CRM opportunities from a single click. Reserved — the editor UI shows up once the feature ships.
      </div>
    </div>
  );
}

/* ── EmptyState shown when no template is selected. */
function EmptyState() {
  return (
    <div style={{
      padding: 60, textAlign: 'center', color: 'var(--gb-text-muted)',
      fontSize: 13, fontFamily: 'var(--gb-font-sans)',
    }}>
      <NIcons.note size={32} style={{ color: 'var(--gb-text-ghost)', marginBottom: 12 }} />
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gb-text-secondary)', marginBottom: 4 }}>
        No note template selected
      </div>
      <div>Pick one from the sidebar, or create a new one.</div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   EDITOR
════════════════════════════════════════════════════════════ */
function NoteEditor({ tpl, onDelete }) {
  const initialSubType = SUBTYPES[tpl.subType] ? tpl.subType : 'note';
  const [subType, setSubType] = useState(initialSubType);
  const [enabled, setEnabled] = useState(tpl.enabled !== false);

  /* Single shared field bag — most fields are subtype-conditional in
     persisted form but live in one state object for ergonomic edits.
     buildTemplate() picks the right ones per subType. */
  const [data, setData] = useState(() => ({
    name:          tpl.name || '',
    audienceVal:   tpl.audienceVal || '',
    subject:       tpl.subject || '',
    body:          tpl.body || '',
    daysOut:       tpl.daysOut ?? null,
    priority:      tpl.priority ?? 2,
    categoryId:    tpl.categoryId ?? 0,
    callDirection: tpl.callDirection ?? 0,
    callCategory:  tpl.callCategory ?? 0,
    callVoicemail: !!tpl.callVoicemail,
    callStep1:     tpl.callStep1 || '',
    callStep2:     tpl.callStep2 || '',
    callStep3:     tpl.callStep3 || '',
    callStep4:     tpl.callStep4 || '',
  }));
  const set = (patch) => setData((d) => ({ ...d, ...patch }));

  const t = SUBTYPES[subType] || SUBTYPES.note;
  const Panel = subType === 'note'    ? NotePanel
              : subType === 'task'    ? TaskPanel
              : subType === 'call_log'? CallLogPanel
              :                         OpportunityPanel;

  /* Storage shape — mirrors legacy collectNoteTemplate. Fields not
     relevant to the active subtype are explicitly undefined so the
     stored object doesn't drag stale data across type switches. */
  function buildTemplate() {
    const isTask    = subType === 'task';
    const isCallLog = subType === 'call_log';
    const trimmed   = (data.name || '').trim()
      || (isTask ? 'Untitled Task' : isCallLog ? 'Untitled Call Log' : 'Untitled');
    return {
      ...tpl,
      id: tpl.id,
      name: trimmed,
      subType,
      enabled,
      audienceVal:   isTask || isCallLog ? '' : (data.audienceVal || '').trim(),
      subject:       (data.subject || '').trim(),
      body:          data.body || '',
      daysOut:       data.daysOut != null && data.daysOut >= 0 ? data.daysOut : null,
      priority:      isTask    ? (data.priority || 2) : undefined,
      categoryId:    isTask    ? (data.categoryId || 0) : undefined,
      callDirection: isCallLog ? (data.callDirection || 0) : undefined,
      callCategory:  isCallLog ? (data.callCategory  || 0) : undefined,
      callVoicemail: isCallLog ? !!data.callVoicemail : undefined,
      callStep1:     isCallLog ? (data.callStep1 || '') : undefined,
      callStep2:     isCallLog ? (data.callStep2 || '') : undefined,
      callStep3:     isCallLog ? (data.callStep3 || '') : undefined,
      callStep4:     isCallLog ? (data.callStep4 || '') : undefined,
      updatedAt: Date.now(),
    };
  }

  /* Auto-save — debounced 500ms, same pattern as editor-templates. */
  const skipSave     = useRef(true);
  const skipTypeSave = useRef(true);
  const saveTimer    = useRef(0);
  useEffect(() => {
    if (skipSave.current) { skipSave.current = false; return undefined; }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (typeof window.__gbSaveNote === 'function') window.__gbSaveNote(buildTemplate());
    }, 500);
    return () => clearTimeout(saveTimer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, data]);

  /* Subtype change saves immediately so the sidebar's row-teleport
     spring kicks in on the next storage tick. */
  useEffect(() => {
    if (skipTypeSave.current) { skipTypeSave.current = false; return; }
    if (typeof window.__gbSaveNote === 'function') window.__gbSaveNote(buildTemplate());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subType]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--gb-surface-canvas)', padding: '18px 16px 40px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{
            width: 28, height: 28, borderRadius: 'var(--gb-r-sm)',
            background: 'var(--gb-brand-tint-medium)',
            border: '1px solid var(--gb-brand-tint-border)',
            color: 'var(--gb-brand-label)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {React.cloneElement(t.icon, { size: 13 })}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--gb-text-primary)', letterSpacing: -0.2 }}>
                {data.name || 'Untitled'}
              </h1>
              <Tag tone="neutral" size="xs" mono>{t.label.toUpperCase()}</Tag>
              <SwitchTag size="xs" on={enabled} label={enabled ? 'Enabled' : 'Disabled'} onClick={() => setEnabled((e) => !e)} />
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 2 }}>
              Shows on: <span style={{ color: 'var(--gb-text-tertiary)', fontWeight: 600 }}>{t.surface}</span>
            </div>
          </div>
          {/* Only Delete — Save isn't here because we auto-save. */}
          <IconBtn size="sm" icon={<I.trash />} danger title="Delete" onClick={onDelete} />
        </div>

        {/* Subtype pill switcher */}
        <div style={{
          display: 'flex', gap: 3, padding: 2,
          background: 'var(--gb-surface-1)',
          border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-sm)',
          marginBottom: 12, width: 'fit-content',
        }}>
          {Object.entries(SUBTYPES).map(([id, info]) => {
            const active = subType === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => { if (!info.disabled) setSubType(id); }}
                disabled={info.disabled}
                style={{
                  padding: '5px 11px', borderRadius: 5,
                  fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                  background: active ? 'var(--gb-brand-tint-medium)' : 'transparent',
                  color:      active ? 'var(--gb-brand-label)'      : 'var(--gb-text-tertiary)',
                  border: 'none', cursor: info.disabled ? 'not-allowed' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  opacity: info.disabled ? 0.55 : 1,
                }}
              >
                {React.cloneElement(info.icon, { size: 11 })}
                {info.label}
                {info.disabled && (
                  <Tag tone="warning" size="xs" style={{ marginLeft: 3 }}>SOON</Tag>
                )}
              </button>
            );
          })}
        </div>

        {/* Per-subtype callout — short, functional description of where the
            subtype's buttons appear in the extension. Different copy than
            the earlier "tips" callouts; these tell the user what the
            template DOES at click time. */}
        <div style={{ marginBottom: 12 }}>
          <Callout tone={subType === 'opportunity' ? 'warning' : 'info'} title={`${t.label} templates`} icon={<I.bolt />}>
            {t.callout}
          </Callout>
        </div>

        {/* Subtype panel */}
        <Panel data={data} set={set} />
      </div>
    </div>
  );
}

/* ── Root ─────────────────────────────────────────────────── */
function NoteEditorRoot() {
  const [tpl, setTpl] = useState(null);

  useEffect(() => {
    window.__gbOpenNote = (template) => setTpl({ ...template });
    return () => { delete window.__gbOpenNote; };
  }, []);

  return tpl ? (
    <NoteEditor
      key={tpl.id}
      tpl={tpl}
      onDelete={() => { if (typeof window.deleteNoteTemplate === 'function') window.deleteNoteTemplate(); }}
    />
  ) : (
    <EmptyState />
  );
}

/* ── Mount ────────────────────────────────────────────────── */
function mount() {
  const host = document.getElementById('ed-note-form');
  if (!host || host.__gbNotesMounted) return;
  host.__gbNotesMounted = true;
  host.style.padding = '0'; // NoteEditor manages its own padding
  ensureTheme();
  createRoot(host).render(<NoteEditorRoot />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
