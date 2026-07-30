import React, { useState } from 'react';
import { I, Tag, Dot, Btn, Input, Field, Switch, PillTag, TemplatePicker, RangeSlider } from '../../ui/index.js';
import { TourBox, MiniFrame } from '../lib/tourbox.jsx';
import { LiveStage } from '../lib/stage.jsx';

/* ───────────────────────────────────────────────────────────────
   workflows.jsx — the Workflows section of the Operator's Guide.

   Two hand-built, visually-faithful pages:
     • QuickSendPage   — the Quick Send / Bulk Email runner. Leads
       with a LiveStage walkthrough (Tour / Play / Try) over a scaled
       Quick Send setup view, then deep TourBox sections rebuilding
       each phase's controls.
     • WorkflowManagerPage — the Workflow Manager. Faithful MiniFrame
       reproductions of the step timeline, the step inspector, the
       conditions builder, and the live audience run view (the real
       WorkflowManager carries heavy state, so we reproduce it here).

   Copy is rewritten from the verified help articles
   (bulk-email-selection, workflow-manager, workflow-conditions);
   visuals trace EmailRunner.jsx + WorkflowManager.jsx tokens.
─────────────────────────────────────────────────────────────── */

/* shared tokens lifted from the real modals so the snippets match. */
const STEP_META = {
  email: { label: 'Email', icon: I.mail, bg: 'var(--gb-brand-tint-medium)', fg: 'var(--gb-brand-label)' },
  call: { label: 'Call', icon: I.phone, bg: 'var(--gb-info-tint-medium, var(--gb-fill-subtle))', fg: 'var(--gb-info-fg, var(--gb-text-secondary))' },
  task: { label: 'Task', icon: I.task, bg: 'var(--gb-info-tint-medium, var(--gb-fill-subtle))', fg: 'var(--gb-info-fg, var(--gb-text-secondary))' },
  custom: { label: 'Custom', icon: I.code, bg: 'var(--gb-fill-strong)', fg: 'var(--gb-text-primary)' },
};

/* ════════════════════════════════════════════════════════════════
   QUICK SEND  (Bulk Email)
════════════════════════════════════════════════════════════════ */

/* ── Setup phase: the template picker + variation split ── */
const SETUP_TPLS = [
  { id: 't_winback', name: 'Win-back Check-in', type: 'account', variations: [{ id: 'a', preview: 'Warmer' }, { id: 'b', preview: 'Brief' }] },
];
function SetupSnippet() {
  const [tpl, setTpl] = useState('t_winback');
  const [delay, setDelay] = useState([15, 45]);
  return (
    <MiniFrame width={360} label="quick send · setup" pad>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Template" hint="Each contact gets a weighted random pick · 1 of 3 variations">
          <TemplatePicker mode="random" templates={SETUP_TPLS} value={tpl} onChange={setTpl} placeholder="Pick a template" floating={false} listMaxHeight={2000} />
        </Field>
        <Field label="Delay between sends" hint="15s–45s, random per contact — keeps the blast looking human.">
          <RangeSlider values={delay} min={5} max={80} step={5} unit="s" onChange={setDelay} />
        </Field>
        <Btn full variant="primary" size="md" icon={<I.send />} onClick={() => {}}>Run · 3</Btn>
      </div>
    </MiniFrame>
  );
}

/* ── A faithful skip-rules card (verbatim shape from EmailRunner) ── */
function SkipRow({ on, setOn, title, desc, trailing }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 'var(--gb-r-md)', border: '1px solid ' + (on ? 'var(--gb-warning-tint-border)' : 'var(--gb-border-subtle)'), background: on ? 'var(--gb-warning-tint-soft)' : 'var(--gb-surface-1)', transition: 'background .2s, border-color .2s' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{title}</div>
        <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'var(--gb-text-muted)', marginTop: 2 }}>{desc}</div>
      </div>
      {on && trailing}
      <Switch on={on} onChange={setOn} size="sm" tone="warning" />
    </div>
  );
}
function SkipSnippet() {
  const [dnc, setDnc] = useState(true);
  const [recent, setRecent] = useState(true);
  return (
    <MiniFrame width={360} label="quick send · skip rules" pad>
      <Field label="Skip rules" hint="Matching contacts are quietly skipped — not emailed — and counted as skipped.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SkipRow on={dnc} setOn={setDnc} title="Do-not-contact" desc={'Skip when the first name, last name, or email contains “do not contact”.'} />
          <SkipRow on={recent} setOn={setRecent} title="Recently emailed" desc="Skip when the contact's last email (from their CRM history) is within the window."
            trailing={<div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Input size="sm" value="30" onChange={() => {}} style={{ width: 52, textAlign: 'center' }} /><span style={{ fontSize: 11, fontWeight: 600, color: 'var(--gb-text-tertiary)' }}>days</span></div>} />
        </div>
      </Field>
    </MiniFrame>
  );
}

