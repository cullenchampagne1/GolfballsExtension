import React from 'react';
import { I } from '../icons.jsx';

/**
 * StepToast — progress through a multi-step async operation. Shows a
 * checklist with done/active/pending states + a spinner in the header.
 *
 * Use for:  a long-running pipeline with 3–6 discrete, named steps.
 * Avoid:    one-shot operations — use a PillToast instead.
 *
 * Required CSS (already in theme.css):
 *   @keyframes gb-toast-in-top
 *   @keyframes gb-spin
 *   @keyframes gb-pulse
 *
 * Props
 *   steps        string[]            — labels, in order
 *   currentStep  number              — 0-indexed active step
 *   title        string?             — header label  (default "Submitting…")
 *   onDismiss    () => void
 *   size         'md' | 'sm'          default 'md'
 */
const SIZES = {
  md: { width: 340, headPad: '10px 12px', spinner: 12, head: 12,   bodyPad: 12, gap: 8, dot: 16, dotIcon: 9, font: 11.5, time: 9.5, close: 10 },
  sm: { width: 280, headPad: '7px 9px',   spinner: 10, head: 11,   bodyPad: 9,  gap: 6, dot: 13, dotIcon: 8, font: 10.5, time: 9,   close: 9  },
};

export function StepToast({
  steps = [], currentStep = 0, title = 'Submitting…', onDismiss, size = 'md',
}) {
  const s = SIZES[size] || SIZES.md;
  return (
    <div style={{
      pointerEvents: 'auto',
      width: s.width,
      background: 'var(--gb-surface-1)',
      border: '1px solid var(--gb-brand-tint-border)',
      borderRadius: 'var(--gb-r-lg)',
      boxShadow: 'var(--gb-shadow-popover)',
      overflow: 'hidden',
      animation: 'gb-toast-in-top .35s cubic-bezier(.34,1.4,.64,1) both',
    }}>
      {/* Header — spinner + title + close */}
      <div style={{
        padding: s.headPad,
        display: 'flex', alignItems: 'center', gap: 9,
        borderBottom: '1px solid var(--gb-border-subtle)',
        background: 'var(--gb-brand-tint-soft)',
      }}>
        <span style={{
          width: s.spinner, height: s.spinner, borderRadius: '50%',
          border: '2px solid var(--gb-brand-label)', borderTopColor: 'transparent',
          animation: 'gb-spin .8s linear infinite',
        }} />
        <div style={{ flex: 1, fontSize: s.head, fontWeight: 700, color: 'var(--gb-brand-label)' }}>{title}</div>
        <span onClick={onDismiss} style={{ cursor: 'pointer', color: 'var(--gb-text-muted)', display: 'flex' }}>
          <I.close size={s.close} />
        </span>
      </div>

      {/* Step list */}
      <div style={{ padding: s.bodyPad, display: 'flex', flexDirection: 'column', gap: s.gap }}>
        {steps.map((step, i) => {
          const state = i < currentStep ? 'done' : i === currentStep ? 'active' : 'pending';
          return (
            <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{
                width: s.dot, height: s.dot, borderRadius: '50%', flexShrink: 0,
                background: state === 'done'   ? 'var(--gb-brand-label)'
                         : state === 'active' ? 'var(--gb-brand-tint-medium)'
                                              : 'var(--gb-fill-subtle)',
                border: '1.5px solid ' + (state === 'pending' ? 'var(--gb-border-strong)' : 'var(--gb-brand-label)'),
                color: state === 'done' ? '#0a0b0c' : 'var(--gb-brand-label)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {state === 'done' && <I.check size={s.dotIcon} strokeWidth={3} />}
                {state === 'active' && (
                  <span style={{
                    width: Math.round(s.dot / 3), height: Math.round(s.dot / 3), borderRadius: '50%',
                    background: 'var(--gb-brand-label)',
                    animation: 'gb-pulse 1.2s ease-in-out infinite',
                  }} />
                )}
              </div>
              <span style={{
                fontSize: s.font,
                color: state === 'pending' ? 'var(--gb-text-muted)'
                     : state === 'done'    ? 'var(--gb-text-tertiary)'
                                           : 'var(--gb-text-primary)',
                fontWeight: state === 'active' ? 600 : 500,
                textDecoration:      state === 'done' ? 'line-through' : 'none',
                textDecorationColor: 'var(--gb-text-ghost)',
              }}>{step}</span>
              {state === 'done'   && <span style={{ fontSize: s.time, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)', marginLeft: 'auto' }}>0.8s</span>}
              {state === 'active' && <span style={{ fontSize: s.time, color: 'var(--gb-brand-label)', marginLeft: 'auto' }}>…</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
