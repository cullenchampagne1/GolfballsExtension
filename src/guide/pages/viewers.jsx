import React, { useState } from 'react';
import { I, Icon, Tag, Btn, IconBtn, Dropdown, Slider } from '../../ui/index.js';
import { TourBox, MiniFrame } from '../lib/tourbox.jsx';

/* ───────────────────────────────────────────────────────────────
   viewers.jsx — On-page Helpers → the three "look at this" modals
   the extension pops over a CRM/order page:

     • EmailViewerPage  — Email / Chat Viewer (EmailPreview + TextPreview)
     • ImageViewerPage  — Image Viewer & Logo Extraction (ImagePreview)
     • Viewer3DPage     — 3D Product Viewer (GolfballViewer)

   None of the three source modals forward `contained` / `portalContainer`
   (they mount FloatingPanel directly and would normally still embed via
   FloatingPanelEmbedContext), but each needs a tall, multi-hundred-px
   layout and elaborate live sample data — and ImagePreview pulls the
   three.js GolfballViewer + grass-mockup compositor into the tree. So
   every demo here is a hand-built, visually-faithful MiniFrame snippet
   that mirrors the real chrome (floating controls, glass chips, toggles,
   bubbles, the 3D control strip) using the real src/ui primitives and
   the same --gb-* tokens the modals use. The prose is rewritten from the
   verified articles: email-thread-preview, text-note-preview, image-viewer,
   mockup-composer, 3d-product-viewer.
─────────────────────────────────────────────────────────────── */

/* Local glyphs the I-registry doesn't ship (mirroring the modals'
   own inline icons). */
const ChatGlyph = (p) => <Icon {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Icon>;
const ImageGlyph = (p) => <Icon {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></Icon>;
const CubeGlyph = (p) => <Icon {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.27 6.96L12 12.01l8.73-5.05" /><path d="M12 22.08V12" /></Icon>;
const AlignGlyph = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /><path d="M12 1v3M12 20v3M1 12h3M20 12h3" /></Icon>;
const CameraGlyph = (p) => <Icon {...p}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></Icon>;
const DropperGlyph = (p) => <Icon {...p}><path d="M19 3a2.83 2.83 0 0 0-4 0l-1.5 1.5 4 4L19 7a2.83 2.83 0 0 0 0-4z" /><path d="M13 6.5L4 15.5V20h4.5l9-9" /></Icon>;

/* The glass-frosted floating control used across the image viewer. A
   faithful copy of GlassIconBtn from ImageColorSwap — small frosted
   square that lights up brand-tinted when `active`. */
const GLASS = {
  bg: 'color-mix(in srgb, var(--gb-surface-canvas) 62%, transparent)',
  border: 'color-mix(in srgb, var(--gb-border-strong) 70%, transparent)',
  filter: 'blur(10px) saturate(150%)',
  shadow: '0 4px 14px -6px rgba(0,0,0,.5)',
  radius: 8,
};
function GlassBtn({ icon, active, label }) {
  return (
    <span title={label} style={{
      width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: active ? 'var(--gb-brand-tint-medium)' : GLASS.bg,
      backdropFilter: GLASS.filter, WebkitBackdropFilter: GLASS.filter,
      border: `1px solid ${active ? 'var(--gb-brand-tint-border)' : GLASS.border}`,
      borderRadius: GLASS.radius, boxShadow: GLASS.shadow,
      color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', cursor: 'default',
    }}>{icon}</span>
  );
}
function GlassChip({ children, mono = true }) {
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4,
      color: 'var(--gb-text-secondary)', background: GLASS.bg,
      backdropFilter: GLASS.filter, WebkitBackdropFilter: GLASS.filter,
      border: `1px solid ${GLASS.border}`, borderRadius: GLASS.radius, boxShadow: GLASS.shadow,
      padding: '2px 7px', fontFamily: mono ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)',
    }}>{children}</span>
  );
}
function ZoomChip({ children }) {
  return (
    <span style={{
      minWidth: 26, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 7px', fontSize: 11, fontWeight: 700, fontFamily: 'var(--gb-font-mono)',
      color: 'var(--gb-text-secondary)', background: GLASS.bg,
      backdropFilter: GLASS.filter, WebkitBackdropFilter: GLASS.filter,
      border: `1px solid ${GLASS.border}`, borderRadius: GLASS.radius, boxShadow: GLASS.shadow,
    }}>{children}</span>
  );
}

/* Shared modal-style header bar used by the email + chat snippets. */
function ViewerHeader({ icon, title, tag, sub, toggle, onClose = true }) {
  return (
    <div style={{
      padding: '12px 16px', background: 'var(--gb-fill-inverse-strong)',
      borderBottom: '1px solid var(--gb-border-default)',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 'var(--gb-r-md)',
        background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)',
        color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: -0.2, color: 'var(--gb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
          {tag && <Tag size="xs" tone={tag.tone || 'neutral'}>{tag.label}</Tag>}
        </div>
        {sub && <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 2, fontFamily: 'var(--gb-font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
      </div>
      {toggle}
      {onClose && <IconBtn size="sm" icon={<I.close />} />}
    </div>
  );
}

/* A two-option pill toggle matching the Case/Inbox and Case/Notes
   header switches. */
function PillToggle({ value, onChange, options }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', padding: 3, gap: 2,
      background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-md)', flexShrink: 0,
    }}>
      {options.map((m) => {
        const on = value === m.id;
        return (
          <button key={m.id} type="button" onClick={() => onChange(m.id)} style={{
            padding: '0 10px', height: 22, border: 'none', cursor: 'pointer',
            background: on ? 'var(--gb-brand-tint-medium)' : 'transparent',
            color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)',
            fontSize: 11, fontWeight: 700, letterSpacing: 0.3, borderRadius: 'var(--gb-r-sm)',
          }}>{m.label}</button>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   1 · EMAIL / CHAT VIEWER
═══════════════════════════════════════════════════════════════ */

function MiniAvatar({ initials, hue = 110, size = 26 }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `oklch(0.30 0.07 ${hue})`, color: `oklch(0.86 0.10 ${hue})`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', letterSpacing: -0.3,
      border: '1px solid color-mix(in srgb, currentColor 30%, transparent)',
    }}>{initials}</span>
  );
}

