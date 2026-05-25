import React from 'react';
import { Btn } from './Btn.jsx';
import { IconBtn } from './IconBtn.jsx';
import { Input } from './Input.jsx';
import { I } from '../icons.jsx';

/* ───────────────────────────────────────────────────────────────
   StepsEditor — up-to-4 next-step actions, edited as an array.

   The persisted shape on a Template is callStep1..4 (legacy
   collectNoteTemplate / call-log activity records); editors and
   the Call Log modal flatten that to an array of strings for
   ergonomic add / remove, then convert back on save.

   Used by:
     • src/pages/NoteEditor.jsx (call_log subtype panel)
     • src/modals/CallLog.jsx   (custom log section)

   Props
     steps     string[]                   current value, 0-4 items
     onChange  (next: string[]) => void   emits the new array
─────────────────────────────────────────────────────────────── */
export function StepsEditor({ steps, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Numbered chip — tinted when the row has content, muted
              when empty, so the visual stack reads as "filled steps
              vs placeholders" at a glance. */}
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
          <IconBtn
            size="sm"
            icon={<I.trash />}
            danger
            onClick={() => onChange(steps.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      {steps.length < 4 && (
        <Btn
          variant="dashed"
          size="sm"
          icon={<I.plus />}
          full
          onClick={() => onChange([...steps, ''])}
        >
          Add step {steps.length + 1}/4
        </Btn>
      )}
    </div>
  );
}
