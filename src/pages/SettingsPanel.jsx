import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  SectionLabel, Card, Callout, Btn, Input, Dropdown, Field,
  FeatureSpotlight, ExpandableFeature, ColorSpotlight, Switch, Dot, I,
  CollapsibleChecklist,
} from '../ui/index.js';
import {
  THEME_VARIANTS, THEME_COLORS, DEFAULT_THEME,
  loadTheme, applyTheme, saveTheme, currentColor,
} from '../lib/theme.js';
import {
  FEATURE_FLAGS, FEATURE_DEFAULTS, loadFlags, saveFlags,
  KEYBOARD_SHORTCUTS_DEFAULTS, loadKeyboardShortcuts, saveKeyboardShortcuts,
} from '../lib/flags.js';
import {
  CUSTOM_PAGE_SECTIONS, loadCustomPages, saveCustomPages, emptyCustomPages,
} from '../lib/customPages.js';
import {
  PRESET_SCOPES, gatherScopes, applyScopes, normalizePreset, presetScopeIds,
} from '../lib/presetScopes.js';
import { Checkbox } from '../ui/components/Checkbox.jsx';
import { Tag } from '../ui/components/Tag.jsx';

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

/* Card hover/active transitions go through a CSS class — not motion's
   whileHover — because motion can't smoothly interpolate `var()` color
   tokens. The artifact was a transient "dark flash" in light theme and
   a midnight-tinted bg in dark theme as motion fell back to invalid
   interpolation values. CSS handles it cleanly. */
const VARIANT_CARD_STYLE_ID = '__gb-variant-card';
function ensureVariantCardStyle() {
  if (typeof document === 'undefined' || document.getElementById(VARIANT_CARD_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = VARIANT_CARD_STYLE_ID;
  el.textContent = `
    .gb-variant-card {
      transition: background-color .15s ease, border-color .15s ease, transform .15s ease;
    }
    .gb-variant-card:hover { background: var(--gb-surface-2); }
    .gb-variant-card:active { transform: scale(0.985); }
  `;
  (document.head || document.documentElement).appendChild(el);
}

/* ── Variant Card ────────────────────────────────────────────── */
function VariantCard({ variant, active, onClick }) {
  useEffect(() => { ensureVariantCardStyle(); }, []);
  return (
    <div
      className="gb-variant-card"
      onClick={onClick}
      style={{
        cursor: 'pointer',
        background: active ? 'var(--gb-surface-2)' : 'var(--gb-surface-1)',
        // Non-themed border so the frame is stable while the preview repaints.
        border: '1px solid ' + (active ? 'var(--gb-brand-tint-border)' : 'rgba(128, 128, 128, 0.28)'),
        borderRadius: 'var(--gb-r-md)',
        padding: 8,
        boxSizing: 'border-box',
      }}
    >
      <div
        data-theme={variant.id}
        style={{
          // Force the brand back to the user's themed value. Each
          // [data-theme="…"] block in src/ui/theme.css re-declares
          // --gb-brand-label to that variant's baseline; setting it to
          // `inherit` here makes it walk back up to <html> (where
          // applyTheme wrote the user's customized brand color). The
          // surface/text/border tokens stay variant-specific so each
          // card still previews the variant's chrome under YOUR brand.
          '--gb-brand-label': 'inherit',
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
    </div>
  );
}

/* ── Keyboard Shortcut Input ─────────────────────────────────── */
function KeyboardShortcutRow({ label, desc, value, onChange }) {
  const enabled = !!value;
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
        <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 2 }}>
          {enabled ? desc : <span style={{ color: 'var(--gb-text-ghost)', fontStyle: 'italic' }}>Disabled — clear left empty</span>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <motion.span
          animate={{ color: enabled ? 'var(--gb-text-ghost)' : 'var(--gb-text-ghost)', opacity: enabled ? 1 : 0.5 }}
          transition={T.base}
          style={{ fontSize: 11 }}
        >
          Ctrl +
        </motion.span>
        <motion.div
          /* `key={value}` makes the input pop on every change — the new
             letter animates in from a slight scale instead of just text-
             swapping. AnimatePresence handles the disabled-state empty
             box vs. an active letter. */
          animate={{
            backgroundColor: enabled ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-2)',
            borderColor: enabled ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)',
          }}
          transition={T.base}
          style={{
            position: 'relative',
            width: 38, height: 32,
            borderRadius: 'var(--gb-r-sm)',
            border: '1px solid',
          }}
        >
          <input
            type="text"
            maxLength={1}
            value={value}
            onChange={handleInput}
            placeholder="—"
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              textAlign: 'center',
              fontSize: 13, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: 1,
              background: 'transparent', border: 'none',
              borderRadius: 'var(--gb-r-sm)',
              color: enabled ? 'var(--gb-brand-label)' : 'var(--gb-text-ghost)',
              outline: 'none',
            }}
          />
        </motion.div>
        {/* Clear / disable — fades in when there's a value to clear, so
            an unbound shortcut stays visually quiet. */}
        <AnimatePresence initial={false}>
          {enabled && (
            <motion.button
              key="clear"
              type="button"
              onClick={() => onChange('')}
              title="Disable shortcut"
              initial={{ opacity: 0, width: 0, marginLeft: 0 }}
              animate={{ opacity: 1, width: 20, marginLeft: 0 }}
              exit={{ opacity: 0, width: 0, marginLeft: 0 }}
              transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
              whileHover={{ color: 'var(--gb-error-fg)' }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: 20, padding: 0,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--gb-text-muted)', overflow: 'hidden',
              }}
            >
              <I.trash size={11} />
            </motion.button>
          )}
        </AnimatePresence>
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

