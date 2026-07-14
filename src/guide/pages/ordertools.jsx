import React, { useState } from 'react';
import {
  I, Btn, Field, Input, Callout, Tag, Segmented, Dropdown,
} from '../../ui/index.js';
import { TourBox, MiniFrame } from '../lib/tourbox.jsx';

/* ───────────────────────────────────────────────────────────────
   ordertools.jsx — four hand-built, visually-faithful doc pages for
   the on-order helpers:

     ChargePage      — Charge & Order Edit
     ProofPage       — Submit Proof
     MarginPage      — Margin Calculator
     OrderExtrasPage — Copy Order IDs & Signifyd Risk Glow

   None of the underlying modals forward FloatingPanel's `contained` /
   `portalContainer` props (Charge/Order Edit are vanilla DOM overlays;
   SubmitProof and MarginCalc wrap their own <FloatingPanel>), so every
   demo here is a MiniFrame snippet that reproduces the real layout with
   the genuine src/ui primitives — not a LiveModal mount. The prose is
   rewritten from the verified help articles (charge-refund, order-edit,
   submit-proof, margin-calculator, copy-order-ids, signifyd-glow) and
   the real source implementations.
─────────────────────────────────────────────────────────────── */

/* A small section label that mimics the upper-case captions inside the
   real modals. */
function MiniLabel({ children }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 800, letterSpacing: 0.8,
      textTransform: 'uppercase', color: 'var(--gb-text-muted)',
      marginBottom: 6,
    }}>{children}</div>
  );
}

/* ════════════════════════════════════════════════════════════════
   CHARGE & ORDER EDIT
═══════════════════════════════════════════════════════════════ */

/* Reproduces a single payment-method row from the charge modal: the
   selection badge (number / minus / check), the card name, and a status
   line on the right. */
function MethodRow({ name, state = 'idle', num, detail }) {
  const tone = state === 'success' ? 'var(--gb-success)'
    : state === 'fail' ? 'var(--gb-error)'
    : state === 'selected' ? 'var(--gb-brand-label)'
    : 'var(--gb-border-default)';
  const badgeBg = state === 'idle' ? 'var(--gb-surface-2)' : tone;
  const badgeFg = state === 'idle' ? 'var(--gb-text-muted)' : '#111';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 13px', marginBottom: 8,
      background: state === 'idle' ? 'var(--gb-surface-1)' : `color-mix(in srgb, ${tone} 12%, transparent)`,
      border: `1px solid ${state === 'idle' ? 'var(--gb-border-subtle)' : tone}`,
      borderRadius: 'var(--gb-r-lg)',
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%',
        background: badgeBg, color: badgeFg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 800, flexShrink: 0,
      }}>
        {state === 'success' ? <I.check size={13} />
          : state === 'fail' ? <I.close size={13} />
            : state === 'selected' ? num
              : '–'}
      </div>
      <div style={{
        flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600,
        color: 'var(--gb-text-secondary)', whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{name}</div>
      {detail && (
        <div style={{
          fontSize: 11, fontWeight: 600,
          color: state === 'success' ? 'var(--gb-brand-label)'
            : state === 'fail' ? 'var(--gb-error)' : 'var(--gb-text-muted)',
        }}>{detail}</div>
      )}
    </div>
  );
}

function ChargeFormSnippet() {
  const [amount, setAmount] = useState('128.45');
  const [reason, setReason] = useState('Order Edit');
  const [note, setNote] = useState('Order Charge');
  return (
    <MiniFrame width={480} label="charge customer · order #29103" pad>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1.5fr', gap: 12 }}>
        <Field label="Amount">
          <Input size="sm" mono inputMode="decimal" leading={<span style={{ fontWeight: 700, color: 'var(--gb-text-muted)' }}>$</span>}
            value={amount} onChange={setAmount} />
        </Field>
        <Field label="Reason">
          <Dropdown size="sm" value={reason} onChange={setReason}
            options={[
              { id: 'Order Edit', label: 'Order Edit' },
              { id: 'Shipping Upgrade', label: 'Shipping Upgrade' },
              { id: 'Other', label: 'Other' },
            ]} />
        </Field>
        <Field label="Note">
          <Input size="sm" value={note} onChange={setNote} />
        </Field>
      </div>
    </MiniFrame>
  );
}