/* ── Running phase: the "Now sending" card + count chips ── */
function CountChip({ tone, value, label }) {
  const tones = {
    success: { bg: 'var(--gb-success-tint-medium)', fg: 'var(--gb-success-fg)' },
    neutral: { bg: 'var(--gb-fill-subtle)', fg: 'var(--gb-text-tertiary)' },
    warning: { bg: 'var(--gb-warning-tint-medium)', fg: 'var(--gb-warning-fg)' },
    error: { bg: 'var(--gb-error-tint-medium)', fg: 'var(--gb-error-fg)' },
  }[tone] || { bg: 'var(--gb-fill-subtle)', fg: 'var(--gb-text-tertiary)' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999, background: tones.bg, color: tones.fg, fontSize: 10, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', fontFamily: 'var(--gb-font-mono)' }}>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>{label}
    </span>
  );
}
function RunningSnippet() {
  const [mode, setMode] = useState('sending'); // sending | pacing
  return (
    <MiniFrame width={360} label="quick send · running" pad>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        <Btn size="xs" variant={mode === 'sending' ? 'tinted' : 'ghost'} status="brand" onClick={() => setMode('sending')}>Now sending</Btn>
        <Btn size="xs" variant={mode === 'pacing' ? 'tinted' : 'ghost'} status="brand" onClick={() => setMode('pacing')}>Pacing</Btn>
      </div>
      {mode === 'sending' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)' }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, color: 'var(--gb-brand-label)', background: 'var(--gb-brand-tint-medium)', flexShrink: 0 }}>MC</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--gb-brand-label)' }}>Now sending</div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--gb-text-primary)', marginTop: 2 }}>Marcus Chen</div>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>marcus@acme.co</div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-subtle)' }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'var(--gb-text-tertiary)', background: 'var(--gb-fill-subtle)', flexShrink: 0 }}><I.refresh size={15} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Pacing</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--gb-text-secondary)', marginTop: 2 }}>Next send in 18.4s</div>
            <div style={{ height: 3, borderRadius: 999, background: 'var(--gb-surface-3)', marginTop: 7, overflow: 'hidden' }}><div style={{ height: '100%', width: '58%', background: 'var(--gb-text-muted)', borderRadius: 999 }} /></div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
        <CountChip tone="success" value={7} label="sent" />
        <CountChip tone="neutral" value={5} label="queued" />
        <CountChip tone="warning" value={1} label="skip" />
        <CountChip tone="error" value={1} label="fail" />
      </div>
    </MiniFrame>
  );
}

/* ── Done phase: stat tiles + timeline bars ── */
function DoneStatTile({ value, label, tone }) {
  const fg = { success: 'var(--gb-success)', error: 'var(--gb-error)', warning: 'var(--gb-warning-fg)', brand: 'var(--gb-brand-label)', neutral: 'var(--gb-text-primary)' }[tone] || 'var(--gb-text-primary)';
  return (
    <div style={{ flex: 1, minWidth: 0, padding: '11px 8px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-subtle)' }}>
      <div style={{ fontSize: 19, fontWeight: 800, color: fg, fontFamily: 'var(--gb-font-mono)', lineHeight: 1, letterSpacing: -0.5, whiteSpace: 'nowrap' }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: 'var(--gb-text-muted)', marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
    </div>
  );
}
function DoneSnippet() {
  const bars = ['sent', 'sent', 'fail', 'sent', 'skip', 'sent', 'sent', 'sent'];
  const h = { sent: '100%', skip: '70%', fail: '46%' };
  const c = { sent: 'var(--gb-success)', skip: 'var(--gb-warning-fg)', fail: 'var(--gb-error)' };
  return (
    <MiniFrame width={380} label="quick send · done" pad>
      <div style={{ textAlign: 'center', marginBottom: 13 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gb-text-primary)', letterSpacing: -0.3 }}>Run complete</div>
        <div style={{ fontSize: 12, color: 'var(--gb-text-tertiary)', marginTop: 3 }}>6 messages delivered · 1 skipped · 1 need a retry</div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <DoneStatTile value={6} label="Sent" tone="success" />
        <DoneStatTile value={1} label="Skipped" tone="warning" />
        <DoneStatTile value={1} label="Failed" tone="error" />
        <DoneStatTile value="86%" label="Success" tone="neutral" />
        <DoneStatTile value="2:14" label="Elapsed" tone="brand" />
      </div>
      <div style={{ marginTop: 13, padding: 12, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-subtle)' }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--gb-text-muted)', marginBottom: 9 }}>Send timeline</div>
        <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 30 }}>
          {bars.map((s, i) => <div key={i} style={{ flex: 1, borderRadius: 2, height: h[s], background: c[s], opacity: 0.85 }} title={`contact ${i + 1} · ${s}`} />)}
        </div>
      </div>
    </MiniFrame>
  );
}

const QS_PHASES = [
  ['Setup', "“N contacts selected.” Pick a template, weight its variations, set the delay range and skip rules, then hit Run · N."],
  ['Running', 'The ring fills to a live %. A “Now sending” card names the current contact; between sends a “Pacing — next send in X.Xs” card takes over. Chips count sent / queued / skip / fail.'],
  ['Done', 'A checkmark burst, then stat tiles (Sent, Skipped, Failed, Success %, Elapsed) and a per-contact timeline bar chart. Close or Send again.'],
];

/* Scaled Quick Send "Setup" view for the LiveStage walkthrough, with data-demo
   targets on each control. */
