import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { I, Icon } from '../../ui/index.js';
import {
  THEME_VARIANTS, loadTheme, saveTheme, applyTheme,
} from '../../lib/theme.js';
import { HELP_SEARCH_INDEX } from '../../lib/helpContent.js';
import { PAGES } from '../pages/index.jsx';

/* ───────────────────────────────────────────────────────────────
   app.jsx — the Operator's Guide shell: sidebar nav, search, hash
   router, theme switcher. Ported from the design mockup
   (docs/design-reference/guide/lib/app.jsx) onto the real stack:
   src/ui components, the real theme store (gbTheme), and the
   generated help-content search index.
─────────────────────────────────────────────────────────────── */

/* Icons the design uses that aren't in src/ui's I map. */
const GIcon = {
  grid: (p) => <Icon {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></Icon>,
  cube: (p) => <Icon {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05"/><path d="M12 22.08V12"/></Icon>,
  gift: (p) => <Icon {...p}><path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></Icon>,
  stack: (p) => <Icon {...p}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></Icon>,
};
const NavGlyph = ({ name, size = 15 }) => {
  const Fn = I[name] || GIcon[name] || I.cog;
  return <Fn size={size} />;
};

/* ── Theme switcher — wired to the REAL stored theme (gbTheme), so
      changing it here changes the whole extension. Swatch chips match
      each variant's canvas/brand. ── */
const SWATCH = {
  dark:     { canvas: '#0e0f10', s1: '#16181a', brand: '#8fce2e' },
  midnight: { canvas: '#050507', s1: '#0d0f12', brand: '#a3e030' },
  light:    { canvas: '#f4f5f6', s1: '#ffffff', brand: '#4d6b14' },
  cream:    { canvas: '#f5efe2', s1: '#fffaf0', brand: '#5a7a14' },
  nord:     { canvas: '#242933', s1: '#353b48', brand: '#88c0d0' },
  dracula:  { canvas: '#21222c', s1: '#2d2f3d', brand: '#bd93f9' },
  rose:     { canvas: '#16141f', s1: '#1f1d2e', brand: '#ebbcba' },
  tokyo:    { canvas: '#16161e', s1: '#1f2335', brand: '#7aa2f7' },
};

function Swatch({ id, size = 18 }) {
  const t = SWATCH[id] || SWATCH.dark;
  return (
    <span style={{ width: size, height: size, borderRadius: 5, flexShrink: 0, background: t.canvas, border: '1px solid var(--gb-border-strong)', position: 'relative', display: 'inline-block', overflow: 'hidden' }}>
      <span style={{ position: 'absolute', left: 2, bottom: 2, width: 5, height: 5, borderRadius: '50%', background: t.brand }} />
      <span style={{ position: 'absolute', right: 2, top: 3, width: size - 8, height: 2, borderRadius: 2, background: t.s1, opacity: 0.9 }} />
    </span>
  );
}

function ThemeSwitcher() {
  const [theme, setTheme] = useState(null);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => { loadTheme().then(setTheme); }, []);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const pick = (id) => {
    const next = { ...(theme || {}), variant: id };
    setTheme(next);
    applyTheme(next);
    saveTheme(next);
    setOpen(false);
  };

  const cur = theme?.variant || 'dark';
  const active = THEME_VARIANTS.find((t) => t.id === cur) || THEME_VARIANTS[0];
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="theme-trigger" onClick={() => setOpen((o) => !o)} title="Change theme (applies to the whole extension)">
        <Swatch id={active.id} size={15} />
        <span className="theme-name">{active.name}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.14 }} style={{ display: 'flex', color: 'var(--gb-text-muted)' }}><I.chevd size={11} /></motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="theme-menu" initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ duration: 0.16, ease: [0.34, 1.4, 0.64, 1] }}>
            <div className="theme-menu-h">Appearance</div>
            {THEME_VARIANTS.map((t) => (
              <button key={t.id} className={`theme-opt ${t.id === cur ? 'on' : ''}`} onClick={() => pick(t.id)}>
                <Swatch id={t.id} />
                <span className="theme-opt-name">{t.name}</span>
                {t.id === cur && <span style={{ marginLeft: 'auto', display: 'flex', color: 'var(--gb-brand-label)' }}><I.check size={13} /></span>}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── NAV — the corrected map (design grouping + the sections it was
      missing). `slugs` ties each page to its docs/content articles:
      it powers search routing now and content rendering in later
      phases. `wip` renders the styled placeholder. ── */
export const NAV = [
  { group: 'Overview', items: [
    { id: 'start', title: 'Getting Started', icon: 'bolt', slugs: ['what-this-extension-does', 'first-launch', 'initial-configuration', 'actions-shelf', 'keyboard-shortcuts'] },
    { id: 'workflows', title: 'Guided Workflows', icon: 'flow', slugs: [] },
  ]},
  { group: 'Daily Driver', items: [
    { id: 'popup', title: 'The Popup', icon: 'mail', slugs: ['email-templates-popup', 'how-email-sending-works'] },
    { id: 'notifications', title: 'Notifications', icon: 'alert', slugs: ['reply-notifications'] },
    { id: 'templates', title: 'Email Templates', icon: 'edit', slugs: ['template-editor', 'template-variables', 'note-templates'] },
    { id: 'charge', title: 'Charge & Order Edit', icon: 'card', slugs: ['charge-refund', 'order-edit'] },
    { id: 'proof', title: 'Submit Proof', icon: 'send', slugs: ['submit-proof'] },
  ]},
  { group: 'Configuration', items: [
    { id: 'settings', title: 'Settings & Manager', icon: 'cog', slugs: ['feature-toggles', 'email-integrations', 'presets', 'developer-settings'] },
    { id: 'themes', title: 'Themes & UI Scale', icon: 'sun', slugs: ['theme-appearance'] },
    { id: 'shortcuts', title: 'Keyboard Shortcuts', icon: 'code', slugs: ['keyboard-shortcuts', 'shortcuts-settings'] },
  ]},
  { group: 'Stay Organized', items: [
    { id: 'watchlist', title: 'Watch List', icon: 'eye', slugs: ['watch-list'] },
    { id: 'tasks', title: 'Task List', icon: 'check', slugs: ['task-list'] },
    { id: 'quicktask', title: 'Quick Task', icon: 'bolt', slugs: ['quick-task'] },
    { id: 'calls', title: 'Call Log', icon: 'phone', slugs: ['call-log'] },
    { id: 'calendar', title: 'Order Dates', icon: 'clock', slugs: ['order-date-manager', 'quick-order-note'] },
  ]},
  { group: 'Find People', items: [
    { id: 'crm-search', title: 'CRM Search', icon: 'search', slugs: ['crm-search', 'phone-finder'] },
    { id: 'crm-query', title: 'Query Builder', icon: 'filter', slugs: ['query-builder'] },
    { id: 'crm-new', title: 'New Contact', icon: 'user', slugs: ['new-contact'] },
  ]},
  { group: 'On-page Helpers', items: [
    { id: 'viewer-email', title: 'Email / Chat Viewer', icon: 'mail', slugs: ['email-thread-preview', 'text-note-preview'] },
    { id: 'viewer-image', title: 'Image Viewer', icon: 'eye', slugs: ['image-viewer', 'mockup-composer'] },
    { id: 'viewer-3d', title: '3D Product Viewer', icon: 'cube', slugs: ['3d-product-viewer'] },
    { id: 'margin', title: 'Margin Calculator', icon: 'calc', slugs: ['margin-calculator'] },
  ]},
  { group: 'Catalog & Proposals', items: [
    { id: 'catalog', title: 'Gift Catalog', icon: 'gift', slugs: ['gift-catalog', 'customizing-item', 'gift-sets', 'custom-service-items', 'supplier-import', 'gifting-glossary'] },
    { id: 'proposals', title: 'Proposals & Quotes', icon: 'sparkle', slugs: ['proposal-panel', 'proposal-breakdown', 'promo-codes', 'build-email-proposal'] },
  ]},
  { group: 'Workflows', items: [
    { id: 'quicksend', title: 'Quick Send (Bulk)', icon: 'megaphone', slugs: ['bulk-email-selection'] },
    { id: 'workflow-manager', title: 'Workflow Manager', icon: 'flow', slugs: ['workflow-manager', 'workflow-conditions'] },
  ]},
  { group: 'Reference', items: [
    { id: 'manual', title: 'Full Reference', icon: 'stack', slugs: [] },
    { id: 'troubleshooting', title: 'Troubleshooting', icon: 'alert', slugs: ['ts-outlook-opened', 'ts-variable-unresolved', 'ts-catalog-stale', 'ts-modal-not-appearing', 'ts-no-cost', 'ts-date-update-failed', 'ts-3d-blank', 'ts-settings-vanished'] },
    { id: 'faq', title: 'FAQ', icon: 'more', slugs: ['faq'] },
    { id: 'power', title: 'Power User', icon: 'zap', slugs: ['code-variables', 'hidden-settings', 'debug-storage'] },
    { id: 'whatsnew', title: "What's New", icon: 'sparkle', slugs: ['whats-new'] },
  ]},
];

const FLAT = NAV.flatMap((g) => g.items.map((it) => ({ ...it, group: g.group })));
const findNav = (id) => FLAT.find((x) => x.id === id);

/* Search corpus: nav pages (title match) + the generated help index
   (articles, tutorials, settings, FAQ, shortcuts — keywords already
   authored). Generated records land on their exact article/tutorial rather
   than a broad hand-built page, so nothing authored is unreachable. */
const SEARCH_ROWS = [
  ...FLAT.map((it) => ({ key: `nav:${it.id}`, route: it.id, title: it.title, sub: it.group, hay: `${it.title} ${it.group}`.toLowerCase(), wip: it.wip, partial: it.partial })),
  ...HELP_SEARCH_INDEX
    .filter((r) => r.article || r.tutorial)
    .map((r) => {
      const route = r.tutorial
        ? `workflows/${encodeURIComponent(r.tutorial)}`
        : `manual/${encodeURIComponent(r.article)}`;
      return {
        key: r.id, route,
        title: r.title,
        sub: r.tutorial ? 'Guided Workflows' : (r.category || 'Full Reference'),
        hay: `${r.title} ${(r.keywords || []).join(' ')} ${r.description || ''}`.toLowerCase(),
      };
    }),
];

function Sidebar({ current, onNavigate, version }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const seen = new Set();
    const out = [];
    for (const row of SEARCH_ROWS) {
      if (!row.hay.includes(s)) continue;
      const dedupe = `${row.route}:${row.title}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push(row);
      if (out.length >= 8) break;
    }
    return out;
  }, [q]);

  return (
    <aside className="side gb-thin-scroll">
      <div className="side-top">
        <div className="side-head">
          <div className="side-logo"><I.mail size={18} /></div>
          <div>
            <div className="side-title">Golfballs Extension</div>
            <div className="side-sub">Operator's Guide · v{version}</div>
          </div>
        </div>
        <div className="side-search" style={{ position: 'relative' }}>
          <div className="box">
            <I.search size={13} />
            <input value={q} placeholder="Search the guide…" onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
            {!q && <kbd>/</kbd>}
          </div>
          {open && q && (
            <div className="searchpop gb-thin-scroll">
              {results.length === 0
                ? <div className="sr-empty">No matches for “{q}”.</div>
                : results.map((r) => (
                  <div key={r.key} className="sr" onMouseDown={() => { onNavigate(r.route); setQ(''); setOpen(false); }}>
                    <div className="sr-t">{r.title}</div>
                    <div className="sr-g">{r.sub}{r.wip ? ' · in progress' : r.partial ? ' · not fully implemented' : ''}</div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
      <nav className="nav">
        {NAV.map((g) => (
          <div className="nav-group" key={g.group}>
            <div className="nav-group-label">{g.group}</div>
            {g.items.map((it) => (
              <button key={it.id} className={`nav-item ${current === it.id ? 'active' : ''}`} onClick={() => onNavigate(it.id)}>
                <span className="ico"><NavGlyph name={it.icon} /></span>
                <span>{it.title}</span>
                {it.wip && <span className="mini">soon</span>}
                {it.partial && <span className="mini partial" title="Not fully implemented yet">partial</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}

function WipPage({ id }) {
  const nav = findNav(id);
  return (
    <div className="prose">
      <div className="eyebrow">{nav?.group}</div>
      <h1 className="title">{nav?.title}</h1>
      <p className="lede">This section is on its way. It will use the guide's live format — the real interface running on sample data, with a guided walkthrough and numbered hotspots — and its content comes from the verified extension manual, not guesswork.</p>
      <div className="docnote info">
        <span className="dn-ico"><I.bolt size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">In progress</div>
          <p style={{ margin: 0 }}>The guide ships section by section. In the meantime, <a href="#start">Getting Started</a> maps the whole toolkit and where everything lives.</p>
        </div>
      </div>
      <div className="cardgrid" style={{ marginTop: 24 }}>
        <button className="featurecard" onClick={() => { window.location.hash = '#start'; }}>
          <span className="fc-ico"><I.bolt size={17} /></span>
          <span className="fc-t">Back to Getting Started</span>
          <span className="fc-d">The overview, the Actions Shelf, and how to read this guide.</span>
        </button>
      </div>
    </div>
  );
}

export function App() {
  const readRoute = () => {
    const raw = (window.location.hash || '#start').slice(1);
    try { return decodeURIComponent(raw); } catch { return raw; }
  };
  const [route, setRoute] = useState(readRoute);
  const version = (typeof chrome !== 'undefined' && chrome.runtime?.getManifest?.()?.version) || '3.3';

  useEffect(() => {
    const onHash = () => {
      setRoute(readRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA' && !document.activeElement?.isContentEditable) {
        e.preventDefault();
        document.querySelector('.side-search input')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const navigate = (id) => { window.location.hash = '#' + id; };
  const [baseRoute, ...detailParts] = route.split('/');
  const detailId = detailParts.join('/');
  const nav = findNav(baseRoute) || FLAT[0];
  const Page = PAGES[baseRoute];

  return (
    <div className="app">
      <Sidebar current={nav.id} onNavigate={navigate} version={version} />
      <div className="main">
        <div className="topbar">
          <div className="crumbs">{nav?.group} <span style={{ opacity: 0.5 }}>/</span> <b>{nav?.title}</b></div>
          <div className="topbar-spacer" />
          <a className="topbar-link" href="#start"><I.bolt size={13} /> Guide home</a>
          <ThemeSwitcher />
        </div>
        <div className="content">
          <div className="page-enter" key={route}>
            {Page ? <Page itemId={detailId || null} /> : <WipPage id={nav.id} />}
          </div>
        </div>
      </div>
    </div>
  );
}

export { GIcon };