function MethodsSnippet() {
  const [sel, setSel] = useState(new Set(['v']));
  const order = ['v'];
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const rows = [
    { id: 'v', name: 'Visa ···· 4242 · Demo Customer' },
    { id: 'm', name: 'Mastercard ···· 8810 · Acme Industries' },
  ];
  return (
    <MiniFrame width={480} label="charge customer · payment methods" pad>
      <MiniLabel>Payment Methods</MiniLabel>
      <div onClick={() => {}}>
        {rows.map((r, i) => (
          <div key={r.id} onClick={() => toggle(r.id)} style={{ cursor: 'pointer' }}>
            <MethodRow name={r.name} state={sel.has(r.id) ? 'selected' : 'idle'} num={[...sel].indexOf(r.id) + 1} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
        <Btn size="sm" status="brand" variant="primary" icon={<I.card size={12} />} disabled={sel.size === 0}>
          Run Charge
        </Btn>
      </div>
    </MiniFrame>
  );
}

function MethodsResultSnippet() {
  return (
    <MiniFrame width={480} label="charge customer · result" pad>
      <MiniLabel>Payment Methods</MiniLabel>
      <MethodRow name="Visa ···· 4242 · Demo Customer" state="success" detail="ID: 8f3a2c1b" />
      <MethodRow name="Mastercard ···· 8810 · Acme Industries" state="fail" detail="D2026:05 Do not honor" />
    </MiniFrame>
  );
}

function OrderSummarySnippet() {
  const Row = ({ k, v, color }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12 }}>
      <span style={{ color: 'var(--gb-text-muted)' }}>{k}</span>
      <span style={{ color: color || 'var(--gb-text-secondary)', fontWeight: 600, fontFamily: 'var(--gb-font-mono)' }}>{v}</span>
    </div>
  );
  return (
    <MiniFrame width={300} label="order edit · summary" pad>
      <MiniLabel>Financials</MiniLabel>
      <Row k="Subtotal" v="$119.50" />
      <Row k="Shipping" v="FREE" color="var(--gb-brand-label)" />
      <Row k="Tax" v="$8.95" />
      <div style={{ height: 1, background: 'var(--gb-border-subtle)', margin: '6px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--gb-text-muted)' }}>Order Total</span>
        <span style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-primary)' }}>$128.45</span>
      </div>
      <div style={{ height: 1, background: 'var(--gb-border-subtle)', margin: '6px 0' }} />
      <MiniLabel>Charges</MiniLabel>
      <Row k="Total Charged" v="$0.00" />
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-md)', padding: '8px 12px', marginTop: 6,
      }}>
        <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--gb-text-muted)' }}>Balance</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-error)' }}>$128.45 owed</span>
      </div>
    </MiniFrame>
  );
}

const CHARGE_REASONS = [
  ['Order Edit', 'The default — a corrective charge tied to an order change (added item, upsized shipping, fixed price).'],
  ['Shipping Upgrade', 'The customer asked to expedite; the charge covers the shipping-method bump.'],
  ['Other', 'Anything that doesn’t fit the two above. Use the Note field to say what it’s for.'],
];

const CHARGE_STATES = [
  ['Idle', 'Grey minus badge. The method is loaded but not selected.'],
  ['Selected', 'Brand badge with a number — the order you ticked them in. Run Charge tries them top-to-bottom and stops at the first success.'],
  ['Charging', 'A spinner with live status — “Verifying card…”, “Charging…”, “Saving record…”.'],
  ['Success', 'Green badge with a check and the transaction ID. The card was debited and the adjustment saved against the order.'],
  ['Failed', 'Red badge with the bank’s decline reason (e.g. “D2026:05 Do not honor”). The next selected method is tried.'],
];