function QsWalkSnippet() {
  const [tpl, setTpl] = useState('t_winback');
  const [delay, setDelay] = useState([15, 45]);
  const [dnc, setDnc] = useState(false);
  const [recent, setRecent] = useState(true);
  return (
    <div style={{ width: 380, maxWidth: '100%', background: 'var(--gb-surface-modal)', borderRadius: 'inherit', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--gb-border-subtle)' }}>
        <span style={{ width: 22, height: 22, borderRadius: 'var(--gb-r-sm)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><I.megaphone size={12} /></span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Quick Send</span>
        <Tag size="xs" tone="brand">3 contacts</Tag>
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 13 }}>
        <div data-demo="qs-template">
          <Field label="Template" hint="Each contact gets a weighted-random pick · 1 of 3 variations">
            <TemplatePicker mode="random" templates={SETUP_TPLS} value={tpl} onChange={setTpl} placeholder="Pick a template" floating={false} listMaxHeight={2000} />
          </Field>
        </div>
        <div data-demo="qs-delay">
          <Field label="Delay between sends" hint="random per contact — keeps a blast looking human">
            <RangeSlider values={delay} min={5} max={80} step={5} unit="s" onChange={setDelay} />
          </Field>
        </div>
        <div data-demo="qs-skip" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gb-text-muted)' }}>Skip rules</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 'var(--gb-r-sm)', border: '1px solid ' + (dnc ? 'var(--gb-warning-tint-border)' : 'var(--gb-border-subtle)'), background: dnc ? 'var(--gb-warning-tint-soft)' : 'var(--gb-surface-1)' }}>
            <Switch on={dnc} size="sm" onChange={setDnc} /><span style={{ flex: 1, fontSize: 11, color: 'var(--gb-text-secondary)' }}>Do-not-contact</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 'var(--gb-r-sm)', border: '1px solid ' + (recent ? 'var(--gb-warning-tint-border)' : 'var(--gb-border-subtle)'), background: recent ? 'var(--gb-warning-tint-soft)' : 'var(--gb-surface-1)' }}>
            <Switch on={recent} size="sm" onChange={setRecent} /><span style={{ flex: 1, fontSize: 11, color: 'var(--gb-text-secondary)' }}>Recently emailed</span>
            {recent && <span style={{ fontSize: 10, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)' }}>≤ 14 days</span>}
          </div>
        </div>
        <div data-demo="qs-run"><Btn full variant="primary" size="md" icon={<I.send />} onClick={() => {}}>Run · 3</Btn></div>
      </div>
    </div>
  );
}
const QS_CALLOUTS = [
  { n: 1, target: 'qs-template', title: 'Template', text: 'The single email everyone gets. With variations, weight sliders appear (always summing to 100%); each contact rolls one, weighted.' },
  { n: 2, target: 'qs-delay', title: 'Delay between sends', text: 'A two-handle range (5–80s). Each send waits a random time inside it, so the blast looks human.' },
  { n: 3, target: 'qs-skip', title: 'Skip rules', text: 'Quietly leave people out without removing them: skip do-not-contact names, or anyone emailed within the day window. Matches count as skipped, not sent.' },
  { n: 4, target: 'qs-run', title: 'Run', text: 'Opens each contact in a background tab, resolves the template’s variables against THAT contact, sends, and closes the tab — then the progress ring takes over.' },
];
const QS_STEPS = [
  { target: 'qs-template', caption: 'Pick the one template everyone gets — with variations, weight sliders appear (sum 100%).', hold: 2600 },
  { target: 'qs-delay', caption: 'Set a random delay range between sends so the blast looks human, not robotic.', hold: 2400 },
  { target: 'qs-skip', caption: 'Optionally skip do-not-contact names or recently-emailed contacts — counted as skipped.', hold: 2600 },
  { target: 'qs-run', caption: 'Press Run — each contact opens in a background tab, personalizes, sends, and closes.', hold: 2400 },
];

