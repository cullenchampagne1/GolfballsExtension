import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  SectionLabel, Card, Callout, Btn, IconBtn, Input, Dropdown, Field,
  FeatureSpotlight, ExpandableFeature, ColorSpotlight, Switch, Dot, I,
  Slider,
} from '../ui/index.js';
import {
  SCALE_CATEGORIES, DEFAULT_SCALES, loadScales, saveScales, applyScales,
} from '../lib/scales.js';
import {
  THEME_VARIANTS, THEME_COLORS, DEFAULT_THEME, DEFAULT_BRAND, BRAND_KEYS,
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
  buildSettingsTemplateFile, parseSettingsTemplateFile,
} from '../lib/presetScopes.js';
import { Checkbox } from '../ui/components/Checkbox.jsx';
import { CollapsibleSection } from '../ui/components/CollapsibleSection.jsx';
import { DEV_SETTINGS, defaultDevSettings, loadDevSettings, saveDevSettings } from '../lib/devSettings.js';
import { EMPTY_CREDENTIALS, loadCredentials, saveCredentials } from '../lib/credentials.js';
import { isPowerAutomateUrl } from '../lib/security.js';
import { sendBackgroundMessage } from '../lib/backgroundMessage.js';

/* ───────────────────────────────────────────────────────────────
   SettingsPanel — the fully-featured Manage → Settings page.
─────────────────────────────────────────────────────────────── */

const T = { base: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } };

function downloadJson(value, filename) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}

function safeJsonFilename(name, fallback) {
  return `${String(name || fallback).trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || fallback}.json`;
}

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
          // Variants with a built-in accent (ownAccent) preview under THAT
          // color: their [data-theme="…"] block in src/ui/theme.css declares
          // --gb-brand-label, and we let it stand so the dot + chip show the
          // variant's signature color. The default-green shells instead force
          // --gb-brand-label to `inherit`, walking back up to <html> (where
          // applyTheme wrote the user's customized brand) so they preview
          // under YOUR brand. Either way the surface/text/border tokens stay
          // variant-specific, so every card previews its own chrome.
          ...(variant.ownAccent ? {} : { '--gb-brand-label': 'inherit' }),
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
function UiScaleRow({ label, hint, value, onChange }) {
  const pct = Math.round((value || 1) * 100);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-text-primary)' }}>{label}</div>
        <div style={{ flex: 1, fontSize: 10.5, color: 'var(--gb-text-muted)' }}>{hint}</div>
        <button
          type="button"
          onClick={() => onChange(1)}
          disabled={pct === 100}
          style={{
            background: pct === 100 ? 'var(--gb-fill-soft)' : 'transparent',
            border: '1px solid var(--gb-border-default)',
            borderRadius: 'var(--gb-r-sm)',
            color: pct === 100 ? 'var(--gb-text-muted)' : 'var(--gb-brand-label)',
            padding: '2px 8px',
            fontSize: 10, fontWeight: 700, fontFamily: 'var(--gb-font-mono)',
            cursor: pct === 100 ? 'default' : 'pointer',
            minWidth: 48, textAlign: 'center',
          }}
          title={pct === 100 ? '' : 'Reset to 100%'}
        >
          {pct}%
        </button>
      </div>
      <Slider
        value={pct}
        min={50}
        max={150}
        step={5}
        unit="%"
        showValue={false}
        ticks={[50, 75, 100, 125, 150]}
        onChange={(v) => onChange(Math.max(0.5, Math.min(1.5, v / 100)))}
      />
    </div>
  );
}

function KeyboardShortcutRow({ label, desc, value, onChange, featureOff }) {
  const enabled = !!value;
  const handleInput = (e) => {
    if (featureOff) return;
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
      // Greyed + non-interactive when the feature itself is turned off — the
      // keybind can't fire while the feature is disabled, so the row shouldn't
      // look editable.
      opacity: featureOff ? 0.45 : 1,
      pointerEvents: featureOff ? 'none' : 'auto',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gb-text-primary)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 2 }}>
          {featureOff
            ? <span style={{ color: 'var(--gb-text-ghost)', fontStyle: 'italic' }}>Feature turned off — enable it above to use this shortcut</span>
            : enabled ? desc : <span style={{ color: 'var(--gb-text-ghost)', fontStyle: 'italic' }}>Disabled — clear left empty</span>}
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

/* ── Shared settings templates ─────────────────────────────────
   Named, scoped snapshots use authenticated links when available and bounded
   JSON files when the server or installation credential is unavailable.
   Both transports preview and apply through the same scoped merge path. */
