import React from 'react';
import { I, Tag, Kbd, Btn, Card, SectionLabel, CollapsibleSection } from '../../ui/index.js';
import { HelpBlocks } from './blocks.jsx';

/* ───────────────────────────────────────────────────────────────
   DocsArticle.jsx — renders one help article record from
   helpContent.js: header (icon, title, tier tags, shortcut),
   tiered body sections (first tier inline, later tiers in
   collapsibles), FAQ, and related-article chips.

   onNavigate(ref) — ref is { article } or { tutorial }.
─────────────────────────────────────────────────────────────── */

const TIER_META = {
  beginner:     { label: 'Basics',        tone: 'success' },
  intermediate: { label: 'Everyday use',  tone: 'info' },
  advanced:     { label: 'Power user',    tone: 'brand' },
};
const LATER_TIER_TITLE = {
  intermediate: 'Going further',
  advanced:     'Power user',
};

function getIcon(name) {
  const Cmp = I[name] || I.sparkle;
  return <Cmp />;
}

export function DocsArticle({ article, getArticleMeta, onNavigate }) {
  if (!article) return null;
  const tiers = (article.tiers || []).filter((t) => article.body?.[t]?.length);
  const IconCmp = I[article.icon] || I.sparkle;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 'var(--gb-r-md)', flexShrink: 0,
            background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--gb-brand-label)',
          }}>
            <IconCmp size={15} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--gb-text-primary)', letterSpacing: -0.2 }}>
              {article.title}
            </div>
          </div>
          {article.shortcut && <Kbd>{article.shortcut}</Kbd>}
        </div>
        <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--gb-text-tertiary)', margin: '0 0 8px' }}>
          {article.summary}
        </p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tiers.map((t) => (
            <Tag key={t} tone={TIER_META[t]?.tone || 'neutral'} size="xs">{TIER_META[t]?.label || t}</Tag>
          ))}
          {article.flag && <Tag tone="neutral" size="xs">toggle: {article.flag}</Tag>}
        </div>
      </div>

      {/* Linked tutorial */}
      {article.tutorial && (
        <Btn
          variant="dashed" size="sm" icon={<I.play />}
          onClick={() => onNavigate?.({ tutorial: article.tutorial })}
          style={{ alignSelf: 'flex-start' }}
        >
          Open the step-by-step tutorial
        </Btn>
      )}

      {/* Body — first tier inline, later tiers collapsible */}
      {tiers.map((tier, i) => {
        const blocks = article.body[tier];
        if (i === 0) return <HelpBlocks key={tier} blocks={blocks} />;
        return (
          <CollapsibleSection
            key={tier}
            title={LATER_TIER_TITLE[tier] || TIER_META[tier]?.label || tier}
            defaultOpen={i === 1}
          >
            <div style={{ padding: '4px 2px' }}>
              <HelpBlocks blocks={blocks} />
            </div>
          </CollapsibleSection>
        );
      })}

      {/* FAQ */}
      {article.faq?.length > 0 && (
        <div>
          <SectionLabel>Questions</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {article.faq.map((f, i) => (
              <CollapsibleSection key={i} title={f.q}>
                <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--gb-text-secondary)', margin: 0, padding: '4px 2px' }}>
                  {f.a}
                </p>
              </CollapsibleSection>
            ))}
          </div>
        </div>
      )}

      {/* Release notes (What's New article) */}
      {article.releases?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {article.releases.map((r) => (
            <Card key={r.version} padding={14}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Tag tone="brand" size="xs">v{r.version}</Tag>
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {r.highlights.map((h, i) => (
                  <li key={i} style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--gb-text-secondary)' }}>{h}</li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {/* Related */}
      {article.related?.length > 0 && (
        <div>
          <SectionLabel>Related</SectionLabel>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {article.related.map((slug) => {
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
                    transition: 'background .12s, color .12s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--gb-brand-tint-soft)';
                    e.currentTarget.style.color = 'var(--gb-brand-label)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--gb-fill-subtle)';
                    e.currentTarget.style.color = 'var(--gb-text-secondary)';
                  }}
                >
                  {getIcon(meta.icon)}
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
