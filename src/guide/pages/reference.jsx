import React, { useState } from 'react';
import { I, Btn, Tag, Switch, Dot } from '../../ui/index.js';
import { TourBox, MiniFrame } from '../lib/tourbox.jsx';
import { DEV_SETTINGS } from '../lib/settings-live.jsx';

/* ───────────────────────────────────────────────────────────────
   reference.jsx — the four "look it up" pages: Troubleshooting,
   FAQ, Power User, and What's New. Hand-built and themed to match
   the gold-standard pages (settings/crm/templates): faithful
   MiniFrame snippets of the real surfaces (error toast, unresolved
   {{variable}} chip, code editor, console terminal), spectable
   reference tables, cardgrids, docnotes, and a themed changelog
   timeline. Content is transcribed from the verified articles in
   src/lib/helpContent.js (ts-* / faq / code-variables /
   hidden-settings / debug-storage / whats-new).
─────────────────────────────────────────────────────────────── */

/* ════════════════════════════════════════════════════════════════
   Shared little surfaces
═══════════════════════════════════════════════════════════════════ */

/* A {{variable}} chip in its unresolved (red) state — mirrors the
   editor/popup styling that warns you a variable would leak braces. */
function UnresolvedChip({ name }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'stretch', borderRadius: 5, border: '1px solid var(--gb-error-tint-border)', background: 'var(--gb-error-tint-soft)', overflow: 'hidden', verticalAlign: 'middle', margin: '0 1px' }}>
      <span style={{ padding: '0 5px', fontFamily: 'var(--gb-font-mono)', fontSize: 11.5, fontWeight: 600, color: 'var(--gb-error-fg)' }}>{'{{' + name + '}}'}</span>
      <span style={{ padding: '0 4px', borderLeft: '1px solid var(--gb-error-tint-border)', color: 'var(--gb-error-fg)', display: 'inline-flex', alignItems: 'center' }}><I.alert size={9} /></span>
    </span>
  );
}

/* A host-page style toast — same shape the LiveStage uses for the
   in-stage toast, tinted by tone. */
function Toast({ tone = 'warning', icon, children }) {
  const fg = `var(--gb-${tone}-fg)`;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, maxWidth: '100%', background: 'var(--gb-tooltip-bg)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-pill)', padding: '9px 15px', boxShadow: 'var(--gb-shadow-popover)' }}>
      <span style={{ width: 22, height: 22, flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `var(--gb-${tone}-tint-medium)`, color: fg, border: `1px solid var(--gb-${tone}-tint-border)` }}>{icon || <I.alert size={12} />}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-text-primary)', lineHeight: 1.4 }}>{children}</span>
    </div>
  );
}

/* A Settings-row style toggle pair, used to point at the switch a fix
   needs flipped. */
function SettingRow({ label, hint, on, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--gb-text-secondary)' }}>{label}</div>
        {hint && <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 2, lineHeight: 1.4 }}>{hint}</div>}
      </div>
      <Switch on={on} size="sm" onChange={onChange} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   TROUBLESHOOTING
═══════════════════════════════════════════════════════════════════ */

/* Snippet: the Outlook-fallback toast + the one switch that fixes it. */
function OutlookFixSnippet() {
  const [pa, setPa] = useState(false);
  return (
    <MiniFrame width={430} label="symptom · send opened outlook" pad>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
        <Toast tone="info" icon={<I.mail size={12} />}>Opening Outlook — Power Automate is off</Toast>
      </div>
      <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--gb-text-muted)', margin: '0 0 7px' }}>The fix — Settings → Experimental</div>
      <SettingRow
        label="Power Automate — direct send"
        hint={pa ? 'On: emails send silently, signature attached.' : 'Off (default): Send opens a pre-filled Outlook window.'}
        on={pa}
        onChange={setPa}
      />
    </MiniFrame>
  );
}

/* Snippet: a body line with the unresolved chip highlighted red, plus
   the two graceful rescues. */
function UnresolvedSnippet() {
  const [mode, setMode] = useState('leak');
  return (
    <MiniFrame width={400} label="symptom · {{unresolved}} variable" pad>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        <Btn size="xs" variant={mode === 'leak' ? 'tinted' : 'ghost'} status="error" onClick={() => setMode('leak')}>Leaks</Btn>
        <Btn size="xs" variant={mode === 'or' ? 'tinted' : 'ghost'} status="brand" onClick={() => setMode('or')}>OR-block</Btn>
        <Btn size="xs" variant={mode === 'drop' ? 'tinted' : 'ghost'} status="brand" onClick={() => setMode('drop')}>Conditional</Btn>
      </div>
      <div style={{ background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', padding: 14, minHeight: 96, fontSize: 12.5, lineHeight: 1.8, color: 'var(--gb-text-secondary)' }}>
        Hi Jordan,<br />
        {mode === 'leak' && <>We'll reach you at <UnresolvedChip name="phone" />.</>}
        {mode === 'or' && <>We'll reach you at <span style={{ fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-brand-label)' }}>jordan.lee@example.com</span>.</>}
        {mode === 'drop' && <span style={{ color: 'var(--gb-text-muted)', fontStyle: 'italic' }}>(the whole sentence is dropped — no awkward blank)</span>}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 8, textAlign: 'center' }}>
        {mode === 'leak' && 'Contact has no phone — the braces would leak. The popup flags it red before you send.'}
        {mode === 'or' && 'Fix #1 — {{phone|email}} falls through to the next non-empty candidate.'}
        {mode === 'drop' && 'Fix #2 — mark it conditional and the empty sentence disappears.'}
      </div>
    </MiniFrame>
  );
}

