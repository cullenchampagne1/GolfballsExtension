import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import {
  Btn, IconBtn, Dot,
  Input, Textarea, Dropdown, Field,
  Segmented,
  FeatureSpotlight, EditorHeader,
  TYPE_ICONS,
  SectionLabel, Card,
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

/* Panel-internal decoration icons. Type icons (note/task/call_log) come
   from the shared TYPE_ICONS map — see `src/ui/typeIcons.jsx`. */
const NIcons = {
  clock:   (p) => <Icon {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></Icon>,
  cal:     (p) => <Icon {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></Icon>,
  inbound: (p) => <Icon {...p}><polyline points="7 17 17 7"/><polyline points="7 7 17 7 17 17"/></Icon>,
  outbound:(p) => <Icon {...p}><polyline points="17 7 7 17"/><polyline points="17 17 7 17 7 7"/></Icon>,
  mic:     (p) => <Icon {...p}><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></Icon>,
};

/* ── Subtype metadata: matches backup/editor.js shape so saved
       tpl.subType values round-trip without translation. */
const SUBTYPES = {
  note:     { label: 'Note',     icon: <TYPE_ICONS.note />,     surface: 'Order pages' },
  task:     { label: 'Task',     icon: <TYPE_ICONS.task />,     surface: 'Contact + Account pages' },
  call_log: { label: 'Call Log', icon: <TYPE_ICONS.call_log />, surface: 'Contact pages' },
  // Opportunity subtype is reserved for a future feature; keeping it out
  // of the editor for now since exposing a non-functional tab adds noise.
  // Re-add via SUBTYPES when the CRM-side implementation lands.
};

// Drives the shared Segmented switcher — same shape the email editor uses.
const SUBTYPE_OPTIONS = Object.entries(SUBTYPES).map(([id, m]) => ({
  id, label: m.label, icon: m.icon,
}));

const PRIORITY_OPTIONS = [
  { id: '1', label: 'High' },
  { id: '2', label: 'Medium' },
  { id: '3', label: 'Low' },
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
            leading={<TYPE_ICONS.note />}
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
            leading={<TYPE_ICONS.task />}
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
            leading={<TYPE_ICONS.call_log />}
            onChange={(v) => set({ name: v })}
          />
        </Field>
      </div>

      <SectionLabel>Call details</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <Field label="Direction">
          {/* Shared Segmented control — the active pill springs between
              options instead of snapping like the bespoke inline pill
              this replaced. Same component the subtype + email type
              switchers use. */}
          <Segmented
            value={String(data.callDirection ?? 0)}
            onChange={(v) => set({ callDirection: parseInt(v, 10) })}
            options={[
              { id: '0', label: 'Outbound', icon: <NIcons.outbound /> },
              { id: '1', label: 'Inbound',  icon: <NIcons.inbound /> },
            ]}
            full
          />
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

      {/* Voicemail toggle — uses the shared FeatureSpotlight component
          (xs size) so it matches the settings page's feature-flag rows
          1:1 instead of being a bespoke styled div. */}
      <div style={{ marginBottom: 14 }}>
        <FeatureSpotlight
          size="xs"
          on={!!data.callVoicemail}
          icon={<NIcons.mic />}
          name="Left voicemail"
          desc="Logs the call with a voicemail flag."
          onChange={(on) => set({ callVoicemail: on })}
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


/* ── EmptyState shown when no template is selected. */
function EmptyState() {
  return (
    <div style={{
      padding: 60, textAlign: 'center', color: 'var(--gb-text-muted)',
      fontSize: 13, fontFamily: 'var(--gb-font-sans)',
    }}>
      <TYPE_ICONS.note size={32} style={{ color: 'var(--gb-text-ghost)', marginBottom: 12 }} />
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
  const Panel = subType === 'task' ? TaskPanel
              : subType === 'call_log' ? CallLogPanel
              : NotePanel;

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
    <div style={{ fontFamily: 'var(--gb-font-sans)', color: 'var(--gb-text-secondary)' }}>

      {/* ── Header — shared EditorHeader, identical to TemplateEditor's. */}
      <EditorHeader
        icon={t.icon}
        title={data.name || 'New Note Template'}
        typeLabel={t.label.toUpperCase()}
        enabled={enabled}
        onToggle={() => setEnabled((e) => !e)}
        desc={<>Shows on: <span style={{ color: 'var(--gb-text-tertiary)', fontWeight: 600 }}>{t.surface}</span></>}
        onDelete={onDelete}
      />

      {/* ── Subtype tabs — Segmented gives the brand pill a layoutId
          spring (no "teleport" between options). Same component the
          email editor uses for its order/case/account picker. */}
      <div style={{ marginBottom: 12 }}>
        <Segmented value={subType} onChange={setSubType} options={SUBTYPE_OPTIONS} />
      </div>

      {/* ── Subtype panel ── */}
      <Panel data={data} set={set} />
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
  // Match editor-templates so the top gap and centered 750px column
  // are identical across the two editors.
  host.style.padding = '40px 0 48px';
  ensureTheme();
  createRoot(host).render(<NoteEditorRoot />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