export function QuickSendPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Workflows</div>
      <h1 className="title">Quick Send (Bulk Email)</h1>
      <p className="lede">
        Tick rows in <a href="#tasks">Task List</a> or <a href="#crm">CRM Search</a> and the selection bar
        offers <strong>Email selected</strong> — that opens <strong>Quick Send</strong>, a one-template blast
        with a big progress ring and three phases. Walk through the setup below — hover the numbered pins (Tour),
        press Play, or switch to Try it — then read each phase in depth.
      </p>

      <LiveStage
        width={380}
        frameKind="modal"
        frameLabel="bulk · quick send"
        render={() => <QsWalkSnippet />}
        callouts={QS_CALLOUTS}
        steps={QS_STEPS}
        note="The Quick Send setup — pick the template, pacing, and skip rules, then Run kicks off the progress ring."
      />

      <h2 className="sec">The three phases, control by control</h2>
      <p>Each block pairs a faithful piece of the runner with what it does. The snippets are live.</p>

      <TourBox n={1} eyebrow="Phase 1 · Setup" title="Template, variations & pacing" live={<SetupSnippet />} flip>
        <p>The header reads <strong>“N contacts selected.”</strong> Then:</p>
        <ul>
          <li><strong>Template</strong> — the single email everyone receives. The picker is the same one as the popup: a template with variations expands to show <em>(original)</em> plus each saved variation.</li>
          <li><strong>Variation weights</strong> — when the chosen template <em>has</em> variations, weight sliders appear (they always sum to <strong>100%</strong>). Each contact rolls one variation, weighted by these — so a 70/30 split sends roughly 70% the warmer copy.</li>
          <li><strong>Delay between sends</strong> — a two-handle range (5–80s). Each send waits a <strong>random</strong> time inside the range, “so the blast looks human.”</li>
        </ul>
        <p>Set it, then press <strong>Run · N</strong> to start.</p>
      </TourBox>

      <TourBox stack eyebrow="Phase 1 · Setup" title="Skip rules — quietly leave contacts out" live={<SkipSnippet />}>
        <p>Two switches let you exclude contacts without removing them from the list — matches are counted as <strong>skipped</strong>, not sent:</p>
        <ul>
          <li><strong>Do-not-contact</strong> — skips anyone whose first name, last name, or email contains the phrase “do not contact”.</li>
          <li><strong>Recently emailed</strong> — skips a contact whose last email (from their CRM email history) is inside the day window you set. Turn it on and a <strong>days</strong> field appears.</li>
        </ul>
        <p>Both tint amber when active, your reminder that they <em>quietly</em> drop people from the run.</p>
      </TourBox>

      <TourBox n={2} eyebrow="Phase 2 · Running" title="The ring, the “now sending” card & the chips" live={<RunningSnippet />} flip>
        <p>Once running, the ring around the count fills to a live <strong>%</strong> and shows <code>sent / total</code> underneath. Toggle the snippet between the two states that share the card slot:</p>
        <ul>
          <li><strong>Now sending</strong> — a brand-tinted card with the current contact's initials, name, and resolved email, plus a small spinner.</li>
          <li><strong>Pacing</strong> — between sends the card flips to a neutral countdown, <strong>“Next send in X.Xs,”</strong> with a draining bar — that's the random delay you set ticking down.</li>
        </ul>
        <p>Below sit the count chips — <strong>sent</strong> (green), <strong>queued</strong> (grey), and <strong>skip</strong> / <strong>fail</strong> when any occur — and a short trail of the last few results. <strong>Cancel run</strong> stops cleanly after the current send.</p>
      </TourBox>

      <TourBox n={3} eyebrow="Phase 3 · Done" title="The summary & timeline" live={<DoneSnippet />} wide>
        <p>When the last send lands, a checkmark bursts and the panel reports <strong>“All sent”</strong> (or “Run complete” with a failure tally). Then:</p>
        <ul>
          <li><strong>Stat tiles</strong> — Sent, Skipped, Failed (only when nonzero), <strong>Success %</strong>, and <strong>Elapsed</strong>.</li>
          <li><strong>Send timeline</strong> — one bar per contact: a tall green bar is a send, a medium amber bar a skip, a short red bar a failure. Hover a bar for the name.</li>
        </ul>
        <p><strong>Close</strong> the panel, or <strong>Send again</strong> to re-run the same blast.</p>
      </TourBox>

      <h2 className="sec">The three phases at a glance</h2>
      <table className="spectable">
        <thead><tr><th>Phase</th><th>What you see / do</th></tr></thead>
        <tbody>{QS_PHASES.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td></tr>)}</tbody>
      </table>

      <div className="docnote info">
        <span className="dn-ico"><I.send size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Every email is genuinely personalized</div>
          <p style={{ margin: 0 }}>Under the hood each contact's page opens in a <strong>background tab</strong>, the template's variables resolve against <em>that contact's</em> real data, the email sends, and the tab closes — so recipients get personalized content, not mail-merge blanks. The same runner powers <a href="#tasks">Task List</a>'s Email selected.</p>
        </div>
      </div>

      <div className="docnote warn">
        <span className="dn-ico"><I.alert size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Keep Chrome open — and turn Power Automate on first</div>
          <p style={{ margin: 0 }}>Leave the tab open until the ring completes. With <strong>Power Automate off</strong>, every send opens a separate <strong>Outlook window</strong> instead of sending in the background — fine for a handful, unworkable for a real blast. Enable it before any bulk run. For a precisely targeted audience, build it in the <a href="#crm-query">Query Builder</a> first, or step up to the <a href="#workflow-manager">Workflow Manager</a> for multi-step sequences.</p>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   WORKFLOW MANAGER
════════════════════════════════════════════════════════════════ */