/* Snippet: a failed step toast for the order-dates chain. */
function StepFailSnippet() {
  const STEPS = ['Load calendar', 'Select approval', 'Select commitment', 'Submit'];
  const [fail] = useState(1);
  return (
    <MiniFrame width={400} label="symptom · date update failed" pad>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {STEPS.map((s, i) => {
          const done = i < fail;
          const failed = i === fail;
          const tone = failed ? 'error' : done ? 'success' : 'muted';
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 'var(--gb-r-md)', background: failed ? 'var(--gb-error-tint-soft)' : 'var(--gb-surface-1)', border: '1px solid ' + (failed ? 'var(--gb-error-tint-border)' : 'var(--gb-border-default)'), opacity: i > fail ? 0.5 : 1 }}>
              <Dot tone={tone} glow={failed} size={6} />
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: failed ? 'var(--gb-error-fg)' : done ? 'var(--gb-text-secondary)' : 'var(--gb-text-muted)' }}>{s}</span>
              {done && <I.check size={13} style={{ color: 'var(--gb-success-fg)' }} />}
              {failed && <Tag tone="error" size="xs">stopped here</Tag>}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 10, textAlign: 'center' }}>The progress toast names the failing step. Re-open and retry — the chain restarts safely from the top.</div>
    </MiniFrame>
  );
}