function SettingsLinksManager({ onPresetLoad }) {
  const fileInputRef = useRef(null);
  const [shares, setShares] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedShare, setSelectedShare] = useState(null);
  const [importCandidate, setImportCandidate] = useState(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [serverUnavailable, setServerUnavailable] = useState(false);
  // Default: full state — every scope checked (save dialog).
  const [chosenScopes, setChosenScopes] = useState(() => new Set(PRESET_SCOPES.map((s) => s.id)));
  // Which scopes to APPLY when loading the selected preset (defaults to all it
  // carries; the recipient can untick any before loading).
  const [loadScopes, setLoadScopes] = useState(new Set());
  useEffect(() => { loadShares(); }, []);

  // Loading a link prepares an import candidate. Owned/listed links never
  // enter this state, so creators are not invited to import their own link.
  useEffect(() => {
    setLoadScopes(new Set(importCandidate ? presetScopeIds(importCandidate) : []));
  }, [importCandidate]);

  async function loadShares() {
    try {
      const response = await sendBackgroundMessage('settingsShareList');
      setShares(response.shares || []);
      setServerUnavailable(false);
    } catch (error) {
      setShares([]);
      setServerUnavailable(true);
    }
  }

  async function openSettingsFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const preset = parseSettingsTemplateFile(await file.text());
      setImportCandidate({ ...preset, id: `json-${Date.now()}` });
      setImportUrl('');
      setShowSaveDialog(false);
      setShowImportPanel(true);
      window.__gbToast?.success(`Loaded "${preset.name}" from JSON — choose what to import`);
    } catch (error) {
      window.__gbToast?.error(error.message || 'Unable to read settings template file');
    }
  }

  function downloadSettingsFallback(name, scopes) {
    const file = buildSettingsTemplateFile(name, scopes);
    downloadJson(file, safeJsonFilename(name, 'golfballs-settings'));
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
    setShowImportPanel(false);
    setShowSaveDialog(true);
  }

  async function handleSave() {
    if (!presetName.trim() || chosenScopes.size === 0) return;
    setBusy(true);
    try {
      const scopes = await gatherScopes([...chosenScopes]);
      if (serverUnavailable) {
        downloadSettingsFallback(presetName, scopes);
        setPresetName('');
        setShowSaveDialog(false);
        window.__gbToast?.success('Settings template downloaded as JSON');
        return;
      }
      const response = await sendBackgroundMessage('settingsShareCreate', {
        name: presetName.trim(), scopes,
      });
      const share = normalizePreset(response.share);
      setShares((current) => [share, ...current.filter((item) => item.id !== share.id)]);
      setSelectedId(share.id);
      setSelectedShare(share);
      setPresetName('');
      setShowSaveDialog(false);
      let copied = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(share.url);
          copied = true;
        }
      } catch {
        // Link creation succeeded; clipboard availability must not turn it
        // into a false failure. The Copy button remains available below.
      }
      window.__gbToast?.success(
        copied ? `Created "${share.name}" and copied its URL` : `Created "${share.name}"`,
      );
    } catch (error) {
      try {
        const scopes = await gatherScopes([...chosenScopes]);
        downloadSettingsFallback(presetName, scopes);
        setServerUnavailable(true);
        setPresetName('');
        setShowSaveDialog(false);
        window.__gbToast?.success('Server unavailable — downloaded a JSON settings template instead');
      } catch (fallbackError) {
        window.__gbToast?.error(fallbackError.message || error.message || 'Unable to share settings');
      }
    } finally { setBusy(false); }
  }

  async function handleLoad() {
    if (!importCandidate) return;
    setBusy(true);
    try {
      const preset = normalizePreset(importCandidate);
      // Apply only the scopes the user left ticked.
      const chosen = {};
      for (const id of loadScopes) if (preset.scopes && preset.scopes[id]) chosen[id] = preset.scopes[id];
      const { applied } = await applyScopes(chosen);
      if (importCandidate.transport !== 'json') {
        try {
          const retained = await sendBackgroundMessage('settingsShareRecordImport', {
            shareId: preset.id,
            scopeIds: applied,
          });
          const retainedShare = normalizePreset(retained.share);
          setShares((current) => [retainedShare, ...current.filter((item) => item.id !== retainedShare.id)]);
          setSelectedId(retainedShare.id);
          setSelectedShare(retainedShare);
        } catch {
          // Applying the local data succeeded. Server-side history is optional
          // and must never turn that success into an import failure.
          setServerUnavailable(true);
        }
      }
      setImportCandidate(null);
      setImportUrl('');
      setShowImportPanel(false);
      onPresetLoad?.();
      const labels = applied.map((id) => PRESET_SCOPES.find((s) => s.id === id)?.label).filter(Boolean);
      window.__gbToast?.success(labels.length ? `Imported ${labels.join(' · ')}` : 'Template had nothing to import');
    } catch (error) {
      window.__gbToast?.error(error.message || 'Unable to import settings template');
    } finally { setBusy(false); }
  }

  async function handleDelete() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await sendBackgroundMessage('settingsShareRevoke', { shareId: selectedId });
      setShares((current) => current.filter((share) => share.id !== selectedId));
      setSelectedId(null);
      setSelectedShare(null);
      window.__gbToast?.success('Settings link revoked');
    } catch (error) {
      window.__gbToast?.error(error.message || 'Unable to revoke settings link');
    } finally { setBusy(false); }
  }

  async function selectOwnedShare(id) {
    setSelectedId(id);
    setSelectedShare(null);
    if (!id) return;
    setBusy(true);
    try {
      const response = await sendBackgroundMessage('settingsShareGet', { shareId: id });
      setSelectedShare(normalizePreset(response.share));
    } catch (error) {
      setServerUnavailable(true);
      window.__gbToast?.error(error.message || 'Unable to open settings link');
    } finally { setBusy(false); }
  }

  async function openImportUrl() {
    if (!importUrl.trim()) return;
    setBusy(true);
    try {
      const response = await sendBackgroundMessage('settingsShareGet', { url: importUrl.trim() });
      const share = normalizePreset(response.share);
      setImportCandidate(share);
      setServerUnavailable(false);
      window.__gbToast?.success(`Loaded "${share.name}" — choose what to import`);
    } catch (error) {
      setServerUnavailable(true);
      window.__gbToast?.error(error.message || 'Unable to open settings link');
    } finally { setBusy(false); }
  }

  async function copySelectedUrl() {
    if (!selectedShare?.url) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable');
      await navigator.clipboard.writeText(selectedShare.url);
      window.__gbToast?.success('Settings URL copied');
    } catch (error) {
      window.__gbToast?.error(error.message || 'Unable to copy settings URL');
    }
  }

  const hasShares = shares.length > 0;
  const dropdownOptions = shares.map((p) => {
    const ids = p.scope_ids || presetScopeIds(p);
    const tail = ids.length ? ` · ${ids.length} scope${ids.length === 1 ? '' : 's'}` : '';
    const created = p.created_at ? new Date(p.created_at).toLocaleDateString() : '';
    const shared = p.relationship === 'imported' ? ' · Shared with you' : '';
    return { id: p.id, label: `${p.name}${created ? ` (${created})` : ''}${tail}${shared}` };
  });
  const candidateScopeIds = importCandidate ? presetScopeIds(importCandidate) : [];

  return (
    <div>
      <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={openSettingsFile} />
      <SectionLabel action={(
        <div style={{ display: 'flex', gap: 5 }}>
          <Btn
            variant={showImportPanel ? 'tinted' : 'ghost'}
            size="xs"
            icon={<I.link />}
            onClick={() => {
              setShowSaveDialog(false);
              setShowImportPanel((open) => !open);
            }}
          >
            Import link
          </Btn>
          <Btn variant="ghost" size="xs" icon={<I.download />} onClick={() => fileInputRef.current?.click()}>
            Import JSON
          </Btn>
          <Btn variant="primary" size="xs" icon={<I.plus />} onClick={openSaveDialog}>
            Create
          </Btn>
        </div>
      )}>
        Shared Settings Templates
      </SectionLabel>
      {serverUnavailable && (
        <Callout tone="warning" style={{ marginBottom: 10 }}>
          Link sharing is unavailable or this installation was revoked. JSON export and import remain available.
        </Callout>
      )}
      <AnimatePresence>
        {showImportPanel && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={T.base}
            style={{ overflow: 'hidden', marginBottom: 10 }}
          >
            <div style={{
              padding: 11,
              background: 'var(--gb-surface-1)',
              border: '1px solid var(--gb-border-default)',
              borderRadius: 'var(--gb-r-md)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gb-text-primary)', marginBottom: 3 }}>
                Load a shared template
              </div>
              <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginBottom: 8 }}>
                Paste the URL you received. Nothing is imported until you choose its scopes below.
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Input
                  value={importUrl}
                  onChange={setImportUrl}
                  onKeyDown={(e) => e.key === 'Enter' && openImportUrl()}
                  placeholder="https://api.cullenchampagne.com/extension/settings-shares/…"
                  leading={<I.link />}
                  mono
                  autoFocus
                  style={{ flex: 1, minWidth: 0 }}
                />
                <Btn variant="tinted" size="md" icon={<I.download />} onClick={openImportUrl} disabled={busy || !importUrl.trim()}>
                  Load link
                </Btn>
                <Btn
                  variant="ghost"
                  size="md"
                  onClick={() => {
                    setShowImportPanel(false);
                    setImportCandidate(null);
                    setImportUrl('');
                  }}
                >
                  Cancel
                </Btn>
              </div>
              <AnimatePresence>
              {candidateScopeIds.length > 0 && (
                <motion.div
                  key={importCandidate.id}
                  initial={{ opacity: 0, height: 0, y: -6 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -6 }}
                  transition={T.base}
                  style={{ overflow: 'hidden', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--gb-border-subtle)' }}
                >
                  <div style={{ fontSize: 11, fontWeight: 750, color: 'var(--gb-text-primary)', marginBottom: 2 }}>
                    {importCandidate.name}
                  </div>
                  <div style={{ fontSize: 9.5, color: 'var(--gb-text-muted)', marginBottom: 7 }}>
                    Choose what to merge into this extension · {loadScopes.size} of {candidateScopeIds.length} selected
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {candidateScopeIds.map((id) => {
                      const def = PRESET_SCOPES.find((scope) => scope.id === id);
                      if (!def) return null;
                      const on = loadScopes.has(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          title={def.desc}
                          onClick={() => setLoadScopes((current) => {
                            const next = new Set(current);
                            if (next.has(id)) next.delete(id); else next.add(id);
                            return next;
                          })}
                          style={{
                            display: 'inline-flex', alignItems: 'center', padding: '3px 9px',
                            borderRadius: 'var(--gb-r-pill)', cursor: 'pointer', fontSize: 10.5,
                            fontWeight: 600, fontFamily: 'inherit',
                            background: on ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-subtle)',
                            border: '1px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'),
                            color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)',
                            textDecoration: on ? 'none' : 'line-through',
                          }}
                        >
                          {def.label}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 9 }}>
                    <Btn
                      variant="primary"
                      size="md"
                      icon={<I.download />}
                      onClick={handleLoad}
                      disabled={busy || loadScopes.size === 0}
                    >
                      Import selected
                    </Btn>
                  </div>
                </motion.div>
              )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
                  onChange={setPresetName}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  placeholder="Name this settings template…"
                  autoFocus size="sm"
                  style={{ flex: 1 }}
                />
                <Btn
                  variant="primary" size="sm" icon={<I.check />}
                  disabled={busy || !presetName.trim() || chosenScopes.size === 0}
                  onClick={handleSave}
                >
                  {serverUnavailable ? 'Download JSON' : 'Save'}
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 14, rowGap: 7 }}>
                  {PRESET_SCOPES.map((s) => (
                    <Checkbox
                      key={s.id}
                      size="sm"
                      checked={chosenScopes.has(s.id)}
                      label={s.label}
                      onChange={() => toggleScope(s.id)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* The server list contains links created by this installation and links
          it has successfully imported. */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <Dropdown size="md" value={selectedId} placeholder={hasShares ? 'Saved settings links…' : 'No settings links yet'} options={dropdownOptions} onChange={selectOwnedShare} disabled={!hasShares || busy} style={{ flex: 1, minWidth: 0 }} />
        <IconBtn size="md" icon={<I.trash />} danger onClick={handleDelete} disabled={busy || selectedShare?.relationship !== 'owned'} title="Revoke selected settings URL" />
      </div>
      {/* Compact link result: creation/list selection never offers scope import.
          Scope choices exist only inside the explicit Import-link flow. */}
      <AnimatePresence>
      {selectedShare?.url && (
        <motion.div
          key={selectedShare.id}
          initial={{ opacity: 0, height: 0, y: -5 }}
          animate={{ opacity: 1, height: 'auto', y: 0 }}
          exit={{ opacity: 0, height: 0, y: -5 }}
          transition={T.base}
          style={{
          marginTop: 9,
          padding: '8px 9px',
          border: '1px solid var(--gb-brand-tint-border)',
          borderRadius: 'var(--gb-r-md)',
          background: 'var(--gb-brand-tint-soft)',
          display: 'flex', alignItems: 'center', gap: 8,
          overflow: 'hidden',
        }}>
          <I.link size={13} style={{ color: 'var(--gb-brand-label)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 750, color: 'var(--gb-text-primary)', marginBottom: 2 }}>
              {selectedShare.name}
            </div>
            <div title={selectedShare.url} style={{
              fontSize: 9.5, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {selectedShare.url}
            </div>
          </div>
          <IconBtn size="sm" icon={<I.copy />} onClick={copySelectedUrl} title="Copy settings URL" />
          <IconBtn
            size="sm"
            icon={<I.close />}
            onClick={() => { setSelectedId(null); setSelectedShare(null); }}
            title="Dismiss link"
          />
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

/* ── NumberCell — controlled input for `number` dev settings.
       Backed by a local draft string so backspacing to empty doesn't
       immediately snap back to the default value (the previous version
       force-flushed `def.default` on every empty render, fighting the
       user's input — backspace would visibly replace the cleared field
       with the stored default). The draft commits to the store on every
       valid numeric edit AND on blur (clamped); blur with an empty
       field reverts to the last good stored value rather than mutating it. */
function NumberCell({ def, value, onChange }) {
  const [draft, setDraft] = useState(String(value ?? ''));

  // Keep the draft in sync when the stored value changes from outside
  // (e.g. Reset Developer Settings, or another tab editing storage).
  // Skip the sync while the input is focused so we don't stomp the user
  // mid-edit.
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!focusedRef.current) setDraft(String(value ?? ''));
  }, [value]);

  return (
    <Input
      size="sm" mono
      value={draft}
      onFocus={() => { focusedRef.current = true; }}
      onBlur={() => {
        focusedRef.current = false;
        // Empty / non-numeric → revert to the stored value rather than
        // forcing the default (the user might have been mid-edit and
        // bailed; mutating to default would surprise them).
        if (draft.trim() === '') { setDraft(String(value ?? '')); return; }
        const n = Number(draft);
        if (Number.isNaN(n)) { setDraft(String(value ?? '')); return; }
        const clamped = Math.max(def.min ?? -Infinity, Math.min(def.max ?? Infinity, n));
        setDraft(String(clamped));
        if (clamped !== value) onChange(clamped);
      }}
      onChange={(v) => {
        // Allow a single leading minus when the setting's range goes negative
        // (e.g. snapshot position X/Y/Z, rotation) — the old digits-only filter
        // silently ate the "-" so negatives couldn't be typed.
        const allowNeg = (def.min ?? 0) < 0;
        let cleaned = v.replace(allowNeg ? /[^0-9.\-]/g : /[^0-9.]/g, '');
        if (allowNeg) {
          const neg = cleaned.startsWith('-');
          cleaned = (neg ? '-' : '') + cleaned.replace(/-/g, '');
        }
        setDraft(cleaned);
        // Persist as the user types when the field holds a valid number;
        // empty / partial input ("1.") stays in the draft only so React
        // doesn't fight us by re-rendering the field to the stored value.
        if (cleaned === '') return;
        const n = Number(cleaned);
        if (Number.isNaN(n)) return;
        const clamped = Math.max(def.min ?? -Infinity, Math.min(def.max ?? Infinity, n));
        if (clamped !== value) onChange(clamped);
      }}
      style={{ width: 70 }}
    />
  );
}

/* ── StringCell — controlled text input for `string` dev settings.
       Backed by a local draft so typing doesn't fight React's
       re-renders. Commits on every change (debouncing is unnecessary
       for the kind of settings that use this — local-part of an
       email address, a small label, etc.) and on blur clamps to a
       trimmed value so a stray leading space doesn't persist. */
function StringCell({ def, value, onChange }) {
  const [draft, setDraft] = useState(value ?? '');
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!focusedRef.current) setDraft(value ?? '');
  }, [value]);
  return (
    <Input
      size="sm"
      value={draft}
      placeholder={def.placeholder || ''}
      onFocus={() => { focusedRef.current = true; }}
      onBlur={() => {
        focusedRef.current = false;
        const trimmed = (draft || '').trim();
        if (trimmed !== draft) setDraft(trimmed);
        if (trimmed !== value) onChange(trimmed);
      }}
      onChange={(v) => {
        setDraft(v);
        if (v !== value) onChange(v);
      }}
      style={{ width: 140 }}
    />
  );
}

/* Select cell — the shared custom Dropdown for `type: 'select'` dev settings.
   `def.options` is an array of strings or { value, label } objects; Dropdown
   wants { id, label }, so we map across. */
function SelectCell({ def, value, onChange }) {
  const opts = (def.options || []).map((o) => (typeof o === 'string'
    ? { id: o, label: o }
    : { id: o.value, label: o.label }));
  return (
    <Dropdown
      size="sm"
      value={value ?? def.default ?? ''}
      options={opts}
      onChange={onChange}
      style={{ minWidth: 150 }}
    />
  );
}

/* ── Developer-settings row — bool toggles to a Switch, number to a
       narrow Input with a unit suffix, string to a text Input, select to a
       dropdown, action to a button that fires the row's `runner`. Add new
       control types here as the registry grows. */
function DevSettingRow({ def, value, onChange }) {
  const isBool   = def.type === 'bool';
  const isNum    = def.type === 'number';
  const isString = def.type === 'string';
  const isSelect = def.type === 'select';
  const isAction = def.type === 'action';
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '8px 0',
      borderBottom: '1px solid var(--gb-border-subtle)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-primary)' }}>
          {def.label}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1, lineHeight: 1.4 }}>
          {def.desc}
        </div>
        <div style={{ fontSize: 9.5, color: 'var(--gb-text-ghost)', marginTop: 3, fontFamily: 'var(--gb-font-mono)' }}>
          {def.key}
        </div>
      </div>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
        {isBool && (
          <Switch on={!!value} size="sm" onChange={(on) => onChange(on)} />
        )}
        {isNum && (
          <NumberCell def={def} value={value} onChange={onChange} />
        )}
        {isString && (
          <StringCell def={def} value={value} onChange={onChange} />
        )}
        {isSelect && (
          <SelectCell def={def} value={value} onChange={onChange} />
        )}
        {isAction && (
          <Btn
            size="sm"
            icon={def.buttonIcon && I[def.buttonIcon] ? React.createElement(I[def.buttonIcon]) : undefined}
            onClick={() => def.runner?.()}
          >
            {def.buttonLabel || 'Run'}
          </Btn>
        )}
      </div>
    </div>
  );
}

