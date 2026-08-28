import React, { useState } from 'react';
import { I } from '../../ui/index.js';
import { TourBox, MiniFrame } from '../lib/tourbox.jsx';
import {
  VariantCard, ShortcutRow, ExpandablePA, DevRow, FeaturesLive,
  FEATURE_FLAGS, FEATURE_DEFAULTS, THEME_VARIANTS, SHORTCUT_ROWS, DEV_ROWS, DEV_SETTINGS,
} from '../lib/settings-live.jsx';

/* ───────────────────────────────────────────────────────────────
   settings.jsx — DEEP page: Manager → Settings. Layout from the
   design exemplar (page-settings.jsx); every list and table is
   generated from the live registries, and the prose is rewritten
   from the verified articles (feature-toggles, theme-appearance,
   email-integrations, presets, developer-settings,
   hidden-settings).
─────────────────────────────────────────────────────────────── */

function VariantSnippet() {
  const [v, setV] = useState('dark');
  return (
    <MiniFrame width={420} label="settings · variant" pad>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {THEME_VARIANTS.map((vv) => <VariantCard key={vv.id} v={vv} active={v === vv.id} onClick={() => setV(vv.id)} />)}
      </div>
    </MiniFrame>
  );
}

function FeaturesSnippet() {
  return (
    <MiniFrame width={400} label="settings · features" pad>
      <FeaturesLive subset={['emailTemplatesEnabled', 'chargeEnabled', 'marginCalcEnabled', 'actionsShelfEnabled']} width="100%" />
    </MiniFrame>
  );
}

function ShortcutsSnippet() {
  const [vals, setVals] = useState(() => Object.fromEntries(SHORTCUT_ROWS.map((s) => [s.key, s.def])));
  return (
    <MiniFrame width={400} label="settings · keyboard shortcuts" pad>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {SHORTCUT_ROWS.slice(0, 2).map((s) => <ShortcutRow key={s.key} s={s} value={vals[s.key]} onChange={(v) => setVals((p) => ({ ...p, [s.key]: v }))} />)}
      </div>
    </MiniFrame>
  );
}

function PASnippet() {
  const [on, setOn] = useState(false);
  const [url, setUrl] = useState('');
  return (
    <MiniFrame width={430} label="settings · experimental" pad>
      <ExpandablePA on={on} onChange={setOn} url={url} onUrl={setUrl} />
    </MiniFrame>
  );
}

