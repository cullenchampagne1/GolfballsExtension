import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

const ROW_TRANSITION = { duration: 0.22, ease: [0.32, 0.72, 0, 1] };
const ROW_INITIAL    = { opacity: 0, y: -6, scale: 0.985 };
const ROW_ANIMATE    = { opacity: 1, y: 0,  scale: 1 };
const ROW_EXIT       = { opacity: 0, scale: 0.94, transition: { duration: 0.14 } };
import { Tag } from './Tag.jsx';
import { Dot } from './Dot.jsx';
import { Btn } from './Btn.jsx';
import { IconBtn } from './IconBtn.jsx';
import { KindPill } from './KindPill.jsx';
import { BodyVar } from './BodyVar.jsx';
import { InlineVariableForm } from './InlineVariableForm.jsx';
import { useSettingNotification } from './SettingNotification.jsx';
import { I, Icon } from '../icons.jsx';

const VariableIcon = (p) => (
  <Icon {...p}>
    <path d="M5 4 a14 14 0 000 16M19 4a14 14 0 010 16"/>
    <path d="M9 9l6 6M9 15l6-6"/>
  </Icon>
);
// 5 columns: variable | kind | source | resolved | actions (single edit).
// Variable is the ONLY flexible column (1fr) — it absorbs all leftover
// space. Kind/Source/Resolved are fixed widths so headers + rows resolve
// to the same track sizes (separate grids can't share `max-content` /
// `fit-content` measurements, which is why the headers were drifting
// rightward away from the data). Actions stays at 28px for the edit btn.
const COL_GRID = 'minmax(0, 1fr) 84px 120px 120px 28px';

/**
 * VariableTable — 5-column grid showing all variables for a template.
 * Columns: name · kind · source config · resolved value · actions.
 * Status is conveyed by BodyVar's chip color rather than a separate column.
 *
 * Props:
 *   typeId       'order'|'case'|'account'
 *   vars         Variable[]
 *   onAdd        () => void      — fires when the dashed Add row is clicked
 *   onDelete     (name) => void
 *   onEdit       ({oldName, newName}, variable) => void — renames only.
 *                Changing kind is intentionally not supported: each kind
 *                stores config in a different shape (path vs regex vs
 *                literal), so the only sane way to "change kind" is to
 *                delete and re-add. Reduces the rename UI to a native prompt.
 *   onOpenSmart  (variable) => void — opens the smart-options modal
 */
