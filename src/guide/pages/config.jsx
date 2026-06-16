import React, { useState } from 'react';
import { I, Slider, ColorSpotlight } from '../../ui/index.js';
import { TourBox, MiniFrame } from '../lib/tourbox.jsx';
import { VariantCard, ShortcutRow, SHORTCUT_ROWS, THEME_VARIANTS } from '../lib/settings-live.jsx';
import { THEME_COLORS, currentColor } from '../../lib/theme.js';
import { SCALE_CATEGORIES } from '../../lib/scales.js';

/* ───────────────────────────────────────────────────────────────
   config.jsx — DEEP pages: Settings → Appearance (Themes) and
   Settings → Keyboard Shortcuts. Same layout grammar as
   settings.jsx: each section pairs a LIVE snippet built from the
   REAL Settings components with a two-paragraph plain-language
   explanation, followed by registry-generated spectables. Prose is
   rewritten from the verified articles (theme-appearance,
   keyboard-shortcuts, shortcuts-settings).
─────────────────────────────────────────────────────────────── */

/* ════════════════════════════════════════════════════════════════
   THEMES PAGE
═══════════════════════════════════════════════════════════════════ */

/* The four shell variants — clicking one previews it (local only). */
function VariantSnippet() {
  const [v, setV] = useState('dark');
  return (
    <MiniFrame width={420} label="settings · theme variant" pad>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {THEME_VARIANTS.map((vv) => (
          <VariantCard key={vv.id} v={vv} active={v === vv.id} onClick={() => setV(vv.id)} />
        ))}
      </div>
    </MiniFrame>
  );
}

/* The eight Theme Color rows — the exact ColorSpotlight component the
   Settings panel renders, seeded with the live token values so the
   swatches show the real shipped colors. Editing here is local only. */
function ColorsSnippet() {
  const [colors, setColors] = useState({});
  return (
    <MiniFrame width={440} label="settings · theme colors" pad>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {THEME_COLORS.slice(0, 4).map((c) => (
          <ColorSpotlight
            key={c.key}
            size="sm"
            name={c.name}
            desc={c.hint}
            varName={c.key}
            value={colors[c.key] || currentColor(c.key)}
            defaultValue={currentColor(c.key)}
            onChange={(hex) => setColors((p) => ({ ...p, [c.key]: hex }))}
          />
        ))}
      </div>
    </MiniFrame>
  );
}

/* One UI-Scale row — mirrors the panel's UiScaleRow: label, hint, a
   live % readout, and a 50–150% slider with ticks. */