export function ChargePage() {
  return (
    <div className="prose">
      <div className="eyebrow">Daily Driver</div>
      <h1 className="title">Charge &amp; Order Edit</h1>
      <p className="lede">
        Two payment tools that ride on top of an order page. <strong>Charge</strong> runs a real
        credit-card charge or refund against the order without leaving it; <strong>Order Edit</strong> opens
        the CRM’s order editor in a framed window with a live financial summary beside it. Both open from the
        popup’s <strong>Actions</strong> section or the Actions Shelf. The pieces below are live snippets of
        the real controls.
      </p>

      <div className="docnote warn">
        <span className="dn-ico"><I.alert size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">This moves real money</div>
          <p style={{ margin: 0 }}>Charge debits the customer’s card the moment you press <strong>Run Charge</strong>. The amount field pre-fills with the computed difference between the order total and what’s already been captured — <em>always verify it against the order before running</em>. There is no undo.</p>
        </div>
      </div>

      <h2 className="sec">Walk through it, piece by piece</h2>

      <TourBox n={1} eyebrow="Top of the modal" title="Amount, Reason & Note" live={<ChargeFormSnippet />} flip>
        <p>Three fields run across the top of the Charge modal:</p>
        <ul>
          <li><strong>Amount</strong> — the dollar figure to charge. It pre-fills with the difference between the page total and what’s already captured, so a typical edit is just “confirm and run.” Edit it freely; a blank or zero amount blocks the charge.</li>
          <li><strong>Reason</strong> — a dropdown: <strong>Order Edit</strong> (default), <strong>Shipping Upgrade</strong>, or <strong>Other</strong>. This is recorded on the order’s adjustment record.</li>
          <li><strong>Note</strong> — free text (defaults to “Order Charge”) that’s saved alongside the adjustment so the next person sees why.</li>
        </ul>
      </TourBox>

      <TourBox n={2} eyebrow="Pick a card" title="Payment methods" live={<MethodsSnippet />} wide>
        <p>Below the fields, the modal lists every card on file for this customer (fetched securely through the background script — you never see full numbers, only the type and last four). Each is a <strong>method row</strong>:</p>
        <ul>
          <li><strong>Click a row to select it.</strong> Selected rows get a numbered brand badge — the order you’ll try them in. You can queue several.</li>
          <li><strong>Run Charge</strong> (the footer button, disabled until at least one card is selected) works through your selected cards <em>top to bottom and stops at the first one that succeeds</em> — so queue a backup card and it only gets hit if the first declines.</li>
          <li>While a charge runs the <strong>Close</strong> button hides, so you can’t exit mid-charge. When it finishes the button reads <strong>Done</strong>.</li>
        </ul>
        <p>Try it — click the rows above to see the selection badges update.</p>
      </TourBox>

      <TourBox n={3} eyebrow="What happens after Run" title="Per-card result" live={<MethodsResultSnippet />} flip>
        <p>Each row morphs as it processes. A <strong>green check + transaction ID</strong> means the card was debited and the adjustment saved against the order. A <strong>red cross</strong> shows the bank’s actual decline reason. If a charge goes through but the adjustment record fails to save, the extension retries once and — if that also fails — flags it loudly (the money moved but the order wasn’t updated; that needs a manual fix before you close the order).</p>
      </TourBox>

      <TourBox n={4} eyebrow="The other tool" title="Order Edit — editor + live summary" live={<OrderSummarySnippet />} flip>
        <p><strong>Order Edit</strong> is for corrections that don’t warrant opening the whole order editor by hand. It opens a two-panel window: the CRM’s real order-edit form on the left (framed inline, so you stay on the page), and an <strong>Order Summary</strong> on the right that reads the cart live.</p>
        <p>The summary breaks down <strong>Financials</strong> (subtotal, shipping — flagged FREE when a promo zeroes it, tax, any promo/gift-cert discounts, and the order total), the active <strong>Promotion</strong> if one applies, a <strong>Charges</strong> block with what’s been captured and the outstanding <strong>Balance</strong> (red when money is owed, green when over-collected), and the chosen <strong>Shipping</strong> method. It’s the same balance math Charge uses — open Order Edit to see exactly what’s owed, then Charge it.</p>
      </TourBox>

      <h2 className="sec">Charge reasons</h2>
      <table className="spectable">
        <thead><tr><th style={{ width: 160 }}>Reason</th><th>When to use it</th></tr></thead>
        <tbody>{CHARGE_REASONS.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td></tr>)}</tbody>
      </table>

      <h2 className="sec">Reading a method row</h2>
      <table className="spectable">
        <thead><tr><th style={{ width: 120 }}>State</th><th>What it means</th></tr></thead>
        <tbody>{CHARGE_STATES.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td></tr>)}</tbody>
      </table>

      <div className="docnote info">
        <span className="dn-ico"><I.card size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Refunds use the same flow</div>
          <p style={{ margin: 0 }}>When the captured amount exceeds the order total the modal opens in <strong>Refund</strong> mode — red header, a Refund button instead of Run Charge — and runs a negative adjustment the same way. Both tools are gated by their feature toggles (<strong>Charge Card</strong> / <strong>Order Edit</strong> in <a href="#settings">Settings → Features</a>); switch one off and its button disappears everywhere.</p>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   SUBMIT PROOF
