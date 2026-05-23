import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import {
  Btn, Tag,
  Input, Textarea, Dropdown, Field,
  SwitchTag, Segmented,
  I, Icon,
} from '../ui/index.js';

/* ─────────────────────────────────────────────────────────────
   editor-notes.jsx — React editor for QUICK-NOTE templates.

   Mirrors editor-templates.jsx in shape: mounts into #ed-note-form,
   listens for window.__gbOpenNote(tpl), auto-saves via
   window.__gbSaveNote(tpl). No save button.

   Note templates have three subtypes, each with a different field
   set. The legacy form used a hidden-section pattern (toggle sec by
   subType) — here it's a single Segmented switcher up top driving
   conditional render of each section.
───────────────────────────────────────────────────────────── */

/* ── Subtype metadata: matches backup/editor.js shape so saved
   tpl.subType values round-trip without translation. */
const NoteIcon = (p) => <Icon {...p}><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></Icon>;
const TaskIcon = (p) => <Icon {...p}><polyline points="20 6 9 17 4 12"/></Icon>;
const CallIcon = (p) => <Icon {...p}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/></Icon>;

const SUBTYPE_OPTIONS = [
  { id: 'note',     label: 'Note',     icon: <NoteIcon /> },
  { id: 'task',     label: 'Task',     icon: <TaskIcon /> },
  { id: 'call_log', label: 'Call Log', icon: <CallIcon /> },
];

const SUBTYPE_META = {
  note:     { label: 'Note',     desc: 'Audience-targeted note dropped into the CRM with one click.', color: 'var(--gb-text-tertiary)' },
  task:     { label: 'Task',     desc: 'Quick-create a CRM task with preset priority and due date.', color: 'var(--gb-brand-label)' },
  call_log: { label: 'Call Log', desc: 'Pre-filled call log for outbound/inbound recap workflow.',  color: 'var(--gb-info-fg)' },
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

/* Verbatim from editor.html — CRM enum IDs map 1:1 to the legacy <option> values. */
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

/* ── EmptyState mirrors editor-templates' empty card. */
function EmptyState() {
  return (
    <div style={{
      padding: 60, textAlign: 'center', color: 'var(--gb-text-muted)',
      fontSize: 13, fontFamily: 'var(--gb-font-sans)',
    }}>
      <NoteIcon size={32} style={{ color: 'var(--gb-text-ghost)', marginBottom: 12 }} />
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gb-text-secondary)', marginBottom: 4 }}>
        No note template selected
      </div>
      <div>Pick one from the sidebar, or create a new one.</div>
    </div>
  );
}

