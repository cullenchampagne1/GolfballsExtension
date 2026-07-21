import React, { useState } from 'react';
import { I, Btn, TemplatePicker, KeyVal, Tag, SectionLabel } from '../../ui/index.js';
import { LiveStage } from '../lib/stage.jsx';
import { TourBox, MiniFrame } from '../lib/tourbox.jsx';
import { PopupLive } from '../lib/popup-live.jsx';

/* ───────────────────────────────────────────────────────────────
   popup.jsx — DEEP page: the toolbar popup. Layout from the design
   exemplar (page-popup.jsx); every factual claim rewritten from the
   verified articles email-templates-popup + how-email-sending-works
   and the send-first-email tutorial.
─────────────────────────────────────────────────────────────── */

const SAMPLE_TPLS = [
  { id: 'tpl_ship', name: 'Order Shipped', type: 'order', variations: [{ id: 'a', preview: 'Warmer tone' }, { id: 'b', preview: 'Brief' }] },
  { id: 'tpl_proof', name: 'Art Proof Ready', type: 'order', variations: [] },
  { id: 'tpl_back', name: 'Backorder Notice', type: 'order', variations: [] },
];

function PickerSnippet() {
  const [val, setVal] = useState('tpl_ship');
  return (
    <MiniFrame width={300} label="popup · template section" pad>
      <div style={{ fontFamily: 'var(--gb-font-sans)' }}>
        <SectionLabel divider={false} style={{ marginBottom: 4 }}>Template</SectionLabel>
        <TemplatePicker mode="single" templates={SAMPLE_TPLS} matchedIds={['tpl_ship']} value={val} onChange={setVal} placeholder="Pick a template" listMaxHeight={220} />
      </div>
    </MiniFrame>
  );
}

const Ic = {
  watch: (p) => <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  checkbox: (p) => <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>,
  paperclip: (p) => <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>,
};

function ActionsSnippet() {
  return (
    <MiniFrame width={300} label="popup · actions" pad>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Btn full size="sm" variant="tinted" status="brand" icon={<I.card />}>Charge Card  ($100.00)</Btn>
        <Btn full size="sm" icon={<I.edit />}>Order Edit</Btn>
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn size="sm" icon={<I.eye />} style={{ flex: 1, width: 'auto' }}>Watch Order</Btn>
          <Btn size="sm" variant="tinted" status="error" icon={<Ic.watch />} badge={2} badgeTone="error" badgePulse style={{ flex: 1, width: 'auto' }}>Watch List</Btn>
        </div>
        <Btn full size="sm" icon={<Ic.checkbox />}>My Tasks</Btn>
        <Btn full size="sm" icon={<I.search />}>CRM Search</Btn>
        <Btn full size="sm" icon={<I.alert />} badge={2} badgeTone="brand">Notifications</Btn>
        <Btn full size="sm" icon={<Ic.paperclip />}>Submit Proof</Btn>
      </div>
    </MiniFrame>
  );
}

function SendSnippet() {
  return (
    <MiniFrame width={300} label="popup · review & send" pad>
      <div>
        <KeyVal k="To" v="jordan.lee@example.com" tone="ok" />
        <KeyVal k="first_name" v="Jordan" />
        <KeyVal k="order_no" v="4815162342" />
        <KeyVal k="tracking" v={<Tag tone="error" size="xs">Not found</Tag>} tone="error" />
        <hr style={{ border: 0, borderTop: '1px solid var(--gb-border-subtle)', margin: '10px 0' }} />
        <Btn full variant="primary" size="md" icon={<I.send />}>Open in Outlook</Btn>
      </div>
    </MiniFrame>
  );
}

