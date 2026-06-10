/* ───────────────────────────────────────────────────────────────
   composer.jsx — faithful port of ui/components/KeyboardComposer.jsx,
   the schema-driven `/` composer shared by Call Log and Quick Task.
   Exposed as window.GBComposer.
─────────────────────────────────────────────────────────────── */
(function () {
  const { I, Icon } = window.GB;

  function Kbd({ children }) {
    return <kbd style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 10, color: 'var(--gb-text-muted)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', borderBottomWidth: 2, borderRadius: 4, padding: '1px 5px', lineHeight: 1.3, whiteSpace: 'nowrap' }}>{children}</kbd>;
  }

  const COMPOSER_TONE = {
    brand:   { fg: 'var(--gb-brand-label)',   bg: 'var(--gb-brand-tint-soft)',   bgMed: 'var(--gb-brand-tint-medium)',   bd: 'var(--gb-brand-tint-border)',   solid: 'var(--gb-brand-label)' },
    info:    { fg: 'var(--gb-info-fg)',       bg: 'var(--gb-info-tint-soft)',    bgMed: 'var(--gb-info-tint-medium)',    bd: 'var(--gb-info-tint-border)',    solid: 'var(--gb-info)' },
    warning: { fg: 'var(--gb-warning-fg)',    bg: 'var(--gb-warning-tint-soft)', bgMed: 'var(--gb-warning-tint-medium)', bd: 'var(--gb-warning-tint-border)', solid: 'var(--gb-warning)' },
    error:   { fg: 'var(--gb-error-fg)',      bg: 'var(--gb-error-tint-soft)',   bgMed: 'var(--gb-error-tint-medium)',   bd: 'var(--gb-error-tint-border)',   solid: 'var(--gb-error)' },
    success: { fg: 'var(--gb-success-fg)',    bg: 'var(--gb-success-tint-soft)', bgMed: 'var(--gb-success-tint-medium)', bd: 'var(--gb-success-tint-border)', solid: 'var(--gb-success)' },
    neutral: { fg: 'var(--gb-text-tertiary)', bg: 'var(--gb-fill-subtle)',       bgMed: 'var(--gb-fill-soft)',           bd: 'var(--gb-border-default)',      solid: 'var(--gb-text-muted)' },
    muted:   { fg: 'var(--gb-text-tertiary)', bg: 'var(--gb-fill-subtle)',       bgMed: 'var(--gb-fill-soft)',           bd: 'var(--gb-border-default)',      solid: 'var(--gb-text-muted)' },
  };

  const CornerKey = (p) => <Icon {...p}><polyline points="9 10 4 15 9 20" /><path d="M20 4v7a4 4 0 0 1-4 4H4" /></Icon>;

  let injected = false;
  function ensureComposerStyles() {
    if (injected || typeof document === 'undefined') return;
    injected = true;
    const el = document.createElement('style');
    el.setAttribute('data-gb-composer', '');
    el.textContent = `
      .gb-kbd-composer .clr-bar:focus-within { border-color: var(--gb-brand-label) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--gb-brand-label) 14%, transparent); }
      @keyframes gb-clr-pop { from { transform: scale(.92); } to { transform: scale(1); } }
      @keyframes gb-clr-rise { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: none; } }
      @keyframes gb-clr-field-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }`;
    document.head.appendChild(el);
  }

  function useComposerFilter(templates, opts = {}) {
    const { getText } = opts;
    const initialActive = opts.initialActive ?? -1;
    const [query, setQuery] = React.useState('');
    const [active, setActive] = React.useState(initialActive);
    const searchRef = React.useRef(null);
    const rowRefs = React.useRef([]);
    const results = React.useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return templates;
      return templates.filter((t) => `${t.name || ''} ${t.subject || ''} ${t.body || ''} ${getText ? getText(t) : ''}`.toLowerCase().includes(q));
    }, [query, templates, getText]);
    React.useEffect(() => { setActive((a) => (a < 0 ? a : Math.min(a, Math.max(0, results.length - 1)))); }, [results.length]);
    const focusRow = React.useCallback((idx) => { const el = rowRefs.current[idx]; if (el) try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }, []);
    const onContainerKey = (e, fire) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea';
      if (!typing) { const n = parseInt(e.key, 10); if (n >= 1 && n <= results.length) { e.preventDefault(); fire?.(results[n - 1]); } }
    };
    const onRowKey = (e, idx, onFire) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); const n = Math.min(idx + 1, results.length - 1); setActive(n); focusRow(n); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (idx === 0) { searchRef.current?.focus(); setActive(-1); } else { const n = idx - 1; setActive(n); focusRow(n); } }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFire?.(results[idx]); }
    };
    return { query, setQuery, results, active, setActive, searchRef, rowRefs, focusRow, onRowKey, onContainerKey };
  }

  function classifyWord(schema, word) {
    const w = word.toLowerCase();
    for (const tt of schema.tokenTypes) { if (tt.shorthand) { const v = tt.shorthand(w); if (v !== null && v !== undefined) return { key: tt.key, value: v }; } }
    return null;
  }
  function menuItems(schema, filter, tokens) {
    const q = filter.trim().toLowerCase();
    const out = []; let nav = 0;
    schema.tokenTypes.forEach((tt) => {
      const opts = (tt.options || []).filter((o) => !q || o.label.toLowerCase().includes(q) || String(o.value).toLowerCase().includes(q));
      if (!opts.length) return;
      out.push({ kind: 'header', label: tt.menuLabel || tt.key });
      opts.forEach((o) => out.push({ kind: 'item', tkey: tt.key, value: o.value, label: o.label, tone: o.tone, icon: o.icon, navIndex: nav++, active: tokens[tt.key] === o.value }));
    });
    return out;
  }

  function ComposePreview({ schema, tokens, subject, body, contact, leadIcon, previewExtraChips, previewFooterMeta, readyLabel = 'ready', needLabel = 'needs category', untitled = 'Untitled' }) {
    const TONE = COMPOSER_TONE;
    const reqKey = schema.requiredKey;
    const hasReq = !reqKey || tokens[reqKey] !== undefined;
    const chips = schema.tokenTypes.filter((tt) => tt.key in tokens).map((tt) => ({ key: tt.key, ...tt.chip(tokens[tt.key]) }));
    const leadTone = chips[0] ? (TONE[chips[0].tone] || TONE.neutral) : TONE.neutral;
    const leadGlyph = chips[0]?.icon || leadIcon;
    return (
      <div style={{ flexShrink: 0, padding: '6px 16px 12px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--gb-text-muted)', padding: '2px 2px 8px' }}>Preview</div>
        <div style={{ position: 'relative', borderRadius: 'var(--gb-r-lg)', overflow: 'hidden', background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-border-subtle)', animation: 'gb-clr-rise .22s cubic-bezier(.34,1.4,.64,1) both' }}>
          <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: leadTone.solid, opacity: hasReq ? 1 : 0.4 }} />
          <div style={{ padding: '14px 16px 14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 30, height: 30, borderRadius: 'var(--gb-r-sm)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: leadTone.bgMed, color: leadTone.fg, border: `1px solid ${leadTone.bd}` }}>{leadGlyph}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, letterSpacing: -0.1, color: subject.trim() ? 'var(--gb-text-primary)' : 'var(--gb-text-ghost)' }}>{subject.trim() || untitled}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 11, minHeight: 22 }}>
              {previewExtraChips}
              {chips.length === 0 && !previewExtraChips ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--gb-text-muted)', fontWeight: 500 }}>Pick a category <Kbd>/</Kbd>{reqKey && <span style={{ color: 'var(--gb-error)' }}>required</span>}</span>
              ) : chips.map((c) => { const T = TONE[c.tone] || TONE.neutral; return (
                <span key={c.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 'var(--gb-r-pill)', background: T.bg, border: `1px solid ${T.bd}`, color: T.fg, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', whiteSpace: 'nowrap', animation: 'gb-clr-pop .14s ease' }}>{c.icon && <span style={{ display: 'flex' }}>{c.icon}</span>}{c.label}</span>
              ); })}
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--gb-border-subtle)', fontSize: 12.5, lineHeight: 1.55, color: body.trim() ? 'var(--gb-text-secondary)' : 'var(--gb-text-ghost)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{body.trim() || 'Add a description below…'}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderTop: '1px solid var(--gb-border-subtle)', background: 'var(--gb-fill-subtle)', fontSize: 10.5, color: 'var(--gb-text-muted)' }}>
            <I.user size={11} /> <span style={{ fontWeight: 600 }}>{contact}</span>
            {previewFooterMeta && <><span style={{ opacity: 0.5 }}>·</span>{previewFooterMeta}</>}
            <span style={{ flex: 1 }} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: hasReq ? 'var(--gb-success-fg)' : 'var(--gb-text-ghost)' }}>{hasReq ? <><I.check size={12} /> {readyLabel}</> : needLabel}</span>
          </div>
        </div>
      </div>
    );
  }

  const FIELD_TAG = { width: 54, flexShrink: 0, fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--gb-text-muted)', userSelect: 'none' };
  const BAR_ICON_BTN = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gb-text-muted)', display: 'flex', padding: 2, flexShrink: 0 };
  const SAVE_BTN = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 30, padding: '0 16px', background: 'var(--gb-fill-inverse-strong)', color: 'var(--gb-text-primary)', border: '1px solid var(--gb-border-strong)', borderRadius: 'var(--gb-r-sm)', fontFamily: 'var(--gb-font-sans)', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 };
  const GHOST_BTN = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 30, padding: '0 10px', background: 'transparent', color: 'var(--gb-text-muted)', border: 'none', borderRadius: 'var(--gb-r-sm)', fontFamily: 'var(--gb-font-sans)', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 };

  const KeyboardComposer = React.forwardRef(function KeyboardComposer({ schema, f, onLog, onFilterEnter, renderList, contact, leadIcon, composeTitle = 'Composing an entry', subjectLabel = 'Subject', noteLabel = 'Note', notePlaceholder = 'Add detail…', extraField, buildExtra, previewExtraChips, previewFooterMeta, previewReadyLabel, previewNeedLabel, previewUntitled, saveLabel = 'Save' }, ref) {
    const [mode, setMode] = React.useState('filter');
    const [tokens, setTokens] = React.useState({});
    const [subject, setSubject] = React.useState('');
    const [body, setBody] = React.useState('');
    const [filter, setFilter] = React.useState('');
    const [menuOpen, setMenuOpen] = React.useState(false);
    const [menuFilter, setMenuF] = React.useState('');
    const [menuActive, setMenuA] = React.useState(0);
    const [nudge, setNudge] = React.useState(false);
    const filterRef = (f && f.searchRef) || React.useRef(null);
    const subjectRef = React.useRef(null);
    const bodyRef = React.useRef(null);
    const extraRef = React.useRef(null);
    const composing = mode === 'compose';
    const hasTokens = Object.keys(tokens).length > 0;
    const hasExtra = !!buildExtra;
    React.useEffect(() => { ensureComposerStyles(); }, []);
    React.useEffect(() => { if (f) f.setQuery(composing ? '' : filter); }, [filter, composing]); // eslint-disable-line
    const focus = (r) => setTimeout(() => r.current?.focus(), 0);
    const reset = () => { setMode('filter'); setTokens({}); setSubject(''); setBody(''); setMenuOpen(false); setMenuF(''); setNudge(false); focus(filterRef); };
    const openMenu = () => { if (!composing) { setMode('compose'); setFilter(''); } setMenuOpen(true); setMenuF(''); setMenuA(0); focus(subjectRef); };
    const closeMenu = () => { setMenuOpen(false); setMenuF(''); focus(subjectRef); };
    const setToken = (k, v) => setTokens((t) => ({ ...t, [k]: v }));
    const removeToken = (k) => setTokens((t) => { const n = { ...t }; delete n[k]; return n; });
    const removeLast = () => { const keys = schema.tokenTypes.map((t) => t.key).filter((k) => k in tokens); if (keys.length) removeToken(keys[keys.length - 1]); };
    const commit = () => { if (schema.requiredKey && tokens[schema.requiredKey] === undefined) { setNudge(true); setTimeout(() => setNudge(false), 800); openMenu(); return; } onLog({ tokens, subject: subject.trim(), body: body.trim() }); reset(); };
    React.useImperativeHandle(ref, () => ({
      loadTemplate(tpl) { setMode('compose'); setTokens(schema.fromTemplate ? schema.fromTemplate(tpl) : {}); setSubject(tpl.subject || tpl.name || ''); setBody(tpl.body || ''); setMenuOpen(false); focus(subjectRef); },
      openMenu, reset, focus() { (composing ? subjectRef : filterRef).current?.focus(); },
    }));
    const items = menuItems(schema, menuFilter, tokens);
    const navItems = items.filter((i) => i.kind === 'item');
    const selectItem = (it) => { if (tokens[it.tkey] === it.value) removeToken(it.tkey); else setToken(it.tkey, it.value); setMenuF(''); setMenuA(0); focus(subjectRef); };
    const onFilterKey = (e) => {
      if (e.key === '/' && filter === '') { e.preventDefault(); openMenu(); return; }
      if (e.key === ' ') { const w = filter.trim(); if (w && !w.includes(' ')) { const tok = classifyWord(schema, w); if (tok) { e.preventDefault(); setMode('compose'); setFilter(''); setToken(tok.key, tok.value); focus(subjectRef); return; } } }
      if (e.key === 'Enter') { e.preventDefault(); if (f && f.results.length && onFilterEnter) onFilterEnter(f.results[0]); else openMenu(); return; }
      if (e.key === 'ArrowDown' && f && f.results.length) { e.preventDefault(); f.setActive(0); f.focusRow(0); }
    };
    const onMenuKey = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMenuA((a) => Math.min(a + 1, navItems.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setMenuA((a) => Math.max(a - 1, 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); if (navItems[menuActive]) selectItem(navItems[menuActive]); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); reset(); }
      else if (e.key === 'Tab') { e.preventDefault(); closeMenu(); }
      else if (e.key === 'Backspace' && menuFilter === '') { e.preventDefault(); closeMenu(); }
    };
    const onSubjectKey = (e) => {
      if (menuOpen) { onMenuKey(e); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); reset(); return; }
      if (e.key === '/' && subject === '') { e.preventDefault(); openMenu(); return; }
      if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); focus(bodyRef); return; }
      if (e.key === 'Enter') { e.preventDefault(); commit(); return; }
      if (e.key === ' ') { const w = subject.trim(); if (w && !w.includes(' ')) { const tok = classifyWord(schema, w); if (tok) { e.preventDefault(); setToken(tok.key, tok.value); setSubject(''); return; } } }
      if (e.key === 'Backspace' && subject === '' && hasTokens) { e.preventDefault(); removeLast(); return; }
    };
    const onBodyKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); reset(); return; }
      if (e.key === 'Enter') { e.preventDefault(); commit(); return; }
      if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); if (hasExtra) setTimeout(() => extraRef.current?.focus?.(), 0); else focus(subjectRef); return; }
      if (e.key === 'Backspace' && body === '') { e.preventDefault(); focus(subjectRef); return; }
    };
    const extraApi = { ref: extraRef, commit, reset, focusSubject: () => focus(subjectRef), focusBody: () => focus(bodyRef) };
    const extraNode = hasExtra ? buildExtra(extraApi) : (extraField || null);
    return (
      <div className="gb-kbd-composer" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ padding: '14px 16px 10px', position: 'relative', flexShrink: 0 }}>
          <div className="clr-bar" style={{ display: 'flex', flexDirection: 'column', padding: composing ? '10px 11px' : '0 10px', background: 'var(--gb-fill-inverse-medium)', border: `1px solid ${nudge ? 'var(--gb-error)' : 'var(--gb-border-default)'}`, borderRadius: 'var(--gb-r-md)', transition: 'padding .2s ease, border-color .15s' }}>
            {composing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, animation: 'gb-clr-field-in .2s ease both' }}>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  <span style={{ display: 'flex', color: 'var(--gb-brand-label)', flexShrink: 0, marginRight: 1 }} title={composeTitle}><CornerKey size={15} /></span>
                  {schema.tokenTypes.map((tt) => (tt.key in tokens) ? (() => { const c = tt.chip(tokens[tt.key]); const T = COMPOSER_TONE[c.tone] || COMPOSER_TONE.neutral; return (
                    <span key={tt.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 4px 3px 8px', borderRadius: 'var(--gb-r-sm)', background: T.bgMed, border: `1px solid ${T.bd}`, color: T.fg, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', animation: 'gb-clr-pop .14s ease' }}>{c.icon && <span style={{ display: 'flex' }}>{c.icon}</span>}{c.label}<span role="button" tabIndex={-1} onClick={(e) => { e.stopPropagation(); removeToken(tt.key); }} style={{ display: 'flex', cursor: 'pointer', opacity: 0.7, marginLeft: 1 }}><I.close size={11} /></span></span>
                  ); })() : null)}
                  <button type="button" onClick={openMenu} title="Add tag · /" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 'var(--gb-r-sm)', background: 'var(--gb-fill-subtle)', border: '1px dashed var(--gb-border-strong)', color: 'var(--gb-text-tertiary)', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'var(--gb-font-sans)' }}><I.plus size={11} /> tag</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                  <label htmlFor="gb-kc-subject" style={FIELD_TAG}>{subjectLabel}</label>
                  <input id="gb-kc-subject" ref={subjectRef} type="text" value={menuOpen ? menuFilter : subject} onChange={(e) => { if (menuOpen) { setMenuF(e.target.value); setMenuA(0); } else setSubject(e.target.value); }} onKeyDown={onSubjectKey} placeholder={menuOpen ? 'Filter tags…' : (schema.subjectPlaceholder || 'What was this about?')} autoComplete="off" spellCheck={false} style={{ flex: 1, minWidth: 0, height: 24, background: 'transparent', border: 'none', outline: 'none', color: 'var(--gb-text-primary)', fontSize: 14, fontWeight: 600, fontFamily: 'var(--gb-font-sans)' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, borderTop: '1px solid var(--gb-border-subtle)', paddingTop: 9 }}>
                  <label htmlFor="gb-kc-note" style={{ ...FIELD_TAG, paddingTop: 3 }}>{noteLabel}</label>
                  <textarea id="gb-kc-note" ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={onBodyKey} rows={2} placeholder={notePlaceholder} autoComplete="off" spellCheck={false} style={{ flex: 1, minWidth: 0, resize: 'none', background: 'transparent', border: 'none', outline: 'none', color: 'var(--gb-text-secondary)', fontSize: 13, fontWeight: 500, lineHeight: 1.5, fontFamily: 'var(--gb-font-sans)', padding: 0 }} />
                </div>
                {hasExtra && extraNode}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--gb-border-subtle)', paddingTop: 9 }}>
                  <span style={{ flex: 1 }} />
                  <button type="button" onClick={reset} style={GHOST_BTN}>Clear</button>
                  <button type="button" onClick={commit} style={SAVE_BTN}>{saveLabel}</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, height: 38 }}>
                <I.search size={15} style={{ color: 'var(--gb-text-muted)', flexShrink: 0 }} />
                <input ref={filterRef} type="text" value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={onFilterKey} onFocus={() => f && f.setActive(-1)} placeholder={schema.filterPlaceholder || 'Filter…   or / to compose'} autoComplete="off" spellCheck={false} style={{ flex: 1, minWidth: 0, height: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'var(--gb-text-primary)', fontSize: 13, fontWeight: 500, fontFamily: 'var(--gb-font-sans)' }} />
                {filter ? <button type="button" onClick={() => setFilter('')} style={BAR_ICON_BTN}><I.close size={13} /></button> : <Kbd>/</Kbd>}
              </div>
            )}
          </div>
          {menuOpen && (
            <div role="listbox" style={{ position: 'absolute', left: 16, right: 16, top: 'calc(100% - 4px)', zIndex: 40, maxHeight: 280, overflowY: 'auto', padding: 6, background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-strong)', borderRadius: 'var(--gb-r-md)', boxShadow: 'var(--gb-shadow-popover)', animation: 'gb-clr-pop .12s ease' }}>
              {items.length === 0 && <div style={{ padding: 10, fontSize: 12, color: 'var(--gb-text-muted)' }}>No tag matches “{menuFilter}”.</div>}
              {items.map((it, i) => it.kind === 'header'
                ? <div key={`h${i}`} style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gb-text-muted)', padding: '8px 8px 4px' }}>{it.label}</div>
                : (() => { const T = COMPOSER_TONE[it.tone] || COMPOSER_TONE.neutral; const on = it.navIndex === menuActive; return (
                    <div key={`i${i}`} role="option" aria-selected={on} onMouseEnter={() => setMenuA(it.navIndex)} onClick={() => selectItem(it)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', background: on ? T.bg : 'transparent', border: `1px solid ${on ? T.bd : 'transparent'}` }}>
                      <span style={{ width: 20, display: 'flex', justifyContent: 'center', color: T.fg }}>{it.icon || <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.solid }} />}</span>
                      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, color: 'var(--gb-text-primary)' }}>{it.label}</span>
                      {it.active && <I.check size={13} style={{ color: T.fg }} />}
                      {on && !it.active && <Kbd>↵</Kbd>}
                    </div>
                  ); })())}
            </div>
          )}
        </div>
        {composing && <ComposePreview schema={schema} tokens={tokens} subject={subject} body={body} contact={contact} leadIcon={leadIcon} previewExtraChips={previewExtraChips} previewFooterMeta={previewFooterMeta} readyLabel={previewReadyLabel} needLabel={previewNeedLabel} untitled={previewUntitled} />}
        {renderList ? renderList(f) : null}
      </div>
    );
  });

  window.GBComposer = { KeyboardComposer, useComposerFilter, COMPOSER_TONE, CornerKey, ensureComposerStyles, Kbd };
})();