/* ── A single timeline step card (faithful to StepCard) ── */
function StepNode({ idx, kind, label, summary, branch, group, indent, cond, childStop }) {
  const meta = STEP_META[kind] || STEP_META.email;
  const KIcon = branch ? I.branch : meta.icon;
  const tone = indent
    ? { bg: 'var(--gb-warning-tint-soft)', bd: 'var(--gb-warning-tint-border)', badgeBg: 'var(--gb-warning-tint-medium)', badgeFg: 'var(--gb-warning-fg)' }
    : { bg: 'var(--gb-surface-1)', bd: 'var(--gb-border-default)', badgeBg: meta.bg, badgeFg: meta.fg };
  return (
    <div style={{ marginLeft: indent ? 32 : 0, background: tone.bg, border: '1px solid ' + tone.bd, borderRadius: 'var(--gb-r-lg)', boxShadow: '0 1px 0 rgba(0,0,0,.12)', overflow: 'hidden' }}>
      <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '26px 1fr', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ width: 26, height: 26, borderRadius: 'var(--gb-r-sm)', background: tone.badgeBg, border: '1px solid ' + tone.bd, color: tone.badgeFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: indent ? 10 : 11, fontWeight: 800, fontFamily: 'var(--gb-font-mono)' }}>{idx}</div>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <KIcon size={12} style={{ color: branch ? 'var(--gb-warning-fg)' : meta.fg, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{label}</span>
            {branch && <Tag tone="warning" size="xs">BRANCH</Tag>}
            {group && <span style={{ fontSize: 10, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)' }}>· {group}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--gb-text-muted)' }}>
            <span style={{ color: 'var(--gb-text-ghost)' }}>{meta.label.toLowerCase()}</span>
            <span style={{ color: 'var(--gb-text-ghost)' }}>·</span>
            <span style={{ color: 'var(--gb-text-tertiary)' }}>{summary}</span>
            {cond && (<>
              <span style={{ color: 'var(--gb-text-ghost)' }}>·</span>
              <span style={{ color: 'var(--gb-warning-fg)', fontWeight: 500 }}>if {cond}</span>
            </>)}
          </div>
        </div>
      </div>
      {childStop && (
        <div style={{ padding: '0 12px 10px 50px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', background: 'var(--gb-warning-tint-medium)', border: '1px solid var(--gb-warning-tint-border)', borderRadius: 'var(--gb-r-pill)', color: 'var(--gb-warning-fg)', fontSize: 9.5, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase' }}>
            <Dot tone="warning" size={5} /> Stops workflow
          </span>
          <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)' }}>Main path resumes if branch didn't fire ↓</span>
        </div>
      )}
    </div>
  );
}
function Connector({ tone, hookRight, hookLeft, height = 28 }) {
  const stroke = tone === 'branch' ? 'var(--gb-warning-fg)' : 'var(--gb-border-strong)';
  return (
    <div style={{ height, width: 26, marginLeft: 12, display: 'flex', justifyContent: 'center' }}>
      <svg width={26} height={height} style={{ overflow: 'visible' }}>
        {hookRight ? <path d={`M13 0 L13 ${height - 10} Q13 ${height} 23 ${height}`} fill="none" stroke={stroke} strokeWidth={1.5} />
          : hookLeft ? <path d={`M23 0 Q13 0 13 10 L13 ${height}`} fill="none" stroke={stroke} strokeWidth={1.5} />
            : <path d={`M13 0 L13 ${height}`} fill="none" stroke={stroke} strokeWidth={1.5} />}
      </svg>
    </div>
  );
}
function TimelineSnippet() {
  return (
    <MiniFrame width={420} label="workflow manager · flow timeline" pad>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <I.flow size={15} style={{ color: 'var(--gb-brand-label)' }} />
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--gb-text-primary)' }}>Flow</div>
        <span style={{ fontSize: 11.5, color: 'var(--gb-text-muted)' }}>· 4 steps · stops after first branch sends</span>
      </div>
      <StepNode idx={1} kind="email" label="Intro nudge" summary="Win-back Check-in · 2 variations" />
      <Connector tone="default" />
      <StepNode idx={2} kind="email" label="Big-spender offer" summary="VIP Offer" branch cond="spend ≥ 5000" />
      <Connector tone="branch" hookRight />
      <StepNode idx="2a" kind="task" label="Flag for AE" summary="Create task" indent childStop />
      <Connector tone="default" hookLeft />
      <StepNode idx={3} kind="call" label="Follow-up call" summary="complete latest task" group="touch" />
      <Connector tone="default" />
      <Btn variant="dashed" size="lg" icon={<I.plus />} onClick={() => {}}>Add step</Btn>
    </MiniFrame>
  );
}

/* ── Step inspector: type picker + branch toggle (faithful) ── */
function InspectorSnippet() {
  const [kind, setKind] = useState('email');
  const [branch, setBranch] = useState(false);
  return (
    <MiniFrame width={420} label="workflow manager · step inspector" pad>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 32, height: 32, borderRadius: 'var(--gb-r-md)', background: branch ? 'var(--gb-warning-tint-medium)' : STEP_META[kind].bg, border: '1px solid var(--gb-border-default)', color: branch ? 'var(--gb-warning-fg)' : STEP_META[kind].fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{React.createElement(branch ? I.branch : STEP_META[kind].icon, { size: 15 })}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: branch ? 'var(--gb-warning-fg)' : STEP_META[kind].fg }}>{branch ? 'Branch' : STEP_META[kind].label} step</div>
          <Input value="Big-spender offer" onChange={() => {}} style={{ marginTop: 3, height: 28, fontSize: 14, fontWeight: 700 }} />
        </div>
      </div>
      <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)', marginBottom: 7 }}>Step type</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
        {Object.entries(STEP_META).map(([k, m]) => {
          const on = k === kind;
          return (
            <button key={k} onClick={() => setKind(k)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '11px 6px', background: on ? m.bg : 'var(--gb-surface-2)', border: '1px solid ' + (on ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), borderRadius: 'var(--gb-r-md)', color: on ? m.fg : 'var(--gb-text-tertiary)', cursor: 'pointer', fontFamily: 'var(--gb-font-sans)', fontSize: 11, fontWeight: 600 }}>
              {React.createElement(m.icon, { size: 16 })} {m.label}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
        <div style={{ paddingRight: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>Branch step</div>
          <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>Stops the workflow after firing; child steps run only if it fires.</div>
        </div>
        <Switch on={branch} tone="warning" onChange={setBranch} />
      </div>
      <div style={{ marginTop: 10, padding: 10, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)' }}>
        <Field label="Group label" hint="Steps in the same group are mutually exclusive — only the first whose conditions pass runs">
          <Input value="touch" mono onChange={() => {}} />
        </Field>
      </div>
    </MiniFrame>
  );
}

/* ── Conditions builder (grouped AND/OR over workflow signals) ── */
const SIGNAL_OPTS = ['Order count', 'Days since last order', 'Lifetime spend ($)', 'Has ordered brand', 'Order item contains'];
function CondRow({ source, field, op, value }) {
  const srcTone = { Signal: 'brand', Schema: 'info', Code: 'warning' }[source] || 'neutral';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 9px', background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-sm)' }}>
      <Tag tone={srcTone} size="xs">{source}</Tag>
      <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 11.5, color: 'var(--gb-text-secondary)', fontWeight: 600 }}>{field}</span>
      <span style={{ fontSize: 11, color: 'var(--gb-text-muted)' }}>{op}</span>
      <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 11.5, color: 'var(--gb-brand-label)', fontWeight: 600 }}>{value}</span>
    </div>
  );
}
function ConditionsSnippet() {
  const [sig, setSig] = useState('Lifetime spend ($)');
  return (
    <MiniFrame width={420} label="workflow manager · conditions" pad>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <I.target size={13} style={{ color: 'var(--gb-warning-fg)' }} />
        <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)' }}>Run conditions</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)' }}>match ALL</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 9, border: '1px dashed var(--gb-border-strong)', borderRadius: 'var(--gb-r-md)' }}>
        <CondRow source="Signal" field={sig} op="≥" value="5,000" />
        <div style={{ alignSelf: 'center', fontSize: 9, fontWeight: 800, letterSpacing: 1, color: 'var(--gb-brand-label)', textTransform: 'uppercase' }}>and</div>
        <CondRow source="Signal" field="Days since last order" op=">" value="60" />
        <div style={{ alignSelf: 'center', fontSize: 9, fontWeight: 800, letterSpacing: 1, color: 'var(--gb-brand-label)', textTransform: 'uppercase' }}>and</div>
        <CondRow source="Schema" field="contact.email" op="is set" value="" />
      </div>
      <div style={{ marginTop: 10, fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--gb-text-muted)', marginBottom: 6 }}>Add a signal</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {SIGNAL_OPTS.map((s) => <PillTag key={s} on={sig === s} onClick={() => setSig(s)}>{s}</PillTag>)}
      </div>
    </MiniFrame>
  );
}