/* ── User Presets Manager ──────────────────────────────────────
   Save snapshot bundles of the extension's storage. Each save lets
   the user pick which scopes to include (Settings, Email Templates,
   Note Templates, or all). Load merges scopes back: arrays merge by
   id (same id = replace, new id = append) so sharing a preset with
   a friend ADDS templates to their library instead of wiping it. */
function UserPresetsManager({ onPresetLoad }) {
  const [presets, setPresets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState('');
  // Default: full state — every scope checked.
  const [chosenScopes, setChosenScopes] = useState(() => new Set(PRESET_SCOPES.map((s) => s.id)));
  const fileInputRef = useRef(null);

  useEffect(() => { loadUserPresets(); }, []);

  async function loadUserPresets() {
    try {
      const data = await chrome.storage.local.get('userPresets');
      setPresets(data.userPresets || []);
    } catch { setPresets([]); }
  }

  function toggleScope(id) {
    setChosenScopes((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  const allChecked  = chosenScopes.size === PRESET_SCOPES.length;
  const someChecked = chosenScopes.size > 0 && !allChecked;
  const toggleAll = () => setChosenScopes(allChecked
    ? new Set()
    : new Set(PRESET_SCOPES.map((s) => s.id)));

  function openSaveDialog() {
    // Reset to full-state each time the dialog opens — the most common
    // intent is "back up everything I have right now".
    setChosenScopes(new Set(PRESET_SCOPES.map((s) => s.id)));
    setPresetName('');
    setShowSaveDialog(true);
  }

  async function handleSave() {
    if (!presetName.trim() || chosenScopes.size === 0) return;
    const scopes = await gatherScopes([...chosenScopes]);
    const id = 'up_' + Date.now();
    const newPreset = {
      id, name: presetName.trim(), createdAt: Date.now(),
      scopes,
    };
    const updated = [...presets, newPreset];
    setPresets(updated);
    await chrome.storage.local.set({ userPresets: updated });
    setPresetName(''); setShowSaveDialog(false); setSelectedId(id);
    window.__gbToast?.success(`Saved "${newPreset.name}"`);
  }

  async function handleLoad() {
    if (!selectedId) return;
    const raw = presets.find((p) => p.id === selectedId);
    if (!raw) return;
    const preset = normalizePreset(raw);
    const { applied } = await applyScopes(preset.scopes);
    onPresetLoad?.();
    const labels = applied
      .map((id) => PRESET_SCOPES.find((s) => s.id === id)?.label)
      .filter(Boolean);
    window.__gbToast?.success(
      labels.length ? `Loaded ${labels.join(' · ')}` : 'Preset had nothing to load',
    );
  }

  async function handleDelete() {
    if (!selectedId) return;
    const updated = presets.filter((p) => p.id !== selectedId);
    setPresets(updated);
    await chrome.storage.local.set({ userPresets: updated });
    setSelectedId(null);
  }

  function handleExport() {
    if (!selectedId) return;
    const preset = presets.find((p) => p.id === selectedId);
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
      // Stamp a fresh id so two imports of the same file don't collide.
      const normalized = normalizePreset({ ...obj, id: 'up_' + Date.now(), createdAt: Date.now() });
      const updated = [...presets, normalized];
      setPresets(updated);
      await chrome.storage.local.set({ userPresets: updated });
      setSelectedId(normalized.id);
      window.__gbToast?.success(`Imported "${normalized.name}"`);
    } catch (err) {
      console.error('Import failed:', err);
      window.__gbToast?.error('Import failed — not a valid preset file');
    }
    e.target.value = '';
  }

  const hasPresets = presets.length > 0;
  const dropdownOptions = presets.map((p) => {
    const ids = presetScopeIds(p);
    const tail = ids.length ? ` · ${ids.length} scope${ids.length === 1 ? '' : 's'}` : '';
    return { id: p.id, label: `${p.name} (${new Date(p.createdAt).toLocaleDateString()})${tail}` };
  });
  const selectedScopeIds = selectedId
    ? presetScopeIds(presets.find((p) => p.id === selectedId))
    : [];

  return (
    <div>
      <SectionLabel>User Presets</SectionLabel>
      <AnimatePresence>
        {showSaveDialog && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={T.base}
            style={{ overflow: 'hidden', marginBottom: 12 }}
          >
            <div style={{
              padding: 12,
              background: 'var(--gb-brand-tint-soft)',
              border: '1px solid var(--gb-brand-tint-border)',
              borderRadius: 'var(--gb-r-md)',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  placeholder="Name this preset…"
                  autoFocus size="sm"
                  style={{ flex: 1 }}
                />
                <Btn
                  variant="primary" size="sm" icon={<I.check />}
                  disabled={!presetName.trim() || chosenScopes.size === 0}
                  onClick={handleSave}
                >
                  Save
                </Btn>
                <Btn variant="ghost" size="sm" onClick={() => setShowSaveDialog(false)}>Cancel</Btn>
              </div>
              {/* Scope picker — uppercase eyebrow + master "Full state"
                  checkbox + one row per scope with its description. */}
              <div style={{
                padding: 10,
                background: 'var(--gb-surface-1)',
                border: '1px solid var(--gb-border-default)',
                borderRadius: 'var(--gb-r-sm)',
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <Checkbox
                    size="sm"
                    checked={allChecked}
                    indeterminate={someChecked}
                    onChange={toggleAll}
                  />
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gb-text-primary)' }}>
                    Full state
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--gb-text-muted)' }}>
                    {chosenScopes.size} of {PRESET_SCOPES.length} included
                  </span>
                </div>
                <div style={{ height: 1, background: 'var(--gb-border-subtle)' }} />
                {PRESET_SCOPES.map((s) => (
                  <Checkbox
                    key={s.id}
                    size="sm"
                    checked={chosenScopes.has(s.id)}
                    label={s.label}
                    hint={s.desc}
                    onChange={() => toggleScope(s.id)}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Dropdown size="sm" value={selectedId} placeholder={hasPresets ? 'Select a preset…' : 'No saved presets'} options={dropdownOptions} onChange={setSelectedId} disabled={!hasPresets} style={{ flex: 1 }} />
        <Btn variant="primary" size="sm" onClick={handleLoad} disabled={!selectedId}>Load</Btn>
        <Btn variant="secondary" size="sm" onClick={openSaveDialog}>Save</Btn>
        <Btn variant="secondary" size="sm" onClick={handleExport} disabled={!selectedId}>Export</Btn>
        <Btn variant="secondary" size="sm" onClick={handleDelete} disabled={!selectedId}><I.trash size={12} /></Btn>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
        <Btn variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>Import</Btn>
      </div>
      {/* Tag row — at a glance, what's in the selected preset. */}
      {selectedScopeIds.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
          {selectedScopeIds.map((id) => {
            const def = PRESET_SCOPES.find((s) => s.id === id);
            return def ? <Tag key={id} tone="brand" size="xs">{def.label}</Tag> : null;
          })}
        </div>
      )}
    </div>
  );
}

/* ── Main Settings Panel ─────────────────────────────────────── */
export function SettingsPanel() {
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [flags, setFlags] = useState(FEATURE_DEFAULTS);
  const [shortcuts, setShortcuts] = useState(KEYBOARD_SHORTCUTS_DEFAULTS);
  const [customPages, setCustomPages] = useState(emptyCustomPages);
  const [refreshKey, setRefreshKey] = useState(0);
  const [paStatus, setPaStatus] = useState(null);

  useEffect(() => {
    loadTheme().then((t) => { setTheme(t); applyTheme(t); });
    loadFlags().then(setFlags);
    loadKeyboardShortcuts().then(setShortcuts);
    loadCustomPages().then(setCustomPages);
  }, [refreshKey]);

  /* Update one section's selection + persist. The customPages shape is
     { [sectionId]: [pageId, …] }, so we replace the section's array
     wholesale on every change — same pattern as setFlagValue. */
  function setSectionSelection(sectionId, ids) {
    const next = { ...customPages, [sectionId]: ids };
    setCustomPages(next);
    saveCustomPages(next);
  }

  const commitTheme = (next) => { setTheme(next); applyTheme(next); saveTheme(next); };
  const pickVariant = (variant) => {
    if (variant === theme.variant) return;
    commitTheme({ ...theme, variant });
    window.__gbToast?.success(`Theme set to ${variant}`);
  };
  const setColor = (key, value) => commitTheme({ ...theme, colors: { ...theme.colors, [key]: value } });
  const resetColors = () => {
    commitTheme({ ...theme, colors: {} });
    window.__gbToast?.success('Colors reset to variant defaults');
  };
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

            <div style={{ marginTop: 12 }}>
              <Callout tone="warning" title="Set up in Power Automate">
                <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                  <li>Create <b style={{ color: 'var(--gb-text-secondary)' }}>New flow</b> → <b style={{ color: 'var(--gb-text-secondary)' }}>When an HTTP request is received</b></li>
                  <li>Add a <b style={{ color: 'var(--gb-text-secondary)' }}>Send an email (V2)</b> action</li>
                  <li>Save and paste the generated URL above</li>
                </ol>
              </Callout>
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

      {/* Custom Pages — pick which internal site pages the extension
          should replace with custom overrides. Each section is a
          CollapsibleChecklist with its own tri-state select-all; the
          section-level header here also drives a master select-all
          that flips every page across every section. */}
      <section>
        {(() => {
          const allItems = CUSTOM_PAGE_SECTIONS.flatMap((s) =>
            s.items.map((it) => ({ sec: s.id, id: it.id })));
          const totalPicked = allItems.reduce(
            (n, { sec, id }) => n + ((customPages[sec] || []).includes(id) ? 1 : 0), 0,
          );
          const allOn = totalPicked === allItems.length && allItems.length > 0;
          const masterToggle = () => {
            const next = {};
            for (const s of CUSTOM_PAGE_SECTIONS) {
              next[s.id] = allOn ? [] : s.items.map((it) => it.id);
            }
            setCustomPages(next);
            saveCustomPages(next);
          };
          return (
            <SectionLabel
              action={
                <Btn variant="ghost" size="xs" onClick={masterToggle}>
                  {allOn ? 'Deselect all' : 'Select all'}
                </Btn>
              }
            >
              Custom Pages
            </SectionLabel>
          );
        })()}
        <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: -4, marginBottom: 10, lineHeight: 1.5 }}>
          Pick which internal site pages the extension replaces with a custom UI. Anything left unchecked falls through to the original page.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {CUSTOM_PAGE_SECTIONS.map((section) => (
            <CollapsibleChecklist
              key={section.id}
              icon={<I.cog />}
              title={section.label}
              items={section.items}
              selected={customPages[section.id] || []}
              onChange={(ids) => setSectionSelection(section.id, ids)}
              columns={2}
              defaultOpen={false}
            />
          ))}
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
              <SectionLabel divider={false} style={{ marginBottom: 7 }}>Notifications</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                <NotifBtn tone="brand"   label="Info"    onClick={() => fireNotification('info', 'Info — everything looks normal', 4000)} />
                <NotifBtn tone="success" label="Success" onClick={() => fireNotification('success', 'Success — action completed', 4000)} />
                <NotifBtn tone="error"   label="Error"   onClick={() => fireNotification('error', 'Error — something went wrong', 5000)} />
                <NotifBtn tone="warning" label="Loading" onClick={() => fireNotification('loading', 'Loading — simulating progress…', 0)} />
              </div>
            </div>

            {/* Modals */}
            <div style={{ marginBottom: 14 }}>
              <SectionLabel divider={false} style={{ marginBottom: 7 }}>Modals</SectionLabel>
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

            <Callout tone="neutral" icon={<I.alert />}>
              API calls inside modals will fail gracefully — UI is fully visible.
            </Callout>
          </ExpandableFeature>
        </section>
      )}
    </div>
  );
}