═══════════════════════════════════════════════════════════════ */

function ItemChip({ children, count }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 9px', borderRadius: 'var(--gb-r-pill, 999px)',
      background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)',
      color: 'var(--gb-brand-label)', fontSize: 11, fontWeight: 700,
    }}>
      {children}
      {count > 1 && <span style={{ fontFamily: 'var(--gb-font-mono)', opacity: 0.8 }}>×{count}</span>}
      <I.close size={10} />
    </span>
  );
}

function ProofItemsSnippet() {
  return (
    <MiniFrame width={520} label="submit proof · items" pad>
      <Field label="Item(s) being proofed" required>
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, padding: 8,
          background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-md)', minHeight: 38, alignItems: 'center',
        }}>
          <ItemChip count={2}>Ball</ItemChip>
          <ItemChip count={1}>Hats</ItemChip>
          <ItemChip count={1}>Divot Tools</ItemChip>
          <span style={{ fontSize: 11, color: 'var(--gb-text-ghost)' }}>+ Add item…</span>
        </div>
      </Field>
    </MiniFrame>
  );
}

function ProofFormSnippet() {
  const [orderId, setOrderId] = useState('29103');
  const [cust, setCust] = useState('4650030');
  const [name, setName] = useState('ATT - Divot Tool');
  const [status, setStatus] = useState('1');
  const [type, setType] = useState('Live Order');
  const [val, setVal] = useState('Under $2k');
  return (
    <MiniFrame width={540} label="submit proof · details" pad>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Order #"><Input size="xs" value={orderId} onChange={setOrderId} /></Field>
          <Field label="Customer ID" required hint="Drives the previous-proofs gallery"><Input size="xs" value={cust} onChange={setCust} /></Field>
        </div>
        <Field label="Proof link name" required><Input size="xs" value={name} onChange={setName} /></Field>
        <Field label="Logo status">
          <Dropdown size="sm" value={status} onChange={setStatus}
            options={[
              { id: '1', label: 'New logo (no proof yet)' },
              { id: '2', label: 'Awaiting approval (proof created)' },
              { id: '4', label: 'Digitization queue' },
              { id: '10', label: 'Approved' },
            ]} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Order type">
            <Segmented full size="sm" value={type} onChange={setType}
              options={[{ id: 'Live Order', label: 'Live' }, { id: 'Potential Order', label: 'Potential' }, { id: 'Jardine Order', label: 'Jardine' }]} />
          </Field>
          <Field label="Order value">
            <Segmented full size="sm" value={val} onChange={setVal}
              options={[{ id: 'Under $2k', label: 'Under $2k' }, { id: 'Over $2k', label: 'Over $2k' }]} />
          </Field>
        </div>
        <Field label="Flags & overrides">
          <div style={{ display: 'flex', gap: 5 }}>
            <Btn size="xs" variant="tinted" status="brand" icon={<I.bolt size={10} />}>Rush</Btn>
            <Btn size="xs" variant="secondary">Canada Drop</Btn>
            <Btn size="xs" variant="secondary">Drop Ship TS</Btn>
          </div>
        </Field>
      </div>
    </MiniFrame>
  );
}

function ProofResultsSnippet() {
  const LinkRow = ({ name, ok }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 6,
      background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-md)',
    }}>
      <span style={{
        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
        background: ok ? 'var(--gb-success)' : 'var(--gb-error)', color: '#111',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{ok ? <I.check size={11} /> : <I.close size={11} />}</span>
      <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>{name}</span>
      {ok
        ? <Btn size="xs" variant="ghost" icon={<I.copy size={10} />}>Copy</Btn>
        : <span style={{ fontSize: 10.5, color: 'var(--gb-error)' }}>generation failed</span>}
    </div>
  );
  return (
    <MiniFrame width={520} label="submit proof · results · 2 of 3 sent" pad>
      <LinkRow name="ATT - Ball" ok />
      <LinkRow name="ATT - Hats" ok />
      <LinkRow name="ATT - Divot Tool" ok={false} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
        <Btn size="sm" variant="ghost" icon={<I.copy size={11} />}>Copy all links</Btn>
        <Btn size="sm" variant="tinted" status="brand" icon={<I.mail size={11} />}>Open in Outlook</Btn>
      </div>
    </MiniFrame>
  );
}