/* ── Run-view audience table with the real status badges ── */
const RUN_BADGES = {
  queued: { fg: 'var(--gb-text-muted)', bg: 'var(--gb-fill-subtle)', bd: 'var(--gb-border-default)', label: 'Queued' },
  sending: { fg: 'var(--gb-brand-label)', bg: 'var(--gb-brand-tint-medium)', bd: 'var(--gb-brand-tint-border)', label: 'Running' },
  sent: { fg: 'var(--gb-success-fg)', bg: 'var(--gb-success-tint-medium)', bd: 'var(--gb-success-tint-border)', label: 'Done' },
  stopped: { fg: 'var(--gb-warning-fg)', bg: 'var(--gb-warning-tint-medium)', bd: 'var(--gb-warning-tint-border)', label: 'Branch · stop' },
  skipped: { fg: 'var(--gb-text-muted)', bg: 'var(--gb-fill-subtle)', bd: 'var(--gb-border-default)', label: 'Skipped' },
  suppressed: { fg: 'var(--gb-warning-fg)', bg: 'var(--gb-warning-tint-soft)', bd: 'var(--gb-warning-tint-border)', label: 'Suppressed' },
  failed: { fg: 'var(--gb-error-fg)', bg: 'var(--gb-error-tint-medium)', bd: 'var(--gb-error-tint-border)', label: 'Failed' },
};
function RunBadge({ status }) {
  const t = RUN_BADGES[status] || RUN_BADGES.queued;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 4, background: t.bg, color: t.fg, border: `1px solid ${t.bd}`, fontSize: 10, fontWeight: 700, letterSpacing: 0.4, fontFamily: 'var(--gb-font-mono)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{t.label}</span>;
}
function RunInitials({ name }) {
  const ini = name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--gb-fill-strong)', color: 'var(--gb-text-secondary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', flexShrink: 0, border: '1px solid var(--gb-border-default)' }}>{ini}</span>;
}
function Pipeline({ ran, total, running }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
      {Array.from({ length: total }).map((_, i) => {
        const done = i < ran;
        const active = running && i === ran;
        const color = done || active ? 'var(--gb-brand-label)' : 'var(--gb-text-ghost)';
        return (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ width: 10, height: 1.5, background: i <= ran ? 'var(--gb-brand-label)' : 'var(--gb-border-default)' }} />}
            <span style={{ width: active ? 10 : 8, height: active ? 10 : 8, borderRadius: '50%', background: (done || active) ? color : 'transparent', border: `1.5px solid ${color}`, flexShrink: 0 }} />
          </React.Fragment>
        );
      })}
    </div>
  );
}
const RUN_ROWS = [
  { name: 'Marcus Chen', account: 'Acme Co', email: 'marcus@acme.co', ran: 3, status: 'sent', step: 'Done' },
  { name: 'Sarah Patel', account: 'Pebble Inc', email: 'sarah@pebble.com', ran: 2, status: 'sending', step: 'Big-spender offer' },
  { name: 'Jordan Brown', account: 'BCG', email: 'jordan@bcg.io', ran: 1, status: 'stopped', step: 'Flag for AE' },
  { name: 'Lee Wong', account: 'Lee Industries', email: 'lee@lee.co', ran: 0, status: 'suppressed', step: '—' },
  { name: 'Dana Cruz', account: 'Cruz Golf', email: 'dana@cruz.com', ran: 0, status: 'queued', step: 'Up next' },
];
function RunViewSnippet() {
  return (
    <MiniFrame width={620} label="workflow manager · run view" pad={false}>
      <div style={{ background: 'var(--gb-surface-canvas)' }}>
        <div style={{ padding: '12px 16px', background: 'var(--gb-surface-1)', borderBottom: '1px solid var(--gb-border-default)', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 32, height: 32, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.send size={14} /></div>
          <div>
            <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--gb-text-muted)' }}>Running workflow</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--gb-text-primary)' }}>Spring win-back</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, padding: 3, background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)' }}>
            <Btn size="sm" variant="tinted" status="warning" icon={<I.pause size={11} />} onClick={() => {}}>Pause</Btn>
            <Btn size="sm" variant="ghost" icon={<I.close size={11} />} onClick={() => {}}>Stop &amp; edit</Btn>
          </div>
        </div>
        <div style={{ height: 4, background: 'var(--gb-fill-inverse-medium, var(--gb-surface-3))' }}><div style={{ height: '100%', width: '55%', background: 'var(--gb-brand-label)' }} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '30px 1.4fr 1.2fr auto 110px', gap: 12, padding: '8px 16px', background: 'var(--gb-surface-1)', borderBottom: '1px solid var(--gb-border-subtle)', fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>
          <div /><div>Contact</div><div>Email</div><div>Pipeline · 3</div><div style={{ textAlign: 'right' }}>State</div>
        </div>
        {RUN_ROWS.map((r) => {
          const inflight = r.status === 'sending';
          return (
            <div key={r.email} style={{ display: 'grid', gridTemplateColumns: '30px 1.4fr 1.2fr auto 110px', gap: 12, alignItems: 'center', padding: '9px 13px', borderBottom: '1px solid var(--gb-border-subtle)', borderLeft: `3px solid ${inflight ? 'var(--gb-brand-label)' : r.status === 'stopped' ? 'var(--gb-warning)' : 'transparent'}`, background: inflight ? 'var(--gb-brand-tint-soft)' : r.status === 'stopped' ? 'var(--gb-warning-tint-soft)' : 'transparent' }}>
              <RunInitials name={r.name} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)' }}>{r.account}</div>
              </div>
              <div style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 10.5, color: 'var(--gb-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.email}</div>
              <Pipeline ran={r.ran} total={3} running={inflight} />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}><RunBadge status={r.status} /></div>
            </div>
          );
        })}
      </div>
    </MiniFrame>
  );
}

