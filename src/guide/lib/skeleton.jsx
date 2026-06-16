import React, { useState } from 'react';
import { I, Icon } from '../../ui/index.js';
import { GIcon } from './app.jsx';
import { LiveStage } from './stage.jsx';

/* ───────────────────────────────────────────────────────────────
   skeleton.jsx — a themed wireframe ("skeleton") of a feature's
   modal/surface, driven by a compact spec, wired into a LiveStage
   so every guide page gets the same Tour / Play walkthrough / Try-it
   treatment as the bespoke live pages.

   A spec:
     {
       title, icon,                 // modal header
       frameLabel,                  // chrome label
       width,                       // device width (px)
       regions: [
         { key, label, hint, kind, lines?, cols? }
       ]
     }
   Each region renders as a labelled wireframe block tagged with
   data-demo={key}; LiveStage's Tour pins + Play cursor target those.
   Callouts and walkthrough steps are derived from the regions, so a
   spec is all a page needs to get the full three-mode stage.
─────────────────────────────────────────────────────────────── */

const NavGlyph = ({ name, size = 14 }) => {
  const Fn = I[name] || GIcon[name] || I.cog;
  return <Fn size={size} />;
};

const Bar = ({ w = '100%', h = 8, r = 4, op = 1, mb = 0 }) => (
  <div style={{ width: w, height: h, borderRadius: r, background: 'var(--gb-fill-strong)', opacity: op, marginBottom: mb }} />
);
const Chip = ({ w = 56, accent = false }) => (
  <div style={{ width: w, height: 22, borderRadius: 'var(--gb-r-pill)', flexShrink: 0, background: accent ? 'var(--gb-brand-tint-soft)' : 'var(--gb-fill-subtle)', border: `1px solid ${accent ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-subtle)'}` }} />
);
const Btn = ({ w = 78, accent = false }) => (
  <div style={{ width: w, height: 28, borderRadius: 'var(--gb-r-sm)', flexShrink: 0, background: accent ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-subtle)', border: `1px solid ${accent ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'}` }} />
);

/* One wireframe block per `kind`. Each is a labelled container so the
   skeleton reads as a real surface, not random gray bars. */
function RegionBody({ kind, lines = 3, cols = 3 }) {
  switch (kind) {
    case 'field':
      return <div style={{ height: 32, borderRadius: 'var(--gb-r-sm)', background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)', display: 'flex', alignItems: 'center', padding: '0 10px' }}><Bar w="40%" h={7} /></div>;
    case 'buttons':
      return <div style={{ display: 'flex', gap: 8 }}>{Array.from({ length: cols }).map((_, i) => <Btn key={i} accent={i === 0} />)}</div>;
    case 'toolbar':
      return <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ flex: 1 }}><div style={{ height: 30, borderRadius: 'var(--gb-r-sm)', background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)' }} /></div><Chip w={52} /><Btn w={64} accent /></div>;
    case 'list':
      return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)' }} />
          <div style={{ flex: 1 }}><Bar w={`${70 - i * 9}%`} h={8} mb={5} /><Bar w={`${45 - i * 6}%`} h={6} op={0.6} /></div>
          <Chip w={40} />
        </div>
      ))}</div>;
    case 'table':
      return <div style={{ border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-sm)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 12, padding: '8px 10px', background: 'var(--gb-surface-1)', borderBottom: '1px solid var(--gb-border-default)' }}>{Array.from({ length: cols }).map((_, i) => <Bar key={i} w={i === 0 ? '34%' : '18%'} h={6} op={0.7} />)}</div>
        {Array.from({ length: lines }).map((_, i) => <div key={i} style={{ display: 'flex', gap: 12, padding: '9px 10px', borderBottom: i < lines - 1 ? '1px solid var(--gb-border-subtle)' : 'none' }}>{Array.from({ length: cols }).map((__, j) => <Bar key={j} w={j === 0 ? '34%' : '18%'} h={7} />)}</div>)}
      </div>;
    case 'grid':
      return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>{Array.from({ length: cols * 2 }).map((_, i) => (
        <div key={i} style={{ borderRadius: 'var(--gb-r-sm)', border: '1px solid var(--gb-border-subtle)', background: 'var(--gb-surface-1)', padding: 8 }}>
          <div style={{ height: 36, borderRadius: 4, background: 'var(--gb-fill-subtle)', marginBottom: 7 }} /><Bar w="80%" h={6} mb={4} /><Bar w="50%" h={6} op={0.6} />
        </div>
      ))}</div>;
    case 'preview':
      return <div style={{ height: 150, borderRadius: 'var(--gb-r-md)', border: '1px solid var(--gb-border-default)', background: 'radial-gradient(120% 120% at 50% 0%, var(--gb-brand-tint-soft) 0%, transparent 60%), var(--gb-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 84, height: 84, borderRadius: '50%', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)' }} /></div>;
    case 'swatches':
      return <div style={{ display: 'flex', gap: 10 }}>{['#0e0f10', '#050507', '#f4f5f6', '#f5efe2'].map((c, i) => <div key={i} style={{ width: 40, height: 40, borderRadius: 8, background: c, border: i === 0 ? '2px solid var(--gb-brand-label)' : '1px solid var(--gb-border-strong)' }} />)}</div>;
    case 'ring':
      return <div style={{ display: 'flex', justifyContent: 'center', padding: 6 }}><div style={{ width: 92, height: 92, borderRadius: '50%', border: '7px solid var(--gb-fill-subtle)', borderTopColor: 'var(--gb-brand-label)', borderRightColor: 'var(--gb-brand-label)' }} /></div>;
    case 'timeline':
      return <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>{Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}><div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)' }} />{i < lines - 1 && <div style={{ width: 2, height: 22, background: 'var(--gb-border-default)' }} />}</div>
          <div style={{ flex: 1, paddingBottom: 12 }}><Bar w={`${64 - i * 8}%`} h={8} mb={5} /><Bar w="40%" h={6} op={0.6} /></div>
        </div>
      ))}</div>;
    case 'split':
      return <div style={{ display: 'flex', gap: 12 }}>{[0, 1].map((c) => <div key={c} style={{ flex: 1, border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-sm)', padding: 9 }}>{Array.from({ length: 3 }).map((_, i) => <Bar key={i} w={`${85 - i * 12}%`} h={7} mb={7} />)}</div>)}</div>;
    case 'row':
    default:
      return <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ flex: 1 }}><Bar w="55%" h={8} /></div><Chip w={48} accent /></div>;
  }
}

/* Hover highlight in Try-it mode so the skeleton feels interactive. */
function Region({ r }) {
  const [hot, setHot] = useState(false);
  return (
    <div
      data-demo={r.key}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      style={{
        borderRadius: 'var(--gb-r-md)', padding: '10px 12px',
        background: hot ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-1)',
        border: `1px solid ${hot ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-subtle)'}`,
        transition: 'background .13s, border-color .13s',
      }}
    >
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase', color: hot ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)', marginBottom: 8 }}>{r.label}</div>
      <RegionBody kind={r.kind} lines={r.lines} cols={r.cols} />
    </div>
  );
}

