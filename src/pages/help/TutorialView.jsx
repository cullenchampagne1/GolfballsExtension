import React from 'react';
import { I, Tag, Card, Callout, SectionLabel } from '../../ui/index.js';

/* ───────────────────────────────────────────────────────────────
   TutorialView.jsx — step-by-step walkthrough renderer. Each step
   is a numbered card: action, expected result, visual cue, plus
   optional tip / heads-up / common-mistake callouts.

   Phase 3 upgrades this into the interactive TutorialPlayer
   (per-step completion persisted to chrome.storage.helpProgress);
   the data shape already supports it.
─────────────────────────────────────────────────────────────── */

const TIER_TONE = { beginner: 'success', intermediate: 'info', advanced: 'brand' };

function Step({ step, index }) {
  return (
    <Card padding={14}>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{
          width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
          background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800, color: 'var(--gb-brand-label)',
        }}>{index + 1}</div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.5, color: 'var(--gb-text-primary)' }}>
            {step.action}
          </div>
          {step.expected && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <I.check size={11} style={{ color: 'var(--gb-success-fg)', flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--gb-text-secondary)' }}>
                {step.expected}
              </span>
            </div>
          )}
          {step.visualCue && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <I.eye size={11} style={{ color: 'var(--gb-text-muted)', flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--gb-text-muted)' }}>
                {step.visualCue}
              </span>
            </div>
          )}
          {step.tip && <Callout tone="info" title="Tip">{step.tip}</Callout>}
          {step.warning && <Callout tone="warning" title="Heads up">{step.warning}</Callout>}
          {step.commonMistake && <Callout tone="error" title="Common mistake">{step.commonMistake}</Callout>}
        </div>
      </div>
    </Card>
  );
}

export function TutorialView({ tutorial, getArticleMeta, onNavigate }) {
  if (!tutorial) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 'var(--gb-r-md)', flexShrink: 0,
            background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--gb-brand-label)',
          }}>
            <I.play size={14} />
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--gb-text-primary)', letterSpacing: -0.2 }}>
            {tutorial.title}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <Tag tone={TIER_TONE[tutorial.tier] || 'neutral'} size="xs">{tutorial.tier}</Tag>
          <Tag tone="neutral" size="xs">{tutorial.steps.length} steps</Tag>
          <Tag tone="neutral" size="xs">~{tutorial.estMinutes} min</Tag>
        </div>
      </div>

      {/* Prerequisites */}
      {tutorial.prerequisites?.length > 0 && (
        <Callout tone="neutral" title="Before you start">
          <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {tutorial.prerequisites.map((p, i) => (
              <li key={i} style={{ fontSize: 11.5, lineHeight: 1.5 }}>{p}</li>
            ))}
          </ul>
        </Callout>
      )}

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tutorial.steps.map((s, i) => <Step key={i} step={s} index={i} />)}
      </div>

      {/* Related articles */}
      {tutorial.related?.length > 0 && (
        <div>
          <SectionLabel>Read more</SectionLabel>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {tutorial.related.map((slug) => {
              const meta = getArticleMeta?.(slug);
              if (!meta) return null;
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => onNavigate?.({ article: slug })}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px', borderRadius: 'var(--gb-r-pill)',
                    border: '1px solid var(--gb-border-default)',
                    background: 'var(--gb-fill-subtle)', cursor: 'pointer',
                    font: 'inherit', fontSize: 11, fontWeight: 600,
                    color: 'var(--gb-text-secondary)',
                  }}
                >
                  {meta.title}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