function DevSnippet() {
  const [vals, setVals] = useState(() => Object.fromEntries(DEV_ROWS.map((d) => [d.key, d.default])));
  return (
    <MiniFrame width={430} label="settings · developer" pad>
      <div style={{ background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', padding: '4px 12px' }}>
        {DEV_ROWS.map((d) => <DevRow key={d.key} def={d} value={vals[d.key]} onChange={(v) => setVals((p) => ({ ...p, [d.key]: v }))} />)}
      </div>
    </MiniFrame>
  );
}

/* The complete toggle table — generated from the registry, grouped
   the way the Settings panel groups it. */
function FlagTable() {
  const sections = [...new Set(FEATURE_FLAGS.map((f) => f.section || 'Other'))];
  return (
    <>
      {sections.map((sec) => (
        <table className="spectable" key={sec}>
          <thead><tr><th style={{ width: 180 }}>{sec}</th><th>What it controls</th><th style={{ width: 70 }}>Default</th></tr></thead>
          <tbody>
            {FEATURE_FLAGS.filter((f) => (f.section || 'Other') === sec).map((f) => (
              <tr key={f.key}>
                <td style={{ whiteSpace: 'nowrap' }}><b>{f.name}</b></td>
                <td>{f.desc}</td>
                <td>{FEATURE_DEFAULTS[f.key] !== false ? 'On' : 'Off'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </>
  );
}

export function SettingsPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Configuration</div>
      <h1 className="title">Settings &amp; Manager</h1>
      <p className="lede">
        Click <strong>Manage</strong> in the popup to open the Manager window — templates in the sidebar,
        Settings behind the gear. Settings is mission control: turn features on or off, restyle the
        extension, rebind shortcuts, and tune behavior. Every change saves instantly and applies live
        across every open tab. Each group is shown live below, next to what it does.
      </p>

      <TourBox n={1} eyebrow="Appearance" title="Theme variant" live={<VariantSnippet />} flip>
        <p>Pick a base look — <strong>Dark</strong> (default), <strong>Slate</strong>, <strong>Light</strong>, <strong>Cream</strong>, <strong>Nord</strong>, <strong>Dracula</strong>, <strong>Rosé</strong>, or <strong>Tokyo Night</strong>. It restyles the whole extension at once: popup, every modal, the shelf, the editor — and this guide.</p>
        <p>Below the variants in the real panel sit <strong>Theme Colors</strong> — eight pickers that override the brand accent and the four status colors — and <strong>UI Scale</strong>, a 50–150% zoom slider per surface (modals, popovers, notifications, shelf, popup, editor) so the extension can run larger or smaller than the host site. Click a card — it's live.</p>
      </TourBox>

      <TourBox n={2} eyebrow="The master switches" title="Feature toggles" live={<FeaturesSnippet />} wide>
        <p>The Features list has <strong>{FEATURE_FLAGS.length} switches</strong>, grouped into {[...new Set(FEATURE_FLAGS.map((f) => f.section))].length} sections (Email &amp; Templates, CRM &amp; Contacts, Orders &amp; Pricing, Tools). Each shows or hides one tool everywhere it appears — popup buttons, shelf actions, keyboard shortcuts, injected page buttons. Off means it simply disappears; nothing breaks.</p>
        <p>This is the direct counterpart to <a href="#popup">the popup</a>: switch <strong>Charge Card</strong> off here and the Charge button vanishes there, instantly. The complete list is in the table below.</p>
      </TourBox>

      <TourBox n={3} eyebrow="Speed" title="Keyboard shortcuts" live={<ShortcutsSnippet />} flip>
        <p>Four global shortcuts, each fired with <span className="kbd">Ctrl</span> (<span className="kbd">Cmd</span> on Mac) + the bound letter, from any CRM page: <strong>My Tasks</strong> ({SHORTCUT_ROWS[0].def}), <strong>Margin Calculator</strong> ({SHORTCUT_ROWS[1].def}), <strong>CRM Search</strong> ({SHORTCUT_ROWS[2].def}), <strong>New Contact</strong> ({SHORTCUT_ROWS[3].def}).</p>
        <p>Type a letter to rebind; a shortcut only fires while its feature toggle is on — the row greys out when the feature is disabled. The Actions Shelf has its own fixed trigger: double-tap <span className="kbd">Shift</span>.</p>
      </TourBox>

      <TourBox n={4} eyebrow="Experimental" title="Power Automate — direct send" live={<PASnippet />} wide>
        <p>This is the single most consequential switch in Settings. <strong>Off (the default), Send opens a pre-filled Outlook window</strong> — plain text, no signature. On, with a flow URL pasted, emails send silently through your Microsoft Power Automate flow with your signature appended and inline images attached properly.</p>
        <p>Setup is three steps inside Power Automate (HTTP-trigger flow → Send-email action that forwards the attachments array → paste the URL here). <strong>Test connection</strong> sanity-checks the URL. If Send keeps opening Outlook windows, this switch is why.</p>
      </TourBox>

      <TourBox n={5} eyebrow="Power-user" title="Developer settings" live={<DevSnippet />} flip>
        <p>The long tail: <strong>{DEV_SETTINGS.length} registry-driven knobs in this build</strong> — animation timing, draggable vs. centered per modal, the minimum-margin threshold, the catalog re-index interval, 3D viewer tuning. Most reps never open this section; the ones shown here are real rows from the registry.</p>
        <p>One matters on day one: <strong>Email account host</strong> is the local part of your From address. It starts blank and must be configured before Power Automate can send.</p>
      </TourBox>

      <h2 className="sec">Every feature toggle</h2>
      <p>The complete Features list, generated from the same registry the panel renders — names, descriptions, and defaults exactly as shipped.</p>
      <FlagTable />

      <h2 className="sec">Also in Settings</h2>
      <ul>
        <li><strong>Shared Settings Templates</strong> — choose scopes, name the template, and receive a revocable URL. A teammate pastes the URL, previews its contents, and chooses scopes to import. <em>Settings overwrite on import; template scopes merge by id</em> (same id replaces, new id appends — local-only templates are never deleted).</li>
        <li><strong>Email signature</strong> — edited from the Manager sidebar; auto-appended to Power Automate sends (not to Outlook-fallback emails).</li>
      </ul>

      <div className="docnote info" style={{ marginTop: 24 }}>
        <span className="dn-ico"><I.eye size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">A toggle is missing from your panel?</div>
          <p style={{ margin: 0 }}>Admins can hide individual settings (the value keeps working, the switch disappears) via console commands on this page — it's how teams lock a standard config. If a switch you expect isn't listed, ask your admin before assuming a bug.</p>
        </div>
      </div>
    </div>
  );
}