/* ── NoteEditor — the full form. */
function NoteEditor({ tpl, onDelete }) {
  const initialSubType = tpl.subType || 'note';
  const [subType,  setSubType]  = useState(initialSubType);
  const meta = SUBTYPE_META[subType] || SUBTYPE_META.note;

  /* Common fields. */
  const [enabled,  setEnabled]  = useState(tpl.enabled !== false);
  const [name,     setName]     = useState(tpl.name || '');

  /* Note-subtype fields. */
  const [audience, setAudience] = useState(tpl.audienceVal || '');
  const [subject,  setSubject]  = useState(tpl.subject || '');
  const [body,     setBody]     = useState(tpl.body || '');
  const [daysOut,  setDaysOut]  = useState(tpl.daysOut != null ? String(tpl.daysOut) : '');

  /* Task-subtype fields. */
  const [priority,    setPriority]    = useState(String(tpl.priority   ?? 2));
  const [categoryId,  setCategoryId]  = useState(String(tpl.categoryId ?? 0));

  /* Call-log-subtype fields. */
  const [callDirection, setCallDirection] = useState(String(tpl.callDirection ?? 0));
  const [callCategory,  setCallCategory]  = useState(String(tpl.callCategory  ?? 0));
  const [callVoicemail, setCallVoicemail] = useState(!!tpl.callVoicemail);
  const [callStep1, setCallStep1] = useState(tpl.callStep1 || '');
  const [callStep2, setCallStep2] = useState(tpl.callStep2 || '');
  const [callStep3, setCallStep3] = useState(tpl.callStep3 || '');
  const [callStep4, setCallStep4] = useState(tpl.callStep4 || '');

  /* Build the storage shape — mirrors backup/editor.js collectNoteTemplate.
     Subtype-specific fields are explicitly `undefined` when not relevant
     so type-switching doesn't strand stale data. */
  function buildTemplate() {
    const isTask    = subType === 'task';
    const isCallLog = subType === 'call_log';
    const trimmed   = name.trim() || (isTask ? 'Untitled Task' : isCallLog ? 'Untitled Call Log' : 'Untitled');
    const days      = parseInt(daysOut, 10);
    return {
      ...tpl,
      id: tpl.id,
      name: trimmed,
      subType,
      enabled,
      audienceVal:   isTask || isCallLog ? '' : audience.trim(),
      subject:       isCallLog ? subject.trim() : subject.trim(),
      body,
      daysOut:       (!isNaN(days) && days >= 0) ? days : null,
      priority:      isTask    ? (parseInt(priority, 10) || 2) : undefined,
      categoryId:    isTask    ? (parseInt(categoryId, 10) || 0) : undefined,
      callDirection: isCallLog ? (parseInt(callDirection, 10) || 0) : undefined,
      callCategory:  isCallLog ? (parseInt(callCategory, 10)  || 0) : undefined,
      callVoicemail: isCallLog ? !!callVoicemail : undefined,
      callStep1:     isCallLog ? callStep1.trim() : undefined,
      callStep2:     isCallLog ? callStep2.trim() : undefined,
      callStep3:     isCallLog ? callStep3.trim() : undefined,
      callStep4:     isCallLog ? callStep4.trim() : undefined,
      updatedAt: Date.now(),
    };
  }

  /* Auto-save — same debounced pattern as editor-templates. Skip the
     first render so the initial load doesn't re-write storage. */
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
  }, [
    name, enabled, audience, subject, body, daysOut,
    priority, categoryId,
    callDirection, callCategory, callVoicemail,
    callStep1, callStep2, callStep3, callStep4,
  ]);

  /* Subtype change saves immediately so the sidebar's row-teleport
     animation kicks in within a frame (matches email-template pattern). */
  useEffect(() => {
    if (skipTypeSave.current) { skipTypeSave.current = false; return; }
    if (typeof window.__gbSaveNote === 'function') window.__gbSaveNote(buildTemplate());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subType]);

  const S = {
    mb8:  { marginBottom: 8  },
    mb12: { marginBottom: 12 },
    mb14: { marginBottom: 14 },
    label: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--gb-text-muted)', display: 'block', marginBottom: 6 },
  };

  const TypeIcon = subType === 'task' ? TaskIcon : subType === 'call_log' ? CallIcon : NoteIcon;

  return (
    <div style={{
      maxWidth: 750, margin: '0 auto', padding: '0 20px',
      fontFamily: 'var(--gb-font-sans)', color: 'var(--gb-text-primary)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 'var(--gb-r-md)',
          background: 'var(--gb-fill-subtle)',
          border: '1px solid var(--gb-border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: meta.color, flexShrink: 0,
        }}>
          <TypeIcon size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--gb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
              {name || 'Untitled'}
            </div>
            <Tag tone="neutral" size="xs" mono style={{ flexShrink: 0 }}>{subType.toUpperCase()}</Tag>
            <SwitchTag size="xs" on={enabled} label={enabled ? 'Enabled' : 'Disabled'} onClick={() => setEnabled((e) => !e)} style={{ flexShrink: 0 }} />
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>{meta.desc}</div>
        </div>
        <Btn variant="danger" size="sm" icon={<I.trash />} onClick={onDelete}>Delete</Btn>
      </div>

      {/* Subtype switcher */}
      <div style={{ marginBottom: 12 }}>
        <Segmented value={subType} onChange={setSubType} options={SUBTYPE_OPTIONS} />
      </div>

      {/* ── NOTE subtype ──────────────────────────────────── */}
      {subType === 'note' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, ...S.mb12 }}>
            <Field label="Button label">
              <Input value={name} placeholder="e.g. Proof Requested" size="sm" onChange={setName} />
            </Field>
            <Field label="Audience value" hint="Must match a CRM option exactly">
              <Input value={audience} placeholder="e.g. Custom Logo" size="sm" onChange={setAudience} />
            </Field>
          </div>

          <div style={S.mb12}>
            <span style={S.label}>Subject</span>
            <Input value={subject} placeholder="e.g. Art Update" size="sm" onChange={setSubject} />
            <div style={{ marginTop: 4, fontSize: 10, color: 'var(--gb-text-muted)' }}>
              Insert <code style={{ fontFamily: 'var(--gb-font-mono)' }}>{'{{date}}'}</code> or <code style={{ fontFamily: 'var(--gb-font-mono)' }}>{'{{time}}'}</code> for live values.
            </div>
          </div>

          <div style={S.mb12}>
            <span style={S.label}>Body</span>
            <Textarea
              value={body}
              placeholder="e.g. Proof Requested {{date}}"
              rows={5}
              resize="vertical"
              onChange={setBody}
            />
          </div>

          <Field label="Push dates (days out)" hint="Pushes Approval and Commitment dates forward automatically">
            <Input
              type="number" size="sm"
              value={daysOut}
              placeholder="e.g. 2"
              onChange={(v) => setDaysOut(v.replace(/[^0-9]/g, ''))}
              style={{ width: 120 }}
            />
          </Field>
        </>
      )}

      {/* ── TASK subtype ──────────────────────────────────── */}
      {subType === 'task' && (
        <>
          <Field label="Button label" hint="Short label shown on the quick-create button">
            <Input value={name} placeholder="e.g. Follow Up" size="sm" onChange={setName} />
          </Field>
          <div style={S.mb12} />

          <Field label="Subject" hint="The actual task name created in the CRM">
            <Input value={subject} placeholder="e.g. Follow up on quote sent {{date}}" size="sm" onChange={setSubject} />
          </Field>
          <div style={S.mb12} />

          <div style={S.mb12}>
            <span style={S.label}>Description</span>
            <Textarea
              value={body}
              placeholder="Optional detail about what this task involves…"
              rows={4}
              resize="vertical"
              onChange={setBody}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, ...S.mb12 }}>
            <Field label="Priority">
              <Dropdown size="sm" value={priority} options={PRIORITY_OPTIONS} onChange={setPriority} />
            </Field>
            <Field label="Due date (days out)">
              <Input
                type="number" size="sm"
                value={daysOut}
                placeholder="0"
                onChange={(v) => setDaysOut(v.replace(/[^0-9]/g, ''))}
              />
            </Field>
            <Field label="Category ID" hint="0 = Other">
              <Input
                type="number" size="sm" mono
                value={categoryId}
                placeholder="0"
                onChange={(v) => setCategoryId(v.replace(/[^0-9]/g, ''))}
              />
            </Field>
          </div>
        </>
      )}

      {/* ── CALL LOG subtype ──────────────────────────────── */}
      {subType === 'call_log' && (
        <>
          <Field label="Button label" hint="Shown on the quick-log button on contact pages">
            <Input value={name} placeholder="e.g. Promo Follow-Up" size="sm" onChange={setName} />
          </Field>
          <div style={S.mb12} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 8, ...S.mb12 }}>
            <Field label="Direction">
              <Dropdown size="sm" value={callDirection} options={CALL_DIRECTION_OPTIONS} onChange={setCallDirection} />
            </Field>
            <Field label="Category">
              <Dropdown size="sm" searchable value={callCategory} options={CALL_CATEGORY_OPTIONS} onChange={setCallCategory} />
            </Field>
          </div>

          {/* Voicemail toggle — xs SwitchTag like reply mode in email editor. */}
          <div style={{ ...S.mb12, display: 'flex' }}>
            <SwitchTag
              size="xs"
              on={callVoicemail}
              label="Left voicemail"
              icon={<I.bolt />}
              onClick={() => setCallVoicemail((v) => !v)}
            />
          </div>

          <Field label="Subject">
            <Input value={subject} placeholder="e.g. Bridgestone & Srixon Promo Follow-Up" size="sm" onChange={setSubject} />
          </Field>
          <div style={S.mb12} />

          <div style={S.mb12}>
            <span style={S.label}>Description</span>
            <Textarea
              value={body}
              placeholder="What was discussed on the call…"
              rows={4}
              resize="vertical"
              onChange={setBody}
            />
          </div>

          {/* Call steps — four optional checklist-style steps the user can
              pre-fill so the rep follows a script. */}
          <div style={S.mb12}>
            <span style={S.label}>Call steps</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                ['Step 1', callStep1, setCallStep1],
                ['Step 2', callStep2, setCallStep2],
                ['Step 3', callStep3, setCallStep3],
                ['Step 4', callStep4, setCallStep4],
              ].map(([label, value, setter]) => (
                <Input
                  key={label}
                  value={value}
                  placeholder={`${label} — e.g. introduce yourself`}
                  size="sm"
                  onChange={setter}
                  leading={
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--gb-text-muted)', letterSpacing: 0.3 }}>
                      {label.replace(/[^\d]/g, '')}
                    </span>
                  }
                />
              ))}
            </div>
          </div>
        </>
      )}
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
  // Match editor-templates' host padding so spacing is consistent.
  host.style.padding = '40px 0 48px';
  ensureTheme();
  createRoot(host).render(<NoteEditorRoot />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