const STEP_TYPES = [
  ['Email', 'A template picker; when the chosen template has variations, weight sliders set the split (always sum to 100%) — each contact rolls one.'],
  ['Call', 'Log a call (saved template, or custom: category, direction, subject, notes, voicemail flag) — or complete the contact\'s open tasks (latest / all).'],
  ['Task', 'Create a task (template, or custom: subject, notes, due-in days, priority) — or complete open tasks.'],
  ['Custom', 'A sandboxed code editor (ctx = contact/account data, h = read-only fetch/catalog/domText helpers) with a “Kill the flow after this step” switch; the code can also return \'kill\'.'],
];
const COND_SOURCES = [
  ['Signal', 'Pre-computed CRM stats: Order count · Days since last order · Lifetime spend ($) · Has ordered brand · Order item contains.'],
  ['Schema', 'Any contact/account field path — contact.email, account.id, orders[any].total with array quantifiers.'],
  ['Code', 'A JavaScript expression evaluated per contact in the sandbox — anything the other two can\'t express.'],
];
const RUN_STATUSES = [
  ['Queued', 'Waiting its turn — the run hasn\'t reached this contact yet.'],
  ['Running', 'Currently being worked through its steps.'],
  ['Done', 'Finished — at least one step ran and sent.'],
  ['Skipped', 'No step\'s conditions matched, so nothing fired for them.'],
  ['Branch · stop', 'A branch fired, so the workflow deliberately stopped here.'],
  ['Suppressed', 'Excluded by a suppression rule (do-not-contact / bounced / mailer-removed).'],
  ['Failed', 'A step errored — worth a look and a retry.'],
];
const RUN_MODES = [
  ['Simulate', 'Animates the flow step by step in the timeline (pulsing badges, tracing connectors) so you can sanity-check routing without an audience.'],
  ['Dry run', 'The full run against the real audience with “Dry-run · nothing is sent” across the top — every step reports “Would email…” with zero sends and zero CRM writes.'],
  ['Run workflow', 'The real send: the live audience table with per-contact status badges, plus Pause / Resume / Stop & edit.'],
];

