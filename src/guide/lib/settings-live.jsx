import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FeatureSpotlight, Switch, Btn, Input, Field, Callout, SectionLabel, Dot, Tag, I } from '../../ui/index.js';
import { FEATURE_FLAGS, FEATURE_DEFAULTS, KEYBOARD_SHORTCUTS_DEFAULTS } from '../../lib/flags.js';
import { THEME_VARIANTS } from '../../lib/theme.js';
import { DEV_SETTINGS } from '../../lib/devSettings.js';

/* ───────────────────────────────────────────────────────────────
   settings-live.jsx — live Settings snippets for the guide, built
   from the REAL registries (flags.js, devSettings.js, theme.js) so
   names, descriptions, and defaults can never drift from the build.
   Local state only — toggling here changes nothing real.
─────────────────────────────────────────────────────────────── */

const ICON_MAP = {
  card: <I.card />, edit: <I.edit />, send: <I.send />, bolt: <I.bolt />,
  eye: <I.eye />, check: <I.check />, search: <I.search />, filter: <I.filter />,
  mail: <I.mail />, cog: <I.cog />, copy: <I.copy />, alert: <I.alert />,
  user: <I.user />, phone: <I.phone />, megaphone: <I.megaphone />,
};
export const getFlagIcon = (name) => ICON_MAP[name] || <I.cog />;

/* The real shortcut rows: registry default keys + the panel's labels. */
export const SHORTCUT_ROWS = [
  { key: 'taskList', label: 'My Tasks', desc: 'Opens the full-screen task list from any page.' },
  { key: 'marginCalc', label: 'Margin Calculator', desc: 'Opens the floating margin calculator from any page.' },
  { key: 'crmSearch', label: 'CRM Search', desc: 'Opens the full-screen CRM search modal from any page.' },
  { key: 'crmNewContact', label: 'New Contact', desc: 'Opens the quick-create contact modal from any page.' },
].map((r) => ({ ...r, def: (KEYBOARD_SHORTCUTS_DEFAULTS[r.key] || '').toUpperCase() }));

/* A representative sample of real dev settings, pulled by key from the
   registry so label/desc/default are always the shipping values. */
const DEV_SAMPLE_KEYS = ['numberDisplay.enabled', 'popup.ignorePageContext', 'marginCalc.minAllowedMargin', 'email.localPart', 'giftCatalog.cacheHours'];
export const DEV_ROWS = DEV_SAMPLE_KEYS
  .map((k) => DEV_SETTINGS.find((d) => d.key === k))
  .filter(Boolean);

export { FEATURE_FLAGS, FEATURE_DEFAULTS, THEME_VARIANTS, DEV_SETTINGS };

/* ── Variant card (mirrors SettingsPanel's VariantCard) ── */
export function VariantCard({ v, active, onClick }) {
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

/* ── Shortcut row (mirrors KeyboardShortcutRow) ── */
export function ShortcutRow({ s, value, onChange }) {
  const enabled = !!value;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gb-text-primary)' }}>{s.label}</div>
        <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 2 }}>{enabled ? s.desc : <span style={{ color: 'var(--gb-text-ghost)', fontStyle: 'italic' }}>Disabled — left empty</span>}</div>
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

/* ── Power Automate expandable (mirrors the panel's ExpandableFeature) ── */
export function ExpandablePA({ on, onChange, url, onUrl }) {
  const [paStatus, setPaStatus] = useState(null);
  const test = () => { const ok = /^https:\/\/\S+/i.test((url || '').trim()); setPaStatus(ok ? 'ok' : 'fail'); };
  return (
    <div style={{ border: '1px solid ' + (on ? 'var(--gb-warning-tint-border)' : 'var(--gb-border-default)'), borderRadius: 'var(--gb-r-lg)', background: on ? 'var(--gb-warning-tint-soft)' : 'var(--gb-surface-1)', overflow: 'hidden', transition: 'background .2s, border-color .2s' }}>
      <div onClick={() => onChange(!on)} style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
        <div style={{ width: 36, height: 36, borderRadius: 'var(--gb-r-md)', flexShrink: 0, border: '1px solid ' + (on ? 'var(--gb-warning-tint-border)' : 'var(--gb-border-default)'), background: on ? 'var(--gb-warning-tint-medium)' : 'var(--gb-fill-subtle)', color: on ? 'var(--gb-warning-fg)' : 'var(--gb-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.send size={17} /></div>
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
              <Field label="Flow URL" required><Input value={url} onChange={onUrl} mono leading={<I.bolt />} placeholder="https://…/powerautomate/…" /></Field>
              <div style={{ marginTop: 12 }}>
                <Callout tone="warning" title="Set up in Power Automate" icon={<I.bolt size={14} />}>
                  <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                    <li>Create <b>New flow</b> → <b>When an HTTP request is received</b></li>
                    <li>Add a <b>Send an email (V2)</b> action — and forward the <b>attachments</b> array so inline images render</li>
                    <li>Save and paste the generated URL above</li>
                  </ol>
                </Callout>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                <Btn variant="tinted" status="warning" size="sm" icon={<I.bolt />} onClick={test}>Test connection</Btn>
                <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Dot tone={paStatus === 'ok' ? 'brand' : paStatus === 'fail' ? 'error' : 'muted'} glow={paStatus === 'ok'} size={5} />{paStatus === 'ok' ? 'URL looks valid — saved automatically' : paStatus === 'fail' ? 'Paste the full URL from Power Automate' : 'Not tested'}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── A single dev-settings row (registry-driven) ── */
export function DevRow({ def, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--gb-border-subtle)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-primary)' }}>{def.label}</div>
        <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1, lineHeight: 1.4 }}>{def.desc}</div>
        <div style={{ fontSize: 9.5, color: 'var(--gb-text-ghost)', marginTop: 3, fontFamily: 'var(--gb-font-mono)' }}>{def.key}</div>
      </div>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        {def.type === 'bool' && <Switch on={!!value} size="sm" onChange={onChange} />}
        {(def.type === 'number') && <Input size="sm" mono value={String(value)} onChange={(v) => onChange(v.replace(/[^0-9.\-]/g, ''))} style={{ width: 70 }} />}
        {def.type === 'string' && <Input size="sm" value={String(value)} onChange={onChange} style={{ width: 140 }} />}
      </div>
    </div>
  );
}

/* ── Live feature-toggle list, grouped by registry section ── */
export function FeaturesLive({ subset, width = 400 }) {
  const data = subset ? FEATURE_FLAGS.filter((f) => subset.includes(f.key)) : FEATURE_FLAGS;
  const [on, setOn] = useState(() => Object.fromEntries(data.map((f) => [f.key, FEATURE_DEFAULTS[f.key] !== false])));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width }}>
      {data.map((f) => (
        <FeatureSpotlight key={f.key} on={on[f.key]} icon={getFlagIcon(f.icon)} name={f.name} desc={f.desc} size="sm" onChange={() => setOn((p) => ({ ...p, [f.key]: !p[f.key] }))} />
      ))}
    </div>
  );
}