function HeaderSnippet() {
  return (
    <MiniFrame width={300} label="popup · header" pad={false}>
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gb-surface-1)', borderRadius: 'var(--gb-r-md)' }}>
        <div style={{ width: 30, height: 30, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.mail size={15} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Email Templates</div>
          <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', fontWeight: 500, marginTop: 1 }}>Golfballs.com · 3 templates</div>
        </div>
        <Btn size="sm" icon={<I.cog />}>Manage</Btn>
      </div>
    </MiniFrame>
  );
}

const CALLOUTS = [
  { n: 1, target: 'manage', title: 'Manage', text: 'Opens the Template Editor window — templates, note templates, and Settings.' },
  { n: 2, target: 'picker', title: 'Template picker', text: "Templates whose rules match this page group at the top under 'Matched on this page' with a glowing dot." },
  { n: 3, target: 'charge', title: 'Charge / Refund', text: 'The amount is the gap between the order total and what has been captured — here $100.00. Negative gaps flip it to Refund.' },
  { n: 4, target: 'watch', title: 'Watch + Watch List', text: 'Watch flags this record on your private list. The badge counts open items; it pulses red when one has waited 6+ hours.' },
  { n: 5, target: 'resolved', title: 'Resolved variables', text: "The To address and every template variable, filled live from the page. Red 'Not found' means fix it before sending." },
  { n: 6, target: 'send', title: 'Send', text: "With Power Automate on this sends silently with your signature. Off (the default), it opens a pre-filled Outlook window — and a Copy button keeps formatting." },
];

const STEPS = [
  { target: 'picker', caption: "Click the toolbar icon and the popup opens, already scanning the page. On this order it matched 'Order Shipped' — matched templates carry a glowing dot.", hold: 2400 },
  { target: 'picker', caption: 'Open the list — matched templates group at the top. The shuffle badge on a parent means it has variations: leave it selected for a random version per send, or expand and pin one.', run: (api) => api.openPicker(true), hold: 2600 },
  { target: 'picker', caption: "Pick 'Backorder Notice'. Its variables start resolving from the live order immediately.", run: (api) => { api.selectTemplate('tpl_back'); api.openPicker(false); }, hold: 1600 },
  { target: 'resolved', caption: "Plain variables land first; code variables show 'running code…' and finish a beat later. Anything red ('Not found') would leak {{name}} into the email — fix it before sending.", hold: 3000 },
  { target: 'charge', caption: 'Action buttons operate on this order. Charge shows the $100.00 gap between the order total and what was captured; a greyed button just means the page lacks the data it needs.', hold: 2600 },
  { target: 'send', caption: "Send: with Power Automate configured it sends silently with your signature. Otherwise — the default — it opens the finished email in Outlook, and Copy puts the formatted version on your clipboard.", run: (api, h) => h.showToast('Power Automate off → opens a pre-filled Outlook window'), hold: 3000 },
];

export function PopupPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Daily Driver</div>
      <h1 className="title">The Popup</h1>
      <p className="lede">
        The popup is where most of a rep's day happens. Click the Golfballs icon in the toolbar and a
        compact panel opens that already knows what page you're on — matched templates first, live
        variable values, and one-click actions for the current order. Watch it work below, then read
        each section beside its live control.
      </p>

      <LiveStage
        width={320}
        frameKind="popup"
        frameLabel="golfballs.com · order #4815162342"
        render={(apiRef, helpers) => <PopupLive ref={apiRef} onToast={helpers.showToast} />}
        callouts={CALLOUTS}
        steps={STEPS}
        note="Live popup · sample order #4815162342 · hover the numbered pins, press Play, or Try it yourself."
      />

      <h2 className="sec">Walk through it, piece by piece</h2>
      <p>Each block pairs the real, clickable control with what it does. The snippets are live.</p>

      <TourBox n={1} eyebrow="Header" title="Where you are, and the way in" live={<HeaderSnippet />} flip>
        <p>The header shows the brand, the site, and your template count. <strong>Manage</strong> opens the Template Editor window — where templates, note templates, and <a href="#settings">Settings</a> live.</p>
      </TourBox>

      <TourBox n={2} eyebrow="Step 1 · Choose" title="The template picker" live={<PickerSnippet />}>
        <p>Templates are filtered to this page's type (order templates on order pages, account templates on contact/account pages), and the ones whose <strong>auto-match rules pass on this exact page</strong> group at the top under “Matched on this page” with a glowing dot.</p>
        <p>A parent row with a <strong>shuffle badge</strong> carries variations — leave the parent selected and each send picks a random version (original + variations, equal odds), or expand the row and <strong>pin one</strong> (check badge) to lock it. If nothing fits, you'll see “No templates for this page type.”</p>
      </TourBox>

      <TourBox n={3} eyebrow="Step 2 · Act" title="Action buttons" live={<ActionsSnippet />} flip>
        <p>These operate on the current page, top to bottom:</p>
        <ul>
          <li><strong>Charge Card / Refund</strong> — the amount is the gap between order total and captured payments; a negative gap flips the button to Refund (red).</li>
          <li><strong>Order Edit</strong> — opens the edit modal on the order page.</li>
          <li><strong>Watch + Watch List</strong> — flag this record on your private list; the badge counts open items and <strong>pulses red once something has waited 6+ hours</strong>.</li>
          <li><strong>My Tasks · CRM Search · Submit Proof</strong> — the same tools as <span className="kbd">Ctrl+X</span> / <span className="kbd">Ctrl+K</span> / the shelf, one click away.</li>
          <li><strong>Notifications</strong> — admin build only; the badge counts open customer replies from the email relay.</li>
        </ul>
        <p>A <strong>greyed</strong> button means this page lacks the data it needs (no order number, no capture gap). A <strong>missing</strong> button means its feature toggle is off — see the note below.</p>
      </TourBox>

      <TourBox n={4} eyebrow="Step 3 · Review" title="Resolved variables" live={<SendSnippet />}>
        <p>Before anything sends, the popup shows exactly what will go out: the <code>To</code> address (green when found) and every variable's value, pulled live from the page.</p>
        <ul>
          <li><strong>Spinner · “resolving…”</strong> — still being read from the page.</li>
          <li><strong>Spinner · “running code…”</strong> — a code variable is executing; these finish last.</li>
          <li><strong>Red “Not found”</strong> — unresolved. Sending now would leak the literal <code>{'{{name}}'}</code> into the email. Treat it as a stop sign.</li>
        </ul>
        <p>Send stays disabled while anything is resolving and when no recipient was found.</p>
      </TourBox>

      <TourBox n={5} eyebrow="Step 4 · Send" title="Send, and where the email actually goes" live={
        <MiniFrame width={300} label="popup · transports" pad>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Btn full variant="primary" size="md" icon={<I.send />}>Send</Btn>
            <Btn full variant="primary" size="md" icon={<I.send />}>Open in Outlook</Btn>
            <Btn full size="sm" icon={<I.copy />}>Copy</Btn>
          </div>
        </MiniFrame>
      } flip>
        <p>The button tells you the transport:</p>
        <ul>
          <li><strong>Send / Reply</strong> — Power Automate is on: the email sends silently through your flow, signature appended, inline images attached properly. “Reply” means the template threads into the existing conversation.</li>
          <li><strong>Open in Outlook / Reply in Outlook</strong> — Power Automate is off (the default): a pre-filled Outlook window opens, plain text, no signature.</li>
          <li><strong>Copy</strong> — Outlook mode only: copies the email as rich HTML so pasting into Outlook keeps the formatting the mailto window strips.</li>
        </ul>
        <p>If Send keeps opening Outlook windows, that's the fallback working as designed — enable Power Automate and paste your flow URL in <a href="#settings">Settings</a>.</p>
      </TourBox>

      <div className="docnote brand" style={{ marginTop: 26 }}>
        <span className="dn-ico"><I.cog size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Missing a button?</div>
          <p style={{ margin: 0 }}>Every action is gated by a toggle in <a href="#settings">Settings → Features</a>. If Charge, My Tasks, or the whole template section is gone, it's switched off — flip it back on and it slides back in. The popup also re-shapes itself per page: order pages get order tools, contact and account pages swap to account templates and contact actions.</p>
        </div>
      </div>
    </div>
  );
}