const PROOF_ITEMS = [
  ['Ball', 'Logo type, ball color, imprint color, number of dozens, print method (Digital / Pad).'],
  ['Apparel · Hats · Towels · Bags · Gloves', 'Decorator, decoration method, item color, logo placement, imprint color.'],
  ['Poker Chip · Ball Marker · Divot Tools', 'Logo type, item color, imprint color.'],
  ['Tees', 'Tee size, one/two-color imprint, item color.'],
  ['Gift Set variants', 'Logo type is locked to “Gift Set”; no extra fields.'],
  ['Flags · Other · Pad to Digital Request', 'Minimal or no extra fields — “Other” adds an item name.'],
];

const PROOF_STATUS = [
  ['New logo (no proof yet)', 'First time through — nothing has been drawn up.'],
  ['Awaiting approval (proof created)', 'A proof exists and is out for the customer’s sign-off.'],
  ['Digitization queue', 'Queued for embroidery digitization.'],
  ['Approved', 'Signed off and ready to produce.'],
];

export function ProofPage() {
  return (
    <div className="prose">
      <div className="eyebrow">Daily Driver</div>
      <h1 className="title">Submit Proof</h1>
      <p className="lede">
        The full proof-request form, sent straight to the art team. Open it from the popup, the Actions Shelf
        on an order page, or the <a href="#image-viewer">Image Viewer</a> (the image rides along). Order # and
        Customer ID pre-fill from the page; the right column shows the customer’s previous proofs so you can
        catch a duplicate before submitting. Build it up below, piece by piece.
      </p>

      <div className="docnote info">
        <span className="dn-ico"><I.send size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">One request per item, all at once</div>
          <p style={{ margin: 0 }}>Pick several items and each gets its own proof block and its own generated link — but you fill the shared details (customer, rep, artist, flags) only once. The whole thing submits in a single pass with live per-item progress.</p>
        </div>
      </div>

      <h2 className="sec">Build the request, top to bottom</h2>

      <TourBox n={1} eyebrow="What are you proofing" title="The item multi-select" live={<ProofItemsSnippet />} flip>
        <p>The first field is a <strong>multi-select</strong>. Pick from Ball, Apparel, Hats, Towels, Bags, Gloves, Poker Chip, Ball Marker, Divot Tools, Tees, Flags, the Gift Set variants, and Other. Picked items show as chips; pick the same item twice (a “×2” chip) and you get two separate proof blocks for it. Each chip’s × removes one instance. <em>This is required</em> — you can’t submit with nothing selected.</p>
      </TourBox>

      <TourBox n={2} eyebrow="The shared details" title="IDs, status, rep & flags" live={<ProofFormSnippet />} wide>
        <p>One block of details applies to every item in the request:</p>
        <ul>
          <li><strong>Order #</strong> / <strong>Customer ID</strong> — pre-filled from the page. Customer ID is required and drives the previous-proofs gallery on the right.</li>
          <li><strong>Proof link name</strong> — required; e.g. “ATT – Divot Tool”. Each item’s block auto-extends this name (and you can override it per block).</li>
          <li><strong>Logo status</strong> — where this art is in its lifecycle (see the table below).</li>
          <li><strong>Sales rep</strong> / <strong>Artist</strong> — searchable dropdowns scraped live from the CRM. Your own name auto-selects from your email setting. If the scrape fails they fall back to plain ID text boxes so you can still submit.</li>
          <li><strong>Order type</strong> (Live · Potential · Jardine) and <strong>value</strong> (Under / Over $2k) — sliding-pill selectors.</li>
          <li><strong>Flags</strong> — toggle chips for <strong>Rush</strong> ⚡, <strong>Canada Drop</strong>, and <strong>Drop Ship TS</strong>.</li>
        </ul>
      </TourBox>

      <TourBox stack eyebrow="Per-item detail" title="The proof blocks adapt to each item">
        <p>Below the shared details, every selected item adds a <strong>“Proof N of M”</strong> block with an editable auto-generated name and fields tailored to that item type — a ball asks for dozens and print method, apparel asks for decorator and placement, tees ask size and color count, gift sets lock the logo type. Under the blocks sit an <strong>Item link</strong>, <strong>Reference logo links</strong> (one per line), and <strong>Special instructions</strong> (“Write N/A if unneeded”). You can drag image files anywhere onto the modal to attach them — non-hosted images get an amber warning because they won’t render inside email templates.</p>
      </TourBox>

      <TourBox n={3} eyebrow="Sending & results" title="Send request, then the links" live={<ProofResultsSnippet />} flip>
        <p><strong>Send request</strong> submits each item in turn, showing live progress (“2 of 3…”). When it finishes you get the <strong>results panel</strong>: one row per item with its generated proof link and a <strong>Copy</strong> button (failed items say so), plus <strong>Copy all links</strong> and <strong>Open in Outlook</strong> to drop the whole batch — pre-formatted subject and body — into an email to the art team. If every item fails, the form stays put so you can retry.</p>
      </TourBox>

      <h2 className="sec">Item-specific fields</h2>
      <table className="spectable">
        <thead><tr><th style={{ width: 240 }}>Item</th><th>Fields its proof block asks for</th></tr></thead>
        <tbody>{PROOF_ITEMS.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td></tr>)}</tbody>
      </table>

      <h2 className="sec">Logo status options</h2>
      <table className="spectable">
        <thead><tr><th style={{ width: 240 }}>Status</th><th>Meaning</th></tr></thead>
        <tbody>{PROOF_STATUS.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td></tr>)}</tbody>
      </table>

      <div className="docnote brand">
        <span className="dn-ico"><I.eye size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Check the gallery first</div>
          <p style={{ margin: 0 }}>When a Customer ID is present, the right column loads that customer’s previous proofs with version labels and approval status. Scan it before you submit — re-proofing art that already exists wastes the art team’s time.</p>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   MARGIN CALCULATOR
