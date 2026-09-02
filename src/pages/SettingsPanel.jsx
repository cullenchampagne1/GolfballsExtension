import React, { useCallback, useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  SectionLabel, Card, Callout, Btn, IconBtn, Input, Dropdown, Field,
  FeatureSpotlight, ExpandableFeature, ColorSpotlight, Switch, Dot, I,
  Slider, ManagedBadge,
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
  PRESET_SCOPES, gatherScopes, applyScopes, normalizePreset, presetScopeIds,
  buildSettingsTemplateFile, parseSettingsTemplateFile,
} from '../lib/presetScopes.js';
import { Checkbox } from '../ui/components/Checkbox.jsx';
import { CollapsibleSection } from '../ui/components/CollapsibleSection.jsx';
import { FeatureRow } from '../ui/components/FeatureRow.jsx';
import { FeatureShelfGrid } from '../ui/components/FeatureShelfGrid.jsx';
import { FEATURE_REGISTRY, featureByKey } from '../lib/features/featureRegistry.js';
import { loadFeatureConfig, saveFeatureConfig, normalizeFeatureConfig, togglePage } from '../lib/features/featureConfig.js';
import { loadCustomActions, saveCustomActions, normalizeCustomAction } from '../lib/customActions.js';
import { DEV_SETTINGS, defaultDevSettings, loadDevSettings, saveDevSettings } from '../lib/devSettings.js';
import { EMPTY_CREDENTIALS, loadCredentials, saveCredentials } from '../lib/credentials.js';
import { isPowerAutomateUrl } from '../lib/security.js';
import { sendBackgroundMessage } from '../lib/backgroundMessage.js';
import {
  buildSupportTicketRequest,
  SUPPORT_TICKET_TITLE_MAX,
  SUPPORT_TICKET_DESCRIPTION_MAX,
} from '../lib/supportTicketRequest.js';
import { listProductStores, revokeProductStore } from '../lib/customItems.js';
import { trackerSummaries, setTrackerEnabled } from '../lib/trackers.js';
import { trackerTableRows } from '../lib/trackerSettings.js';
import { removeRetainedEmailTemplate } from '../lib/templateImport.js';
import {
  retainManagedRowsOnFailure,
  settingsJsonFallbackMessage,
  shouldShowManagedSection,
} from '../lib/manageSections.js';
import {
  IDENTITY_NOTICE_KEY,
  identityNoticeSignature,
  installationIdentityNoticeView,
} from '../lib/installationIdentityNotice.js';
import {
  EMPTY_REMOTE_POLICY,
  developerSettingIsManaged,
  featureIsManaged,
} from '../lib/managedSettingsPolicy.js';

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
    } catch {
      setShares(retainManagedRowsOnFailure);
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
      // Always retry the link service. A previous list/create failure never
      // turns this panel into a permanent JSON-only mode.
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
    } catch {
      try {
        const fallbackName = presetName.trim();
        const scopes = await gatherScopes([...chosenScopes]);
        downloadSettingsFallback(fallbackName, scopes);
        setPresetName('');
        setShowSaveDialog(false);
        window.__gbToast?.success(settingsJsonFallbackMessage(fallbackName));
      } catch {
        window.__gbToast?.error('Unable to download the JSON settings template');
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
          const sourceScopeIds = Object.keys(importCandidate.scopes || {});
          const retainedScopeIds = sourceScopeIds.filter((id) => (
            id === 'settings'
              ? applied.some((appliedId) => appliedId.startsWith('settings-'))
              : applied.includes(id)
          ));
          const retained = await sendBackgroundMessage('settingsShareRecordImport', {
            shareId: preset.id,
            scopeIds: retainedScopeIds,
          });
          const retainedShare = normalizePreset(retained.share);
          setShares((current) => [retainedShare, ...current.filter((item) => item.id !== retainedShare.id)]);
          setSelectedId(retainedShare.id);
          setSelectedShare(retainedShare);
        } catch {
          // Applying the local data succeeded. Server-side history is optional
          // and must never turn that success into an import failure.
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
    } catch {
      window.__gbToast?.error('Unable to revoke settings link');
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
    } catch {
      window.__gbToast?.error('Unable to open settings link');
    } finally { setBusy(false); }
  }

  async function openImportUrl() {
    if (!importUrl.trim()) return;
    setBusy(true);
    try {
      const response = await sendBackgroundMessage('settingsShareGet', { url: importUrl.trim() });
      const share = normalizePreset(response.share);
      setImportCandidate(share);
      window.__gbToast?.success(`Loaded "${share.name}" — choose what to import`);
    } catch {
      window.__gbToast?.error('Unable to open settings link');
    } finally { setBusy(false); }
  }

  async function copySelectedUrl() {
    if (!selectedShare?.url) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable');
      await navigator.clipboard.writeText(selectedShare.url);
      window.__gbToast?.success('Settings URL copied');
    } catch {
      window.__gbToast?.error('Unable to copy settings URL');
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
  const scopeCategories = [...new Set(PRESET_SCOPES.map((scope) => scope.category))];

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
                  placeholder="https://api.cullenchampagne.com/projects/golfballs-extension/client/settings-shares/…"
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {scopeCategories.map((category) => {
                      const defs = PRESET_SCOPES.filter((scope) => scope.category === category && candidateScopeIds.includes(scope.id));
                      if (!defs.length) return null;
                      return (
                        <div key={category}>
                          <div style={{ fontSize: 8.5, fontWeight: 750, color: 'var(--gb-text-muted)', textTransform: 'uppercase', letterSpacing: '.55px', marginBottom: 4 }}>{category}</div>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            {defs.map((def) => {
                              const on = loadScopes.has(def.id);
                              return (
                                <button
                                  key={def.id}
                                  type="button"
                                  title={def.desc}
                                  onClick={() => setLoadScopes((current) => {
                                    const next = new Set(current);
                                    if (next.has(def.id)) next.delete(def.id); else next.add(def.id);
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
                        </div>
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
                {scopeCategories.map((category) => (
                  <div key={category}>
                    <div style={{ fontSize: 8.5, fontWeight: 750, color: 'var(--gb-text-muted)', textTransform: 'uppercase', letterSpacing: '.55px', marginBottom: 5 }}>{category}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 14, rowGap: 7 }}>
                      {PRESET_SCOPES.filter((scope) => scope.category === category).map((scope) => (
                        <Checkbox
                          key={scope.id}
                          size="sm"
                          checked={chosenScopes.has(scope.id)}
                          label={scope.label}
                          onChange={() => toggleScope(scope.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* The server list contains links created by this installation and links
          it has successfully imported. */}
      <AnimatePresence initial={false}>
        {hasShares && (
          <motion.div
            key="active-settings-links"
            initial={{ opacity: 0, height: 0, y: -5 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -5 }}
            transition={T.base}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Dropdown size="md" value={selectedId} placeholder="Saved settings links…" options={dropdownOptions} onChange={selectOwnedShare} disabled={busy} style={{ flex: 1, minWidth: 0 }} />
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
function NumberCell({ def, value, onChange, disabled = false }) {
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
      size="sm" mono disabled={disabled}
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
function StringCell({ def, value, onChange, disabled = false }) {
  const [draft, setDraft] = useState(value ?? '');
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!focusedRef.current) setDraft(value ?? '');
  }, [value]);
  return (
    <Input
      size="sm" disabled={disabled}
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
function SelectCell({ def, value, onChange, disabled = false }) {
  const opts = (def.options || []).map((o) => (typeof o === 'string'
    ? { id: o, label: o }
    : { id: o.value, label: o.label }));
  return (
    <Dropdown
      size="sm"
      value={value ?? def.default ?? ''}
      options={opts}
      onChange={onChange}
      disabled={disabled}
      style={{ minWidth: 150 }}
    />
  );
}

/* Stat cell — a read-only readout for `type: 'stat'` rows. The row's
   `reader(settings)` answers with { value, detail, tone }; we re-read on mount,
   and whenever a watched setting changes (flipping one usually changes the
   answer). Readers never reject — a failed read comes back as its own view, so
   the row explains itself instead of going blank. */
function StatCell({ def, settings }) {
  const [view, setView] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const watched = (def.watch || []).map((key) => String(settings?.[key] ?? '')).join('|');

  const read = useCallback(() => {
    if (typeof def.reader !== 'function') return;
    Promise.resolve(def.reader(settings)).then(setView);
    // `settings` is a fresh object on every edit; the watched values are what
    // this row actually depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, watched]);
  useEffect(() => { read(); }, [read]);

  const tone = {
    brand:   'var(--gb-brand-label)',
    warning: 'var(--gb-warning-fg)',
  }[view?.tone] || 'var(--gb-text-primary)';

  /* A stat row that can hand over what it counted gets an export icon beside
     the number. The row says WHAT it exports (`exporter`); this only downloads
     what comes back and reports on it — an empty cache is said out loud rather
     than saved as an empty file the rep would open to find nothing. */
  const runExport = useCallback(async () => {
    if (typeof def.exporter !== 'function' || exporting) return;
    setExporting(true);
    try {
      const result = await def.exporter(settings);
      if (result?.empty) {
        window.__gbToast?.info?.('Nothing cached to export yet');
        return;
      }
      downloadJson(result.document, result.filename);
      window.__gbToast?.success?.(`Exported ${result.summary}`);
    } catch (error) {
      window.__gbToast?.error?.(error?.message || 'Unable to export this cache');
    } finally {
      setExporting(false);
    }
  }, [def, settings, exporting]);

  const runClear = useCallback(async () => {
    if (typeof def.clearer !== 'function' || clearing) return;
    setClearing(true);
    try {
      const result = await def.clearer(settings);
      const next = typeof def.reader === 'function' ? await def.reader(settings) : null;
      if (next) setView(next);
      const removed = Number(result?.cleared);
      const message = Number.isFinite(removed)
        ? (removed > 0
          ? `Deleted ${removed.toLocaleString('en-US')} cached record${removed === 1 ? '' : 's'}`
          : 'Cache was already empty')
        : 'Cached contacts deleted';
      window.__gbToast?.success?.(message);
    } catch (error) {
      window.__gbToast?.error?.(error?.message || 'Unable to delete this cache');
    } finally {
      setClearing(false);
    }
  }, [def, settings, clearing]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <div style={{ textAlign: 'right', minWidth: 0, maxWidth: 240 }}>
        <div style={{
          fontFamily: 'var(--gb-font-mono)', fontSize: 13.5, fontWeight: 650,
          color: view ? tone : 'var(--gb-text-muted)',
          lineHeight: 1.2,
        }}>
          {view ? view.value : '…'}
        </div>
        {def.showDetail !== false && view?.detail && (
          <div style={{ fontSize: 9.5, color: 'var(--gb-text-muted)', marginTop: 2, lineHeight: 1.35 }}>
            {view.detail}
          </div>
        )}
      </div>
      {typeof def.exporter === 'function' && (
        <IconBtn
          size="sm"
          icon={<I.download />}
          disabled={exporting}
          onClick={runExport}
          title={def.exportTitle || 'Export as JSON'}
        />
      )}
      {typeof def.clearer === 'function' && (
        <IconBtn
          size="sm"
          icon={<I.trash />}
          disabled={clearing || exporting}
          onClick={runClear}
          title={def.clearTitle || 'Delete cached data'}
        />
      )}
    </div>
  );
}

/* ── Developer-settings row — bool toggles to a Switch, number to a
       narrow Input with a unit suffix, string to a text Input, select to a
       dropdown, action to a button that fires the row's `runner`, stat to a
       live readout. Add new control types here as the registry grows. */
function DevSettingRow({ def, value, onChange, settings, managed = false }) {
  const isBool   = def.type === 'bool';
  const isNum    = def.type === 'number';
  const isString = def.type === 'string';
  const isSelect = def.type === 'select';
  const isAction = def.type === 'action';
  const isStat   = def.type === 'stat';
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '8px 0',
      borderBottom: '1px solid var(--gb-border-subtle)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-primary)' }}>
          <span>{def.label}</span>
          {managed && <ManagedBadge />}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1, lineHeight: 1.4 }}>
          {def.desc}
        </div>
        <div style={{ fontSize: 9.5, color: 'var(--gb-text-ghost)', marginTop: 3, fontFamily: 'var(--gb-font-mono)' }}>
          {def.key}
        </div>
      </div>
      <div style={{ alignSelf: 'stretch', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
        {isBool && (
          <Switch on={!!value} size="sm" disabled={managed} onChange={(on) => onChange(on)} />
        )}
        {isNum && (
          <NumberCell def={def} value={value} onChange={onChange} disabled={managed} />
        )}
        {isString && (
          <StringCell def={def} value={value} onChange={onChange} disabled={managed} />
        )}
        {isSelect && (
          <SelectCell def={def} value={value} onChange={onChange} disabled={managed} />
        )}
        {isAction && (
          <Btn
            size="sm"
            disabled={managed}
            icon={def.buttonIcon && I[def.buttonIcon] ? React.createElement(I[def.buttonIcon]) : undefined}
            onClick={() => def.runner?.()}
          >
            {def.buttonLabel || 'Run'}
          </Btn>
        )}
        {isStat && (
          <StatCell def={def} settings={settings} />
        )}
      </div>
    </div>
  );
}

/* ── Shared email templates: owners can revoke; recipients can remove their
      read-only import without affecting the creator's share. */
function EmailLinksSection() {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await sendBackgroundMessage('emailShareList'); setLinks(Array.isArray(r?.shares) ? r.shares : []); }
    catch { setLinks(retainManagedRowsOnFailure); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onShareChange = (changes, area) => {
      if (area === 'local' && changes.gbEmailShareRevision) load();
    };
    try { chrome.storage.onChanged.addListener(onShareChange); } catch { /* */ }
    return () => {
      try { chrome.storage.onChanged.removeListener(onShareChange); } catch { /* */ }
    };
  }, [load]);

  const remove = async (link) => {
    setBusyId(link.id);
    try {
      if (link.relationship === 'imported') {
        await removeRetainedEmailTemplate(
          link.id,
          {
            release: (shareId) => sendBackgroundMessage(
              'emailTemplateShareImportRemove', { shareId },
            ),
            retain: (shareId) => sendBackgroundMessage(
              'emailTemplateShareImport', { shareId },
            ),
          },
        );
        window.__gbToast?.success?.('Imported email template removed');
      } else {
        await sendBackgroundMessage('emailShareRevoke', { shareId: link.id });
        window.__gbToast?.success?.('Email template share revoked');
      }
      setLinks((prev) => prev.filter((item) => item.id !== link.id));
    } catch (error) {
      window.__gbToast?.error?.(error?.message || 'Unable to remove email template');
    } finally { setBusyId(null); }
  };

  return (
    <AnimatePresence initial={false}>
      {!loading && links.length > 0 && (
        <motion.section
          key="active-email-links"
          initial={{ opacity: 0, height: 0, y: -6 }}
          animate={{ opacity: 1, height: 'auto', y: 0 }}
          exit={{ opacity: 0, height: 0, y: -6 }}
          transition={T.base}
          style={{ overflow: 'hidden' }}
        >
          <SectionLabel action={<Btn variant="ghost" size="xs" onClick={load} disabled={loading}>Refresh</Btn>}>Shared Email Templates</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {links.map((link) => (
              <Card key={link.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--gb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.name || 'Shared email template'}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>
                    {link.relationship === 'imported'
                      ? `Imported from ${link.owner_name || 'another user'} · read-only`
                      : `Owned by you · active until revoked · opened ${link.access_count || 0}×`}
                  </div>
                  <div style={{ fontSize: 9.5, color: 'var(--gb-text-ghost)', marginTop: 2 }}>
                    Version {Math.max(1, Number(link.version) || 1)}
                    {' · '}{Number(link.change_count) || 0} update{Number(link.change_count) === 1 ? '' : 's'}
                    {link.updated_at ? ` · last changed ${new Date(link.updated_at).toLocaleString()}` : ''}
                  </div>
                </div>
                <IconBtn
                  size="md" icon={<I.trash />} danger
                  onClick={() => remove(link)} disabled={busyId === link.id}
                  title={link.relationship === 'imported' ? 'Remove imported template' : 'Revoke this email template share'}
                />
              </Card>
            ))}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

/* ── Product stores: list this installation's shared custom-item stores and
      revoke them. Stores persist until revoked; mirrors the email-links list. */
function ProductStoresSection() {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const list = await listProductStores(); setStores(list); }
    catch { setStores(retainManagedRowsOnFailure); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const copyLink = (url) => {
    try { navigator.clipboard.writeText(url); window.__gbToast?.success?.('Store link copied'); }
    catch { window.__gbToast?.error?.('Could not copy link'); }
  };

  const revoke = async (id) => {
    setBusyId(id);
    try {
      await revokeProductStore(id);
      setStores((prev) => prev.filter((s) => s.id !== id));
      window.__gbToast?.success?.('Store revoked');
    } catch {
      window.__gbToast?.error?.('Unable to revoke store');
    } finally { setBusyId(null); }
  };

  return (
    <AnimatePresence initial={false}>
      {shouldShowManagedSection(stores, loading) && (
        <motion.section
          key="active-product-stores"
          initial={{ opacity: 0, height: 0, y: -6 }}
          animate={{ opacity: 1, height: 'auto', y: 0 }}
          exit={{ opacity: 0, height: 0, y: -6 }}
          transition={T.base}
          style={{ overflow: 'hidden' }}
        >
          <SectionLabel action={<Btn variant="ghost" size="xs" onClick={load} disabled={loading}>Refresh</Btn>}>Product Stores</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {stores.map((store) => (
              <Card key={store.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--gb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{store.name || 'Product store'}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>
                    {store.item_count || 0} item{(store.item_count || 0) === 1 ? '' : 's'} · opened {store.access_count || 0}×
                  </div>
                </div>
                <IconBtn size="md" icon={<I.copy />} onClick={() => copyLink(store.url)} title="Copy store link" />
                <IconBtn size="md" icon={<I.trash />} danger onClick={() => revoke(store.id)} disabled={busyId === store.id} title="Revoke this store" />
              </Card>
            ))}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

/* ── Support tickets: only materializes when this installation owns at least
      one ticket. The notification cursor publishes typed invalidations;
      Settings fetches the authoritative ticket list only on open or change. */
function SupportTicketsSection() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const response = await sendBackgroundMessage('supportTicketList');
      setTickets(Array.isArray(response?.tickets) ? response.tickets : []);
    } catch {
      if (!quiet) setTickets(retainManagedRowsOnFailure);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const onTicketChange = (changes, area) => {
      if (area === 'local' && changes.gbSupportTicketRevision) {
        load({ quiet: true });
      }
    };
    try { chrome.storage.onChanged.addListener(onTicketChange); } catch { /* */ }
    return () => {
      try { chrome.storage.onChanged.removeListener(onTicketChange); } catch { /* */ }
    };
  }, [load]);

  const tone = (status) => ({
    open: ['var(--gb-warning-fg)', 'var(--gb-warning-tint-soft)', 'var(--gb-warning-tint-border)'],
    triaged: ['var(--gb-brand-label)', 'var(--gb-brand-tint-soft)', 'var(--gb-brand-tint-border)'],
    in_progress: ['var(--gb-brand-label)', 'var(--gb-brand-tint-soft)', 'var(--gb-brand-tint-border)'],
    planned: ['var(--gb-brand-label)', 'var(--gb-brand-tint-medium)', 'var(--gb-brand-tint-border)'],
    resolved: ['var(--gb-success-fg)', 'var(--gb-success-tint-soft)', 'var(--gb-success-tint-border)'],
    closed: ['var(--gb-text-muted)', 'var(--gb-fill-subtle)', 'var(--gb-border-default)'],
  }[status] || ['var(--gb-text-muted)', 'var(--gb-fill-subtle)', 'var(--gb-border-default)']);

  return (
    <AnimatePresence initial={false}>
      {!loading && tickets.length > 0 && (
        <motion.section
          key="support-tickets"
          initial={{ opacity: 0, height: 0, y: -7 }}
          animate={{ opacity: 1, height: 'auto', y: 0 }}
          exit={{ opacity: 0, height: 0, y: -7 }}
          transition={T.base}
          style={{ overflow: 'hidden' }}
        >
          <SectionLabel action={<Btn variant="ghost" size="xs" onClick={() => load()} disabled={loading}>Refresh</Btn>}>Support Tickets</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tickets.map((ticket) => {
              const status = String(ticket.status || 'open');
              const [fg, bg, border] = tone(status);
              const replies = Array.isArray(ticket.replies) ? ticket.replies : [];
              const latest = replies.at(-1);
              return (
                <motion.div key={ticket.id} layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={T.base}>
                  <Card style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '11px 12px', display: 'grid', gridTemplateColumns: '30px minmax(0,1fr) auto', gap: 9, alignItems: 'start' }}>
                      <span style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', color: ticket.kind === 'feature' ? 'var(--gb-brand-label)' : 'var(--gb-error-fg)', background: ticket.kind === 'feature' ? 'var(--gb-brand-tint-soft)' : 'var(--gb-error-tint-soft)', border: `1px solid ${ticket.kind === 'feature' ? 'var(--gb-brand-tint-border)' : 'var(--gb-error-tint-border)'}` }}>
                        {ticket.kind === 'feature' ? <I.sparkle size={13} /> : <I.alert size={13} />}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <strong style={{ color: 'var(--gb-text-primary)', fontSize: 12, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.title}</strong>
                          <code style={{ flex: 'none', color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)', fontSize: 8.5 }}>{ticket.id}</code>
                        </div>
                        <div style={{ marginTop: 4, color: 'var(--gb-text-muted)', fontSize: 10.5, lineHeight: 1.45 }}>{ticket.description}</div>
                      </div>
                      <span style={{ padding: '3px 7px', borderRadius: 'var(--gb-r-pill)', color: fg, background: bg, border: `1px solid ${border}`, fontSize: 8.5, lineHeight: 1.2, fontWeight: 750, textTransform: 'uppercase', letterSpacing: '.35px', whiteSpace: 'nowrap' }}>{status.replace('_', ' ')}</span>
                    </div>
                    {latest && (
                      <div style={{ padding: '9px 12px', display: 'flex', gap: 8, borderTop: '1px solid var(--gb-border-subtle)', background: 'var(--gb-fill-subtle)' }}>
                        <I.mail size={12} style={{ marginTop: 1, flex: 'none', color: 'var(--gb-brand-label)' }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: 'var(--gb-text-secondary)', fontSize: 10.5, lineHeight: 1.45 }}>{latest.message}</div>
                          <div style={{ marginTop: 3, color: 'var(--gb-text-muted)', fontSize: 8.75 }}>{latest.author || 'RevStack'} · {latest.created_at ? new Date(latest.created_at).toLocaleString() : 'recently'}</div>
                        </div>
                      </div>
                    )}
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

/* ── Submit a ticket: the manage-window path to file a bug report or feature
      request WITHOUT going through Help Companion. Reuses the exact
      `supportTicketCreate` background action the chatbot uses (idempotent by
      request_id), so the server contract stays in one place. On success the
      list above refreshes itself off the gbSupportTicketRevision storage cursor
      that the worker bumps — no manual reload wiring here. */
const TICKET_KINDS = [
  { id: 'bug', label: 'Bug report', icon: 'alert', hint: 'Something is broken or behaving wrong' },
  { id: 'feature', label: 'Feature request', icon: 'sparkle', hint: 'An idea or improvement you’d like' },
];

function SubmitTicketSection() {
  const [kind, setKind] = useState('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');

  const active = TICKET_KINDS.find((entry) => entry.id === kind) || TICKET_KINDS[0];
  const canSubmit = title.trim().length > 0 && description.trim().length > 0;

  const submit = async () => {
    setError('');
    setDone(null);
    let extensionVersion = '';
    try { extensionVersion = chrome.runtime.getManifest()?.version || ''; } catch { /* */ }
    const { payload, valid } = buildSupportTicketRequest({
      kind, title, description, extensionVersion, surface: 'settings-manage',
    });
    if (!valid) return;
    try {
      const response = await sendBackgroundMessage('supportTicketCreate', payload);
      const ticket = response?.ticket || {};
      setDone({ id: String(ticket.id || '').slice(0, 20), kind });
      setTitle('');
      setDescription('');
    } catch (err) {
      setError(err?.message || 'Unable to submit your ticket. Please try again.');
      throw err; // let the Btn surface its error state
    }
  };

  return (
    <section>
      <SectionLabel>Submit a Ticket</SectionLabel>
      <Card style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', lineHeight: 1.45 }}>
          Report a bug or request a feature. Your ticket appears above and RevStack replies in place.
        </div>

        {/* Kind toggle — the same iconography the ticket list uses. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
          {TICKET_KINDS.map((entry) => {
            const on = entry.id === kind;
            const Icon = I[entry.icon];
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => { setKind(entry.id); setDone(null); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '9px 11px',
                  borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                  border: `1px solid ${on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'}`,
                  background: on ? 'var(--gb-brand-tint-soft)' : 'transparent',
                  color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)',
                  transition: 'background .15s ease, border-color .15s ease, color .15s ease',
                }}
              >
                {Icon && <Icon size={13} style={{ flex: 'none' }} />}
                <span style={{ fontSize: 11.5, fontWeight: 650 }}>{entry.label}</span>
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 9.5, color: 'var(--gb-text-ghost)', marginTop: -4 }}>{active.hint}</div>

        <Input
          value={title}
          onChange={setTitle}
          placeholder={active.id === 'bug' ? 'Short summary of the problem' : 'Short summary of the request'}
          maxLength={SUPPORT_TICKET_TITLE_MAX}
        />

        <div style={{ position: 'relative' }}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={active.id === 'bug'
              ? 'What happened, what did you expect, and how can we reproduce it?'
              : 'What would you like, and how would it help?'}
            rows={4}
            maxLength={SUPPORT_TICKET_DESCRIPTION_MAX}
            style={{
              width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 82,
              background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)',
              borderRadius: 10, padding: '9px 11px', color: 'var(--gb-text-primary)',
              font: 'inherit', fontFamily: 'var(--gb-font-sans)', fontSize: 12, lineHeight: 1.5, outline: 'none',
            }}
          />
          <span style={{ position: 'absolute', right: 9, bottom: 7, fontSize: 8.75, color: 'var(--gb-text-ghost)', fontFamily: 'var(--gb-font-mono)', pointerEvents: 'none' }}>
            {description.length}/{SUPPORT_TICKET_DESCRIPTION_MAX}
          </span>
        </div>

        <AnimatePresence initial={false} mode="wait">
          {done && (
            <motion.div key="done" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={T.base}>
              <Callout tone="success" title={`${done.kind === 'bug' ? 'Bug report' : 'Feature request'} submitted`}>
                {done.id ? <>Ticket <code style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 10 }}>{done.id}</code> is now in your list above.</> : 'It’s now in your list above.'}
              </Callout>
            </motion.div>
          )}
          {error && (
            <motion.div key="error" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={T.base}>
              <Callout tone="error" title="Couldn’t submit">{error}</Callout>
            </motion.div>
          )}
        </AnimatePresence>

        <Btn variant="primary" size="md" full disabled={!canSubmit} onClick={submit}>
          {active.id === 'bug' ? 'Submit bug report' : 'Submit feature request'}
        </Btn>
      </Card>
    </section>
  );
}

/* ── Trackers ────────────────────────────────────────────────────
   One row per tracker: what it collects, how much it has, when it last
   learned something, and its own switch. Everything here is read from the
   worker's summaries — the settings page never reaches into tracker storage,
   because the worker is the single writer (lib/tracker-store.js). What each
   row SAYS lives in src/lib/trackerSettings.js, where it is testable.

   Nothing in this section names a tracker: a fourth tracker is a fourth object
   in lib/tracker-definitions.js and it appears here with no change. */

function TrackersSection({ featureOn, managed }) {
  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try { setSummaries(await trackerSummaries()); }
    catch { if (!quiet) setSummaries([]); }
    finally { if (!quiet) setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load, featureOn]);

  const toggle = async (row, next) => {
    setBusyId(row.trackerId);
    // Optimistic: the switch is the whole point of the row, so it moves now and
    // is put back if the worker refuses.
    const set = (value) => setSummaries((prev) => prev.map(
      (entry) => (entry.trackerId === row.trackerId ? { ...entry, enabled: value } : entry),
    ));
    set(next);
    try {
      await setTrackerEnabled(row.trackerId, next);
      load({ quiet: true });
    } catch {
      set(!next);
      window.__gbToast?.error?.(`Could not turn ${row.label} ${next ? 'on' : 'off'}`);
    } finally { setBusyId(null); }
  };

  const rows = trackerTableRows(summaries);
  if (loading || !rows.length) return null;

  const GRID = 'minmax(0,1fr) 74px 88px 40px';
  const head = {
    fontSize: 8.5, fontWeight: 750, textTransform: 'uppercase', letterSpacing: '.5px',
    color: 'var(--gb-text-muted)',
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={T.base}
    >
      <SectionLabel action={<Btn variant="ghost" size="xs" onClick={() => load()}>Refresh</Btn>}>Trackers</SectionLabel>
      <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', margin: '-2px 0 10px' }}>
        {featureOn
          ? 'Each tracker keeps its own table. Turning one off stops it collecting — the rows it already gathered are kept.'
          : 'Trackers is off, so none of these are collecting. Turn on Trackers above to start.'}
      </div>
      <Card style={{ padding: 0, overflow: 'hidden', opacity: featureOn ? 1 : 0.55 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: GRID, gap: 10, alignItems: 'center',
          padding: '7px 12px', borderBottom: '1px solid var(--gb-border-subtle)',
          background: 'var(--gb-fill-subtle)',
        }}>
          <div style={head}>Tracker</div>
          <div style={{ ...head, textAlign: 'right' }}>Records</div>
          <div style={{ ...head, textAlign: 'right' }}>Last</div>
          <div style={{ ...head, textAlign: 'center' }}>On</div>
        </div>
        {rows.map((row, index) => (
          <div
            key={row.trackerId}
            style={{
              display: 'grid', gridTemplateColumns: GRID, gap: 10, alignItems: 'center',
              padding: '10px 12px',
              borderTop: index === 0 ? 'none' : '1px solid var(--gb-border-subtle)',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{ flex: 'none', color: row.enabled && featureOn ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)', display: 'grid', placeItems: 'center' }}>
                  {row.kind === 'poll' ? <I.search size={12} /> : <I.eye size={12} />}
                </span>
                <span style={{
                  fontSize: 12.5, fontWeight: 600, color: 'var(--gb-text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{row.label}</span>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 2 }}>
                {row.arrival}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 12.5, color: 'var(--gb-text-primary)' }}>
                {row.total}
              </div>
              {row.showOpen && (
                <div style={{ fontSize: 9.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>{row.open} open</div>
              )}
            </div>
            <div style={{ textAlign: 'right', fontSize: 10.5, color: 'var(--gb-text-muted)' }}>
              {row.lastLabel}
            </div>
            <div style={{ display: 'grid', placeItems: 'center' }}>
              <Switch
                size="sm"
                on={!!row.enabled && featureOn}
                disabled={!featureOn || managed || busyId === row.trackerId}
                onChange={(next) => toggle(row, next)}
              />
            </div>
          </div>
        ))}
      </Card>
    </motion.section>
  );
}

/* ── Installation identity ──────────────────────────────────── */
function InstallationIdentityNotice() {
  const [identity, setIdentity] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [noticeSeen, setNoticeSeen] = useState('');
  const [noticeReady, setNoticeReady] = useState(false);

  const applyIdentity = useCallback((value) => {
    if (!value || typeof value !== 'object') return;
    const next = {
      registered: value.registered === true && !!String(value.displayName || '').trim(),
      installationId: String(value.installationId || '').trim(),
      displayName: String(value.displayName || '').trim(),
      localPart: String(value.localPart || '').trim(),
      updatedAt: String(value.updatedAt || '').trim(),
    };
    setIdentity(next);
    if (next.registered) setName(next.displayName);
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await sendBackgroundMessage('getInstallationIdentity');
      applyIdentity(response.identity);
    } catch { /* cached settings remain usable while identity sync is offline */ }
  }, [applyIdentity]);

  useEffect(() => {
    load();
    try {
      chrome.storage.local.get(IDENTITY_NOTICE_KEY, (stored) => {
        setNoticeSeen(String(stored?.[IDENTITY_NOTICE_KEY] || ''));
        setNoticeReady(true);
      });
    } catch {
      setNoticeReady(true);
    }
    const onStorage = (changes, area) => {
      if (area === 'local' && changes.gbInstallationIdentity?.newValue) {
        applyIdentity(changes.gbInstallationIdentity.newValue);
      }
    };
    try { chrome.storage.onChanged.addListener(onStorage); } catch { /* */ }
    return () => {
      try { chrome.storage.onChanged.removeListener(onStorage); } catch { /* */ }
    };
  }, [load, applyIdentity]);

  useEffect(() => {
    if (!noticeReady || !identity?.registered) return undefined;
    const signature = identityNoticeSignature(identity);
    if (!signature || signature === noticeSeen) return undefined;
    const timer = setTimeout(() => {
      try {
        chrome.storage.local.set({ [IDENTITY_NOTICE_KEY]: signature }, () => {
          setNoticeSeen(signature);
        });
      } catch {
        setNoticeSeen(signature);
      }
    }, 3200);
    return () => clearTimeout(timer);
  }, [identity, noticeReady, noticeSeen]);

  const save = async () => {
    const displayName = name.trim().replace(/\s+/g, ' ');
    if (!displayName) {
      setError('Enter your name so shared items can be attributed to you.');
      return false;
    }
    setError('');
    try {
      const response = await sendBackgroundMessage(
        'setInstallationIdentity', { displayName },
      );
      applyIdentity(response.identity);
      window.__gbToast?.success?.(`Extension registered to ${response.identity.displayName}`);
      return true;
    } catch {
      // Registration is server-owned. Keep the prompt available for a later
      // retry, but do not turn a temporary outage into persistent page chrome.
      setError('');
      return false;
    }
  };

  const noticeView = installationIdentityNoticeView(
    identity, noticeSeen, noticeReady,
  );
  const showRegistered = noticeView === 'confirmation';
  const showPrompt = noticeView === 'prompt';
  return (
    <AnimatePresence initial={false}>
      {(showPrompt || showRegistered) && (
        <motion.section
          layout
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -7, height: 0, marginBottom: -24 }}
          transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
          style={{ overflow: 'hidden' }}
        >
          {showPrompt ? (
            <Callout tone="warning" icon={<I.user />} title="Tell RevStack who uses this extension">
              <div style={{ marginBottom: 9 }}>
                Your existing API key stays in place. This name labels API access,
                settings shares, and email-template shares created from this browser.
              </div>
              <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                <Input
                  size="sm"
                  value={name}
                  onChange={setName}
                  error={!!error}
                  placeholder="Your name"
                  leading={<I.user />}
                  autoComplete="name"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void save();
                  }}
                />
                <Btn variant="tinted" status="warning" size="sm" onClick={save}>
                  Register
                </Btn>
              </div>
              {error && <div style={{ marginTop: 6, color: 'var(--gb-error-fg)' }}>{error}</div>}
            </Callout>
          ) : (
            <Callout tone="brand" icon={<I.user />} title={`Registered as ${identity.displayName}`}>
              Shared items from this browser are now attributed to this user
              {identity.localPart ? ` · ${identity.localPart}` : ''}. This confirmation will close automatically.
            </Callout>
          )}
        </motion.section>
      )}
    </AnimatePresence>
  );
}

/* ── Main Settings Panel ─────────────────────────────────────── */
export function SettingsPanel({ remotePolicy = EMPTY_REMOTE_POLICY }) {
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [flags, setFlags] = useState(FEATURE_DEFAULTS);
  const [featureCfg, setFeatureCfg] = useState(() => normalizeFeatureConfig({}));
  const [customActions, setCustomActions] = useState([]);
  const [credentials, setCredentials] = useState(EMPTY_CREDENTIALS);
  const [shortcuts, setShortcuts] = useState(KEYBOARD_SHORTCUTS_DEFAULTS);
  const [devSettings, setDevSettings] = useState(defaultDevSettings);
  const [devSearch, setDevSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [paStatus, setPaStatus] = useState(null);
  const [scales, setScales] = useState(DEFAULT_SCALES);
  // Visibility is server-owned after a complete, validated policy sync.
  // Dashboard administrators bypass the policy and retain their local setup.
  const visible = (key) => remotePolicy.adminBypass
    || (!remotePolicy.hiddenFeatures[key] && !remotePolicy.hiddenDeveloperSettings[key]);
  const managedFeature = (key) => featureIsManaged(remotePolicy, key);
  const managedDevSetting = (key) => developerSettingIsManaged(remotePolicy, key);
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
    loadFeatureConfig().then(setFeatureCfg);
    loadCustomActions().then(setCustomActions);
    loadCredentials().then(setCredentials);
    loadKeyboardShortcuts().then(setShortcuts);
    loadDevSettings().then(setDevSettings);
    loadScales().then(setScales);
  }, [refreshKey, remotePolicy.revision, remotePolicy.adminBypass]);

  // Keep the Custom Actions table live as the editor (bridge) writes/deletes.
  useEffect(() => {
    const onCh = (changes, area) => {
      if (area === 'local' && changes.gbCustomActions) {
        setCustomActions((changes.gbCustomActions.newValue || []).map(normalizeCustomAction));
      }
    };
    try { chrome.storage.onChanged.addListener(onCh); } catch { /* */ }
    return () => { try { chrome.storage.onChanged.removeListener(onCh); } catch { /* */ } };
  }, []);

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
    if (managedDevSetting(key)) return;
    const next = { ...devSettings, [key]: value };
    setDevSettings(next);
    saveDevSettings(next);
  }
  function resetDevSettings() {
    const next = {
      ...defaultDevSettings(),
      ...(remotePolicy.adminBypass ? {} : remotePolicy.managedDeveloperSettings),
    };
    setDevSettings(next);
    saveDevSettings(next);
    window.__gbToast?.success('Developer settings reset to defaults');
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
  const toggleFlag = (key) => {
    if (managedFeature(key)) return;
    const next = { ...flags, [key]: !flags[key] };
    setFlags(next);
    saveFlags(next);
  };
  /* Surface/page config lives in its own store (featureConfig) so the master
     on/off in featureFlags stays untouched. patch = a shallow merge into one
     feature's row; normalize keeps it clamped to what the feature supports. */
  const updateFeatureCfg = (key, patch) => {
    const next = normalizeFeatureConfig({ ...featureCfg, [key]: { ...(featureCfg[key] || {}), ...patch } });
    setFeatureCfg(next);
    saveFeatureConfig(next);
  };
  const setFeatureSurface = (key, surface, value) => updateFeatureCfg(key, { [surface]: value });
  const toggleFeaturePage = (key, page) => updateFeatureCfg(key, { pages: togglePage(featureCfg[key]?.pages, page) });
  const setFeatureCustomUrl = (key, url) => updateFeatureCfg(key, { customUrl: url });
  /* The Custom Actions table manages user-authored, label-less actions only —
     every built-in feature is controlled by its own row above (with a pages
     picker), so built-ins must NOT appear here. Placing an action on a page
     implies it belongs on the shelf, so flip showInShelf on as we edit pages. */
  const persistActions = (next) => { setCustomActions(next); saveCustomActions(next); };
  const toggleActionCell = (id, page) => persistActions(customActions.map((a) =>
    a.id === id ? { ...a, showInShelf: true, pages: togglePage(a.pages, page) } : a));
  const editAction = (id) => { try { window.openAction?.(id); } catch { /* */ } };
  const deleteAction = (id) => { try { window.deleteActionById?.(id); } catch { /* */ } };
  const addAction = () => { try { window.newAction?.('contact'); } catch { /* */ } };
  const setFlagValue = (key, value) => {
    if (managedFeature(key)) return;
    const next = { ...flags, [key]: value };
    setFlags(next);
    saveFlags(next);
  };
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

  // The consumer Power Automate flow download is gated on the email account
  // host (email.localPart) — the server personalizes the flow to that address.
  const [emailLocalPart, setEmailLocalPart] = useState('');
  const [flowBusy, setFlowBusy] = useState(false);
  useEffect(() => {
    const read = () => { try { chrome.storage.local.get('devSettings', (d) => setEmailLocalPart(String((d.devSettings || {})['email.localPart'] || '').trim())); } catch { /* */ } };
    read();
    const onChange = (ch, area) => { if (area === 'local' && ch.devSettings) read(); };
    try { chrome.storage.onChanged.addListener(onChange); } catch { /* */ }
    return () => { try { chrome.storage.onChanged.removeListener(onChange); } catch { /* */ } };
  }, []);
  const downloadFlow = async () => {
    if (!emailLocalPart || flowBusy) return;
    setFlowBusy(true);
    try {
      const r = await sendBackgroundMessage('getConsumerFlow', { localPart: emailLocalPart });
      const binary = atob(r.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
      const link = document.createElement('a');
      link.href = url; link.download = r.filename || 'EmailExchangeService.zip';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      window.__gbToast?.success?.('Power Automate flow downloaded');
    } catch {
      window.__gbToast?.error?.('Could not download the flow');
    } finally { setFlowBusy(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, fontFamily: 'var(--gb-font-sans)' }}>

      <InstallationIdentityNotice />

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {[...new Set(regularFeatures.map(f => f.section || 'Other'))].map((sec) => (
            <div key={sec}>
              <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-text-muted)', marginBottom: 10 }}>{sec}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {regularFeatures.filter(f => (f.section || 'Other') === sec).map((f) => (
                  <FeatureRow
                    key={f.key}
                    feature={featureByKey(f.key) || { ...f, surfaces: { popup: null, shelf: null } }}
                    icon={getIcon(f.icon)}
                    on={!!flags[f.key]}
                    managed={managedFeature(f.key)}
                    cfg={featureCfg[f.key] || {}}
                    onToggleEnabled={() => toggleFlag(f.key)}
                    onSetSurface={(surface, value) => setFeatureSurface(f.key, surface, value)}
                    onTogglePage={(page) => toggleFeaturePage(f.key, page)}
                    onSetCustomUrl={(url) => setFeatureCustomUrl(f.key, url)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Trackers — the per-tracker table under the Trackers feature toggle:
          how much each has collected and its own switch. */}
      <TrackersSection
        featureOn={!!flags.trackersEnabled}
        managed={managedFeature('trackersEnabled')}
      />

      {/* Custom Actions — the "what shows where" matrix for label-less custom
          shelf actions (code-block actions). Built-in features are managed by
          their own rows above, so only custom actions appear here. The Add
          button (code-block editor) is wired in a later phase. */}
      <section>
        <SectionLabel action={
          <IconBtn size="xs" icon={<I.plus />} title="Create a custom action" onClick={addAction} />
        }>Custom Actions</SectionLabel>
        <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', margin: '-2px 0 10px' }}>
          Build your own quick-actions and choose which pages they appear on. Built-in features are controlled by their toggles above.
        </div>
        <FeatureShelfGrid actions={customActions} onToggleCell={toggleActionCell} onEdit={editAction} onDelete={deleteAction} />
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
            managed={managedFeature('powerAutomateEnabled')}
            disabled={managedFeature('powerAutomateEnabled')}
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

            <div style={{ marginTop: 12, borderTop: '1px solid var(--gb-border-subtle)', paddingTop: 12 }}>
              <Btn variant="secondary" size="sm" icon={<I.send />} disabled={!emailLocalPart || flowBusy} onClick={downloadFlow}>
                {flowBusy ? 'Preparing…' : 'Download my Power Automate flow'}
              </Btn>
              <div style={{ fontSize: 10.5, color: emailLocalPart ? 'var(--gb-text-muted)' : 'var(--gb-warning-fg)', marginTop: 6, lineHeight: 1.5 }}>
                {emailLocalPart
                  ? 'Import the downloaded zip in Power Automate, then paste its flow URL above.'
                  : 'Set your Email account host in Developer Settings first to enable the download.'}
              </div>
            </div>
          </ExpandableFeature>
        </div>
      </section>
      )}

      <EmailLinksSection />

      <ProductStoresSection />

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
          Adding a new row is one entry in
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
                  settings={devSettings}
                  managed={managedDevSetting(def.key)}
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

      {/* The user's own tickets (absent when empty), then the always-present
          form to file a new one. New tickets appear in the list above the
          moment the worker confirms them; revstack replies update in place. */}
      <SupportTicketsSection />
      <SubmitTicketSection />
    </div>
  );
}
