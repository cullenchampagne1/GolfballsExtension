import React from 'react';
import { motion } from 'motion/react';

export const DEVELOPER_WORKSPACE_CSS = `
  button { color:inherit; font:inherit; }
  .gb-dev-workspace { width:100%; height:100%; min-width:0; display:flex; flex-direction:column; color:var(--gb-text-secondary); background:var(--gb-surface-canvas); font-family:var(--gb-font-sans); font-size:12px; line-height:1.45; }
  .gb-dev-header { position:relative; flex:0 0 auto; min-height:78px; padding:13px 24px; display:flex; align-items:center; gap:13px; overflow:hidden; border-bottom:1px solid var(--gb-border-default); background:color-mix(in srgb,var(--gb-surface-1) 94%,var(--gb-brand-label) 6%); }
  .gb-dev-header::after { content:""; position:absolute; left:0; right:0; bottom:0; height:2px; opacity:.55; background:linear-gradient(90deg,var(--gb-brand-label),color-mix(in srgb,var(--gb-brand-label) 20%,transparent) 38%,transparent 78%); }
  .gb-dev-mark { position:relative; width:44px; height:44px; flex:0 0 auto; display:grid; place-items:center; overflow:hidden; color:var(--gb-brand-label); border:1px solid var(--gb-brand-tint-border); border-radius:var(--gb-r-xl); background:linear-gradient(145deg,var(--gb-brand-tint-medium),var(--gb-brand-tint-soft)); box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 12%,transparent),0 8px 22px color-mix(in srgb,var(--gb-brand-label) 12%,transparent); }
  .gb-dev-mark::after { content:""; position:absolute; inset:-50% 35% -50% -25%; transform:rotate(18deg); opacity:.22; background:linear-gradient(90deg,transparent,#fff,transparent); animation:gb-dev-shimmer 5s ease-in-out infinite; }
  .gb-dev-header-copy { min-width:0; flex:1; }
  .gb-dev-eyebrow { margin-bottom:2px; color:var(--gb-brand-label); font-size:8px; line-height:1.2; font-weight:850; letter-spacing:1.05px; text-transform:uppercase; }
  .gb-dev-title { overflow:hidden; color:var(--gb-text-primary); font-size:16px; line-height:1.25; font-weight:850; letter-spacing:-.3px; text-overflow:ellipsis; white-space:nowrap; }
  .gb-dev-subtitle { margin-top:3px; overflow:hidden; color:var(--gb-text-muted); font-size:10px; text-overflow:ellipsis; white-space:nowrap; }
  .gb-dev-header-actions { flex:0 0 auto; display:flex; align-items:center; gap:8px; }
  .gb-dev-status { min-height:26px; padding:4px 9px; display:inline-flex; align-items:center; gap:7px; color:var(--gb-success-fg); border:1px solid var(--gb-success-tint-border); border-radius:var(--gb-r-pill); background:var(--gb-success-tint-soft); font-size:8.5px; font-weight:850; letter-spacing:.62px; text-transform:uppercase; white-space:nowrap; }
  .gb-dev-status.brand { color:var(--gb-brand-label); border-color:var(--gb-brand-tint-border); background:var(--gb-brand-tint-soft); }
  .gb-dev-status-dot { width:6px; height:6px; flex:0 0 auto; border-radius:50%; background:currentColor; box-shadow:0 0 0 3px color-mix(in srgb,currentColor 13%,transparent); animation:gb-dev-pulse 1.9s ease-in-out infinite; }
  .gb-dev-main { flex:1; min-height:0; overflow:auto; padding:20px 24px 32px; scrollbar-width:thin; scrollbar-color:var(--gb-border-strong) transparent; }
  .gb-dev-main::-webkit-scrollbar { width:8px; }
  .gb-dev-main::-webkit-scrollbar-thumb { border:2px solid transparent; border-radius:99px; background:var(--gb-border-strong); background-clip:padding-box; }
  .gb-dev-stack { width:100%; max-width:1280px; margin:0 auto; display:grid; gap:14px; }
  .gb-dev-card { min-width:0; overflow:hidden; border:1px solid var(--gb-border-default); border-radius:var(--gb-r-xl); background:var(--gb-surface-1); box-shadow:0 8px 26px color-mix(in srgb,#000 8%,transparent),inset 0 1px 0 color-mix(in srgb,#fff 4%,transparent); }
  .gb-dev-context { min-height:82px; padding:14px 16px; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:16px; align-items:center; }
  .gb-dev-context-copy { min-width:0; }
  .gb-dev-context-kicker { margin-bottom:3px; color:var(--gb-text-muted); font-size:8px; font-weight:850; letter-spacing:.75px; text-transform:uppercase; }
  .gb-dev-context-title { overflow:hidden; color:var(--gb-text-primary); font-size:13px; line-height:1.35; font-weight:800; text-overflow:ellipsis; white-space:nowrap; }
  .gb-dev-context-url { margin-top:3px; overflow:hidden; color:var(--gb-text-muted); font-family:var(--gb-font-mono); font-size:9px; text-overflow:ellipsis; white-space:nowrap; }
  .gb-dev-pills { margin-top:9px; display:flex; flex-wrap:wrap; gap:6px; }
  .gb-dev-pill { min-height:21px; padding:2px 8px; display:inline-flex; align-items:center; gap:5px; color:var(--gb-text-tertiary); border:1px solid var(--gb-border-default); border-radius:var(--gb-r-pill); background:var(--gb-fill-faint); font-size:8.5px; line-height:1.2; font-weight:750; }
  .gb-dev-pill.brand { color:var(--gb-brand-label); border-color:var(--gb-brand-tint-border); background:var(--gb-brand-tint-soft); }
  .gb-dev-pill.success { color:var(--gb-success-fg); border-color:var(--gb-success-tint-border); background:var(--gb-success-tint-soft); }
  .gb-dev-context-meta { min-width:110px; display:grid; justify-items:end; gap:8px; color:var(--gb-text-muted); font-size:8.5px; text-align:right; white-space:nowrap; }
  .gb-dev-metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }
  .gb-dev-metric { position:relative; min-width:0; min-height:72px; padding:12px 14px; overflow:hidden; border:1px solid var(--gb-border-default); border-radius:var(--gb-r-lg); background:linear-gradient(145deg,var(--gb-surface-1),color-mix(in srgb,var(--gb-surface-1) 94%,var(--gb-brand-label) 6%)); }
  .gb-dev-metric::before { content:""; position:absolute; left:0; top:13px; bottom:13px; width:2px; border-radius:2px; opacity:.75; background:var(--gb-brand-label); }
  .gb-dev-metric-label { color:var(--gb-text-muted); font-size:8px; font-weight:850; letter-spacing:.62px; text-transform:uppercase; }
  .gb-dev-metric-value { margin-top:5px; overflow:hidden; color:var(--gb-text-primary); font-size:18px; line-height:1.1; font-weight:850; letter-spacing:-.4px; text-overflow:ellipsis; white-space:nowrap; font-variant-numeric:tabular-nums; }
  .gb-dev-metric-detail { margin-top:3px; overflow:hidden; color:var(--gb-text-muted); font-size:8px; text-overflow:ellipsis; white-space:nowrap; }
  .gb-dev-panel-head { min-height:48px; padding:10px 14px; display:flex; align-items:center; justify-content:space-between; gap:12px; border-bottom:1px solid var(--gb-border-subtle); background:linear-gradient(90deg,var(--gb-fill-faint),transparent); }
  .gb-dev-panel-copy { min-width:0; }
  .gb-dev-panel-title { color:var(--gb-text-primary); font-size:11.5px; font-weight:800; }
  .gb-dev-panel-subtitle { margin-top:2px; color:var(--gb-text-muted); font-size:8.5px; }
  .gb-dev-panel-meta { flex:0 0 auto; color:var(--gb-text-muted); font-size:8.5px; font-variant-numeric:tabular-nums; text-align:right; }
  .gb-dev-state { min-height:270px; padding:48px 24px; display:grid; place-items:center; align-content:center; gap:10px; color:var(--gb-text-muted); text-align:center; }
  .gb-dev-state-icon { width:46px; height:46px; display:grid; place-items:center; color:var(--gb-brand-label); border:1px solid var(--gb-brand-tint-border); border-radius:var(--gb-r-xl); background:var(--gb-brand-tint-soft); }
  .gb-dev-state-title { color:var(--gb-text-primary); font-size:13px; font-weight:800; }
  .gb-dev-state-copy { max-width:500px; font-size:10px; line-height:1.6; }
  @keyframes gb-dev-pulse { 0%,100%{opacity:.58;transform:scale(.9)} 50%{opacity:1;transform:scale(1)} }
  @keyframes gb-dev-shimmer { 0%,72%,100%{transform:translateX(-75%) rotate(18deg)} 86%{transform:translateX(260%) rotate(18deg)} }
  @media(max-width:760px){ .gb-dev-header{padding:12px 16px}.gb-dev-main{padding:16px}.gb-dev-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.gb-dev-context{grid-template-columns:1fr}.gb-dev-context-meta{justify-items:start;text-align:left}.gb-dev-subtitle{white-space:normal}.gb-dev-status{font-size:0;gap:0;padding:4px 8px} }
  @media(prefers-reduced-motion:reduce){ .gb-dev-status-dot,.gb-dev-mark::after{animation:none}.gb-dev-card{transform:none!important;transition:none!important} }
`;