const TS_TABLE = [
  ['Send opened Outlook instead of sending', 'Power Automate is off (default) or has no flow URL — that’s the fallback transport, not a failure.', <>Settings &rarr; enable <b>Power Automate</b> + paste the flow URL. <span style={{ color: 'var(--gb-text-muted)' }}>(With it off, a bulk send opens one window per recipient.)</span></>],
  ['A variable shows as {{unresolved}}', 'Wrong page type, the data is genuinely missing, the page hadn’t finished loading, or a code variable threw.', <>Match the template type to the page; use <code>{'{{phone|email}}'}</code> or a conditional block for missing data; let the page render, then reopen.</>],
  ['Gift Catalog is stale / missing items', 'It’s a local index refreshed every 24 h — new products and prices land at the next re-index.', <>Use the catalog’s rebuild control, or shorten <b>Developer Settings &rarr; re-index interval</b> (0 = every open).</>],
  ['A modal or button isn’t appearing', 'A feature toggle is off, you’re on the wrong page type, the page predates an update, or you’re off-site.', <>Check <b>Settings &rarr; Features</b>; confirm the page type; reload; verify you’re on a golfballs.com CRM page.</>],
  ['Margin Calculator shows no cost', 'Cost/inventory lookups need an active office-portal (gbcadmin) session; cached costs can also be stale.', <>Sign into the portal in another tab and retry; run a <b>cost sync</b> for asterisked SKUs; a fresh sync clears the ~6 h cache.</>],
  ['Date update failed mid-way', 'The save walks a multi-step admin form; an expired session or slow response stops the chain.', <>Re-open Order Dates and retry (safe to repeat); if it fails at step one, reload the order page so the iframe re-authenticates.</>],
  ['3D preview is black or blank', 'Almost always a graphics-driver quirk (known on Windows-on-ARM / Snapdragon), not missing artwork.', <>Update the extension; confirm hardware WebGL at <code>chrome://gpu</code>; close + reopen the modal to rebuild the 3D context.</>],
  ['My settings changed', 'An imported settings-link scope overwrote local values, or administrator policy applied a managed value.', <>Review the imported scopes and ask a RevStack administrator to review managed settings. Policy is reapplied independently after imports.</>],
];

export function TroubleshootingPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Reference</div>
      <h1 className="title">Troubleshooting</h1>
      <p className="lede">
        When something looks off, it’s usually one of a handful of known, benign causes — a toggle that’s off,
        a fallback that fired by design, or data the page simply doesn’t carry. Each case below is a
        <strong> symptom &rarr; cause &rarr; fix</strong> unit, with the real surface shown beside it. Start with the
        quick-reference table, then jump to the one that matches your screen.
      </p>

      <h2 className="sec">Quick reference</h2>
      <p>Every common issue at a glance. The detailed walkthroughs follow.</p>
      <table className="spectable">
        <thead><tr><th style={{ width: 230 }}>Symptom</th><th>Likely cause</th><th>Fix</th></tr></thead>
        <tbody>
          {TS_TABLE.map((r, i) => (
            <tr key={i}>
              <td><b>{r[0]}</b></td>
              <td>{r[1]}</td>
              <td>{r[2]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="sec">Walk through the common ones</h2>

      <TourBox n={1} eyebrow="Sending" title="“Send opened Outlook instead of sending”" live={<OutlookFixSnippet />} flip wide>
        <p>That isn’t a failure — it’s the <strong>fallback transport</strong>. When Power Automate is off (the default) or its flow URL is empty, every Send opens a pre-filled Outlook window, with formatting stripped and no signature.</p>
        <ul>
          <li><strong>Fix:</strong> Settings &rarr; enable Power Automate and paste your flow URL. Flip the switch in the snippet to see the row’s hint change.</li>
          <li><strong>Verify:</strong> send a test — it should go silently, signature attached.</li>
          <li><strong>Bulk warning:</strong> with the fallback active, a bulk send opens one Outlook window per recipient.</li>
        </ul>
      </TourBox>

      <TourBox n={2} eyebrow="Templates" title="“A variable shows as {{unresolved}}”" live={<UnresolvedSnippet />}>
        <p>An unresolved variable would leak its braces into the email. The popup highlights it <strong>red before you send</strong> — treat any highlight as a stop sign. Four causes:</p>
        <ul>
          <li><strong>Wrong page type</strong> — order variables resolve only on order pages, contact variables on contact pages.</li>
          <li><strong>Data genuinely missing</strong> — no phone on file means <code>{'{{phone}}'}</code> stays empty.</li>
          <li><strong>Page not finished loading</strong> — variables scrape the live page; let it render, then reopen the popup.</li>
          <li><strong>Code variable error</strong> — test the expression in the editor; a thrown error resolves to empty.</li>
        </ul>
        <p>For missing data, the snippet shows the two graceful rescues: an <strong>OR-block</strong> (<code>{'{{phone|email}}'}</code>) or a <strong>conditional</strong> drop.</p>
      </TourBox>

      <TourBox n={3} eyebrow="Order dates" title="“Date update failed mid-way”" live={<StepFailSnippet />} flip>
        <p>Saving order dates walks a multi-step form sequence on the admin site (load calendar &rarr; select approval &rarr; select commitment &rarr; submit). If a step fails — usually an expired admin session or a slow response — the <strong>progress toast names the failing step</strong> and the chain stops.</p>
        <ul>
          <li><strong>Retry:</strong> re-open the Order Date Manager and run it again — the chain restarts from the top and is safe to repeat.</li>
          <li><strong>Stuck at step one?</strong> Your admin.icustomize.com session likely expired — reload the order page so the iframe re-authenticates.</li>
          <li><strong>Verify:</strong> after a success toast, spot-check the dates on the order record the first few times.</li>
        </ul>
      </TourBox>

      <h2 className="sec">The rest, in brief</h2>
      <div className="cardgrid">
        <div className="featurecard">
          <span className="fc-ico"><I.card size={17} /></span>
          <span className="fc-t">Catalog looks stale</span>
          <span className="fc-d">A 24 h local index. Use the rebuild control, or shorten Developer Settings &rarr; re-index interval (0 = every open).</span>
        </div>
        <div className="featurecard">
          <span className="fc-ico"><I.eye size={17} /></span>
          <span className="fc-t">A modal or button is missing</span>
          <span className="fc-d">Feature toggle off, wrong page type, a page open since before an update, or you’re off the CRM. Reload after checking.</span>
        </div>
        <div className="featurecard">
          <span className="fc-ico"><I.calc size={17} /></span>
          <span className="fc-t">No cost in Margin Calc</span>
          <span className="fc-d">Sign into the office portal (gbcadmin) in another tab; run a cost sync for asterisked SKUs; refresh the ~6 h cache.</span>
        </div>
        <div className="featurecard">
          <span className="fc-ico"><I.cog size={17} /></span>
          <span className="fc-t">3D preview is black</span>
          <span className="fc-d">A driver quirk (Windows-on-ARM). Update the extension, confirm WebGL at chrome://gpu, reopen the modal.</span>
        </div>
      </div>

      <div className="docnote warn">
        <span className="dn-ico"><I.alert size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">A toggle is gone, not just off?</div>
          <p style={{ margin: 0 }}>If a switch you expect is <em>absent</em>, the authenticated server policy marked it hidden. A RevStack administrator can update the Golfballs configuration; the next valid sync applies it automatically.</p>
        </div>
      </div>

      <div className="docnote info">
        <span className="dn-ico"><I.check size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">No toast usually means success</div>
          <p style={{ margin: 0 }}>The extension only notifies on errors — silence means it worked. The exceptions are flows that show explicit progress (date saves, bulk sends). So before assuming a bug, check whether the operation actually completed.</p>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   FAQ
═══════════════════════════════════════════════════════════════════ */

const FAQ_GROUPS = [
  {
    label: 'Notifications & sending',
    items: [
      { q: 'Why don’t I see a confirmation when something succeeds?', a: 'Deliberate design: the extension only notifies on errors. No toast means it worked. The exceptions are flows that show explicit progress, like date saves and bulk sends.', link: ['#troubleshooting', 'Troubleshooting'] },
      { q: 'Why did Send open an Outlook window?', a: 'Power Automate is off (the default) or has no flow URL, so sending falls back to a pre-filled Outlook window.', link: ['#settings', 'How email sending works'] },
      { q: 'Did “reply with template” send my email?', a: 'Power Automate sends directly and reports the result. With Power Automate off, the extension opens a pre-filled Outlook window and you finish the send there.' },
    ],
  },
  {
    label: 'Your data & privacy',
    items: [
      { q: 'Does anyone else see my Watch List, templates, or settings?', a: 'Local data stays in your browser profile unless you explicitly create a settings link. The link stores only the scopes you select; Watch List and credentials are never included.' },
      { q: 'A toggle disappeared from my Settings — am I losing my mind?', a: 'No — the authenticated administrator policy can hide managed controls. Ask a RevStack administrator to review the Golfballs configuration.', link: ['#power-user', 'Managed settings'] },
      { q: 'Where do saved proposals live?', a: 'Both locally (your saved proposals list) and server-side as a real cart tied to the CRM opportunity — which is why you can reload one later or send the customer a live cart link.' },
    ],
  },
  {
    label: 'Tools & behavior',
    items: [
      { q: 'What’s the difference between the Watch List and Quick Tasks?', a: 'Watch List is your private local to-do list; nothing reaches the CRM. Quick Task creates a real CRM task attached to the contact, visible to the team.', link: ['#crm', 'CRM tools'] },
      { q: 'Are 3D previews accurate enough to send to customers?', a: 'Yes — decorations render through the same production services the website uses, and exports use a fixed pose so every shot frames identically.' },
      { q: 'Why does the Gift Catalog take a few seconds sometimes?', a: 'It’s re-indexing the full site catalog — happens when the local cache (24 h) expires. Subsequent opens are instant.' },
      { q: 'Will a workflow email people twice if I run it again?', a: 'A workflow processes the audience you select per run. Re-running on the same selection sends again — use saved queries to define audiences precisely, and dry-run first.' },
    ],
  },
];

function FaqItem({ q, a, link }) {
  return (
    <div style={{ padding: '16px 0', borderBottom: '1px solid var(--gb-border-subtle)' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ flexShrink: 0, marginTop: 1, color: 'var(--gb-brand-label)', fontFamily: 'var(--gb-font-mono)', fontWeight: 800, fontSize: 13 }}>Q</span>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--gb-text-primary)', lineHeight: 1.45 }}>{q}</div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 7 }}>
        <span style={{ flexShrink: 0, marginTop: 1, color: 'var(--gb-text-ghost)', fontFamily: 'var(--gb-font-mono)', fontWeight: 800, fontSize: 13 }}>A</span>
        <div style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--gb-text-tertiary)' }}>
          {a}
          {link && <> <a href={link[0]} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 4, whiteSpace: 'nowrap' }}>{link[1]} <I.chevr size={10} /></a></>}
        </div>
      </div>
    </div>
  );
}

export function FaqPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Reference</div>
      <h1 className="title">Frequently Asked Questions</h1>
      <p className="lede">
        Quick answers to the questions every new user asks — grouped by theme, with links to the full
        articles where there’s more to say. If your question is about something looking broken, the
        <a href="#troubleshooting"> Troubleshooting</a> page is the better start.
      </p>

      <div className="docnote info">
        <span className="dn-ico"><I.check size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">The two answers worth internalizing</div>
          <p style={{ margin: 0 }}><strong>Silence means success</strong> — the extension only toasts on errors. Most state is local; only scopes you deliberately place in a <strong>Shared Settings Template</strong> are stored by RevStack and available through its opaque URL.</p>
        </div>
      </div>

      {FAQ_GROUPS.map((g) => (
        <section key={g.label}>
          <h2 className="sec">{g.label}</h2>
          <div style={{ border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-lg)', background: 'var(--gb-surface-canvas)', padding: '2px 18px' }}>
            {g.items.map((it, i) => <FaqItem key={i} {...it} />)}
          </div>
        </section>
      ))}

      <div className="docnote brand" style={{ marginTop: 28 }}>
        <span className="dn-ico"><I.megaphone size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Running a workflow? Define the audience first</div>
          <p style={{ margin: 0 }}>Re-running a workflow on the same selection sends again — there’s no built-in dedupe across runs. Build the audience with a <a href="#crm">saved query</a>, verify it visually in the results, and dry-run before the real blast.</p>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   POWER USER
═══════════════════════════════════════════════════════════════════ */

/* Snippet: a code-variable editor with the h.* helper rail. */
const HELPER_RAIL = [
  { sig: 'h.dom / h.domAll / h.domText', d: 'Read the live page' },
  { sig: 'h.fetchText / h.fetchJson', d: 'GET via the background worker' },
  { sig: 'h.catalogSearch / h.catalogFind', d: 'Search the gift catalog' },
  { sig: 'h.fmt.currency / number / date', d: 'Format for the email' },
  { sig: 'h.coalesce / h.titleCase', d: 'First non-empty · Title Case' },
];

function CodeEditorSnippet() {
  const [hover, setHover] = useState(null);
  return (
    <MiniFrame width={460} label="editor · code variable" pad>
      <div style={{ background: 'var(--gb-surface-deep)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', padding: '10px 12px', fontFamily: 'var(--gb-font-mono)', fontSize: 11.5, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
        <div style={{ color: 'var(--gb-text-muted)' }}>{'// (ctx, vars, h) => string'}</div>
        <div><span style={{ color: 'var(--gb-error-fg)' }}>const</span> hit = <span style={{ color: 'var(--gb-warning-fg)' }}>await</span> h.<span style={{ color: 'var(--gb-brand-label)' }}>catalogFind</span>(<span style={{ color: 'var(--gb-success-fg)' }}>'pro v1'</span>);</div>
        <div><span style={{ color: 'var(--gb-error-fg)' }}>return</span> h.<span style={{ color: 'var(--gb-brand-label)' }}>titleCase</span>(hit?.title);</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '8px 0' }}>
        <Tag tone="warning" size="xs">ASYNC · awaits the background</Tag>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--gb-text-muted)' }}>cap 8,192 chars · 10 s timeout</span>
      </div>
      <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--gb-text-muted)', margin: '4px 0 6px' }}>h.* helper rail — hover</div>
      <div style={{ border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-surface-1)', padding: 5 }}>
        {HELPER_RAIL.map((r) => {
          const on = hover === r.sig;
          return (
            <div key={r.sig} onMouseEnter={() => setHover(r.sig)} onMouseLeave={() => setHover(null)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 7px', borderRadius: 'var(--gb-r-sm)', background: on ? 'var(--gb-brand-tint-soft)' : 'transparent', cursor: 'default' }}>
              <I.code size={11} style={{ color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-ghost)' }} />
              <span style={{ flex: 1, fontFamily: 'var(--gb-font-mono)', fontSize: 10.5, color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)' }}>{r.sig}</span>
              <span style={{ fontSize: 10, color: 'var(--gb-text-muted)' }}>{r.d}</span>
            </div>
          );
        })}
      </div>
    </MiniFrame>
  );
}

const PU_FLAG_ROWS = [
  ['Feature flags', 'featureFlags', 'On/off for every tool — the Features list in Settings. Off = the tool vanishes everywhere.'],
  ['Developer Settings', 'devSettings', `${DEV_SETTINGS.length} low-level knobs in this build: animation timing, per-modal draggable mode, margin threshold, catalog re-index interval, 3D viewer tuning.`],
  ['Remote policy', 'gbRemoteSettingsPolicy', 'Last validated revision, visibility maps, and administrator-bypass state. Policy does not travel in presets.'],
];

const PU_STORAGE_ROWS = [
  ['gbProposalDebugLog', 'Bounded, opt-in proposal trace; cleared when proposal debugging is disabled'],
  ['devSettings / featureFlags / gbRemoteSettingsPolicy', 'Local values plus the last validated administrator policy metadata'],
  ['gbGiftCatalogCache_v5 / gbInventoryCache / gbCostMap', 'Data caches (catalog, inventory, costs) — safe to delete, they rebuild'],
];

export function PowerUserPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Reference</div>
      <h1 className="title">Power User Corner</h1>
      <p className="lede">
        The deepest reference in the guide. Sandboxed JavaScript variables and the <code>h.*</code> helper API,
        the authenticated administrator policy that manages settings, the full feature-flag / dev-setting
        map, and where the extension keeps its state. <strong>Advanced</strong>, but every
        piece is documented exactly as shipped.
      </p>

      <h2 className="sec">Code variables &amp; the h.* API</h2>
      <p>
        When a built-in field isn’t enough, a <strong>code variable</strong> runs JavaScript in a guarded sandbox.
        Your function receives three arguments and must return a string: <code>ctx</code> (the extracted page data),
        <code>vars</code> (previously-resolved variables, so later code builds on earlier values), and <code>h</code>
        (the helper namespace). Hover the helper rail in the snippet.
      </p>

      <TourBox n={1} eyebrow="Sandboxed JS" title="Author it in a real editor" live={<CodeEditorSnippet />} flip wide>
        <p>The editor has syntax highlighting and helper autocomplete. <strong>Async is automatic</strong> — write <code>await</code> and the variable runs on the async path with a 10-second timeout.</p>
        <p>The sandbox blocks <code>fetch(</code>, <code>chrome.</code>, <code>eval(</code>, <code>import(</code>, <code>Function(</code>, timers, <code>Worker</code>, <code>XMLHttpRequest</code>, and infinite-loop shapes like <code>while(true)</code> — use the <code>h.*</code> equivalents. Bodies cap at <strong>8,192 characters</strong>; an erroring variable resolves to empty (the error surfaces in the table).</p>
      </TourBox>

      <h3 className="sub">The <code>h</code> helper namespace</h3>
      <table className="spectable">
        <thead><tr><th>Helper</th><th>Does</th></tr></thead>
        <tbody>
          <tr><td><code>h.dom(sel) / h.domAll(sel) / h.domText(sel)</code></td><td>Query the live page: first element, all elements, or the first match’s text</td></tr>
          <tr><td><code>h.fetchText(url) / h.fetchJson(url)</code></td><td>Fetch a page or JSON through the background worker (CORS-safe, allow-listed hosts)</td></tr>
          <tr><td><code>h.fetchText(url)</code></td><td>Read an allowlisted HTTPS resource</td></tr>
          <tr><td><code>h.catalogSearch(q, {'{limit}'}) / h.catalogFind(q)</code></td><td>Search the gift catalog by name similarity — top matches, or the single best one</td></tr>
          <tr><td><code>h.fmt.currency / h.fmt.number / h.fmt.date</code></td><td>Format values for the email ($1,234.00 · 1,234 · MM/DD/YYYY)</td></tr>
          <tr><td><code>h.parseNumber / h.parseDate / h.normalizePhone</code></td><td>Extract a number, parse a date, format a phone as (###) ###-####</td></tr>
          <tr><td><code>h.coalesce(...vals) / h.titleCase(s)</code></td><td>First non-empty value · Title Case</td></tr>
        </tbody>
      </table>

      <div className="docnote warn">
        <span className="dn-ico"><I.alert size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Code runs per-contact in workflows</div>
          <p style={{ margin: 0 }}>A code variable runs once for every contact in a bulk send or workflow audience. An expression that fetches pages adds those seconds <em>per recipient</em> — keep them lean, and prefer Schema variables when a plain field will do.</p>
        </div>
      </div>

      <h3 className="sub">Prebuilt recipes</h3>
      <table className="spectable">
        <thead><tr><th>Recipe</th><th>What it computes</th></tr></thead>
        <tbody>
          <tr><td><b>Out-of-stock items</b></td><td>Scans the order page for items flagged OOS — fully self-contained, sync</td></tr>
          <tr><td><b>Recommended replacement</b></td><td>For each OOS item, fetches the brand’s catalog and scores candidates by name / price / decoration to suggest the closest in-stock match (async)</td></tr>
        </tbody>
      </table>

      <h2 className="sec">Managed settings &amp; feature flags</h2>
      <p>The installation-authenticated policy drives managed values and visibility. Local feature and developer values remain in <code>chrome.storage.local</code>; policy metadata never travels in presets.</p>
      <table className="spectable">
        <thead><tr><th style={{ width: 200 }}>Map</th><th style={{ width: 150 }}>Storage key</th><th>What it holds</th></tr></thead>
        <tbody>{PU_FLAG_ROWS.map((r) => <tr key={r[1]}><td><b>{r[0]}</b></td><td><code>{r[1]}</code></td><td>{r[2]}</td></tr>)}</tbody>
      </table>

      <h2 className="sec">Debug storage keys</h2>
      <p>
        All state lives in <code>chrome.storage.local</code> — inspect it from the service-worker console with
        <code> chrome.storage.local.get(null)</code>. The keys worth knowing when you’re chasing a problem:
      </p>
      <table className="spectable">
        <thead><tr><th style={{ width: 280 }}>Key</th><th>Holds</th></tr></thead>
        <tbody>{PU_STORAGE_ROWS.map((r) => <tr key={r[0]}><td><code>{r[0]}</code></td><td>{r[1]}</td></tr>)}</tbody>
      </table>
      <p>Contact-search speed comes from the worker-owned encrypted IndexedDB database <code>gb-crm-index-secure</code>. Names remain searchable; full rows decrypt only for ranked visible results using locally generated, non-extractable keys.</p>

      <div className="docnote warn">
        <span className="dn-ico"><I.alert size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Safe to delete vs. not</div>
          <p style={{ margin: 0 }}>Deleting <strong>cache</strong> keys is safe — they rebuild. Deleting <code>templates</code>, <code>featureFlags</code>, or <code>devSettings</code> is <strong>not</strong> — create a private settings link with the scopes you need before experimenting.</p>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   WHAT'S NEW
═══════════════════════════════════════════════════════════════════ */

const RELEASES = [
  {
    version: '3.3 (July)',
    tag: 'Latest',
    date: 'Jul 21',
    summary: 'Complete searchable reference coverage, guided workflows, installation notifications, and clearer preview boundaries.',
    highlights: [
      { icon: 'bookmark', text: 'Full Reference now exposes every authored help article at an exact deep link; guide search also includes tutorials and settings.', link: ['#manual', 'Full Reference'] },
      { icon: 'play', text: 'Guided Workflows turns the existing tutorials into optional-progress checklists that remain useful as refresher sheets.', link: ['#workflows', 'Guided Workflows'] },
      { icon: 'alert', text: 'Notifications now has delivery, receipt, offline-storage, and safe-action documentation.', link: ['#notifications', 'Notifications'] },
      { icon: 'card', text: 'Proposal Checkout is now explicitly labeled as a non-operational preview until a real order backend is implemented.', link: ['#manual/proposal-checkout-preview', 'Checkout preview'] },
    ],
  },
  {
    version: '3.3.7',
    date: 'Jun 13–15',
    summary: 'The Operator’s Guide goes live, plus template-variation naming and proposal polish.',
    highlights: [
      { icon: 'bolt', text: 'Operator’s Guide: hand-built feature walkthroughs joined the extension, with interactive sample-data screens and a searchable manual.', link: ['#start', 'Getting Started'] },
      { icon: 'edit', text: 'Template editor: the initial email becomes a named “Variation 1” block; rename variations inline and the custom names are honored in the picker, runner, and workflows.', link: ['#templates', 'Email Templates'] },
      { icon: 'mail', text: 'The Classic proposal email now matches the website-generated layout exactly.' },
      { icon: 'card', text: 'Proposal reliability: free-quantity promo lines no longer drop from saved proposals, and carts no longer come back empty under concurrent load.' },
      { icon: 'search', text: 'New Proposal Debug tool: intercept and compare proposal and email submits in a draggable panel.', link: ['#power', 'Power User'] },
    ],
  },
  {
    version: '3.3.6',
    date: 'Jun 10–12',
    summary: 'Checkout autocomplete, richer templates, and one-click catalog logos.',
    highlights: [
      { icon: 'edit', text: 'Checkout: US address autocomplete wired through golfballs’ own address feed (no key setup), an order-summary rail that fills its pane, and personalization wired straight into the imprint list.' },
      { icon: 'mail', text: 'Templates: attachment variables, grouped account-condition import, an assisted template importer, and a full Srixon template set.', link: ['#templates', 'Email Templates'] },
      { icon: 'gift', text: 'Gift Catalog: items default to custom-logo, and you can drag one logo onto every blank line at once.', link: ['#catalog', 'Gift Catalog'] },
      { icon: 'calc', text: 'Margin: recognizes Buy-N-Dozen-Get-M-Free multipacks and prices them off the single dozen’s cost.', link: ['#margin', 'Margin Calculator'] },
      { icon: 'megaphone', text: 'Quick Send: a scrollable template dropdown plus skip rules for do-not-contact and recently-emailed contacts.', link: ['#quicksend', 'Quick Send'] },
    ],
  },
  {
    version: '3.3.5',
    date: 'Jun 9',
    summary: 'Server-side tracked proposals and real promo codes.',
    highlights: [
      { icon: 'send', text: 'Proposals are now tracked server-side exactly like web quotes — sending creates the proposal email record, registers tracking, and updates the opportunity value.', link: ['#proposals', 'Proposals & Quotes'] },
      { icon: 'card', text: 'Promo codes: apply real promotions to proposals, including free-quantity promos with genuine free-item lines; the picker only offers codes that apply to your cart.' },
      { icon: 'users', text: 'Current Proposals sidebar: see a contact’s existing proposals live from the CRM — open the breakdown, load one back into the builder, or re-email it.' },
      { icon: 'calc', text: 'Costs & inventory: bulk cost sync, auto-loading costs in breakdowns, editable per-split prices, and real-cost labels.' },
      { icon: 'mail', text: 'Proposal emails are now Outlook-desktop safe — solid colors, no dropped styling.' },
    ],
  },
  {
    version: '3.3.4',
    date: 'Jun 6–8',
    summary: 'Gift Catalog, rep-defined Custom Items, and 3D gift sets.',
    highlights: [
      { icon: 'gift', text: 'Gift Catalog: search the whole site, save proposals to a CRM account or opportunity, and compose the email inline from the margin panel.', link: ['#catalog', 'Gift Catalog'] },
      { icon: 'cube', text: 'Custom Items: build rep-defined items and import full supplier catalogs (HPG, SnugZ) with real per-quantity cost ladders.' },
      { icon: 'eye', text: 'Gift sets render in 3D as an assembled box — real foam recesses, tool slots, and chrome ball markers.', link: ['#viewer-3d', '3D Product Viewer'] },
      { icon: 'sparkle', text: 'Proposal emails gain an imprint-proof preview system: 3D personalization previews, monograms, and per-pole imprint detail under each line.' },
      { icon: 'sun', text: 'New Slate theme (Atom One Dark) joins Dark, Light, and Cream.', link: ['#themes', 'Themes & UI Scale'] },
    ],
  },
  {
    version: '3.4.0',
    date: 'May 31 – Jun 1',
    summary: 'A live-config product customizer and cross-platform 3D.',
    highlights: [
      { icon: 'gift', text: 'The product customizer is now driven by each product’s live configuration — real option controls, correct decoration tabs, and accurate print-type gating.' },
      { icon: 'cube', text: 'Dual-pole imprint: a full personalized second imprint with a compact hue/shade color picker, gated by the product’s tags.', link: ['#viewer-3d', '3D Product Viewer'] },
      { icon: 'eye', text: 'The golf-ball logo now renders correctly on Windows / ARM (Adreno) machines — fixing the invisible or black decal.', link: ['#troubleshooting', 'Troubleshooting'] },
      { icon: 'mail', text: 'Image Viewer streams the raw express upload in instantly instead of showing a frozen spinner.', link: ['#viewer-image', 'Image Viewer'] },
    ],
  },
  {
    version: '3.3.2',
    date: 'May 28–29',
    summary: 'A schema-driven CRM engine and native React modals.',
    highlights: [
      { icon: 'filter', text: 'Unified CRM schema with per-page extractors; a schema-driven picker now drives every template variable.', link: ['#templates', 'Email Templates'] },
      { icon: 'send', text: 'Power Automate: predicate diagnostics and strict type checks make send conditions reliable.' },
      { icon: 'megaphone', text: 'Email Runner: a weighted variation picker with sliders for bulk sends.' },
      { icon: 'mail', text: 'Email/Chat preview, the Order Date Manager, and the Query Builder are all rebuilt as native React modals.', link: ['#viewer-email', 'Email / Chat Viewer'] },
    ],
  },
  {
    version: '3.3.1',
    date: 'May 26–27',
    summary: 'The Actions Shelf, instant CRM search, and bulk email.',
    highlights: [
      { icon: 'bolt', text: 'Actions Shelf: double-tap Shift for context-aware quick actions per page — Copy Order IDs, Open Image Viewer, Run last query, log a call, and more.', link: ['#start', 'Getting Started'] },
      { icon: 'search', text: 'CRM Search: a local index for instant typeahead, infinite scroll, and relevance-first ranking.', link: ['#crm-search', 'CRM Search'] },
      { icon: 'check', text: 'Keyboard-first navigation across Quick Task, Call Log, and Task List, with a marching-ants focus ring.', link: ['#shortcuts', 'Keyboard Shortcuts'] },
      { icon: 'megaphone', text: 'Email Runner: background bulk send with weighted template variations in a draggable panel.', link: ['#quicksend', 'Quick Send'] },
      { icon: 'sun', text: 'Per-surface UI scale sliders that persist across sessions.', link: ['#themes', 'Themes & UI Scale'] },
    ],
  },
  {
    version: '3.3.0',
    date: 'May 22',
    summary: 'The first release of the React-rebuilt Golfballs.com rep extension.',
    highlights: [
      { icon: 'sparkle', text: 'Initial release — the popup, email templates, and the design-system foundation everything since has been built on.' },
    ],
  },
];

function TimelineNode({ rel, last }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr', columnGap: 16 }}>
      {/* rail + dot */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, fontFamily: 'var(--gb-font-mono)' }}>
          <I.sparkle size={16} />
        </div>
        {!last && <div style={{ flex: 1, width: 2, background: 'var(--gb-border-default)', marginTop: 6 }} />}
      </div>
      {/* card */}
      <div style={{ paddingBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <h2 className="sec" style={{ margin: 0, fontSize: 22 }}>Version {rel.version}</h2>
          {rel.tag && <Tag tone="brand" size="sm">{rel.tag}</Tag>}
          {rel.date && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)', whiteSpace: 'nowrap' }}>{rel.date}</span>}
        </div>
        <p style={{ marginTop: 0, marginBottom: 14, color: 'var(--gb-text-tertiary)' }}>{rel.summary}</p>
        <div style={{ border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-lg)', background: 'var(--gb-surface-canvas)', overflow: 'hidden' }}>
          {rel.highlights.map((h, i) => {
            const Ico = I[h.icon] || I.bolt;
            return (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '13px 16px', borderBottom: i < rel.highlights.length - 1 ? '1px solid var(--gb-border-subtle)' : 'none' }}>
                <span style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico size={14} /></span>
                <div style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--gb-text-tertiary)' }}>
                  {h.text}
                  {h.link && <> <a href={h.link[0]} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>{h.link[1]} <I.chevr size={10} /></a></>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function WhatsNewPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Reference</div>
      <h1 className="title">What’s New</h1>
      <p className="lede">
        The complete history since launch, newest first — minor fixes are omitted. Each line links to the
        full article where there’s more to learn.
      </p>

      <div style={{ marginTop: 28 }}>
        {RELEASES.map((rel, i) => (
          <TimelineNode key={rel.version} rel={rel} last={i === RELEASES.length - 1} />
        ))}
      </div>

      <div className="docnote brand">
        <span className="dn-ico"><I.megaphone size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">New here? Start with the live guide</div>
          <p style={{ margin: 0 }}>Use the hand-built pages for visual walkthroughs, <a href="#workflows">Guided Workflows</a> for end-to-end tasks, and <a href="#manual">Full Reference</a> when you need one exact setting or control.</p>
        </div>
      </div>
    </div>
  );
}
