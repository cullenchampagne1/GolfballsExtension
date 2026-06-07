import React from 'react';
import { Btn } from './Btn.jsx';
import { IconBtn } from './IconBtn.jsx';
import { I } from '../icons.jsx';

/* ───────────────────────────────────────────────────────────────
   TemplateSplits — the shared A/B split control.

   One stacked proportion bar + a weighted slider per row, where the
   weights ALWAYS sum to 100: dragging one slider redistributes the
   remainder across the others in proportion to their current values
   (the same model the Quick Send / EmailRunner variation weights use).

   Reused by:
     • EmailRunner — fixed variation rows (renderLabel = text).
     • Campaign StepInspector — each row is a template picker, with
       add/remove (renderLabel = a <TemplatePicker/>, onAdd/onRemove set).

   Controlled: pass `items` ([{ id, label? }]) + `weights` ({ [id]: n })
   and an `onChange(nextWeights)` that receives the full redistributed
   map. Optional `renderLabel(item)` swaps the row's label cell;
   `onAdd` / `onRemove(id)` enable editing the row set.
─────────────────────────────────────────────────────────────── */

/* Per-row index → a tint of the brand color, matching the stacked bar
   segment so a slider maps back to its stripe without reading labels. */
export function splitStripeColor(idx) {
  const pcts = [100, 60, 30, 18, 12, 8];
  const pct = pcts[idx] ?? Math.max(6, 100 - idx * 18);
  return pct === 100
    ? 'var(--gb-brand-label)'
    : `color-mix(in srgb, var(--gb-brand-label) ${pct}%, transparent)`;
}

/* Move `targetId` to `raw`%, split the remainder among the others in
   proportion to their current weights (equal split when they were all
   zero). Returns the full next weights map. */
export function redistributeWeights(weights, ids, targetId, raw) {
  const clamped = Math.max(0, Math.min(100, Number(raw) || 0));
  const others = ids.filter((id) => id !== targetId);
  if (others.length === 0) return { [targetId]: 100 };
  const oldOthersSum = others.reduce((s, id) => s + (weights[id] || 0), 0);
  const remainder = 100 - clamped;
  const next = { [targetId]: clamped };
  if (oldOthersSum <= 0) {
    const each = remainder / others.length;
    for (const id of others) next[id] = each;
  } else {
    for (const id of others) next[id] = remainder * ((weights[id] || 0) / oldOthersSum);
  }
  return next;
}

/* Equal-split weights for a set of ids — handy when initializing. */
export function equalWeights(ids) {
  if (!ids.length) return {};
  const each = 100 / ids.length;
  return Object.fromEntries(ids.map((id) => [id, each]));
}

function SplitRow({ colorIndex, label, value, onChange, onRemove, disabled }) {
  const rounded = Math.round(value);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `10px minmax(0, 1.3fr) minmax(0, 1.4fr) 36px${onRemove ? ' 22px' : ''}`,
      gap: 10, alignItems: 'center',
    }}>
      <div style={{ width: 8, height: 8, borderRadius: 2, background: splitStripeColor(colorIndex) }} />
      <div style={{ minWidth: 0, fontSize: 11, color: 'var(--gb-text-secondary)', overflow: 'hidden' }}>
        {label}
      </div>
      <input
        type="range" min={0} max={100} step={1} value={rounded}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        style={{ width: '100%', accentColor: 'var(--gb-brand-fg)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}
      />
      <div style={{ fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--gb-text-primary)', textAlign: 'right' }}>{rounded}%</div>
      {onRemove && (
        <IconBtn size="xs" variant="ghost" danger icon={<I.trash size={10} />} onClick={onRemove} disabled={disabled} />
      )}
    </div>
  );
}

export function TemplateSplits({ items, weights, onChange, disabled, renderLabel, onAdd, onRemove, addLabel = 'Add split' }) {
  const ids = items.map((it) => it.id);
  const change = (targetId, raw) => onChange?.(redistributeWeights(weights || {}, ids, targetId, raw));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: 12, background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-md)' }}>
      {/* Stacked proportion bar */}
      <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', border: '1px solid var(--gb-border-subtle)' }}>
        {items.map((it, idx) => (
          <div key={it.id}
            style={{ flex: (weights?.[it.id] || 0.0001), background: splitStripeColor(idx), minWidth: 0, transition: 'flex .35s cubic-bezier(.4,0,.2,1)' }}
            title={`${typeof it.label === 'string' ? it.label : 'Split'}: ${Math.round(weights?.[it.id] || 0)}%`} />
        ))}
      </div>

      {items.map((it, idx) => (
        <SplitRow
          key={it.id}
          colorIndex={idx}
          label={renderLabel ? renderLabel(it) : it.label}
          value={weights?.[it.id] || 0}
          onChange={(v) => change(it.id, v)}
          onRemove={onRemove && items.length > 1 ? () => onRemove(it.id) : undefined}
          disabled={disabled}
        />
      ))}

      {onAdd && (
        <div>
          <Btn size="xs" variant="dashed" icon={<I.plus size={10} />} onClick={onAdd} disabled={disabled}>{addLabel}</Btn>
        </div>
      )}
    </div>
  );
}