export function SkeletonModal({ title, icon, regions = [] }) {
  return (
    <div style={{ background: 'var(--gb-surface-modal)', borderRadius: 'inherit', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 14px', borderBottom: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
        <span style={{ width: 26, height: 26, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <NavGlyph name={icon} size={14} />
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', flex: 1 }}>{title}</span>
        <span style={{ width: 22, height: 22, borderRadius: 'var(--gb-r-sm)', border: '1px solid var(--gb-border-subtle)', color: 'var(--gb-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.close size={12} /></span>
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
        {regions.map((r) => <Region key={r.key} r={r} />)}
      </div>
    </div>
  );
}

/* Turn a spec into a fully-wired LiveStage (Tour + Play + Try-it). */
export function SkeletonStage({ spec }) {
  if (!spec) return null;
  const callouts = spec.regions.map((r, i) => ({ n: i + 1, target: r.key, title: r.label, text: r.hint }));
  const steps = spec.regions.map((r) => ({ target: r.key, caption: r.hint, hold: 2100 }));
  return (
    <LiveStage
      width={spec.width || 460}
      frameKind="modal"
      frameLabel={spec.frameLabel || 'live · sample data'}
      render={() => <SkeletonModal title={spec.title} icon={spec.icon} regions={spec.regions} />}
      callouts={callouts}
      steps={steps}
      note={spec.note || 'A wireframe of this feature — hover the numbered pins (Tour), press Play for a walkthrough, or switch to Try it and hover the parts yourself.'}
    />
  );
}