export function WorkflowManagerPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Workflows</div>
      <h1 className="title">Workflow Manager</h1>
      <p className="lede">
        Where <a href="#quicksend">Quick Send</a> fires one email at everyone, the Workflow Manager builds a
        <strong> multi-step flow</strong> — Email, Call, Task, and Custom steps, with conditional <strong>branches</strong>
        and mutually-exclusive <strong>groups</strong> — then runs it across a selected audience, routing each contact
        through whichever steps their data says they should get. Below: the timeline, the inspector, the conditions
        builder, and the live run view, each rebuilt faithfully so you can read every control.
      </p>

      <TourBox n={1} eyebrow="The middle column" title="The flow timeline" live={<TimelineSnippet />} wide>
        <p>Steps run <strong>top to bottom</strong>, numbered 1, 2, 3…, joined by connector lines. Each card shows its type icon, label, a template-or-code summary, and a conditions preview (<em>“if FIELD OP”</em>). Copy and trash icons duplicate or delete; click a card to edit it in the inspector. <strong>Add step</strong> appends a new one.</p>
        <p>The snippet shows the two routing devices in action:</p>
        <ul>
          <li>Step 2 is a <strong>branch</strong> (amber <Tag tone="warning" size="xs">BRANCH</Tag>): if its condition passes it fires and the workflow <strong>stops</strong> for that contact. Its child, <strong>2a</strong>, indents underneath and runs only when the branch fired — hence the “Stops workflow” chip and the “main path resumes if branch didn't fire” note.</li>
          <li>Step 3 carries a <strong>group</strong> label (<code>touch</code>): steps sharing a group name are mutually exclusive — only the first whose conditions pass runs.</li>
        </ul>
      </TourBox>

      <TourBox n={2} eyebrow="The right column" title="The step inspector" live={<InspectorSnippet />} flip wide>
        <p>Click any step to open its inspector. At the top, rename it. Then the four <strong>step types</strong> — Email, Call, Task, Custom — switch what the step does (each reveals its own config below). The <strong>Branch step</strong> switch is a flag on <em>any</em> type: flip it on and the step becomes conditional and workflow-stopping when it fires.</p>
        <ul>
          <li><strong>Group label</strong> — type a shared name to make sibling steps mutually exclusive (only the first matching one runs).</li>
          <li><strong>Branch membership</strong> (shown when an earlier branch exists) — assign a step to “Main path” or under a branch, which indents it as 1a / 1b.</li>
          <li><strong>Variation split</strong> — for an Email step whose template has variations, the same weighted sliders as Quick Send appear.</li>
        </ul>
        <p>Click empty timeline space (deselect) and the inspector instead edits <strong>workflow defaults</strong>: name, Draft/Active/Paused status, the pacing range, suppressions, audience order, and a send cap.</p>
      </TourBox>

      <TourBox n={3} eyebrow="On every step" title="The conditions builder" live={<ConditionsSnippet />} wide>
        <p>Branches (and groups) gate on <strong>conditions</strong> — the same grouped <strong>AND / OR + NOT</strong> builder used by template rules and the <a href="#crm-query">Query Builder</a>. Each condition draws from one of three sources, shown as a coloured tag in the snippet:</p>
        <ul>
          <li><strong>Signal</strong> — pre-computed CRM stats: order count, days since last order, lifetime spend, has-ordered-brand, order-item-contains.</li>
          <li><strong>Schema</strong> — any contact/account field path, with array quantifiers like <code>orders[any].total</code>.</li>
          <li><strong>Code</strong> — a JavaScript expression evaluated per contact for anything the other two can't express.</li>
        </ul>
        <p>So “VIP, gone quiet, reachable” becomes three rows joined by AND — exactly the example above.</p>
      </TourBox>

      <TourBox n={4} eyebrow="When you press Run" title="The live audience run view" live={<RunViewSnippet />} wide>
        <p>Running (or dry-running) swaps the editor for a <strong>live audience table</strong>. The header tallies Audience / Running / Sent / Stopped / Skipped (and Failed when any), with a progress bar and <strong>Pause / Resume / Stop &amp; edit</strong>. Each row shows the contact, their email, a <strong>pipeline</strong> of dots (one per main step, filling as they advance), the current step, and a <strong>status badge</strong>.</p>
        <p>The badges are the whole story of a run at a glance — every one of the seven is named in the table below.</p>
      </TourBox>

      <h2 className="sec">The four step types</h2>
      <table className="spectable">
        <thead><tr><th>Type</th><th>Configuration</th></tr></thead>
        <tbody>{STEP_TYPES.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td></tr>)}</tbody>
      </table>

      <h3 className="sub">Condition sources</h3>
      <table className="spectable">
        <thead><tr><th>Source</th><th>What it offers</th></tr></thead>
        <tbody>{COND_SOURCES.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td></tr>)}</tbody>
      </table>

      <h3 className="sub">Run-view status badges</h3>
      <table className="spectable">
        <thead><tr><th>Badge</th><th>Meaning</th></tr></thead>
        <tbody>{RUN_STATUSES.map((r) => <tr key={r[0]}><td><RunBadge status={Object.keys(RUN_BADGES).find((k) => RUN_BADGES[k].label === r[0])} /></td><td>{r[1]}</td></tr>)}</tbody>
      </table>

      <h3 className="sub">Three ways to run it</h3>
      <table className="spectable">
        <thead><tr><th>Mode</th><th>What it does</th></tr></thead>
        <tbody>{RUN_MODES.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td></tr>)}</tbody>
      </table>

      <div className="docnote info">
        <span className="dn-ico"><I.megaphone size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Bring your own audience</div>
          <p style={{ margin: 0 }}>The Workflow Manager doesn't pick contacts — you do. Build a precise list in <a href="#crm">CRM Search</a> / <a href="#crm-query">Query Builder</a> or <a href="#tasks">Task List</a>, select the rows, and choose <strong>Run workflow</strong>; those contacts become the audience. The audience count shows in the top bar.</p>
        </div>
      </div>

      <div className="docnote brand">
        <span className="dn-ico"><I.check size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Dry-run every workflow before going live</div>
          <p style={{ margin: 0 }}>The <strong>Dry run</strong> toggle runs the whole flow against the real audience with zero sends and zero CRM writes — every step reports “Would email…”. Read a handful of per-contact results to confirm the routing is doing what you meant. It's the cheapest QA you'll ever do. One caveat: email/call-<em>history</em> signals (replied, days since last call…) are visible in the editor but <strong>not yet active</strong> — don't build branches around them yet.</p>
        </div>
      </div>
    </div>
  );
}
