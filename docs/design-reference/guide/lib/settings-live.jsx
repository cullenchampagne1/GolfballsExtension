/* ───────────────────────────────────────────────────────────────
   settings-live.jsx — faithful, runnable port of the Manager →
   Settings page (src/pages/SettingsPanel.jsx), trimmed to the
   sections that matter for a new rep. Reads/writes the mock chrome.
   Exposed as window.SettingsLive.
─────────────────────────────────────────────────────────────── */
(function () {
  const { motion, AnimatePresence } = window.Motion;
  const { useState, useEffect, useImperativeHandle, forwardRef } = React;
  const G = window.GB;
  const { FeatureSpotlight, Switch, Btn, Input, Field, Callout, SectionLabel, Dot, Tag, I } = G;

  /* feature flags + descriptions (verbatim from src/lib/flags.js) */
  const FEATURE_FLAGS = [
    { key: 'emailTemplatesEnabled', name: 'Email Templates', icon: 'mail', desc: 'Shows the template dropdown, resolved-variables readout, and Send button in the popup.' },
    { key: 'chargeEnabled', name: 'Charge Card', icon: 'card', desc: "Shows the Charge Card / Refund button in the email template popup. Disable if you don't process payments through the extension." },
    { key: 'orderEditEnabled', name: 'Order Edit', icon: 'edit', desc: "Shows the Order Edit button in the email template popup." },
    { key: 'submitProofEnabled', name: 'Submit Proof', icon: 'send', desc: 'Shows the Submit Proof button for sending art proofs directly from the order page.' },
    { key: 'marginCalcEnabled', name: 'Margin Calculator', icon: 'calc', desc: 'Displays margin calculations and profit metrics on order pages.' },
    { key: 'watchListEnabled', name: 'Watchlist', icon: 'eye', desc: 'Enables the watchlist feature to track orders across sessions.' },
    { key: 'taskListEnabled', name: 'Task List', icon: 'check', desc: 'Shows an integrated task list for tracking order-related todos.' },
    { key: 'crmSearchEnabled', name: 'CRM Search', icon: 'search', desc: 'Quick search bar for looking up customers and orders in the CRM.' },
    { key: 'crmQueryBuilderEnabled', name: 'CRM Query Builder', icon: 'filter', desc: 'Advanced query builder for filtering CRM data with complex conditions.' },
    { key: 'emailPreviewEnabled', name: 'Email Preview', icon: 'mail', desc: 'Hover over any email row in the Case Email History portlet to see a popup preview — no download required.' },
    { key: 'imagePreviewEnabled', name: 'Image Viewer', icon: 'eye', desc: 'Shows a View Logo hover button over product logo images — preview, download, or submit proof without leaving the page.' },
    { key: 'calendarEnabled', name: 'Calendar', icon: 'calendar', desc: 'Shows order ship dates and production timeline on a visual calendar.' },
    { key: 'autoPushEnabled', name: 'Auto Push', icon: 'send', desc: 'Automatically pushes order updates to external systems when status changes.' },
    { key: 'phoneFinderEnabled', name: 'Phone Finder', icon: 'phone', desc: 'Extracts and formats phone numbers from order data for quick copying.' },
    { key: 'copyIdsEnabled', name: 'Copy IDs', icon: 'copy', desc: 'Shows a Copy button in the Order List portlet title bar, writing all order IDs as clickable links to the clipboard.' },
    { key: 'signifydGlowEnabled', name: 'Signifyd Glow', icon: 'alert', desc: 'Adds a subtle glow effect to orders based on their Signifyd fraud-score status.' },
  ];
  const ICON_EL = (name) => (I[name] || I.cog)({});

  const VARIANTS = [
    { id: 'dark', name: 'Dark' }, { id: 'light', name: 'Light' }, { id: 'midnight', name: 'Midnight' }, { id: 'cream', name: 'Cream' },
  ];
  const SHORTCUTS = [
    { key: 'taskList', label: 'My Tasks', def: 'X', desc: 'Opens the full-screen task list from any page.' },
    { key: 'marginCalc', label: 'Margin Calculator', def: 'M', desc: 'Opens the floating margin calculator from any page.' },
    { key: 'crmSearch', label: 'CRM Search', def: 'K', desc: 'Opens the full-screen CRM search modal from any page.' },
    { key: 'crmNewContact', label: 'New Contact', def: 'Q', desc: 'Opens the quick-create contact modal from any page.' },
  ];
  const DEV_ROWS = [
    { key: 'numberDisplay.enabled', label: 'Animated number displays', desc: 'Counts up to the value over time. Turn off for instant snap.', type: 'bool', default: true },
    { key: 'popup.ignorePageContext', label: 'Popup: ignore page context', desc: 'Show all order + account templates in the popup regardless of the current page.', type: 'bool', default: false },
    { key: 'marginCalc.draggable', label: 'Margin Calculator: draggable mode', desc: 'When on, the calculator is a draggable tool window with a click-through backdrop.', type: 'bool', default: true },
    { key: 'email.localPart', label: 'Email account host', desc: 'Local part of the sender address (before @). e.g. "cullen" → cullen@golfballs.com.', type: 'string', default: 'cullen' },
    { key: 'golfballViewer.ballScale', label: 'Golfball viewer: default ball scale', desc: 'Initial scale of the ball when 3D opens (1 = native size).', type: 'number', default: 1 },
  ];

  function VariantCard({ v, active, onClick }) {
    return (
      <div onClick={onClick} style={{ cursor: 'pointer', background: active ? 'var(--gb-surface-2)' : 'var(--gb-surface-1)', border: '1px solid ' + (active ? 'var(--gb-brand-tint-border)' : 'rgba(128,128,128,0.28)'), borderRadius: 'var(--gb-r-md)', padding: 8, boxSizing: 'border-box' }}>
        <div data-theme={v.id} style={{ '--gb-brand-label': 'inherit', height: 38, borderRadius: 'var(--gb-r-sm)', padding: '0 8px', background: 'var(--gb-surface-canvas)', border: '1px solid var(--gb-border-default)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: 'var(--gb-brand-label)', flexShrink: 0 }} />
          <span style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--gb-fill-soft)' }} />
          <span style={{ width: 16, height: 11, borderRadius: 3, background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)' }} />
        </div>
        <div style={{ marginTop: 7, fontSize: 11.5, fontWeight: 700, color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-primary)' }}>{v.name}</div>
      </div>
    );
  }

  function ShortcutRow({ s, value, onChange }) {
    const enabled = !!value;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gb-text-primary)' }}>{s.label}</div>
          <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 2 }}>{enabled ? s.desc : <span style={{ color: 'var(--gb-text-ghost)', fontStyle: 'italic' }}>Disabled — clear left empty</span>}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--gb-text-ghost)' }}>Ctrl +</span>
          <div style={{ width: 38, height: 32, borderRadius: 'var(--gb-r-sm)', border: '1px solid ' + (enabled ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), background: enabled ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <input value={value} maxLength={1} onChange={(e) => onChange((e.target.value.replace(/[^a-zA-Z]/g, '').slice(-1) || '').toUpperCase())} placeholder="—"
              style={{ width: '100%', height: '100%', textAlign: 'center', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', background: 'transparent', border: 'none', outline: 'none', color: enabled ? 'var(--gb-brand-label)' : 'var(--gb-text-ghost)', fontFamily: 'var(--gb-font-sans)' }} />
          </div>
        </div>
      </div>
    );
  }

  function ExpandablePA({ on, onChange, url, onUrl }) {
    const [paStatus, setPaStatus] = useState(null);
    const test = () => { const ok = /^https:\/\/[^/\s]+\.(logic\.azure\.com|environment\.api\.powerplatform\.com)(:\d+)?\/\S+/i.test((url || '').trim()); setPaStatus(ok ? 'ok' : 'fail'); };
    return (
      <div style={{ border: '1px solid ' + (on ? 'var(--gb-warning-tint-border)' : 'var(--gb-border-default)'), borderRadius: 'var(--gb-r-lg)', background: on ? 'var(--gb-warning-tint-soft)' : 'var(--gb-surface-1)', overflow: 'hidden', transition: 'background .2s, border-color .2s' }}>
        <div onClick={() => onChange(!on)} style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
          <div style={{ width: 36, height: 36, borderRadius: 'var(--gb-r-md)', flexShrink: 0, border: '1px solid ' + (on ? 'var(--gb-warning-tint-border)' : 'var(--gb-border-default)'), background: on ? 'var(--gb-warning-tint-medium)' : 'var(--gb-fill-subtle)', color: on ? 'var(--gb-warning)' : 'var(--gb-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{I.send({ size: 17 })}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}><span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Direct Send via Power Automate</span><Tag tone="warning" size="xs">EXPERIMENTAL</Tag></div>
            <div style={{ fontSize: 11, color: 'var(--gb-text-tertiary)', marginTop: 3, lineHeight: 1.5 }}>When enabled and a flow URL is set, templates that opt in send directly through Power Automate instead of opening Outlook.</div>
          </div>
          <Switch on={on} size="md" tone="warning" onChange={onChange} />
        </div>
        <AnimatePresence>
          {on && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: 'hidden' }}>
              <div style={{ padding: '0 14px 14px' }}>
                <Field label="Flow URL" required><Input value={url} onChange={onUrl} mono leading={I.bolt({})} placeholder="https://…environment.api.powerplatform.com/powerautomate/…" /></Field>
                <div style={{ marginTop: 12 }}><Callout tone="warning" title="Set up in Power Automate" icon={I.bolt({ size: 14 })}><ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}><li>Create <b>New flow</b> → <b>When an HTTP request is received</b></li><li>Add a <b>Send an email (V2)</b> action</li><li>Save and paste the generated URL above</li></ol></Callout></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                  <Btn variant="tinted" status="warning" size="sm" icon={I.bolt({})} onClick={test}>Test connection</Btn>
                  <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Dot tone={paStatus === 'ok' ? 'brand' : paStatus === 'fail' ? 'error' : 'muted'} glow={paStatus === 'ok'} size={5} />{paStatus === 'ok' ? 'URL valid — saved automatically' : paStatus === 'fail' ? 'Paste the full URL from Power Automate' : 'Not tested'}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  function DevRow({ def, value, onChange }) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--gb-border-subtle)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-primary)' }}>{def.label}</div>
          <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1, lineHeight: 1.4 }}>{def.desc}</div>
          <div style={{ fontSize: 9.5, color: 'var(--gb-text-ghost)', marginTop: 3, fontFamily: 'var(--gb-font-mono)' }}>{def.key}</div>
        </div>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {def.type === 'bool' && <Switch on={!!value} size="sm" onChange={onChange} />}
          {def.type === 'number' && <Input size="sm" mono value={String(value)} onChange={(v) => onChange(v.replace(/[^0-9.]/g, ''))} style={{ width: 70 }} />}
          {def.type === 'string' && <Input size="sm" value={value} onChange={onChange} style={{ width: 140 }} />}
        </div>
      </div>
    );
  }

  const SettingsLive = forwardRef(function SettingsLive({ chrome }, ref) {
    const [flags, setFlags] = useState({});
    const [variant, setVariant] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');
    const [shortcuts, setShortcuts] = useState(() => Object.fromEntries(SHORTCUTS.map((s) => [s.key, s.def])));
    const [dev, setDev] = useState(() => Object.fromEntries(DEV_ROWS.map((d) => [d.key, d.default])));

    useEffect(() => { chrome.storage.local.get('featureFlags', (d) => setFlags(d.featureFlags || {})); }, []);
    const toggleFlag = (key) => { const next = { ...flags, [key]: !flags[key] }; setFlags(next); chrome.storage.local.set({ featureFlags: next }); };
    const setFlagVal = (key, v) => { const next = { ...flags, [key]: v }; setFlags(next); chrome.storage.local.set({ featureFlags: next }); };

    useImperativeHandle(ref, () => ({
      toggleFlag, setVariant, setShortcut: (k, v) => setShortcuts((s) => ({ ...s, [k]: v })),
      setPA: (on) => setFlagVal('powerAutomateEnabled', on),
      getFlags: () => flags,
    }), [flags]);

    return (
      <div data-theme={variant} style={{ width: 660, background: 'var(--gb-surface-canvas)', color: 'var(--gb-text-secondary)', fontFamily: 'var(--gb-font-sans)', padding: 18, display: 'flex', flexDirection: 'column', gap: 24, borderRadius: 'inherit' }}>
        <section data-demo="variant">
          <SectionLabel>Variant</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {VARIANTS.map((v) => <VariantCard key={v.id} v={v} active={variant === v.id} onClick={() => setVariant(v.id)} />)}
          </div>
        </section>

        <section data-demo="features">
          <SectionLabel>Features</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {FEATURE_FLAGS.map((f) => <FeatureSpotlight key={f.key} on={flags[f.key] !== false} icon={ICON_EL(f.icon)} name={f.name} desc={f.desc} size="sm" onChange={() => toggleFlag(f.key)} />)}
          </div>
        </section>

        <section data-demo="shortcuts">
          <SectionLabel>Keyboard Shortcuts</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SHORTCUTS.map((s) => <ShortcutRow key={s.key} s={s} value={shortcuts[s.key]} onChange={(v) => setShortcuts((p) => ({ ...p, [s.key]: v }))} />)}
          </div>
        </section>

        <section data-demo="powerautomate">
          <SectionLabel>Experimental</SectionLabel>
          <ExpandablePA on={!!flags.powerAutomateEnabled} onChange={(on) => setFlagVal('powerAutomateEnabled', on)} url={flags.powerAutomateUrl || ''} onUrl={(v) => setFlagVal('powerAutomateUrl', v)} />
        </section>

        <section data-demo="dev">
          <SectionLabel action={<span style={{ fontSize: 10, color: 'var(--gb-text-muted)' }}>{DEV_ROWS.length} of 20+ shown</span>}>Developer Settings</SectionLabel>
          <div style={{ background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', padding: '4px 12px' }}>
            {DEV_ROWS.map((d) => <DevRow key={d.key} def={d} value={dev[d.key]} onChange={(v) => setDev((p) => ({ ...p, [d.key]: v }))} />)}
          </div>
        </section>
      </div>
    );
  });

  window.SettingsLive = SettingsLive;
  window.GB_FEATURE_FLAGS_DATA = FEATURE_FLAGS;
  window.GBSettingsBits = { VariantCard, ShortcutRow, ExpandablePA, DevRow, FEATURE_FLAGS, ICON_EL, VARIANTS, SHORTCUTS, DEV_ROWS };
})();