const REVEAL = { duration: .26, ease: [0.22, 1, 0.36, 1] };

export function DeveloperWorkspace({ icon, title, subtitle, status = 'Live', statusTone = 'success', children }) {
  return <><style>{DEVELOPER_WORKSPACE_CSS}</style><div className="gb-dev-workspace" data-gb-ui-root>
    <header className="gb-dev-header"><span className="gb-dev-mark">{icon}</span><div className="gb-dev-header-copy"><div className="gb-dev-eyebrow">Developer workspace</div><div className="gb-dev-title">{title}</div><div className="gb-dev-subtitle">{subtitle}</div></div><div className="gb-dev-header-actions"><span className={`gb-dev-status ${statusTone === 'brand' ? 'brand' : ''}`}><span className="gb-dev-status-dot" />{status}</span></div></header>
    <main className="gb-dev-main">{children}</main>
  </div></>;
}

export function DeveloperStack({ children }) {
  return <div className="gb-dev-stack">{children}</div>;
}

export function DeveloperCard({ children, className = '', delay = 0, ...props }) {
  return <motion.section className={`gb-dev-card ${className}`.trim()} initial={{ opacity: 0, y: 10, scale: .995 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...REVEAL, delay }} {...props}>{children}</motion.section>;
}

export function DeveloperPill({ children, tone = 'neutral' }) {
  return <span className={`gb-dev-pill ${tone === 'neutral' ? '' : tone}`.trim()}>{children}</span>;
}