═══════════════════════════════════════════════════════════════ */

function MarginSnippet({ low }) {
  const [cost, setCost] = useState(low ? '8.50' : '6.00');
  const [price, setPrice] = useState('12.00');
  const sym = (ch) => <span style={{ fontWeight: 700, color: 'var(--gb-text-muted)' }}>{ch}</span>;
  const c = parseFloat(cost) || 0;
  const p = parseFloat(price) || 0;
  const profit = p - c;
  const margin = p ? (profit / p) * 100 : 0;
  const markup = c ? (profit / c) * 100 : 0;
  const fmt = (n) => Number.isFinite(n) ? n.toFixed(2) : '';
  return (
    <MiniFrame width={360} label="margin calculator · ctrl+m" pad>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Item Cost"><Input size="sm" mono inputMode="decimal" leading={sym('$')} value={cost} onChange={setCost} /></Field>
          <Field label="Selling Price"><Input size="sm" mono inputMode="decimal" leading={sym('$')} value={price} onChange={setPrice} /></Field>
        </div>
        <div style={{ height: 1, background: 'var(--gb-border-subtle)' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Gross Margin"><Input size="sm" mono trailing={sym('%')} value={fmt(margin)} onChange={() => {}} /></Field>
          <Field label="Markup"><Input size="sm" mono trailing={sym('%')} value={fmt(markup)} onChange={() => {}} /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '0.55fr 1fr 1fr', gap: 8 }}>
          <Field label="Qty"><Input size="sm" mono value="1" onChange={() => {}} /></Field>
          <Field label="Unit Profit"><Input size="sm" mono leading={sym('$')} value={fmt(profit)} onChange={() => {}} /></Field>
          <Field label="Total Profit"><Input size="sm" mono leading={sym('$')} value={fmt(profit)} onChange={() => {}} /></Field>
        </div>
        {low && margin > 0 && margin < 30 && (
          <Callout tone="warning" title={`Margin ${margin.toFixed(1)}% is below 30% threshold.`}>
            Increased sell price recomended.
          </Callout>
        )}
      </div>
    </MiniFrame>
  );
}

const MARGIN_FIELDS = [
  ['Item Cost', 'What the item costs you. Auto-fills from inventory when a SKU lookup succeeds, or type it.'],
  ['Selling Price', 'What you’re charging the customer.'],
  ['Gross Margin %', 'Profit as a percentage of the sell price — the number management cares about. = (Price − Cost) ÷ Price.'],
  ['Markup %', 'Profit as a percentage of cost. = (Price − Cost) ÷ Cost.'],
  ['Qty', 'How many units; multiplies the unit profit into the total. Defaults to 1.'],
  ['Unit Profit', 'Dollars of profit per unit. = Price − Cost.'],
  ['Total Profit', 'Read-only result. Unit Profit × Qty, counting up/down as you type. Red once there’s a real number.'],
];

