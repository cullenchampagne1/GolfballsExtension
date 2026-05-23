import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  SectionLabel, Card, Btn, Input, Dropdown, Field,
  FeatureSpotlight, ExpandableFeature, ColorSpotlight, Switch, Dot, I,
} from '../ui/index.js';
import {
  THEME_VARIANTS, THEME_COLORS, DEFAULT_THEME,
  loadTheme, applyTheme, saveTheme, currentColor,
} from '../lib/theme.js';
import {
  FEATURE_FLAGS, FEATURE_DEFAULTS, loadFlags, saveFlags,
  KEYBOARD_SHORTCUTS_DEFAULTS, loadKeyboardShortcuts, saveKeyboardShortcuts,
} from '../lib/flags.js';

/* ───────────────────────────────────────────────────────────────
   SettingsPanel — the fully-featured Manage → Settings page.
─────────────────────────────────────────────────────────────── */

const T = { base: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } };

/* ── Icon helper ─────────────────────────────────────────────── */
const ICON_MAP = {
  card: <I.card />, edit: <I.edit />, send: <I.send />, bolt: <I.bolt />,
  eye: <I.eye />, check: <I.check />, search: <I.search />, filter: <I.filter />,
  mail: <I.mail />, cog: <I.cog />, copy: <I.copy />, alert: <I.alert />, user: <I.user />,
};
const getIcon = (name) => ICON_MAP[name] || <I.cog />;

/* Each variant's BASELINE brand-label — mirrors src/ui/theme.css. The
   preview overrides --gb-brand-label inline so the user's saved color
   override on <html> doesn't leak in and make every card show the same
   green. (Inline style on the preview div beats inline style on <html>
   because the cream/dark/etc. declaration sits on the preview itself.) */
const VARIANT_BASE_BRAND = {
  dark:     '#8fce2e',
  midnight: '#a3e030',
  light:    '#4d6b14',
  cream:    '#5a7a14',
};

/* ── Variant Card ────────────────────────────────────────────── */
function VariantCard({ variant, active, onClick }) {
  const baseBrand = VARIANT_BASE_BRAND[variant.id] || VARIANT_BASE_BRAND.dark;
  return (
    <Card
      active={active} hover onClick={onClick} padding={8}
      style={{
        cursor: 'pointer',
        // Non-themed border on the container — the variant previews can
        // change, but the frame around them stays put.
        border: '1px solid rgba(128, 128, 128, 0.28)',
      }}
    >
      <div
        data-theme={variant.id}
        style={{
          // Force the preview's brand back to the variant's baseline so
          // the user's custom brand override doesn't paint every card the
          // same color.
          '--gb-brand-label': baseBrand,
          height: 38, borderRadius: 'var(--gb-r-sm)', padding: '0 8px',
          background: 'var(--gb-surface-canvas)', border: '1px solid var(--gb-border-default)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: 'var(--gb-brand-label)', flexShrink: 0 }} />
        <span style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--gb-fill-soft)' }} />
        <span style={{ width: 16, height: 11, borderRadius: 3, background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)' }} />
      </div>
      <div style={{ marginTop: 7, fontSize: 11.5, fontWeight: 700, color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-primary)' }}>
        {variant.name}
      </div>
    </Card>
  );
}

/* ── Keyboard Shortcut Input ─────────────────────────────────── */
function KeyboardShortcutRow({ label, desc, value, onChange }) {
  const handleInput = (e) => {
    const v = e.target.value.replace(/[^a-zA-Z]/g, '');
    onChange(v ? v.slice(-1).toUpperCase() : '');
  };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px',
      background: 'var(--gb-surface-1)',
      border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-md)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gb-text-primary)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 2 }}>{desc}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: 'var(--gb-text-ghost)' }}>Ctrl +</span>
        <input
          type="text"
          maxLength={1}
          value={value}
          onChange={handleInput}
          placeholder="X"
          style={{
            width: 38, height: 32, textAlign: 'center',
            fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1,
            background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)',
            borderRadius: 'var(--gb-r-sm)', color: 'var(--gb-text-primary)',
            outline: 'none',
          }}
        />
      </div>
    </div>
  );
}