/* A single message card from the email thread (collapsible). */
function MailCard({ initials, hue, name, addr, time, sent, expanded, body }) {
  return (
    <div style={{
      border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)',
      background: 'var(--gb-surface-1)', marginBottom: 8, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px' }}>
        <MiniAvatar initials={initials} hue={hue} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{name}</span>
            <span style={{ fontSize: 10, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>&lt;{addr}&gt;</span>
          </div>
          <div style={{ fontSize: 9.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)', marginTop: 1 }}>{time}</div>
        </div>
        {sent && <Tag size="xs" tone="brand">SENT</Tag>}
        <span style={{ color: 'var(--gb-text-muted)', transform: expanded ? 'none' : 'rotate(-90deg)', display: 'flex' }}><I.chevd size={13} /></span>
      </div>
      {expanded && (
        <div style={{ padding: '0 13px 12px 48px', fontSize: 12, lineHeight: 1.6, color: 'var(--gb-text-secondary)' }}>{body}</div>
      )}
    </div>
  );
}

function EmailSnippet() {
  const [mode, setMode] = useState('inbox');
  const isCase = mode === 'case';
  return (
    <MiniFrame width={isCase ? 620 : 460} label="golfballs.com · email preview" pad={false}>
      <div style={{ background: 'var(--gb-surface-canvas)', borderRadius: '0 0 var(--gb-r-md) var(--gb-r-md)', overflow: 'hidden' }}>
        <ViewerHeader
          icon={<I.mail size={14} />}
          title="Re: Order #4471823 — wrong shaft flex"
          sub="Sarah Patel · sarah@pebblecreek.com · CASE-90214"
          toggle={<PillToggle value={mode} onChange={setMode} options={[{ id: 'case', label: 'Case' }, { id: 'inbox', label: 'Inbox' }]} />}
        />
        <div style={{ display: 'flex', minHeight: 0 }}>
          {/* LEFT — thread */}
          <div style={{ flex: 1, minWidth: 0, padding: '12px 14px', borderRight: isCase ? '1px solid var(--gb-border-default)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>
              <span>Thread</span>
              <span style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />
              <span style={{ fontFamily: 'var(--gb-font-mono)', letterSpacing: 0, textTransform: 'none', color: 'var(--gb-text-tertiary)' }}>2 messages</span>
            </div>
            <MailCard initials="SP" hue={20} name="Sarah Patel" addr="sarah@pebblecreek.com" time="Today · 9:14 AM" expanded
              body="Hi — the dozen we got came stiff-flex but our order says regular. Can we swap before the tournament Saturday?" />
            <MailCard initials="GB" hue={130} name="You (Golfballs CS)" addr="cs@golfballs.com" time="Yesterday · 4:02 PM" sent
              body="Thanks for the order, Sarah! Confirming your imprint proof is attached…" />
            {/* reply bar */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, padding: '10px 12px',
              background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)',
            }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><I.send size={11} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>Reply to Sarah Patel</div>
                <div style={{ fontSize: 9.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>Click to write a draft</div>
              </div>
              <Tag size="xs" tone="neutral" mono>DRAFT</Tag>
            </div>
          </div>
          {/* RIGHT — categorize rail (case mode) */}
          {isCase && (
            <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--gb-border-subtle)' }}>
                <Dropdown size="sm" value="t1" options={[{ id: 't1', label: 'Order Change · Flex swap' }]} />
                <Btn size="sm" variant="primary" status="brand" icon={<I.send size={11} />} full style={{ marginTop: 6 }}>Send template</Btn>
              </div>
              <div style={{ padding: '10px 12px', flex: 1 }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--gb-text-muted)', marginBottom: 8 }}>Categorize</div>
                {[
                  { star: true, k: '1', label: 'Order Change' },
                  { star: true, k: '2', label: 'Returns / Reprint' },
                  { star: false, k: '3', label: 'Order Status Update' },
                  { star: false, k: '4', label: 'Cancelation' },
                ].map((r) => (
                  <div key={r.k} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', marginBottom: 4,
                    borderRadius: 'var(--gb-r-sm)', fontSize: 11.5, color: 'var(--gb-text-secondary)',
                    background: r.star ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-1)',
                    border: '1px solid ' + (r.star ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-subtle)'),
                  }}>
                    <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 9.5, color: 'var(--gb-text-muted)' }}>{r.k}</span>
                    {r.star && <span style={{ color: 'var(--gb-brand-label)' }}><I.sparkle size={11} /></span>}
                    <span style={{ flex: 1 }}>{r.label}</span>
                  </div>
                ))}
                <Btn size="sm" variant="secondary" status="error" icon={<I.alert size={11} />} full style={{ marginTop: 8 }}>Junk</Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    </MiniFrame>
  );
}

/* Chat / Text preview snippet — visitor left, agent right, system
   divider, a SnapEngage link pill, an amber NOTE. */
function ChatBubble({ side, initials, hue, name, time, body }) {
  const agent = side === 'right';
  return (
    <div style={{ display: 'flex', flexDirection: agent ? 'row-reverse' : 'row', gap: 9, marginTop: 10 }}>
      <MiniAvatar initials={initials} hue={hue} size={24} />
      <div style={{ maxWidth: '74%', display: 'flex', flexDirection: 'column', alignItems: agent ? 'flex-end' : 'flex-start' }}>
        <div style={{ display: 'flex', gap: 6, fontSize: 9.5, color: 'var(--gb-text-muted)', marginBottom: 2 }}>
          <span style={{ fontWeight: 700, color: 'var(--gb-text-secondary)' }}>{name}</span>
          <span style={{ fontFamily: 'var(--gb-font-mono)' }}>{time}</span>
        </div>
        <div style={{
          padding: '7px 11px', fontSize: 11.5, lineHeight: 1.5,
          borderRadius: 'var(--gb-r-md)', color: 'var(--gb-text-primary)',
          background: agent ? 'color-mix(in srgb, var(--gb-brand-label) 10%, var(--gb-surface-1))' : 'var(--gb-surface-2)',
          border: '1px solid ' + (agent ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-subtle)'),
        }}>{body}</div>
      </div>
    </div>
  );
}

function ChatSnippet() {
  return (
    <MiniFrame width={470} label="golfballs.com · chat preview" pad={false}>
      <div style={{ background: 'var(--gb-surface-canvas)', borderRadius: '0 0 var(--gb-r-md) var(--gb-r-md)', overflow: 'hidden' }}>
        <ViewerHeader
          icon={<ChatGlyph size={14} />}
          title="Live Chat Transcript"
          tag={{ label: 'READ-ONLY', tone: 'neutral' }}
          sub="CASE-90377 · Promo code wouldn't apply"
          toggle={<IconBtn size="sm" variant="ghost" icon={<I.copy />} />}
        />
        <div style={{ padding: '12px 16px 14px' }}>
          {/* system divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />
            <span style={{ padding: '3px 9px', borderRadius: 'var(--gb-r-pill)', background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)', fontSize: 9, fontWeight: 600, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>Chat started · 2:41 PM</span>
            <div style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />
          </div>
          <ChatBubble side="left" initials="V" hue={200} name="Visitor" time="2:41 PM" body="The code SUMMER15 isn't taking at checkout." />
          <ChatBubble side="right" initials="MR" hue={130} name="Maria R." time="2:42 PM" body="Happy to help! That promo ended Friday — I can apply a one-time 10% instead." />
          {/* note */}
          <div style={{ margin: '10px 0', padding: '8px 11px', background: 'var(--gb-warning-tint-soft)', border: '1px solid var(--gb-warning-tint-border)', borderRadius: 'var(--gb-r-md)', fontSize: 11.5, lineHeight: 1.5, color: 'var(--gb-text-secondary)' }}>
            <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--gb-warning-fg)', marginRight: 8 }}>Note</span>
            Applied manual coupon MR-10OFF, ref #88231.
          </div>
          {/* link pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', borderRadius: 'var(--gb-r-pill)', fontSize: 10, fontWeight: 700, fontFamily: 'var(--gb-font-mono)' }}><I.bolt size={10} /> View full transcript on SnapEngage</span>
            <div style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />
          </div>
        </div>
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--gb-border-default)', background: 'var(--gb-surface-1)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 10.5, color: 'var(--gb-text-muted)' }}>
          <Tag size="xs" tone="neutral">VIEW ONLY</Tag>
          <span>replies happen in SnapEngage</span>
        </div>
      </div>
    </MiniFrame>
  );
}

const EMAIL_KEYS = [
  ['1 – 9', 'Apply the Nth recommended category (case mode)'],
  ['Click category', 'Apply it with its first subcategory'],
  ['Click subcategory', 'Apply the exact category + subcategory pair'],
  ['Esc', 'Close the viewer'],
];

const CASE_CATALOG = [
  ['Order Status Update', 'Lost Package · Carrier Issue · Tracking Update · Out of Stock · Drop Ships · Late Ship · Misunderstanding'],
  ['Returns / Reprint', 'Wrong Item Ordered (Customer Error) · Wrong Item Shipped (GBC Error) · Manufacture Error/Defect · Lost in Transit · printing-defect variants'],
  ['Charge Error', 'Fixed – System did not charge · Actual Charge Error – Resolved by CSR · Fraud · Card did not populate'],
  ['Order Change', 'Quantity · Personalization Edit · Shipping Address · Payment Method · Product Change'],
  ['Cancelation', 'Out of Stock · Customer Changed Mind · Delivery Delays · better price/quality found'],
  ['Website Concerns', 'Cannot Load cart · Cannot Login · Cannot Check out · Promo Codes · Price Variance'],
  ['Also', 'Place an Order · Product Inquiry · Transfer · Fraud Inquiry · International Orders · Profanity · General Inquiry · CSAT · Other'],
];

export function EmailViewerPage() {
  return (
    <div className="prose">
      <div className="eyebrow">On-page Helpers</div>
      <h1 className="title">Email &amp; Chat Viewer</h1>
      <p className="lede">
        Click the preview button on an email or chat row and the whole conversation opens in place — no
        new tab, no hunting through Outlook. Email threads render as stacked message cards; live-chat
        transcripts render as a proper conversation. On a case page, the same <strong>Categorize rail</strong>
        rides along on the right so you can tag and (for email) reply without leaving the page.
      </p>

      <EmailSnippet />

      <h2 className="sec">The email viewer, card by card</h2>
      <p>Each block pairs a piece of the real chrome with what it does. Flip the Case/Inbox toggle in the demo above to see the rail appear.</p>

      <TourBox n={1} eyebrow="Read" title="The thread" live={<ChatSnippet />} flip>
        <p>Open an email row and the thread builds itself: <strong>one card per message</strong> in chronological order, each with the sender's avatar, their <code>Name &lt;email&gt;</code>, a timestamp, and a green <strong>SENT</strong> badge on messages from our side. Quoted replies are split off into their own collapsible cards — click a collapsed one to expand it. The header reads <strong>Thread · N messages</strong>.</p>
        <p>The body renders the real HTML (dark-mode normalised, no iframe). The <strong>Case / Inbox</strong> toggle in the header flips the categorize rail on and off in place. (The snippet here is the sibling chat viewer — same chrome, conversation layout.)</p>
      </TourBox>

      <TourBox n={2} eyebrow="Tag the case" title="The Categorize rail" live={<EmailSnippet />} wide>
        <p>On case pages a categorize rail sits on the right. <strong>Recommended chips</strong> (marked with a ✦ star) come from the selected reply template's case tags — press <span className="kbd">1</span>–<span className="kbd">9</span> to apply the Nth recommendation, or browse the full list. <strong>Clicking a category</strong> applies it with its first subcategory; <strong>clicking a subcategory</strong> applies the exact pair. The status line shows <em>Saving…</em> then <em>Applied: &lt;subcategory&gt;</em>.</p>
        <p>At the top of the rail sits a <strong>reply-template picker + Send</strong> (only templates whose match rules fit this email show up); picking one drives the ✦ recommendations. A red <strong>Junk</strong> button is pinned at the bottom for spam.</p>
      </TourBox>

      <TourBox n={3} eyebrow="Respond" title="The reply composer" live={<ChatSnippet />} flip>
        <p>The bar at the bottom — <strong>Reply to &lt;address&gt;</strong> — expands into a composer with <strong>To</strong>, <strong>Subject</strong> (pre-filled <code>RE:</code>), and a rich-text body seeded with your signature, caret already at the top. The reply target is resolved automatically to the <strong>customer</strong> side of the thread; our own domains are skipped, so replying to a message we sent still drafts to them.</p>
        <p>One thing to know: the composer writes a <strong>draft only</strong> — it does not send from here. Finish and send it from Outlook. (The snippet is the chat viewer, which is read-only by design — replies there happen in SnapEngage.)</p>
      </TourBox>

      <TourBox n={4} eyebrow="Sibling viewer" title="Chat / text transcripts" live={<ChatSnippet />} wide>
        <p>The preview button on a <strong>chat or note row</strong> opens the same surface in transcript form: visitor messages on the left, <strong>agent messages right-aligned</strong> with a brand tint, system events as centered divider badges, internal notes in amber <strong>NOTE</strong> boxes, and a <strong>View full transcript on SnapEngage</strong> pill when a link exists. The header counts parsed messages and carries a <strong>READ-ONLY</strong> tag.</p>
        <p>It's view-only by design (the footer says so) — replies happen in SnapEngage. On case pages the <strong>same categorize rail</strong> as the email viewer appears for tagging the case, minus the reply picker.</p>
      </TourBox>

      <h2 className="sec">The case category catalog</h2>
      <p>What the rail offers, top to bottom. Each category carries its own subcategory list; you can apply at either level.</p>
      <table className="spectable">
        <thead><tr><th style={{ width: 180 }}>Category</th><th>Subcategories (examples)</th></tr></thead>
        <tbody>{CASE_CATALOG.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td></tr>)}</tbody>
      </table>

      <h3 className="sub">Keyboard &amp; clicks</h3>
      <table className="spectable">
        <thead><tr><th style={{ width: 150 }}>Action</th><th>Does</th></tr></thead>
        <tbody>{EMAIL_KEYS.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td></tr>)}</tbody>
      </table>

      <div className="docnote warn" style={{ marginTop: 24 }}>
        <span className="dn-ico"><I.alert size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">The composer drafts — it doesn't send</div>
          <p style={{ margin: 0 }}>The email reply composer writes a <strong>draft</strong> only; finish and send it from Outlook. The chat viewer never sends at all — it's read-only, and replies happen in SnapEngage. Both viewers are about <em>reading and triaging</em> fast, then handing off to the tool that actually sends.</p>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   2 · IMAGE VIEWER & LOGO EXTRACTION
═══════════════════════════════════════════════════════════════ */

/* The dark graph-paper preview surface with the full floating-control
   layout. `mode` swaps between the plain 2D view, the alignment ring,
   and the eyedropper/swap state so the snippets can show each. */
function PreviewSurface({ mode = '2d', height = 230 }) {
  const aligning = mode === 'align';
  return (
    <div style={{
      position: 'relative', height, width: '100%',
      backgroundColor: 'var(--gb-surface-2)',
      backgroundImage: 'linear-gradient(var(--gb-border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--gb-border-subtle) 1px, transparent 1px)',
      backgroundSize: '18px 18px',
      border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* faux logo */}
      <div style={{
        width: 96, height: 96, borderRadius: '50%',
        background: 'radial-gradient(circle at 38% 32%, #fff 0%, #e6e6e6 55%, #c7c7c7 100%)',
        boxShadow: '0 8px 24px -8px rgba(0,0,0,.5), inset -10px -12px 22px rgba(0,0,0,.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 900, fontSize: 19, letterSpacing: -0.5, color: '#1f4ba8', fontFamily: 'var(--gb-font-sans)',
      }}>ACME</div>

      {/* alignment ring + crosshair */}
      {aligning && (
        <>
          <div style={{ position: 'absolute', height: '70%', aspectRatio: '1/1', maxWidth: 150, maxHeight: 150, borderRadius: '50%', border: '2px solid var(--gb-brand-label)', boxShadow: '0 0 0 9999px var(--gb-overlay-strong)' }} />
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'var(--gb-brand-label)', opacity: 0.4 }} />
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--gb-brand-label)', opacity: 0.4 }} />
          {/* vertical rotation slider */}
          <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', height: '60%', width: 6, borderRadius: 4, background: GLASS.bg, border: `1px solid ${GLASS.border}`, boxShadow: GLASS.shadow }}>
            <div style={{ position: 'absolute', left: '50%', top: '38%', transform: 'translate(-50%,-50%)', width: 14, height: 14, borderRadius: '50%', background: '#fff', border: '1px solid var(--gb-border-strong)', boxShadow: '0 1px 4px rgba(0,0,0,.4)' }} />
          </div>
        </>
      )}

      {/* top-left: size chip + eyedropper */}
      <div style={{ position: 'absolute', top: 8, left: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
        <GlassChip>1024×1024</GlassChip>
        <GlassBtn icon={<DropperGlyph size={14} />} active={mode === 'swap'} label="Eyedropper" />
      </div>

      {/* top-right: Align · 3D · Mockup */}
      <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
        <GlassBtn icon={<AlignGlyph size={14} />} active={aligning} label="Align" />
        <GlassBtn icon={<CubeGlyph size={14} />} label="3D view" />
        <GlassBtn icon={<CameraGlyph size={14} />} label="Mockup" />
      </div>

      {/* bottom-left: zoom % */}
      <div style={{ position: 'absolute', bottom: 8, left: 10 }}><GlassChip>140%</GlassChip></div>

      {/* bottom-right: − 1:1 + */}
      <div style={{ position: 'absolute', bottom: 8, right: 8, display: 'flex', gap: 4 }}>
        <ZoomChip>−</ZoomChip><ZoomChip>1:1</ZoomChip><ZoomChip>+</ZoomChip>
      </div>

      {/* eyedropper swap popover */}
      {mode === 'swap' && (
        <div style={{
          position: 'absolute', top: 46, left: 60, width: 168, padding: 10,
          background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-strong)',
          borderRadius: 'var(--gb-r-md)', boxShadow: '0 12px 30px -8px rgba(0,0,0,.55)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 18, height: 18, borderRadius: 5, background: '#1f4ba8', border: '1px solid var(--gb-border-strong)' }} />
            <I.chevr size={12} />
            <span style={{ width: 18, height: 18, borderRadius: 5, background: '#16233f', border: '1px solid var(--gb-border-strong)' }} />
            <span style={{ fontSize: 10, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>→ navy</span>
          </div>
          <div style={{ fontSize: 9, color: 'var(--gb-text-muted)', marginBottom: 3 }}>Tolerance</div>
          <Slider value={32} min={0} max={100} onChange={() => {}} />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <Btn size="xs" variant="secondary" style={{ flex: 1 }}>Cancel</Btn>
            <Btn size="xs" variant="tinted" status="brand" style={{ flex: 1 }}>Apply</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function ImageSnippet() {
  return (
    <MiniFrame width={460} label="golfballs.com · logo extractor" pad>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ViewerHeader icon={<ImageGlyph size={14} />} title="Logo Extractor" sub="Extracted logo · order #4471823" onClose />
        <PreviewSurface mode="2d" />
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn size="sm" variant="secondary" status="success" icon={<I.copy />} style={{ flex: 1 }}>Copy URL</Btn>
          <Btn size="sm" variant="primary" icon={<I.download />} style={{ flex: 1 }}>Download</Btn>
        </div>
        <Btn size="sm" variant="tinted" status="brand" icon={<I.send />} full>Submit Proof</Btn>
      </div>
    </MiniFrame>
  );
}

function AlignSnippet() {
  return (
    <MiniFrame width={440} label="logo extractor · align" pad>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <PreviewSurface mode="align" height={210} />
        <div style={{ padding: 8, background: 'var(--gb-surface-2)', border: '1px dashed var(--gb-brand-tint-border)', borderRadius: 'var(--gb-r-md)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, fontSize: 10.5, fontWeight: 600, color: 'var(--gb-text-tertiary)' }}>Position image inside the alignment ring</span>
          <Btn size="sm" variant="secondary">Cancel</Btn>
          <Btn size="sm" variant="tinted" status="brand" icon={<I.check />}>Save</Btn>
        </div>
      </div>
    </MiniFrame>
  );
}

function SwapSnippet() {
  return (
    <MiniFrame width={440} label="logo extractor · color swap" pad>
      <PreviewSurface mode="swap" height={210} />
    </MiniFrame>
  );
}

const IMG_CONTROLS = [
  ['Align · 3D · Mockup', 'top right', 'Toggle alignment mode, the 3D ball view, and the grass-scene mockup'],
  ['Size chip + eyedropper', 'top left', 'Natural pixel size · pick a color off the image for swapping'],
  ['Zoom % chip', 'bottom left', 'Current zoom level'],
  ['− · 1:1 · +', 'bottom right', 'Zoom out / reset / in (the wheel zooms too; double-click toggles 1× ↔ 2×)'],
  ['Copy URL · Download · Submit Proof', 'below preview', 'Copy the source URL, save the file, or carry the image into Submit Proof'],
];
const IMG_KEYS = [
  ['W / S', 'Zoom in / out'],
  ['R', 'Reset zoom to 1:1'],
  ['A', 'Toggle alignment mode'],
  ['3', 'Toggle the 3D ball view'],
  ['C', 'Toggle the mockup view'],
];

export function ImageViewerPage() {
  return (
    <div className="prose">
      <div className="eyebrow">On-page Helpers</div>
      <h1 className="title">Image Viewer &amp; Logo Extraction</h1>
      <p className="lede">
        Hover any product or render image on an order page and click the expand button (<span className="kbd">Shift</span>+click
        downloads immediately instead). The viewer opens on a grid surface and resolves the best original
        it can find — direct file, the express order's raw upload, CDN candidates, then the page render as a
        last resort. The subtitle tells you which you got. You can also paste any image URL or drag a file
        straight onto the surface.
      </p>

      <ImageSnippet />

      <h2 className="sec">Walk the surface, control by control</h2>
      <p>The preview floats its controls in the four corners so the image stays unobstructed. Every one is reproduced live below.</p>

      <TourBox n={1} eyebrow="Inspect" title="Zoom, pan & the floating chips" live={<ImageSnippet />} flip>
        <p><strong>Top-left</strong> shows the <strong>natural pixel size</strong> (the source resolution, not the rendered one) next to the <strong>eyedropper</strong>. <strong>Bottom-left</strong> is the live <strong>zoom %</strong>. <strong>Bottom-right</strong> is the zoom cluster — <strong>−</strong> out, <strong>1:1</strong> reset, <strong>+</strong> in. The mouse wheel zooms toward the cursor, drag pans at any zoom, and a double-click toggles 1× ↔ 2×.</p>
        <p><strong>Top-right</strong> holds the three view toggles — <strong>Align</strong>, <strong>3D</strong>, and <strong>Mockup</strong>. Below the preview: <strong>Copy URL</strong>, <strong>Download</strong>, and <strong>Submit Proof</strong>, which carries whatever's on screen (edited bytes or the URL) into the proof form.</p>
      </TourBox>

      <TourBox n={2} eyebrow="Extract" title="Alignment: pulling a clean decal" live={<AlignSnippet />} wide>
        <p>Click <strong>Align</strong> (or press <span className="kbd">A</span>) and a circular <strong>alignment ring</strong> overlays the image, the surround dims, and crosshairs appear. A <strong>rotation slider</strong> rides the right edge (−180° to +180°) and panning is unrestricted so even a small or off-center logo can reach the ring's middle. Frame the logo inside the ring and hit <strong>Save alignment</strong>.</p>
        <p>On save, the crop is captured and <strong>near-white pixels are knocked out to transparency</strong> — so the result is a clean decal where white reads as "no ink, ball shows through", exactly like a real print. That decal is what the 3D ball and the proposal renders project. (Cancel backs out without capturing.)</p>
      </TourBox>

      <TourBox n={3} eyebrow="Recolor" title="Color swap with the eyedropper" live={<SwapSnippet />} flip>
        <p>Pick the <strong>eyedropper</strong> (top-left, next to the size chip), click a pixel on the image, and a popover opens at that point: the <strong>picked color</strong>, a <strong>tolerance slider</strong> (how close a pixel must be to count), and the <strong>replacement color picker</strong>. The image updates live as you dial it in; <strong>Apply</strong> commits the swap.</p>
        <p>This is the <em>"what would it look like in our navy?"</em> tool. The original is always kept, so a <strong>Reset</strong> chip appears to revert. If you've already saved an alignment, the swap is applied to the decal too — so the 3D ball and mockup pick up the new color without re-aligning.</p>
      </TourBox>

      <TourBox n={4} eyebrow="Sell it" title="Mockup composer (grass scene)" live={<SwapSnippet />} wide>
        <p>The <strong>Mockup</strong> toggle (or <span className="kbd">C</span>) swaps the preview for a <strong>photoreal grass scene</strong> — the ball front and center with your aligned decal composited onto the camera-facing surface. Combine it with the color swap (recolor the logo first, then render) and you've got a client-ready mockup without ever opening a design tool. The <strong>Download</strong> / <strong>Copy</strong> snapshot buttons in the strip export the finished render.</p>
      </TourBox>

      <h2 className="sec">Every floating control</h2>
      <table className="spectable">
        <thead><tr><th style={{ width: 200 }}>Control</th><th style={{ width: 110 }}>Where</th><th>Does</th></tr></thead>
        <tbody>{IMG_CONTROLS.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td><td>{r[2]}</td></tr>)}</tbody>
      </table>

      <h3 className="sub">Keyboard map</h3>
      <table className="spectable">
        <thead><tr><th style={{ width: 90 }}>Key</th><th>Action</th></tr></thead>
        <tbody>{IMG_KEYS.map((r) => <tr key={r[0]}><td><span className="kbd">{r[0]}</span></td><td>{r[1]}</td></tr>)}</tbody>
      </table>

      <div className="docnote info" style={{ marginTop: 24 }}>
        <span className="dn-ico"><I.eye size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Drop, paste, or extract</div>
          <p style={{ margin: 0 }}>Three ways in: open it from a page image (it resolves the best original automatically), <strong>paste an image URL</strong> into the field, or <strong>drag a file</strong> straight onto the grid. Everything downstream — align, color swap, 3D, mockup, Submit Proof — works the same regardless of how the image got there.</p>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   3 · 3D PRODUCT VIEWER
═══════════════════════════════════════════════════════════════ */

const MODELS = [
  { id: 'ball', label: 'Golf Ball' },
  { id: 'chip', label: 'Poker Chip' },
  { id: 'divot', label: 'Divot Tool' },
  { id: 'bartender', label: 'Bartender Tool' },
  { id: 'marker', label: 'Ball Marker' },
  { id: 'giftsetPoker', label: 'Gift Set · Poker Chip' },
  { id: 'giftsetLever', label: 'Gift Set · Lever Divot' },
  { id: 'giftsetBartender', label: 'Gift Set · Bartender' },
  { id: 'giftsetWoodPoker', label: 'Premium Wood · Poker Chip' },
  { id: 'giftsetWoodLever', label: 'Premium Wood · Lever Divot' },
];

/* Styled 3D canvas placeholder — a radial-lit stage with a shaded ball
   + decal. The CONTROLS around it are the real point of the snippet. */
function Viewer3DSurface({ height = 230, tint = '#f6f6f6', throwMode = false }) {
  return (
    <div style={{
      position: 'relative', height, width: '100%', overflow: 'hidden',
      border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)',
      background: 'radial-gradient(120% 120% at 50% 30%, #2a2d31 0%, #161719 60%, #0c0d0e 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* shadow */}
      <div style={{ position: 'absolute', bottom: '20%', width: 120, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,.5)', filter: 'blur(8px)' }} />
      {/* ball */}
      <div style={{
        width: 116, height: 116, borderRadius: '50%',
        background: `radial-gradient(circle at 36% 30%, #ffffff 0%, ${tint} 42%, color-mix(in srgb, ${tint} 60%, #444) 100%)`,
        boxShadow: 'inset -16px -18px 34px rgba(0,0,0,.30), 0 10px 30px -8px rgba(0,0,0,.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
      }}>
        <span style={{ fontWeight: 900, fontSize: 17, letterSpacing: -0.5, color: '#1f4ba8', transform: 'rotate(-8deg)' }}>ACME</span>
      </div>
      {/* HDRI scene chip (top-left) */}
      <div style={{ position: 'absolute', top: 8, left: 10, display: 'flex', gap: 4 }}>
        <GlassBtn icon={<I.sun size={13} />} label="Scene / HDRI" />
        <GlassBtn icon={<I.bolt size={13} />} active={throwMode} label="Throw / physics" />
      </div>
      {/* orbit hint */}
      <div style={{ position: 'absolute', bottom: 8, left: 10 }}><GlassChip mono={false}>drag to orbit · scroll to zoom</GlassChip></div>
      {/* tint control (bottom-right) */}
      <div style={{ position: 'absolute', bottom: 8, right: 8, display: 'flex', gap: 4 }}>
        <span title="Ball color" style={{ width: 28, height: 28, borderRadius: 8, background: GLASS.bg, border: `1px solid ${GLASS.border}`, boxShadow: GLASS.shadow, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ width: 15, height: 15, borderRadius: 4, background: tint, border: '1px solid var(--gb-border-strong)' }} />
        </span>
      </div>
    </div>
  );
}

function Viewer3DSnippet() {
  const [model, setModel] = useState('ball');
  return (
    <MiniFrame width={470} label="3d product viewer" pad>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Viewer3DSurface />
        {/* the 3D-view control strip */}
        <div style={{ padding: 8, background: 'var(--gb-surface-2)', border: '1px dashed var(--gb-brand-tint-border)', borderRadius: 'var(--gb-r-md)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Btn size="sm" variant="secondary" icon={<I.chevd size={11} style={{ transform: 'rotate(90deg)' }} />}>Image</Btn>
          <Dropdown size="sm" value={model} options={MODELS} onChange={setModel} style={{ flex: 1, minWidth: 130 }} />
          <Btn size="sm" variant="secondary" icon={<I.copy />}>Copy</Btn>
          <Btn size="sm" variant="tinted" status="brand" icon={<I.download />}>Download</Btn>
        </div>
      </div>
    </MiniFrame>
  );
}

function GiftSetSnippet() {
  return (
    <MiniFrame width={420} label="3d viewer · gift box" pad>
      <div style={{
        position: 'relative', height: 200, borderRadius: 'var(--gb-r-md)', overflow: 'hidden',
        background: 'radial-gradient(120% 120% at 50% 30%, #2a2d31 0%, #161719 60%, #0c0d0e 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* foam box with 6 ball slots + a tool */}
        <div style={{ width: 200, height: 120, borderRadius: 10, background: 'linear-gradient(180deg,#3b3022,#241c12)', boxShadow: '0 14px 34px -10px rgba(0,0,0,.7), inset 0 2px 6px rgba(255,255,255,.05)', padding: 14, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} style={{ borderRadius: '50%', background: 'radial-gradient(circle at 36% 30%,#fff,#dcdcdc 60%,#bcbcbc)', boxShadow: 'inset -4px -5px 10px rgba(0,0,0,.25)' }} />
          ))}
          <span style={{ borderRadius: 4, background: 'linear-gradient(135deg,#cfd3d6,#8b9094)', boxShadow: 'inset -3px -4px 8px rgba(0,0,0,.3)' }} />
        </div>
        <div style={{ position: 'absolute', top: 8, right: 10 }}><GlassChip mono={false}>assembled box</GlassChip></div>
      </div>
    </MiniFrame>
  );
}

const MODEL_TABLE = [
  ['Golf ball', 'The default. Decal projected on the pole; supports a physics throw mode.'],
  ['Poker chip', 'Clay chip with its own tint; logo on the face.'],
  ['Divot tool', 'Metal repair tool — fixed steel, no tint.'],
  ['Bartender tool', 'Multi-tool / lever — fixed steel.'],
  ['Ball marker', 'Chrome marker disc.'],
  ['Gift boxes', 'Black 6-ball, premium wood, and lever-divot variants — every piece seated in its foam slot, balls tinted as one.'],
];

const DECO_TABLE = [
  ['Logo decal', 'Your extracted print, projected where production prints it.'],
  ['Personalized text', 'Rendered in the real font on the ball surface.'],
  ['Monogram', 'Live monogram art recolored onto the ball.'],
  ['Dual-pole pair', 'A second decoration on the opposite pole (logo one side, personalization the other).'],
];

export function Viewer3DPage() {
  return (
    <div className="prose">
      <div className="eyebrow">On-page Helpers</div>
      <h1 className="title">3D Product Viewer</h1>
      <p className="lede">
        Interactive 3D balls, accessories, and assembled gift boxes with your decal projected exactly where
        production prints it. <strong>Drag to orbit, scroll to zoom.</strong> It appears inside the Image Viewer,
        the catalog customizer, and proposal renders — and its <strong>fixed-pose snapshot export</strong> is what
        makes proposal emails look composed rather than screenshotted.
      </p>

      <Viewer3DSnippet />
      <p style={{ fontSize: 12.5, color: 'var(--gb-text-muted)', fontStyle: 'italic', marginTop: -2 }}>
        A faithful reproduction of the viewer chrome — the model picker, tint, scene/HDRI and throw controls,
        and the snapshot strip. The canvas itself is a styled stand-in; the real viewer is live three.js/WebGL.
      </p>

      <h2 className="sec">The controls around the canvas</h2>

      <TourBox n={1} eyebrow="Pick a model" title="The model dropdown" live={<Viewer3DSnippet />} flip>
        <p>The dropdown in the bottom strip switches the model: <strong>golf ball</strong>, <strong>poker chip</strong>, <strong>divot tool</strong>, <strong>bartender tool</strong>, <strong>chrome ball marker</strong>, and the <strong>gift boxes</strong> (black 6-ball, premium wood, lever-divot variants) with every piece seated in its foam slot. Each model keeps its own decoration where production actually prints it.</p>
        <p>The <strong>Image</strong> button (left of the dropdown) drops you back to the 2D editor. <strong>Drag</strong> the canvas to orbit, <strong>scroll</strong> to zoom — the viewer owns those gestures.</p>
      </TourBox>

      <TourBox n={2} eyebrow="Recolor & light" title="Tint, scenes, and HDRI" live={<GiftSetSnippet />} wide>
        <p>A <strong>color control</strong> sits bottom-right, showing one swatch per body the active model exposes — ball → ball color, chip → chip color, a gift set → just the ball color (chips and metal tools keep their fixed colorway). Top-left, the <strong>scene / HDRI</strong> control swaps the environment lighting so the product reads differently under studio vs. outdoor light.</p>
        <p>Gift boxes render as a fully <strong>assembled box</strong> (shown here) — the foam tray, the six balls, and the tool/marker all seated in their recesses, not a loose pile.</p>
      </TourBox>

      <TourBox n={3} eyebrow="Export" title="Fixed-pose snapshots" live={<Viewer3DSnippet />} flip>
        <p>The <strong>Copy</strong> and <strong>Download</strong> buttons in the strip export a snapshot. Crucially, each model exports from a <strong>fixed pose</strong> — every PNG frames identically, with a transparent background — so a row of products in a proposal email lines up perfectly instead of looking screenshotted at random angles. (Admins can tune the poses under Developer Settings → Snapshot.)</p>
      </TourBox>

      <TourBox n={4} eyebrow="For fun" title="Physics throw mode" live={<Viewer3DSurface throwMode />} wide>
        <p>The ball has a <strong>throw mode</strong>: flip it on (top-left) and gravity kicks in — drag and fling the ball and it bounces around the scene. There's even a <strong>bomb tool</strong> in the fun menu. It's ball-only and disabled in HDRI scenes (nothing to bounce off a skybox). Yes, really — it's a small reward for getting the proof right.</p>
      </TourBox>

      <h2 className="sec">Models</h2>
      <table className="spectable">
        <thead><tr><th style={{ width: 150 }}>Model</th><th>Notes</th></tr></thead>
        <tbody>{MODEL_TABLE.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td></tr>)}</tbody>
      </table>

      <h3 className="sub">Decorations it renders</h3>
      <table className="spectable">
        <thead><tr><th style={{ width: 160 }}>Decoration</th><th>How it renders</th></tr></thead>
        <tbody>{DECO_TABLE.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td></tr>)}</tbody>
      </table>

      <div className="docnote info" style={{ marginTop: 24 }}>
        <span className="dn-ico"><I.bolt size={15} /></span>
        <div className="dn-b">
          <div className="dn-t">Snapshots are why proposals look composed</div>
          <p style={{ margin: 0 }}>The fixed pose per model is the whole trick: drop several exported PNGs into a proposal and they frame identically, like a product catalog. If the viewer ever renders <strong>blank or black</strong> (some Windows/ARM GPUs mishandle the decal texture), see Troubleshooting → "3D viewer is blank".</p>
        </div>
      </div>
    </div>
  );
}