export function MarginPage() {
  return (
    <div className="prose">
      <div className="eyebrow">On-page Helpers</div>
      <h1 className="title">Margin Calculator</h1>
      <p className="lede">
        Press <span className="kbd">Ctrl+M</span> on any order page (or use the Actions Shelf) for instant
        cost / price / margin / markup / profit math. <strong>Enter any two values and the rest compute as you
        type.</strong> It can pull real per-unit costs from inventory and flags anything below your minimum
        margin. The real calculator is reproduced below — type in the live fields.
      </p>

      <h2 className="sec">Every field, and how they relate</h2>

      <TourBox n={1} eyebrow="The whole calculator" title="Enter any two, get the rest" live={<MarginSnippet low={false} />} flip>
        <p>The six inputs are all linked. Fill any two — typically <strong>Item Cost</strong> and <strong>Selling Price</strong> — and the calculator solves for the others instantly. The field you’re typing in is never overwritten, so a partial entry like “12.” survives while you finish it.</p>
        <p>The first row is <strong>Item Cost</strong> and <strong>Selling Price</strong>. Below the divider: <strong>Gross Margin %</strong> (profit ÷ price — the headline number) and <strong>Markup %</strong> (profit ÷ cost). The bottom row is <strong>Qty</strong>, <strong>Unit Profit</strong>, and the read-only <strong>Total Profit</strong> that animates as the numbers change. <strong>Clear all</strong> in the footer resets everything.</p>
      </TourBox>

      <TourBox n={2} eyebrow="The guardrail" title="Minimum-margin warning" live={<MarginSnippet low />} flip>
        <p>When the gross margin drops below your configured minimum (default <strong>30%</strong>), an amber warning slides in naming the exact figure — “Margin 29.2% is below 30% threshold.” It only fires on a real positive margin under the line; an empty or zero margin is treated as “no signal,” not a violation. Try lowering the price in the snippet above to push the margin under 30 and watch it appear.</p>
        <p>Admins can change the threshold (or set it to 0 to disable the warning entirely) under <a href="#settings">Settings → Developer Settings → “Minimum allowed margin.”</a></p>
      </TourBox>

      <TourBox stack eyebrow="Real costs" title="Inventory cost lookup">
        <p>Beyond raw math, the calculator can pull <strong>live per-unit cost and stock levels</strong> for a SKU straight from the company inventory system, keyed on the human SKU (e.g. <code>B3273</code>). Costs are cached after the first lookup and a bulk sync keeps the cost map warm, so most lookups are instant. If a cost won’t load you usually need an active session on the office portal — see the troubleshooting article.</p>
      </TourBox>

      <h2 className="sec">Field reference</h2>
      <table className="spectable">
        <thead><tr><th style={{ width: 150 }}>Field</th><th>What it is</th></tr></thead>
        <tbody>{MARGIN_FIELDS.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td></tr>)}</tbody>
      </table>

      <div className="docnote info">
        <span className="dn-ico"><I.calc size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">It’s a scratch pad — nothing saves</div>
          <p style={{ margin: 0 }}>The calculator doesn’t write anything to the order; it’s purely for working out a price before you quote or charge it. Close it (<span className="kbd">Ctrl+M</span> again, or Esc) and the numbers clear. The count-up animation on Total Profit is configurable in Developer Settings.</p>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   COPY ORDER IDS & SIGNIFYD RISK GLOW
═══════════════════════════════════════════════════════════════ */

function CopyActionSnippet() {
  return (
    <MiniFrame width={320} label="actions shelf · order index" pad>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
        background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-md)', cursor: 'pointer',
      }}>
        <span style={{
          width: 30, height: 30, borderRadius: 'var(--gb-r-md)', flexShrink: 0,
          background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)',
          color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><I.copy size={15} /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Copy order IDs</div>
          <div style={{ fontSize: 11, color: 'var(--gb-text-muted)' }}>42 orders on this page</div>
        </div>
      </div>
    </MiniFrame>
  );
}