export function DeveloperContext({ kicker = 'Active source', title, url, pills, meta, action, delay = 0 }) {
  return <DeveloperCard className="gb-dev-context" delay={delay}><div className="gb-dev-context-copy"><div className="gb-dev-context-kicker">{kicker}</div><div className="gb-dev-context-title">{title}</div><div className="gb-dev-context-url" title={url}>{url}</div>{pills && <div className="gb-dev-pills">{pills}</div>}</div><div className="gb-dev-context-meta">{meta}{action}</div></DeveloperCard>;
}

export function DeveloperMetrics({ items = [], delay = .04 }) {
  return <motion.div className="gb-dev-metrics" initial="hidden" animate="shown" variants={{ hidden: {}, shown: { transition: { staggerChildren: .045, delayChildren: delay } } }}>{items.map((item) => <motion.div className="gb-dev-metric" key={item.label} variants={{ hidden: { opacity: 0, y: 9 }, shown: { opacity: 1, y: 0, transition: REVEAL } }}><div className="gb-dev-metric-label">{item.label}</div><div className="gb-dev-metric-value" title={String(item.value)}>{item.value}</div>{item.detail && <div className="gb-dev-metric-detail">{item.detail}</div>}</motion.div>)}</motion.div>;
}

export function DeveloperPanelHeader({ title, subtitle, meta }) {
  return <div className="gb-dev-panel-head"><div className="gb-dev-panel-copy"><div className="gb-dev-panel-title">{title}</div>{subtitle && <div className="gb-dev-panel-subtitle">{subtitle}</div>}</div>{meta != null && <div className="gb-dev-panel-meta">{meta}</div>}</div>;
}

export function DeveloperState({ icon, title, copy }) {
  return <div className="gb-dev-state"><span className="gb-dev-state-icon">{icon}</span><div className="gb-dev-state-title">{title}</div><div className="gb-dev-state-copy">{copy}</div></div>;
}