/* ── Main Settings Panel ─────────────────────────────────────── */
export function SettingsPanel({ remotePolicy }) {
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [flags, setFlags] = useState(FEATURE_DEFAULTS);
  const [credentials, setCredentials] = useState(EMPTY_CREDENTIALS);
  const [shortcuts, setShortcuts] = useState(KEYBOARD_SHORTCUTS_DEFAULTS);
  const [customPages, setCustomPages] = useState(emptyCustomPages);
  const [devSettings, setDevSettings] = useState(defaultDevSettings);
  const [devSearch, setDevSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [paStatus, setPaStatus] = useState(null);
  const [scales, setScales] = useState(DEFAULT_SCALES);
  // Visibility is server-owned after a complete, validated policy sync.
  // Dashboard administrators bypass the policy and retain their local setup.
  const visible = (key) => remotePolicy.adminBypass
    || (!remotePolicy.hiddenFeatures[key] && !remotePolicy.hiddenDeveloperSettings[key]);
  const devSectionHidden = !remotePolicy.adminBypass && remotePolicy.developerSectionHidden;

  /* Sort registry alphabetically once; filter on the user's query
     case-insensitively against label / desc / key so they can find a
     knob by any of the three. Memoization is fine on every render —
     DEV_SETTINGS is tiny. */
  const filteredDevSettings = (() => {
    const q = devSearch.trim().toLowerCase();
    const sorted = [...DEV_SETTINGS].sort((a, b) => a.label.localeCompare(b.label)).filter((d) => visible(d.key));
    if (!q) return sorted;
    return sorted.filter((d) =>
      d.label.toLowerCase().includes(q)
      || d.desc.toLowerCase().includes(q)
      || d.key.toLowerCase().includes(q),
    );
  })();


  useEffect(() => {
    loadTheme().then((t) => { setTheme(t); applyTheme(t); });
    loadFlags().then(setFlags);
    loadCredentials().then(setCredentials);
    loadKeyboardShortcuts().then(setShortcuts);
    loadCustomPages().then(setCustomPages);
    loadDevSettings().then(setDevSettings);
    loadScales().then(setScales);
  }, [refreshKey, remotePolicy.revision, remotePolicy.adminBypass]);

  /* UI-scale commit — local state + persist + apply to this document
     immediately so the rep sees the change without waiting for the
     storage.onChanged round-trip. Other open tabs get the update via
     the chrome.storage.onChanged listener wired in ensureScales(). */
  const setScale = (id, value) => {
    const next = { ...scales, [id]: value };
    setScales(next);
    saveScales(next);
    applyScales(next);
  };
  const resetScales = () => {
    setScales(DEFAULT_SCALES);
    saveScales(DEFAULT_SCALES);
    applyScales(DEFAULT_SCALES);
    window.__gbToast?.success('UI scale reset to 100% across the board');
  };

  function setDevSetting(key, value) {
    const next = { ...devSettings, [key]: value };
    setDevSettings(next);
    saveDevSettings(next);
  }
  function resetDevSettings() {
    const next = defaultDevSettings();
    setDevSettings(next);
    saveDevSettings(next);
    window.__gbToast?.success('Developer settings reset to defaults');
  }

  /* The UI manages one switch per scope. Storage remains an array of page ids
     so the classic page engine keeps its stable, backward-compatible shape. */
  function toggleCustomPageScope(section) {
    const enabled = (customPages[section.id] || []).length > 0;
    const next = {
      ...customPages,
      [section.id]: enabled ? [] : section.items.map((item) => item.id),
    };
    setCustomPages(next);
    saveCustomPages(next);
  }

  const commitTheme = (next) => { setTheme(next); applyTheme(next); saveTheme(next); };
  const pickVariant = (variant) => {
    // Selecting a template (re)applies ITS accent: drop any pinned brand
    // override so the variant's own --gb-brand-* tokens show through. Not
    // early-returning on the active variant lets a re-click "set it again".
    const colors = { ...theme.colors };
    for (const k of BRAND_KEYS) delete colors[k];
    commitTheme({ ...theme, variant, colors });
    window.__gbToast?.success(`Theme set to ${variant}`);
  };
  const setColor = (key, value) => commitTheme({ ...theme, colors: { ...theme.colors, [key]: value } });
  const resetColors = () => {
    // Reset always returns to the canonical golf-green, regardless of which
    // template is active (pin the green brand, clear the other overrides).
    commitTheme({ ...theme, colors: { ...DEFAULT_BRAND } });
    window.__gbToast?.success('Colors reset to green');
  };
  const toggleFlag = (key) => { const next = { ...flags, [key]: !flags[key] }; setFlags(next); saveFlags(next); };
  const setFlagValue = (key, value) => { const next = { ...flags, [key]: value }; setFlags(next); saveFlags(next); };
  const setCredentialValue = (key, value) => {
    const next = { ...credentials, [key]: value };
    setCredentials(next);
    saveCredentials(next);
  };
  const setShortcut = (key, value) => { const next = { ...shortcuts, [key]: value.toLowerCase() }; setShortcuts(next); saveKeyboardShortcuts(next); };

  const regularFeatures = FEATURE_FLAGS.filter(f => !f.experimental && !f.dev && visible(f.key));

  // Non-destructive check of the Power Automate flow URL format.
  // Accepts both Logic Apps (logic.azure.com) and Power Platform direct
  // automation (*.environment.api.powerplatform.com) URL formats.
  const testConnection = () => {
    const ok = isPowerAutomateUrl(credentials.powerAutomateUrl);
    setPaStatus(ok ? 'ok' : 'fail');
    return ok ? Promise.resolve() : Promise.reject(new Error('invalid flow url'));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, fontFamily: 'var(--gb-font-sans)' }}>

      {/* Installation-authenticated shared settings templates */}
      <SettingsLinksManager onPresetLoad={() => setRefreshKey(k => k + 1)} />

      {/* Variant */}
      <section>
        <SectionLabel>Variant</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {THEME_VARIANTS.map((v) => <VariantCard key={v.id} variant={v} active={theme.variant === v.id} onClick={() => pickVariant(v.id)} />)}
        </div>
      </section>

      {/* Features — grouped into sections (the `section` field on each flag),
          rendered in first-seen order so flags.js controls grouping + order. */}
      <section>
        <SectionLabel>Features</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {[...new Set(regularFeatures.map(f => f.section || 'Other'))].map((sec) => (
            <div key={sec}>
              <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-text-muted)', marginBottom: 8 }}>{sec}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {regularFeatures.filter(f => (f.section || 'Other') === sec).map((f) => (
                  <FeatureSpotlight key={f.key} on={!!flags[f.key]} icon={getIcon(f.icon)} name={f.name} desc={f.desc} onChange={() => toggleFlag(f.key)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* UI Scale — independent zoom per extension surface. Lets the
          rep run the host CRM at one browser zoom and the extension
          UI at another, dialed in per surface. */}
      <section>
        <SectionLabel action={<Btn variant="ghost" size="xs" onClick={resetScales}>Reset All</Btn>}>UI Scale</SectionLabel>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 12 }}>
            {SCALE_CATEGORIES.map((c) => (
              <UiScaleRow
                key={c.id}
                label={c.label}
                hint={c.hint}
                value={scales[c.id] ?? 1}
                onChange={(v) => setScale(c.id, v)}
              />
            ))}
          </div>
        </Card>
      </section>

      {/* Keyboard Shortcuts */}
      <section>
        <SectionLabel>Keyboard Shortcuts</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <KeyboardShortcutRow label="My Tasks" desc="Opens the full-screen task list from any page." value={shortcuts.taskList?.toUpperCase() || ''} onChange={(v) => setShortcut('taskList', v)} featureOff={flags.taskListEnabled === false} />
          <KeyboardShortcutRow label="Margin Calculator" desc="Opens the floating margin calculator from any page." value={shortcuts.marginCalc?.toUpperCase() || ''} onChange={(v) => setShortcut('marginCalc', v)} featureOff={flags.marginCalcEnabled === false} />
          <KeyboardShortcutRow label="CRM Search" desc="Opens the full-screen CRM search modal from any page." value={shortcuts.crmSearch?.toUpperCase() || ''} onChange={(v) => setShortcut('crmSearch', v)} featureOff={flags.crmSearchEnabled === false} />
          <KeyboardShortcutRow label="New Contact" desc="Opens the quick-create contact modal from any page." value={shortcuts.crmNewContact?.toUpperCase() || ''} onChange={(v) => setShortcut('crmNewContact', v)} featureOff={flags.crmNewContactEnabled === false} />
        </div>
      </section>

      {/* Bearer-style integration settings are stored outside featureFlags so
          presets and feature broadcasts cannot copy them. */}
      {visible('powerAutomateEnabled') && (
      <section>
        <SectionLabel>Experimental</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ExpandableFeature
            on={!!flags.powerAutomateEnabled}
            onChange={(next) => setFlagValue('powerAutomateEnabled', next)}
            icon={<I.send />}
            tone="warning"
            name="Direct Send via Power Automate"
            desc="When enabled and a flow URL is set, templates that opt in send directly through Power Automate instead of opening Outlook."
          >
            <Field label="Flow URL" required>
              <Input
                value={credentials.powerAutomateUrl}
                onChange={(v) => setCredentialValue('powerAutomateUrl', v)}
                mono
                type="password"
                autoComplete="off"
                spellCheck={false}
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
      )}

      {/* Custom Pages — one switch per registered scope. The page engine still
          consumes page-id arrays internally, preserving its stable contract. */}
      {(!remotePolicy.hiddenCustomPages || remotePolicy.adminBypass) && CUSTOM_PAGE_SECTIONS.some((section) => (
        remotePolicy.adminBypass || !remotePolicy.hiddenCustomPageScopes[section.id]
      )) && (
      <section>
        <SectionLabel>Custom Pages</SectionLabel>
        <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: -4, marginBottom: 10, lineHeight: 1.5 }}>
          Enable the extension's custom interface by page scope. Disabled scopes use the original site.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {CUSTOM_PAGE_SECTIONS
            .filter((section) => remotePolicy.adminBypass || !remotePolicy.hiddenCustomPageScopes[section.id])
            .map((section) => (
            <FeatureSpotlight
              key={section.id}
              icon={<I.cog />}
              name={section.label}
              desc={`Use the custom extension UI for supported ${section.label} pages.`}
              on={(customPages[section.id] || []).length > 0}
              onChange={() => toggleCustomPageScope(section)}
            />
          ))}
        </div>
      </section>
      )}

      {/* Theme Colors */}
      <section>
        <SectionLabel action={<Btn variant="ghost" size="xs" onClick={resetColors}>Reset All</Btn>}>Theme Colors</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {THEME_COLORS.map((c) => (
            <ColorSpotlight key={c.key} value={theme.colors?.[c.key] || currentColor(c.key)} defaultValue={currentColor(c.key)} name={c.name} desc={c.hint} varName={c.key} onChange={(hex) => setColor(c.key, hex)} />
          ))}
        </div>
      </section>

      {/* Developer Settings — registry-driven key/value table for
          low-priority knobs that don't deserve a feature flag.
          Always at the bottom. Adding a new row is one entry in
          src/lib/devSettings.js → DEV_SETTINGS. The body caps at 340px
          and scrolls internally (native scrollbar hidden via the
          CollapsibleSection's `hideScrollbar` flag) so the page doesn't
          grow as the registry fills up. */}
      {!devSectionHidden && (
      <section>
        <CollapsibleSection
          icon={<I.bolt />}
          title="Developer Settings"
          subtitle="Low-level tweaks — animation timing, debounce intervals, etc."
          maxHeight={340}
          hideScrollbar
          action={
            <Btn variant="ghost" size="xs" onClick={resetDevSettings}>Reset</Btn>
          }
        >
          {/* Search — animates filtered rows in/out via AnimatePresence
              and motion's `layout` so the table reflows smoothly as the
              query narrows. Rows are sorted alphabetically by label. */}
          <div style={{ marginBottom: 8 }}>
            <Input
              size="sm"
              value={devSearch}
              onChange={setDevSearch}
              placeholder="Search settings…"
              leading={<I.search />}
              trailing={devSearch ? (
                <span
                  onClick={() => setDevSearch('')}
                  style={{ cursor: 'pointer', display: 'flex', color: 'var(--gb-text-muted)' }}
                >
                  <I.close size={11} />
                </span>
              ) : undefined}
            />
          </div>
          <AnimatePresence initial={false} mode="popLayout">
            {filteredDevSettings.map((def) => (
              <motion.div
                key={def.key}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
              >
                <DevSettingRow
                  def={def}
                  value={devSettings[def.key]}
                  onChange={(v) => setDevSetting(def.key, v)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
          {filteredDevSettings.length === 0 && (
            <div style={{
              padding: '14px 12px', textAlign: 'center', fontSize: 11,
              color: 'var(--gb-text-muted)',
              border: '1px dashed var(--gb-border-default)',
              borderRadius: 'var(--gb-r-sm)',
              background: 'var(--gb-fill-subtle)',
            }}>
              No settings match "{devSearch}".
            </div>
          )}
        </CollapsibleSection>
      </section>
      )}
    </div>
  );
}
