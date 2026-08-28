/* app.jsx — the documentation shell: sidebar nav, search, hash router.
   Pages register into window.GBPages; this renders them. */
(function () {
  const { useState, useEffect, useMemo, useRef } = React;
  const { motion, AnimatePresence } = window.Motion;
  const { I } = window.GB;

  /* ---- Theme switcher (variants from ui/theme.css) ---- */
  const THEMES = [
    { id: 'dark',     name: 'Dark',     canvas: '#0e0f10', s1: '#16181a', brand: '#8fce2e' },
    { id: 'light',    name: 'Light',    canvas: '#f4f5f6', s1: '#ffffff', brand: '#4d6b14' },
    { id: 'midnight', name: 'Midnight', canvas: '#050507', s1: '#0d0f12', brand: '#a3e030' },
    { id: 'cream',    name: 'Cream',    canvas: '#f5efe2', s1: '#fffaf0', brand: '#5a7a14' },
  ];
  const THEME_KEY = 'gb-guide-theme';
  function applyTheme(id) {
    document.documentElement.setAttribute('data-theme', id);
    try { localStorage.setItem(THEME_KEY, id); } catch (e) {}
  }
  (function initTheme() {
    let saved = 'dark';
    try { saved = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) {}
    if (!THEMES.some((t) => t.id === saved)) saved = 'dark';
    document.documentElement.setAttribute('data-theme', saved);
  })();

  function Swatch({ t, size = 18 }) {
    return (
      <span style={{ width: size, height: size, borderRadius: 5, flexShrink: 0, background: t.canvas, border: '1px solid var(--gb-border-strong)', position: 'relative', display: 'inline-block', overflow: 'hidden' }}>
        <span style={{ position: 'absolute', left: 2, bottom: 2, width: 5, height: 5, borderRadius: '50%', background: t.brand }} />
        <span style={{ position: 'absolute', right: 2, top: 3, width: size - 8, height: 2, borderRadius: 2, background: t.s1, opacity: 0.9 }} />
      </span>
    );
  }
  function ThemeSwitcher() {
    const [cur, setCur] = useState(() => { try { return localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) { return 'dark'; } });
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
      if (!open) return undefined;
      const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      document.addEventListener('mousedown', onDown);
      return () => document.removeEventListener('mousedown', onDown);
    }, [open]);
    const pick = (id) => { setCur(id); applyTheme(id); setOpen(false); };
    const active = THEMES.find((t) => t.id === cur) || THEMES[0];
    return (
      <div ref={ref} style={{ position: 'relative' }}>
        <button className="theme-trigger" onClick={() => setOpen((o) => !o)} title="Change theme">
          <Swatch t={active} size={15} />
          <span className="theme-name">{active.name}</span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.14 }} style={{ display: 'flex', color: 'var(--gb-text-muted)' }}>{I.chevd({ size: 11 })}</motion.span>
        </button>
        <AnimatePresence>
          {open && (
            <motion.div className="theme-menu" initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ duration: 0.16, ease: [0.34, 1.4, 0.64, 1] }}>
              <div className="theme-menu-h">Appearance</div>
              {THEMES.map((t) => (
                <button key={t.id} className={`theme-opt ${t.id === cur ? 'on' : ''}`} onClick={() => pick(t.id)}>
                  <Swatch t={t} />
                  <span className="theme-opt-name">{t.name}</span>
                  {t.id === cur && <span style={{ marginLeft: 'auto', display: 'flex', color: 'var(--gb-brand-label)' }}>{I.check({ size: 13 })}</span>}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  /* NAV — the full map. `wip` items show a placeholder until built. */
  const NAV = [
    { group: 'Overview', items: [
      { id: 'start', title: 'Getting Started', icon: 'bolt' },
    ]},
    { group: 'Daily Driver', items: [
      { id: 'popup', title: 'The Popup', icon: 'mail' },
      { id: 'templates', title: 'Email Templates', icon: 'edit' },
      { id: 'charge', title: 'Charge & Refund', icon: 'card', wip: true },
      { id: 'proof', title: 'Submit Proof', icon: 'send', wip: true },
    ]},
    { group: 'Configuration', items: [
      { id: 'settings', title: 'Settings & Manager', icon: 'cog' },
      { id: 'themes', title: 'Themes & UI Scale', icon: 'sun', wip: true },
      { id: 'shortcuts', title: 'Keyboard Shortcuts', icon: 'bolt', wip: true },
    ]},
    { group: 'Stay Organized', items: [
      { id: 'watchlist', title: 'Watch List', icon: 'eye' },
      { id: 'tasks', title: 'Tasks', icon: 'check' },
      { id: 'quicktask', title: 'Quick Task', icon: 'bolt' },
      { id: 'calls', title: 'Call Log', icon: 'phone' },
      { id: 'calendar', title: 'Calendar', icon: 'calendar' },
    ]},
    { group: 'Find People', items: [
      { id: 'crm-search', title: 'CRM Search', icon: 'search' },
      { id: 'crm-query', title: 'Query Builder', icon: 'filter' },
      { id: 'crm-new', title: 'New Contact', icon: 'user' },
    ]},
    { group: 'On-page Helpers', items: [
      { id: 'viewer-email', title: 'Email / Chat Viewer', icon: 'mail' },
      { id: 'viewer-image', title: 'Image Viewer', icon: 'eye' },
      { id: 'viewer-3d', title: '3D Golfball Viewer', icon: 'cube' },
      { id: 'margin', title: 'Margin Calculator', icon: 'calc', wip: true },
    ]},
    { group: 'Catalog & Art', items: [
      { id: 'catalog', title: 'Gift Catalog & Grass Mockup', icon: 'gift', wip: true },
    ]},
    { group: 'For Developers', items: [
      { id: 'audit', title: 'Wiring Audit', icon: 'alert', wip: true },
    ]},
  ];
  const FLAT = NAV.flatMap((g) => g.items.map((it) => ({ ...it, group: g.group })));
  const findNav = (id) => FLAT.find((x) => x.id === id);

  const SEARCH_KEYWORDS = {
    popup: 'templates charge refund watch list tasks crm search submit proof send outlook',
    templates: 'variables variations subject body rules conditions mailto power automate',
    charge: 'card refund capture payment signifyd total',
    settings: 'features flags toggle theme variant developer presets',
    crm: 'search create contact query builder phone finder lookup',
    watchlist: 'follow up flag order contact account badge',
    tasks: 'todo quick task call log categories due',
    'viewer-email': 'email preview chat transcript thread case inbox categorize reply snapengage',
    'viewer-image': 'image preview logo zoom pan rotate align color swap eyedropper download proof decal',
    'viewer-3d': 'golfball 3d viewer decal orbit rotate scene throw physics light',
    catalog: 'gift golfball grass mockup composer logo',
    margin: 'profit margin calculator cost price',
    audit: 'feature flags not wired dead settings power automate phone finder',
  };

  function NavIcon({ name }) { const fn = I[name] || I.cog; return fn({ size: 15 }); }

  function WipPage({ id }) {
    const nav = findNav(id);
    return (
      <div className="prose">
        <div className="eyebrow">{nav?.group}</div>
        <h1 className="title">{nav?.title}</h1>
        <p className="lede">This section is being built next. The live UI and walkthrough will land here — same Tour / Play / Try-it format as the pages already finished.</p>
        <div className="docnote info">
          <span className="dn-ico">{I.bolt({ size: 15 })}</span>
          <div className="dn-b">
            <div className="dn-t">In progress</div>
            <p style={{ margin: 0 }}>We're going deep on the top sections first — <a href="#popup">The Popup</a> is fully done. Settings, Email Templates, and CRM are next, then everything else.</p>
          </div>
        </div>
        <div className="cardgrid" style={{ marginTop: 24 }}>
          <button className="featurecard" onClick={() => (window.location.hash = '#start')}><span className="fc-ico">{I.bolt({ size: 17 })}</span><span className="fc-t">Back to Getting Started</span><span className="fc-d">The overview and how to read this guide.</span></button>
          <button className="featurecard" onClick={() => (window.location.hash = '#popup')}><span className="fc-ico">{I.mail({ size: 17 })}</span><span className="fc-t">See a finished page</span><span className="fc-d">The Popup — live UI, hotspots, and a full walkthrough.</span></button>
        </div>
      </div>
    );
  }

  function Sidebar({ current, onNavigate }) {
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(false);
    const results = useMemo(() => {
      const s = q.trim().toLowerCase();
      if (!s) return [];
      return FLAT.filter((it) => (it.title + ' ' + it.group + ' ' + (SEARCH_KEYWORDS[it.id] || '')).toLowerCase().includes(s)).slice(0, 8);
    }, [q]);
    return (
      <aside className="side gb-thin-scroll">
        <div className="side-top">
        <div className="side-head">
          <div className="side-logo">{I.mail({ size: 18 })}</div>
          <div>
            <div className="side-title">Golfballs Extension</div>
            <div className="side-sub">Operator's Guide · v3.3</div>
          </div>
        </div>
        <div className="side-search" style={{ position: 'relative' }}>
          <div className="box">
            {I.search({ size: 13 })}
            <input value={q} placeholder="Search the guide…" onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
            {!q && <kbd>/</kbd>}
          </div>
          {open && q && (
            <div className="searchpop gb-thin-scroll">
              {results.length === 0 ? <div className="sr-empty">No matches for “{q}”.</div> : results.map((r) => (
                <div key={r.id} className="sr" onMouseDown={() => { onNavigate(r.id); setQ(''); setOpen(false); }}>
                  <div className="sr-t">{r.title}</div>
                  <div className="sr-g">{r.group}{r.wip ? ' · in progress' : ''}</div>
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
                  <span className="ico"><NavIcon name={it.icon} /></span>
                  <span>{it.title}</span>
                  {it.wip && <span className="mini">soon</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>
    );
  }

  function App() {
    const [route, setRoute] = useState(() => (window.location.hash || '#start').slice(1));
    useEffect(() => {
      const onHash = () => { setRoute((window.location.hash || '#start').slice(1)); document.querySelector('.main')?.scrollTo?.(0, 0); window.scrollTo(0, 0); };
      window.addEventListener('hashchange', onHash);
      return () => window.removeEventListener('hashchange', onHash);
    }, []);
    useEffect(() => {
      const onKey = (e) => { if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') { e.preventDefault(); document.querySelector('.side-search input')?.focus(); } };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []);
    const navigate = (id) => { window.location.hash = '#' + id; };

    const nav = findNav(route) || FLAT[0];
    const page = window.GBPages[route];
    return (
      <div className="app">
        <Sidebar current={route} onNavigate={navigate} />
        <div className="main">
          <div className="topbar">
            <div className="crumbs">{nav?.group} <span style={{ opacity: .5 }}>/</span> <b>{nav?.title}</b></div>
            <div className="topbar-spacer" />
            <a className="topbar-link" href="#start">{I.bolt({ size: 13 })} Guide home</a>
            <ThemeSwitcher />
          </div>
          <div className="content">
            <div className="page-enter" key={route}>
              {page ? page.render() : <WipPage id={route} />}
            </div>
          </div>
        </div>
      </div>
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
})();