function GlowSnippet() {
  const Row = ({ id, cust, total, risky }) => (
    <div style={{
      display: 'grid', gridTemplateColumns: '70px 1fr 70px', alignItems: 'center', gap: 8,
      padding: '9px 11px', marginBottom: 5, fontSize: 11.5,
      background: risky ? 'color-mix(in srgb, var(--gb-error) 14%, var(--gb-surface-1))' : 'var(--gb-surface-1)',
      border: `1px solid ${risky ? 'var(--gb-error)' : 'var(--gb-border-subtle)'}`,
      borderRadius: 'var(--gb-r-md)',
      boxShadow: risky ? 'inset 0 0 14px 2px color-mix(in srgb, var(--gb-error) 35%, transparent)' : 'none',
    }}>
      <span style={{ fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-brand-label)', fontWeight: 700 }}>{id}</span>
      <span style={{ color: 'var(--gb-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
        {cust}
        {risky && <Tag tone="error" size="xs">SignifydFailed</Tag>}
      </span>
      <span style={{ fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)', textAlign: 'right' }}>{total}</span>
    </div>
  );
  return (
    <MiniFrame width={420} label="order index · signifyd glow" pad>
      <Row id="29103" cust="Acme Industries" total="$128.45" />
      <Row id="29104" cust="Globex Corp" total="$2,940.00" risky />
      <Row id="29105" cust="Initech LLC" total="$56.00" />
    </MiniFrame>
  );
}

export function OrderExtrasPage() {
  return (
    <div className="prose">
      <div className="eyebrow">On-page Helpers</div>
      <h1 className="title">Order IDs &amp; Risk Glow</h1>
      <p className="lede">
        Two small helpers that live on the order <strong>index</strong> page (the list of orders).
        <strong> Copy Order IDs</strong> grabs every order number on the page in one click, and the
        <strong> Signifyd Glow</strong> tints risky orders so they catch your eye. Both are reproduced live below.
      </p>

      <h2 className="sec">The two helpers</h2>

      <TourBox n={1} eyebrow="One click, every ID" title="Copy Order IDs" live={<CopyActionSnippet />} flip>
        <p>On the order index page, the <a href="#actions-shelf">Actions Shelf</a> offers <strong>Copy order IDs</strong> (its hint counts the orders it found). One click puts every listed order number on your clipboard, ready to paste into a report, spreadsheet, or email.</p>
        <p>It copies in two formats at once: a rich version (each ID is a clickable link to its order, with real line breaks for Outlook and Teams) and a plain-text fallback for everything else. Newly-loaded rows are picked up at click time, so scroll to load the table first if the count looks low. The action is gated by the <strong>Copy Order IDs</strong> feature toggle.</p>
      </TourBox>

      <TourBox n={2} eyebrow="Fraud at a glance" title="Signifyd risk glow" live={<GlowSnippet />} flip>
        <p>Signifyd is the fraud-scoring service the store runs. When an order page carries a <strong>SignifydFailed</strong> tag, the extension wraps the order content in a soft red inset glow — a strong, unmissable visual warning that this order tripped the fraud check. The glow re-applies automatically as the page lays out and on resize, so it stays pinned to the order even while you scroll.</p>
        <p>Treat the glow as a <em>triage cue, not a verdict</em>: it tells you to look, not to act. Open the order and check the actual Signifyd case before you hold, cancel, or release it. The effect is gated by the <strong>Signifyd Glow</strong> feature toggle.</p>
      </TourBox>

      <div className="cardgrid">
        <div className="featurecard">
          <span className="fc-ico"><I.copy size={17} /></span>
          <div className="fc-t">Copy Order IDs</div>
          <div className="fc-d">Shelf action on the order index. Copies every order number — links + plain text — in one click.</div>
        </div>
        <div className="featurecard">
          <span className="fc-ico"><I.alert size={17} /></span>
          <div className="fc-t">Signifyd Glow</div>
          <div className="fc-d">A red inset glow on any order flagged SignifydFailed, so high-risk orders stand out instantly.</div>
        </div>
      </div>

      <div className="docnote warn">
        <span className="dn-ico"><I.alert size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">The glow is a flag, not a decision</div>
          <p style={{ margin: 0 }}>A glowing order isn’t automatically fraud — it’s an order Signifyd wants a human to review. Always open the case and read the score before holding or canceling. Both helpers are toggled under <a href="#settings">Settings → Features</a>, alongside the rest of the Orders &amp; Pricing tools.</p>
        </div>
      </div>
    </div>
  );
}