/* ── Dev console buttons (match design reference's NotifBtn / ModalBtn) ── */
function NotifBtn({ tone, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '8px 11px',
        background: 'var(--gb-surface-1)',
        border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-sm)',
        fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-secondary)',
        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
      }}
    >
      <Dot tone={tone} glow size={6} />
      {label}
    </button>
  );
}

function ModalBtn({ icon, label, meta, metaTone, onClick }) {
  const metaColor = metaTone === 'error' ? 'var(--gb-error-fg)'
    : metaTone === 'brand' ? 'var(--gb-brand-label)'
      : 'var(--gb-text-ghost)';
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px',
        background: 'var(--gb-surface-1)',
        border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-sm)',
        fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-secondary)',
        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
      }}
    >
      <span style={{ color: 'var(--gb-text-tertiary)', display: 'flex' }}>
        {React.cloneElement(icon, { size: 12 })}
      </span>
      {label}
      {meta && (
        <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 500, color: metaColor }}>
          {meta}
        </span>
      )}
    </button>
  );
}

/* ── User Presets Manager ────────────────────────────────────── */
function UserPresetsManager({ onPresetLoad }) {
  const [presets, setPresets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => { loadUserPresets(); }, []);

  async function loadUserPresets() {
    try {
      const data = await chrome.storage.local.get('userPresets');
      setPresets(data.userPresets || []);
    } catch { setPresets([]); }
  }

  async function handleSave() {
    if (!presetName.trim()) return;
    const theme = await loadTheme();
    const flags = await loadFlags();
    const id = 'up_' + Date.now();
    const newPreset = { id, name: presetName.trim(), colors: theme.colors || {}, variant: theme.variant, featureFlags: flags, createdAt: Date.now() };
    const updated = [...presets, newPreset];
    setPresets(updated);
    await chrome.storage.local.set({ userPresets: updated });
    setPresetName(''); setShowSaveDialog(false); setSelectedId(id);
  }

  async function handleLoad() {
    if (!selectedId) return;
    const preset = presets.find(p => p.id === selectedId);
    if (!preset) return;
    const newTheme = { variant: preset.variant || 'dark', colors: preset.colors || {} };
    applyTheme(newTheme); saveTheme(newTheme);
    if (preset.featureFlags) saveFlags(preset.featureFlags);
    onPresetLoad?.();
  }

  async function handleDelete() {
    if (!selectedId) return;
    const updated = presets.filter(p => p.id !== selectedId);
    setPresets(updated);
    await chrome.storage.local.set({ userPresets: updated });
    setSelectedId(null);
  }

  function handleExport() {
    if (!selectedId) return;
    const preset = presets.find(p => p.id === selectedId);
    if (!preset) return;
    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = preset.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_preset.json';
    a.click(); URL.revokeObjectURL(url);
  }

  async function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const obj = JSON.parse(await file.text());
      if (!obj.name) throw new Error('Invalid');
      obj.id = 'up_' + Date.now(); obj.createdAt = Date.now();
      const updated = [...presets, obj];
      setPresets(updated);
      await chrome.storage.local.set({ userPresets: updated });
    } catch (err) { console.error('Import failed:', err); }
    e.target.value = '';
  }

  const hasPresets = presets.length > 0;
  const dropdownOptions = presets.map(p => ({ id: p.id, label: `${p.name} (${new Date(p.createdAt).toLocaleDateString()})` }));

  return (
    <div>
      <SectionLabel>User Presets</SectionLabel>
      <AnimatePresence>
        {showSaveDialog && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={T.base} style={{ overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, padding: 12, background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)', borderRadius: 'var(--gb-r-md)' }}>
              <Input value={presetName} onChange={(e) => setPresetName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSave()} placeholder="Name this preset..." autoFocus size="sm" style={{ flex: 1 }} />
              <Btn variant="primary" size="sm" icon={<I.check />} onClick={handleSave}>Save</Btn>
              <Btn variant="ghost" size="sm" onClick={() => setShowSaveDialog(false)}>Cancel</Btn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Dropdown value={selectedId} placeholder={hasPresets ? 'Select a preset...' : 'No saved presets'} options={dropdownOptions} onChange={setSelectedId} disabled={!hasPresets} style={{ flex: 1 }} />
        <Btn variant="primary" size="sm" onClick={handleLoad} disabled={!selectedId}>Load</Btn>
        <Btn variant="secondary" size="sm" onClick={() => setShowSaveDialog(true)}>Save</Btn>
        <Btn variant="secondary" size="sm" onClick={handleExport} disabled={!selectedId}>Export</Btn>
        <Btn variant="ghost" size="sm" onClick={handleDelete} disabled={!selectedId}><I.trash size={12} /></Btn>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
        <Btn variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>Import</Btn>
      </div>
    </div>
  );
}

/* ── Main Settings Panel ─────────────────────────────────────── */
export function SettingsPanel() {
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [flags, setFlags] = useState(FEATURE_DEFAULTS);
  const [shortcuts, setShortcuts] = useState(KEYBOARD_SHORTCUTS_DEFAULTS);
  const [refreshKey, setRefreshKey] = useState(0);
  const [paStatus, setPaStatus] = useState(null);

  useEffect(() => {
    loadTheme().then((t) => { setTheme(t); applyTheme(t); });
    loadFlags().then(setFlags);
    loadKeyboardShortcuts().then(setShortcuts);
  }, [refreshKey]);

  const commitTheme = (next) => { setTheme(next); applyTheme(next); saveTheme(next); };
  const pickVariant = (variant) => commitTheme({ ...theme, variant });
  const setColor = (key, value) => commitTheme({ ...theme, colors: { ...theme.colors, [key]: value } });
  const resetColors = () => commitTheme({ ...theme, colors: {} });
  const toggleFlag = (key) => { const next = { ...flags, [key]: !flags[key] }; setFlags(next); saveFlags(next); };
  const setFlagValue = (key, value) => { const next = { ...flags, [key]: value }; setFlags(next); saveFlags(next); };
  const setShortcut = (key, value) => { const next = { ...shortcuts, [key]: value.toLowerCase() }; setShortcuts(next); saveKeyboardShortcuts(next); };

  const regularFeatures = FEATURE_FLAGS.filter(f => !f.experimental && !f.dev);
  const experimentalFeatures = FEATURE_FLAGS.filter(f => f.experimental);
  const devFeature = FEATURE_FLAGS.find(f => f.dev);

  // Dev test helpers
  const fireNotification = (type, msg, dur) => {
    chrome.tabs.query({}, tabs => tabs.forEach(tab =>
      chrome.tabs.sendMessage(tab.id, { action: 'devFireNotification', type, msg, dur }, () => void chrome.runtime.lastError)
    ));
  };
  const fireModal = (modal, extra = {}) => {
    const stubs = {
      charge: { action: 'showChargeModal', context: { orderId: 'TEST-1234', userId: 'DEV-USER', pageTotal: 87.50, captured: 75.00, apiOrderTotal: 87.50, diffAmount: 12.50, isRefund: false, isZeroDiff: false, chargeRows: [], _devMode: true } },
      'charge-refund': { action: 'showChargeModal', context: { orderId: 'TEST-1234', userId: 'DEV-USER', pageTotal: 75.00, captured: 87.50, apiOrderTotal: 75.00, diffAmount: -12.50, isRefund: true, isZeroDiff: false, chargeRows: [], _devMode: true } },
      calendar: { action: 'devFireModal', modal: 'calendar' },
      'image-viewer': { action: 'devFireModal', modal: 'image-viewer' },
      'proof-modal': { action: 'devFireModal', modal: 'proof-modal' },
      'email-preview-case': { action: 'devFireModal', modal: 'email-preview', isCasePage: true },
      'email-preview-nocase': { action: 'devFireModal', modal: 'email-preview', isCasePage: false },
      watchlist: { action: 'showWatchListModal' },
    };
    const stub = stubs[modal];
    if (stub) chrome.tabs.query({}, tabs => tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { ...stub, ...extra }, () => void chrome.runtime.lastError)));
  };

  // Non-destructive check of the Power Automate flow URL format.
  // Accepts both Logic Apps (logic.azure.com) and Power Platform direct
  // automation (*.environment.api.powerplatform.com) URL formats.
  const testConnection = () => {
    const url = (flags.powerAutomateUrl || '').trim();
    const ok = /^https:\/\/[^/\s]+\.(logic\.azure\.com|environment\.api\.powerplatform\.com)(:\d+)?\/\S+/i.test(url);
    setPaStatus(ok ? 'ok' : 'fail');
    return ok ? Promise.resolve() : Promise.reject(new Error('invalid flow url'));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, fontFamily: 'var(--gb-font-sans)' }}>

      {/* User Presets */}
      <UserPresetsManager onPresetLoad={() => setRefreshKey(k => k + 1)} />

      {/* Variant */}
      <section>
        <SectionLabel>Variant</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {THEME_VARIANTS.map((v) => <VariantCard key={v.id} variant={v} active={theme.variant === v.id} onClick={() => pickVariant(v.id)} />)}
        </div>
      </section>

      {/* Features */}
      <section>
        <SectionLabel>Features</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {regularFeatures.map((f) => (
            <FeatureSpotlight key={f.key} on={!!flags[f.key]} icon={getIcon(f.icon)} name={f.name} desc={f.desc} onChange={() => toggleFlag(f.key)} />
          ))}
        </div>
      </section>

      {/* Keyboard Shortcuts */}
      <section>
        <SectionLabel>Keyboard Shortcuts</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <KeyboardShortcutRow label="My Tasks" desc="Opens the full-screen task list from any page." value={shortcuts.taskList?.toUpperCase() || ''} onChange={(v) => setShortcut('taskList', v)} />
          <KeyboardShortcutRow label="Margin Calculator" desc="Opens the floating margin calculator from any page." value={shortcuts.marginCalc?.toUpperCase() || ''} onChange={(v) => setShortcut('marginCalc', v)} />
          <KeyboardShortcutRow label="CRM Search" desc="Opens the full-screen CRM search modal from any page." value={shortcuts.crmSearch?.toUpperCase() || ''} onChange={(v) => setShortcut('crmSearch', v)} />
          <KeyboardShortcutRow label="New Contact" desc="Opens the quick-create contact modal from any page." value={shortcuts.crmNewContact?.toUpperCase() || ''} onChange={(v) => setShortcut('crmNewContact', v)} />
        </div>
      </section>

      {/* Experimental */}
      <section>
        <SectionLabel>Experimental</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ExpandableFeature
            on={!!flags.replyWithTemplateEnabled}
            onChange={() => toggleFlag('replyWithTemplateEnabled')}
            icon={<I.send />}
            tone="warning"
            name="Direct Send via Power Automate"
            desc="When enabled and a flow URL is set, the send button becomes Send and emails go directly through Power Automate — no Outlook window."
          >
            <Field label="Flow URL" required>
              <Input
                value={flags.powerAutomateUrl || ''}
                onChange={(v) => setFlagValue('powerAutomateUrl', v)}
                mono
                placeholder="https://…environment.api.powerplatform.com/powerautomate/…"
                leading={<I.bolt />}
              />
            </Field>

            <div style={{
              marginTop: 12, padding: 11,
              background: 'var(--gb-warning-tint-soft)',
              border: '1px solid var(--gb-warning-tint-border)',
              borderLeft: '3px solid var(--gb-warning)',
              borderRadius: 'var(--gb-r-sm)',
              fontSize: 11, color: 'var(--gb-text-tertiary)', lineHeight: 1.55,
            }}>
              <div style={{
                fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase',
                letterSpacing: 0.8, color: 'var(--gb-warning-fg)', marginBottom: 4,
              }}>
                Set up in Power Automate
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>Create <b style={{ color: 'var(--gb-text-secondary)' }}>New flow</b> → <b style={{ color: 'var(--gb-text-secondary)' }}>When an HTTP request is received</b></li>
                <li>Add a <b style={{ color: 'var(--gb-text-secondary)' }}>Send an email (V2)</b> action</li>
                <li>Save and paste the generated URL above</li>
              </ol>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <Btn variant="tinted" status="warning" size="sm" icon={<I.bolt />} onClick={testConnection}>
                Test connection
              </Btn>
              <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Dot tone={paStatus === 'ok' ? 'brand' : paStatus === 'fail' ? 'error' : 'muted'} glow={paStatus === 'ok'} size={5} />
                {paStatus === 'ok' ? 'URL valid — saved automatically' : paStatus === 'fail' ? 'Paste the full URL from Power Automate' : 'Not tested'}
              </span>
            </div>
          </ExpandableFeature>
        </div>
      </section>

      {/* Theme Colors */}
      <section>
        <SectionLabel action={<Btn variant="ghost" size="xs" onClick={resetColors}>Reset All</Btn>}>Theme Colors</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {THEME_COLORS.map((c) => (
            <ColorSpotlight key={c.key} value={theme.colors?.[c.key] || currentColor(c.key)} defaultValue={currentColor(c.key)} name={c.name} desc={c.hint} varName={c.key} onChange={(hex) => setColor(c.key, hex)} />
          ))}
        </div>
      </section>

      {/* Developer — always at the bottom */}
      {devFeature && (
        <section>
          <SectionLabel>Developer</SectionLabel>
          <ExpandableFeature
            on={!!flags[devFeature.key]}
            onChange={() => toggleFlag(devFeature.key)}
            icon={<I.bolt />}
            tone="brand"
            name={devFeature.name}
            desc="Reveals a test console for firing notifications and opening modals on the active tab. API calls fail gracefully — UI is fully visible."
          >
            {/* Notifications */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--gb-text-muted)', marginBottom: 7 }}>
                Notifications
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                <NotifBtn tone="brand"   label="Info"    onClick={() => fireNotification('info', 'Info — everything looks normal', 4000)} />
                <NotifBtn tone="success" label="Success" onClick={() => fireNotification('success', 'Success — action completed', 4000)} />
                <NotifBtn tone="error"   label="Error"   onClick={() => fireNotification('error', 'Error — something went wrong', 5000)} />
                <NotifBtn tone="warning" label="Loading" onClick={() => fireNotification('loading', 'Loading — simulating progress…', 0)} />
              </div>
            </div>

            {/* Modals */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--gb-text-muted)', marginBottom: 7 }}>
                Modals
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                <ModalBtn icon={<I.card />} label="Charge Card"             meta="+$12.50 due" metaTone="brand" onClick={() => fireModal('charge')} />
                <ModalBtn icon={<I.card />} label="Charge — Refund state"   meta="−$12.50"     metaTone="error" onClick={() => fireModal('charge-refund')} />
                <ModalBtn icon={<I.edit />} label="Calendar / Date Picker"  meta="dev mode"    onClick={() => fireModal('calendar')} />
                <ModalBtn icon={<I.eye />}  label="Image / Logo Viewer"     meta="placeholder" onClick={() => fireModal('image-viewer')} />
                <ModalBtn icon={<I.send />} label="Submit Proof Modal"      meta="stub data"   onClick={() => fireModal('proof-modal')} />
                <ModalBtn icon={<I.mail />} label="Email Preview — Case"    meta="w/ sidebar"  onClick={() => fireModal('email-preview-case')} />
                <ModalBtn icon={<I.mail />} label="Email Preview — No case" meta="no sidebar"  onClick={() => fireModal('email-preview-nocase')} />
                <ModalBtn icon={<I.eye />}  label="Watch List Modal"        onClick={() => fireModal('watchlist')} />
              </div>
            </div>

            <div style={{
              padding: '8px 11px',
              background: 'var(--gb-fill-subtle)',
              border: '1px solid var(--gb-border-subtle)',
              borderRadius: 'var(--gb-r-sm)',
              fontSize: 10.5, color: 'var(--gb-text-muted)',
              display: 'flex', alignItems: 'center', gap: 7,
            }}>
              <I.alert size={11} style={{ color: 'var(--gb-brand-label)' }} />
              API calls inside modals will fail gracefully — UI is fully visible.
            </div>
          </ExpandableFeature>
        </section>
      )}
    </div>
  );
}