function ScaleRow({ c, pct, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-text-primary)' }}>{c.label}</div>
        <div style={{ flex: 1, fontSize: 10.5, color: 'var(--gb-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.hint}</div>
        <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', color: pct === 100 ? 'var(--gb-text-muted)' : 'var(--gb-brand-label)', minWidth: 40, textAlign: 'right' }}>{pct}%</span>
      </div>
      <Slider
        value={pct}
        min={50}
        max={150}
        step={5}
        unit="%"
        showValue={false}
        ticks={[50, 75, 100, 125, 150]}
        onChange={onChange}
      />
    </div>
  );
}

/* Several surfaces, each with its own zoom slider. Local state only. */
function ScaleSnippet() {
  const surfaces = SCALE_CATEGORIES.slice(0, 4);
  const [vals, setVals] = useState(() => Object.fromEntries(surfaces.map((c) => [c.id, 100])));
  return (
    <MiniFrame width={420} label="settings · UI scale" pad>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {surfaces.map((c) => (
          <ScaleRow key={c.id} c={c} pct={vals[c.id]} onChange={(v) => setVals((p) => ({ ...p, [c.id]: v }))} />
        ))}
      </div>
    </MiniFrame>
  );
}

/* The full Theme Colors reference — every one of the eight pickers. */
function ThemeColorTable() {
  return (
    <table className="spectable">
      <thead><tr><th style={{ width: 150 }}>Color</th><th>What it tints</th><th style={{ width: 150 }}>Token</th></tr></thead>
      <tbody>
        {THEME_COLORS.map((c) => (
          <tr key={c.key}>
            <td style={{ whiteSpace: 'nowrap' }}><b>{c.name}</b></td>
            <td>{c.hint}</td>
            <td style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 11.5, color: 'var(--gb-text-muted)' }}>{c.key}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* The full UI-Scale reference — every zoomable surface. */
function ScaleTable() {
  return (
    <table className="spectable">
      <thead><tr><th style={{ width: 180 }}>Surface</th><th>What it covers</th><th style={{ width: 90 }}>Range</th></tr></thead>
      <tbody>
        {SCALE_CATEGORIES.map((c) => (
          <tr key={c.id}>
            <td style={{ whiteSpace: 'nowrap' }}><b>{c.label}</b></td>
            <td>{c.hint}</td>
            <td>50–150%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ThemesPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Configuration</div>
      <h1 className="title">Themes &amp; Appearance</h1>
      <p className="lede">
        Make the extension look the way you want and sit at the size you prefer. In <strong>Settings</strong> you
        pick a base look, fine-tune the accent colors, and zoom each part of the interface independently. Every
        change saves the instant you make it and applies live — across every open tab, the popup, the editor, and
        even this guide. Each control is shown live below, next to what it does.
      </p>

      <TourBox n={1} eyebrow="Base look" title="Theme variant" live={<VariantSnippet />} flip>
        <p>This is the master look-and-feel switch. Pick one of four shells: <strong>Dark</strong> (the default), <strong>Slate</strong> (deeper, bluer blacks), <strong>Light</strong>, or <strong>Cream</strong> (a warm, paper-like off-white). Each card is a tiny preview of that look — click one and the whole extension restyles at once: the popup, every modal, the floating shelf, the templates editor, and this guide. No reload, no waiting.</p>
        <p>Choosing a variant only sets the backgrounds, text, and borders — it doesn't lock your accent. The <strong>Theme Colors</strong> and <strong>UI Scale</strong> controls below layer on top of whichever variant you pick, so you can run, say, Light with your own brand accent at a slightly larger size. Click a card here — the preview is live.</p>
      </TourBox>

      <TourBox n={2} eyebrow="Accent &amp; status" title="Theme colors" live={<ColorsSnippet />} wide>
        <p>Eight color pickers let you override the accent and status colors the extension paints with. The first four control the <strong>brand accent</strong> — the label color plus the three shades of the primary action button (its top, its bottom, and its border). The last four are the <strong>status colors</strong>: <strong>Error</strong> (destructive actions), <strong>Warning</strong> (holds and cautions), <strong>Success</strong> (confirmations), and <strong>Info</strong> (notes). Each row shows a swatch, the color's job, and its hex value.</p>
        <p>To change one, click the swatch to open the color picker, or type a hex code straight into the box on the right. You don't have to recolor every tint by hand — every faint background, glow, and border in the extension is mixed automatically from these eight, so one change ripples everywhere. A row glows and shows a reset button once you've changed it; <strong>Reset All</strong> at the top of the section returns every color to the variant's defaults.</p>
      </TourBox>

      <TourBox n={3} eyebrow="Size" title="UI scale" live={<ScaleSnippet />} flip>
        <p>The extension can run larger or smaller than the website it sits on — and each surface scales on its own slider, from <strong>50% to 150%</strong>. The surfaces are: <strong>Modals</strong> (the image viewer, charge, call log, task list…), <strong>Popovers</strong> (dropdowns, the date and color pickers), <strong>Notifications</strong> (the toast pop-ups), the <strong>Smart Actions Shelf</strong>, the <strong>Toolbar Popup</strong>, and the <strong>Templates Editor</strong>. Drag a slider; the percentage to its right updates live.</p>
        <p>Why per-surface? Many reps run the dense CRM order pages at a reduced browser zoom for reading, but still want the extension's own panels at a comfortable, readable size. Scaling each surface separately means you can enlarge just the thing you find small without blowing up the whole browser. The number is a quick reset target — <strong>Reset All</strong> snaps every surface back to 100%.</p>
      </TourBox>

      <h2 className="sec">Every theme color</h2>
      <p>All eight pickers from the Theme Colors section, generated from the same registry the panel renders — the name, what it tints, and the underlying token.</p>
      <ThemeColorTable />

      <h2 className="sec">Every scalable surface</h2>
      <p>Each row is one slider in the UI Scale section. Anything not listed (for example, injected buttons on the host page) follows the page's own zoom.</p>
      <ScaleTable />

      <div className="docnote brand" style={{ marginTop: 24 }}>
        <span className="dn-ico"><I.sun size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Everything here applies live, everywhere</div>
          <p style={{ margin: 0 }}>Theme and scale changes are saved the moment you make them and broadcast to every open tab — you'll see the popup, your modals, the shelf, and this guide change together. Nothing needs a refresh, and nothing here can break a feature: appearance settings only change how things look and how big they are.</p>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   SHORTCUTS PAGE
═══════════════════════════════════════════════════════════════════ */

/* The real rebind rows — type a letter to change the binding. */
function ShortcutsSnippet() {
  const [vals, setVals] = useState(() => Object.fromEntries(SHORTCUT_ROWS.map((s) => [s.key, s.def])));
  return (
    <MiniFrame width={400} label="settings · keyboard shortcuts" pad>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {SHORTCUT_ROWS.map((s) => (
          <ShortcutRow key={s.key} s={s} value={vals[s.key]} onChange={(v) => setVals((p) => ({ ...p, [s.key]: v }))} />
        ))}
      </div>
    </MiniFrame>
  );
}

/* Global shortcuts table — the four rebindable letters plus the
   fixed double-Shift trigger. Defaults pulled from the live registry. */
const GLOBAL_SHORTCUTS = [
  { keys: 'Ctrl + K', action: 'CRM Search', desc: 'Quick search for customers and orders.', rebind: true },
  { keys: 'Ctrl + X', action: 'Task List', desc: 'The full-screen order task list.', rebind: true },
  { keys: 'Ctrl + M', action: 'Margin Calculator', desc: 'The floating margin / profit calculator.', rebind: true },
  { keys: 'Ctrl + Q', action: 'New Contact', desc: 'The quick-create CRM contact form.', rebind: true },
  { keys: 'Shift, Shift', action: 'Smart Actions Shelf', desc: 'Double-tap Shift to toggle the floating shelf.', rebind: false },
];

function GlobalTable() {
  return (
    <table className="spectable">
      <thead><tr><th style={{ width: 130 }}>Keys</th><th style={{ width: 160 }}>Opens</th><th>What it is</th><th style={{ width: 90 }}>Rebindable</th></tr></thead>
      <tbody>
        {GLOBAL_SHORTCUTS.map((r) => (
          <tr key={r.action}>
            <td style={{ whiteSpace: 'nowrap' }}>
              {r.keys.split(' + ').map((k, i, arr) => (
                <React.Fragment key={k + i}>
                  <span className="kbd">{k}</span>{i < arr.length - 1 ? ' + ' : ''}
                </React.Fragment>
              ))}
            </td>
            <td><b>{r.action}</b></td>
            <td>{r.desc}</td>
            <td>{r.rebind ? 'Yes' : 'Fixed'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* In-composer keys — the Quick Task / Call Log keyboard flow. */
const COMPOSER_SHORTCUTS = [
  { keys: '/', action: 'Enter composer mode — fill every field without touching the mouse.' },
  { keys: 'type', action: 'Filter the template list as you type.' },
  { keys: '1 – 9', action: 'Pick the Nth filtered template (also picks category chips in Email Preview).' },
  { keys: '↑ ↓', action: 'Walk up and down the filtered list.' },
  { keys: 'Enter', action: 'Select the highlighted item, or advance to the next field.' },
];

function ComposerTable() {
  return (
    <table className="spectable">
      <thead><tr><th style={{ width: 120 }}>Keys</th><th>Action</th></tr></thead>
      <tbody>
        {COMPOSER_SHORTCUTS.map((r) => (
          <tr key={r.keys}>
            <td style={{ whiteSpace: 'nowrap' }}><span className="kbd">{r.keys}</span></td>
            <td>{r.action}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ShortcutsPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Configuration</div>
      <h1 className="title">Keyboard Shortcuts</h1>
      <p className="lede">
        Four global shortcuts open the tools you reach for most — from any CRM page, without touching the mouse.
        Each one is a single letter you can rebind to whatever feels natural, and there's a separate set of keys
        for working inside the Quick Task and Call Log composers. The rebind panel is shown live below.
      </p>

      <TourBox n={1} eyebrow="Rebind" title="The four global shortcuts" live={<ShortcutsSnippet />} flip>
        <p>Every global shortcut fires with <span className="kbd">Ctrl</span> (<span className="kbd">Cmd</span> on a Mac) plus one letter, from anywhere in the CRM. Out of the box: <strong>CRM Search</strong> is <span className="kbd">Ctrl + {SHORTCUT_ROWS[2].def}</span>, <strong>Margin Calculator</strong> is <span className="kbd">Ctrl + {SHORTCUT_ROWS[1].def}</span>, <strong>My Tasks</strong> is <span className="kbd">Ctrl + {SHORTCUT_ROWS[0].def}</span>, and <strong>New Contact</strong> is <span className="kbd">Ctrl + {SHORTCUT_ROWS[3].def}</span>. Each row names the tool, describes what it opens, and shows its current letter.</p>
        <p>To change a binding, click the letter box on the right and type a new letter — that's the whole flow. To switch a shortcut off entirely, clear the box; the row greys out and reads "Disabled." One thing to know: a shortcut only fires while its matching feature is turned on. Turn a feature off in the Features list and its row here greys out automatically, because there's nothing left for the key to open.</p>
      </TourBox>

      <h2 className="sec">Global shortcuts</h2>
      <p>Work from any page in the CRM. The four letters are rebindable in Settings; the Smart Actions Shelf has its own fixed trigger — double-tap <span className="kbd">Shift</span>.</p>
      <GlobalTable />

      <h2 className="sec">Inside the composers</h2>
      <p>
        The Quick Task and Call Log modals share a keyboard-first composer. These keys are fixed (not rebindable) and
        let you fill out a task or log a call end-to-end without reaching for the mouse.
      </p>
      <ComposerTable />

      <h3 className="sub">Rebinding and turning shortcuts off</h3>
      <p>
        All four global letters live under <strong>Settings → Keyboard Shortcuts</strong>. The modifier is always
        <span className="kbd">Ctrl</span> (<span className="kbd">Cmd</span> on Mac) — you only ever change the letter,
        never the modifier. Clearing a row's letter disables that shortcut without affecting the feature itself; the
        button or shelf action it triggers stays available, you just lose the hotkey. The double-tap
        <span className="kbd">Shift</span> for the Smart Actions Shelf is built in and can't be remapped.
      </p>

      <div className="docnote info" style={{ marginTop: 24 }}>
        <span className="dn-ico"><I.bolt size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">A shortcut only works when its feature is on</div>
          <p style={{ margin: 0 }}>Shortcuts ride on top of features. If <span className="kbd">Ctrl + M</span> does nothing, check that <strong>Margin Calculator</strong> is enabled in the Features list — a disabled feature greys its shortcut row out and stops the key from firing. This is also the fastest way to free up a letter: turn the feature off, or just clear the binding.</p>
        </div>
      </div>
    </div>
  );
}