export function VariableTable({ typeId, vars = [], onAdd, onDelete, onEdit, onOpenSmart, paEnabled = false, onExport }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [exported, setExported] = useState(false);
  const notify = useSettingNotification();

  // Copy the variables as an import-shaped JSON blob — for pasting into a
  // model conversation as context ("here's a previous version and the
  // variables we used"). Same shape the toolset doc + Import dialog use.
  const exportVars = async () => {
    if (!onExport) return;
    try {
      await navigator.clipboard.writeText(onExport());
      setExported(true);
      setTimeout(() => setExported(false), 1600);
    } catch {
      notify.notify('Couldn’t write to the clipboard.', { tone: 'warning' });
    }
  };

  return (
    <div style={{
      border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-lg)',
      overflow: 'hidden',
      background: 'var(--gb-surface-canvas)',
    }}>
      {/* Panel header */}
      <div style={{
        padding: '7px 10px',
        background: 'var(--gb-surface-modal)',
        borderBottom: '1px solid var(--gb-border-subtle)',
        display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap',
      }}>
        <VariableIcon size={12} style={{ color: 'var(--gb-brand-label)' }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gb-text-primary)' }}>
          Variables
        </span>
        {/* Single combined status tag — "<ok>/<total> resolved" with tone
            tracking completeness. Replaces the dual "resolved/unresolved"
            chips which were saying the same thing twice. */}
        {vars.length > 0 && (() => {
          const okN = vars.filter(v => v.status === 'ok').length;
          const allOk = okN === vars.length;
          return (
            <Tag tone={allOk ? 'brand' : 'warning'} size="xs">
              {okN}/{vars.length} resolved
            </Tag>
          );
        })()}
        {/* Deprecated-variable count — the one-version migration flags
            legacy vars it couldn't lift onto the engine. Sending a template
            with any of these throws until they're fixed. */}
        {vars.some((v) => v.deprecated) && (
          <span title="These variables are deprecated — fix them or sending this template will fail">
            <Tag tone="error" size="xs">
              {vars.filter((v) => v.deprecated).length} deprecated
            </Tag>
          </span>
        )}
        <div style={{ flex: 1 }} />
        {vars.length > 0 && onExport && (
          <IconBtn
            size="xs"
            icon={exported ? <I.check /> : <I.copy />}
            tooltip="Copy variables as JSON — paste into a model chat as context"
            onClick={exportVars}
          />
        )}
        <span style={{ fontSize: 9.5, color: 'var(--gb-text-muted)' }}>
          Live
        </span>
        <Dot tone="brand" glow size={5} />
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: COL_GRID,
        gap: 7, padding: '5px 10px',
        background: 'var(--gb-surface-canvas)',
        borderBottom: '1px solid var(--gb-border-subtle)',
        fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: 0.5, color: 'var(--gb-text-muted)',
      }}>
        <div>Variable</div>
        <div>Kind</div>
        <div>Source</div>
        <div>Resolved</div>
        <div />
      </div>

      {/* Rows — wrapped in popLayout AnimatePresence so add/delete shift
          neighbors smoothly instead of snapping. */}
      <AnimatePresence mode="popLayout" initial={false}>
      {vars.map((v, i) => {
        const hasSmart = !!(v.smart && (
          (typeof v.smart.fallback === 'string' && v.smart.fallback.length > 0)
            || v.smart.transform
            || v.smart.conditional
            || v.smart.format
        ));
        const isMissNoFallback = v.status === 'miss' && !hasSmart;

        return (
          <motion.div
            key={v.name}
            layout
            initial={ROW_INITIAL}
            animate={ROW_ANIMATE}
            exit={ROW_EXIT}
            transition={ROW_TRANSITION}
            style={{
              display: 'grid', gridTemplateColumns: COL_GRID,
              gap: 7, padding: '6px 10px', alignItems: 'center',
              borderBottom: i < vars.length - 1 ? '1px solid var(--gb-border-subtle)' : 'none',
              fontSize: 10,
              background: v.deprecated
                ? 'var(--gb-error-tint-soft, var(--gb-warning-tint-soft))'
                : (isMissNoFallback ? 'var(--gb-warning-tint-soft)' : 'transparent'),
            }}
          >
            {/* Name — the canonical BodyVar chip at table density.
                Bolt is BodyVar's own clickable smart-options button. */}
            <div style={{ minWidth: 0, display: 'flex' }}>
              <BodyVar v={v} size="sm" onOpenSmart={onOpenSmart} />
            </div>

            {/* Kind (+ deprecation badge from the one-version migration) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
              <KindPill kind={v.kind} />
              {v.deprecated && (
                <span title={v.deprecatedReason || 'Uses a deprecated variable — fix it to keep sending this template'}>
                  <Tag tone="error" size="xs">deprecated</Tag>
                </span>
              )}
            </div>

            {/* Source config */}
            <div style={{
              fontFamily: 'var(--gb-font-mono)', fontSize: 9.5,
              color: 'var(--gb-text-tertiary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {v.config}
            </div>

            {/* Resolved value */}
            <div style={{
              color: v.resolved ? 'var(--gb-text-primary)' : 'var(--gb-warning-fg)',
              fontWeight: 600,
              fontStyle: v.resolved ? 'normal' : 'italic',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {v.resolved
                || (hasSmart && v.smart?.fallback ? `↳ "${v.smart.fallback}"` : '— not found —')
              }
            </div>

            {/* Actions — single edit button that opens the rename prompt;
                the prompt itself surfaces a Delete option as its tertiary
                action. One button per row keeps the actions column slim
                and the destructive action gated behind a confirm step. */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <IconBtn
                size="sm"
                icon={<I.edit />}
                tooltip="Edit variable"
                onClick={() => { setAdding(false); setEditing(v); }}
              />
            </div>
          </motion.div>
        );
      })}
      </AnimatePresence>

      {/* Inline add-variable form — slides into the table when the
          dashed Add button is clicked. Replaces the legacy modal. */}
      <AnimatePresence initial={false}>
        {editing && (
          <InlineVariableForm
            key={`inline-edit-${editing.name}`}
            typeId={typeId}
            initialVariable={editing}
            varNames={vars.filter((v) => v.name !== editing.name).map((v) => v.name)}
            onAdd={(payload) => {
              onEdit?.({ oldName: editing.name, newName: payload.name }, payload);
              setEditing(null);
            }}
            onDelete={() => { onDelete?.(editing.name); setEditing(null); }}
            onCancel={() => setEditing(null)}
          />
        )}
        {adding && (
          <InlineVariableForm
            key="inline-add"
            typeId={typeId}
            varNames={vars.map((v) => v.name)}
            onAdd={(payload) => { onAdd?.(payload); setAdding(false); }}
            onCancel={() => setAdding(false)}
          />
        )}
      </AnimatePresence>
      {!adding && !editing && (
        <div style={{
          padding: 8,
          background: 'var(--gb-surface-modal)',
          borderTop: '1px solid var(--gb-border-subtle)',
        }}>
          <Btn variant="dashed" size="sm" icon={<I.plus />} full onClick={() => { setEditing(null); setAdding(true); }}>
            Add variable
          </Btn>
        </div>
      )}
    </div>
  );
}
