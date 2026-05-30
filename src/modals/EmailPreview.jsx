import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { FloatingPanel, IconBtn, Btn, Tag, I, Spinner, RichTextEditor, Dropdown } from '../ui/index.js';
import { EmailHtmlView } from '../ui/components/EmailHtmlView.jsx';
import { CategorizeRail } from '../ui/components/CategorizeRail.jsx';
import { categorySections, recommendedFromTemplate } from '../lib/caseMatch.js';
import { splitThreadHtml } from '../lib/emailParse.js';

const OUR_DOMAINS = /(golfballs\.com|loyaltylogo\.com|gbcadmin)/i;
function plainPreview(html, n = 120) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim().slice(0, n);
}

/* Build the renderable thread from the parsed email. When the body
   carries an Outlook quoted history we split it into one card per
   message (newest first); otherwise it's a single-message thread.
   The top card inherits the EML envelope headers; quoted cards use
   the From/Sent/To/Subject parsed out of each divRplyFwdMsg block. */
function buildThread(email, meta) {
  const bodyHtml = email?.bodyHtml || '';
  const split = splitThreadHtml(bodyHtml);
  const topFrom = email?.from || meta?.from || '';
  let msgs;
  if (!split) {
    msgs = [{
      id: 'm0', from: topFrom, to: email?.to || meta?.to || '',
      date: email?.date || meta?.date || '', subject: email?.subject || meta?.subject || '',
      bodyHtml, direction: OUR_DOMAINS.test(topFrom) ? 'out' : 'in',
    }];
  } else {
    msgs = split.map((m, i) => {
      const from = m.quoted ? (m.from || '') : topFrom;
      return {
        id: `m${i}`,
        from,
        to: m.quoted ? (m.to || '') : (email?.to || meta?.to || ''),
        date: m.quoted ? (m.sent || '') : (email?.date || meta?.date || ''),
        subject: m.quoted ? (m.subject || '') : (email?.subject || meta?.subject || ''),
        bodyHtml: m.bodyHtml,
        direction: OUR_DOMAINS.test(from) ? 'out' : 'in',
      };
    });
  }
  /* Quoted headers often carry only a display name ("From: Caleb
     Twachtman") with no address, while the envelope + To: lines DO
     have addresses. Build a name→email registry across the whole
     thread so every card can show "Name <email>" like the main
     message, not just the bare name. */
  const registry = new Map();
  const learn = (raw) => {
    const a = splitAddress(raw);
    if (a.name && a.email && a.email.includes('@')) {
      const key = a.name.trim().toLowerCase();
      if (!registry.has(key)) registry.set(key, a.email);
    }
  };
  [topFrom, email?.to, meta?.from, meta?.to].forEach(learn);
  msgs.forEach((m) => { learn(m.from); learn(m.to); });
  msgs.forEach((m) => {
    const a = splitAddress(m.from);
    m.fromName = a.name;
    m.fromEmail = a.email && a.email.includes('@') ? a.email : (registry.get(a.name.trim().toLowerCase()) || '');
  });

  /* splitThreadHtml returns newest-first (the live reply, then each
     older quoted message). Reverse so the thread reads chronologically
     — oldest at top, most recent at the bottom, right above the reply
     composer. */
  return msgs.reverse();
}

/* The customer is the party on the thread that ISN'T us. Reply always
   goes to them (Reply-All semantics) — so opening a message WE sent
   last still drafts a follow-up TO the customer, not back to
   ourselves. Prefer a resolved name+email; scan envelope first, then
   every message's from/to. */
function findCustomerAddress(thread, ...fallbacks) {
  const pick = (raw) => {
    if (!raw) return null;
    const a = splitAddress(raw);
    const probe = `${a.name} ${a.email}`;
    return OUR_DOMAINS.test(probe) ? null : (a.email && a.email.includes('@') ? `${a.name} <${a.email}>` : raw.trim());
  };
  for (const m of thread) {
    const c = pick(m.fromEmail ? `${m.fromName} <${m.fromEmail}>` : m.from) || pick(m.to);
    if (c) return c;
  }
  for (const f of fallbacks) { const c = pick(f); if (c) return c; }
  return fallbacks.find(Boolean) || '';
}

function MessageCard({ msg, expanded, onToggle }) {
  /* Prefer the thread-resolved name/email (buildThread fills the
     email from the registry when the quoted header only had a name)
     so every card shows "Name <email>" like the main message. */
  const sender = { name: msg.fromName || splitAddress(msg.from).name, email: msg.fromEmail || splitAddress(msg.from).email };
  return (
    <div
      style={{
        background: 'var(--gb-surface-1)',
        border: '1px solid var(--gb-border-subtle)',
        borderRadius: 'var(--gb-r-md)',
        marginBottom: 10,
        overflow: 'hidden',
        boxShadow: expanded ? '0 4px 16px -8px rgba(0,0,0,.4)' : 'none',
        transition: 'box-shadow .25s ease, border-color .25s ease',
      }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%', display: 'grid', gridTemplateColumns: '36px 1fr auto',
          gap: 12, alignItems: 'center', padding: '11px 13px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          textAlign: 'left', fontFamily: 'inherit', color: 'inherit',
        }}
      >
        <Avatar name={sender.name} email={sender.email} size={30} />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{sender.name || 'Unknown'}</span>
            {sender.email && (
              <span style={{
                fontSize: 11, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
              }}>&lt;{sender.email}&gt;</span>
            )}
            {msg.direction === 'out' && <Tag size="xs" tone="brand">SENT</Tag>}
          </div>
          <div style={{
            fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {expanded ? (msg.to ? `to ${splitAddress(msg.to).name}` : '') : plainPreview(msg.bodyHtml)}
          </div>
        </div>
        <span style={{
          fontSize: 10.5, fontWeight: 600, color: 'var(--gb-text-tertiary)',
          fontFamily: 'var(--gb-font-mono)', whiteSpace: 'nowrap', alignSelf: 'flex-start', paddingTop: 2,
        }}>{msg.date}</span>
      </button>
      {/* CSS grid-rows collapse — smooth height transition without framer
          measuring the async shadow-DOM body (the old layout + height:auto
          combo was the jitter). Content stays mounted so collapse animates
          too; the thread defaults to all-expanded anyway. */}
      <div style={{ display: 'grid', gridTemplateRows: expanded ? '1fr' : '0fr', transition: 'grid-template-rows .3s cubic-bezier(.4, 0, .2, 1)' }}>
        <div style={{ overflow: 'hidden', minHeight: 0, borderTop: expanded ? '1px solid var(--gb-border-subtle)' : '1px solid transparent' }}>
          <EmailHtmlView html={msg.bodyHtml} style={{ border: 'none', borderRadius: 0, background: 'transparent' }} />
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
   EmailPreview — React port of the vanilla email-preview modal.

   Centered FloatingPanel (per the design handoff) with a two-
   column body: the email thread on the left + a Categorize rail
   on the right (case mode only). The opened message's HTML body
   renders through EmailHtmlView (Shadow DOM, dark-mode normalised,
   no iframe). A Case/Inbox toggle in the header flips the rail on
   and off in place.

   Props
     email      parsed record { subject, from, to, date, bodyHtml }
     meta       row-scraped { from, to, subject, date } fallback
     loading    EML still fetching → show a spinner in the body
     defaultCase  open in case mode (true on a case page)
     recommended  [{ category, subcategory, label }] from template
     onApplyCategory(category, subcategory) → server update
     onJunk()    → server junk update
     applyState   null | 'saving' | { category, subcategory } applied
     onClosed, bindClose  FloatingPanel close plumbing
─────────────────────────────────────────────────────────────── */

function hueFromString(s) {
  let h = 0;
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

/** "Sarah Patel <sarah@pebble.com>" → { name, email } */
function splitAddress(raw) {
  const s = (raw || '').trim();
  const m = s.match(/^(.*?)\s*<([^>]+)>$/);
  if (m) return { name: m[1].replace(/^"|"$/g, '').trim() || m[2], email: m[2].trim() };
  if (/@/.test(s)) return { name: s, email: s };
  return { name: s || 'Unknown', email: '' };
}

function Avatar({ name, email, size = 32, ring }) {
  const hue = hueFromString(email || name);
  const initials = (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  /* Absolute-center the initials. inline-flex centering left them
     riding low because the mono font's line box carries descender
     space; a positioned child with translate(-50%,-50%) ignores font
     metrics and sits dead-center in the circle. */
  return (
    <span style={{
      position: 'relative',
      width: size, height: size, borderRadius: '50%',
      background: `oklch(0.30 0.07 ${hue})`,
      color: `oklch(0.86 0.10 ${hue})`,
      display: 'inline-block', flexShrink: 0,
      border: '1px solid color-mix(in srgb, currentColor 30%, transparent)',
      boxShadow: ring
        ? `0 0 0 2px var(--gb-surface-canvas), 0 0 0 3px color-mix(in srgb, oklch(0.78 0.18 ${hue}) 50%, transparent)`
        : 'none',
    }}>
      <span style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        fontSize: size * 0.36, fontWeight: 700, lineHeight: 1,
        fontFamily: 'var(--gb-font-mono)', letterSpacing: -0.3,
        whiteSpace: 'nowrap',
      }}>{initials}</span>
    </span>
  );
}

function HeaderBar({ subject, sender, caseId, viewMode, onViewModeChange, onClose }) {
  return (
    <div style={{
      padding: '14px 20px',
      background: 'var(--gb-fill-inverse-strong)',
      borderBottom: '1px solid var(--gb-border-default)',
      display: 'flex', alignItems: 'center', gap: 14,
      flexShrink: 0,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 'var(--gb-r-md)',
        background: 'var(--gb-brand-tint-medium)',
        border: '1px solid var(--gb-brand-tint-border)',
        color: 'var(--gb-brand-label)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}><I.mail size={15} /></div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{
            fontSize: 14.5, fontWeight: 800, letterSpacing: -0.2,
            color: 'var(--gb-text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: 640,
          }}>{subject || '(no subject)'}</span>
        </div>
        <div style={{
          fontSize: 11.5, color: 'var(--gb-text-muted)',
          marginTop: 3,
          display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
        }}>
          <Avatar name={sender.name} email={sender.email} size={18} />
          <span style={{ color: 'var(--gb-text-secondary)', fontWeight: 600 }}>{sender.name}</span>
          {sender.email && (
            <span style={{
              fontFamily: 'var(--gb-font-mono)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>&lt;{sender.email}&gt;</span>
          )}
          {viewMode === 'case' && caseId && (
            <>
              <span>·</span>
              <span style={{
                padding: '1px 7px', borderRadius: 4,
                background: 'var(--gb-brand-tint-medium)',
                border: '1px solid var(--gb-brand-tint-border)',
                color: 'var(--gb-brand-label)',
                fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
                fontFamily: 'var(--gb-font-mono)',
              }}>{caseId}</span>
            </>
          )}
        </div>
      </div>

      {onViewModeChange && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', padding: 3, gap: 2,
          background: 'var(--gb-surface-2)',
          border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-md)',
          flexShrink: 0,
        }}>
          {[{ id: 'case', label: 'Case' }, { id: 'inbox', label: 'Inbox' }].map((m) => {
            const on = viewMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onViewModeChange(m.id)}
                style={{
                  padding: '0 10px', height: 24,
                  border: 'none', cursor: 'pointer',
                  background: on ? 'var(--gb-brand-tint-medium)' : 'transparent',
                  color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)',
                  fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
                  fontFamily: 'var(--gb-font-sans)',
                  borderRadius: 'var(--gb-r-sm)',
                }}
              >{m.label}</button>
            );
          })}
        </div>
      )}

      <IconBtn size="md" icon={<I.close />} onClick={onClose} />
    </div>
  );
}

function MetaRow({ k, children }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0 }}>
      <span style={{
        width: 44, flexShrink: 0,
        fontSize: 9, fontWeight: 800, letterSpacing: 0.6,
        textTransform: 'uppercase', color: 'var(--gb-text-muted)',
      }}>{k}</span>
      <span style={{
        fontSize: 11.5, color: 'var(--gb-text-secondary)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{children}</span>
    </div>
  );
}

/* Sticky reply composer — UI only for now (no send wiring). Uses the
   same RichTextEditor as the template/signature editors so the rep
   gets the full formatting toolbar (bold/italic/lists/colors). */
function ReplyComposer({ replyTo, subject }) {
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState('');
  const [nonce, setNonce] = useState(0); // bump to reset the editor on discard
  const hasText = body.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0;
  const discard = () => { setBody(''); setExpanded(false); setNonce((n) => n + 1); };

  return (
    <div style={{
      position: 'sticky', bottom: 0,
      background: 'var(--gb-surface-canvas)',
      boxShadow: '0 -24px 28px -16px var(--gb-surface-canvas)',
      paddingTop: 12, marginTop: 18, zIndex: 3,
    }}>
      <div style={{
        background: 'var(--gb-surface-1)',
        border: '1px solid ' + (expanded ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
        borderRadius: 'var(--gb-r-md)',
        boxShadow: expanded
          ? '0 6px 24px -8px color-mix(in srgb, var(--gb-brand-label) 28%, transparent)'
          : '0 2px 10px -4px rgba(0,0,0,.35)',
        overflow: 'hidden',
        transition: 'border-color .25s, box-shadow .25s',
      }}>
        {!expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            style={{
              width: '100%', padding: '12px 14px',
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', color: 'inherit', textAlign: 'left',
            }}
          >
            <span style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'var(--gb-brand-tint-medium)',
              border: '1px solid var(--gb-brand-tint-border)',
              color: 'var(--gb-brand-label)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}><I.send size={12} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>
                Reply to {replyTo}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1, fontFamily: 'var(--gb-font-mono)' }}>
                Click to write a draft
              </div>
            </div>
            <span style={{
              padding: '3px 8px', background: 'var(--gb-fill-subtle)',
              border: '1px solid var(--gb-border-default)', borderRadius: 4,
              fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6,
              color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)',
              textTransform: 'uppercase', flexShrink: 0,
            }}>Draft</span>
          </button>
        )}

        {/* grid-rows collapse — smooth open/close via CSS, no framer
            height measurement (was jittery). The editor stays mounted so
            the close animates too; discard bumps `nonce` to clear it. */}
        <div style={{ display: 'grid', gridTemplateRows: expanded ? '1fr' : '0fr', transition: 'grid-template-rows .28s cubic-bezier(.32, .72, 0, 1)' }}>
          <div style={{ overflow: 'hidden', minHeight: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderBottom: '1px solid var(--gb-border-subtle)',
              fontSize: 11.5,
            }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>TO</span>
              <span style={{ color: 'var(--gb-text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{replyTo}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>SUBJECT</span>
              <span style={{ color: 'var(--gb-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>{subject}</span>
            </div>
            <div style={{ padding: '4px 6px' }}>
              <RichTextEditor
                key={nonce}
                initialHtml=""
                onChange={setBody}
                placeholder="Write your reply…"
                minHeight={120}
              />
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderTop: '1px solid var(--gb-border-subtle)',
              background: 'var(--gb-surface-2)',
            }}>
              <IconBtn size="sm" variant="ghost" icon={<I.bolt />} tooltip="Pick template" />
              <IconBtn size="sm" variant="ghost" icon={<I.copy />} tooltip="Attach" />
              <span style={{ flex: 1 }} />
              <Btn size="sm" variant="ghost" onClick={discard}>Discard</Btn>
              <Btn size="sm" variant="primary" status="brand" icon={<I.send size={11} />} disabled={!hasText}>
                Send
              </Btn>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Sticky case-mode control: a template picker (only the case email
   templates whose match rules fit this email) + a Send button. Picking
   one drives the rail's ✦ Recommended chips; Send fires onSendTemplate. */
function TemplateSendBar({ templates, selectedId, onSelect, onSend, sending }) {
  const hasTemplates = templates.length > 0;
  const options = templates.map((t) => ({ id: t.id, label: t.name || t.subject || 'Untitled template' }));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {hasTemplates ? (
          <Dropdown
            size="sm"
            searchable
            value={selectedId}
            options={options}
            placeholder="Pick a reply template…"
            onChange={onSelect}
          />
        ) : (
          <span style={{
            display: 'inline-flex', alignItems: 'center', height: 28,
            fontSize: 11, fontStyle: 'italic', color: 'var(--gb-text-muted)',
          }}>No matching reply templates</span>
        )}
      </div>
      <Btn
        size="sm" variant="primary" status="brand"
        icon={<I.send size={11} />}
        disabled={!hasTemplates || !selectedId || sending}
        onClick={onSend}
      >
        {sending ? 'Sending…' : 'Send'}
      </Btn>
    </div>
  );
}

export function EmailPreview({
  email, meta, loading,
  defaultCase = false,
  caseId,
  recommended = [],
  caseTemplates = [],
  onSendTemplate,
  sendingTemplate = false,
  onApplyCategory,
  onJunk,
  applyState,
  onClosed, bindClose,
}) {
  const [viewMode, setViewMode] = useState(defaultCase ? 'case' : 'inbox');
  /* Selected case template drives both the rail's ✦ Recommended chips
     and what Send fires. Defaults to the first match (the list arrives
     pre-filtered to templates whose rules match this email). */
  const [selectedTplId, setSelectedTplId] = useState(() => caseTemplates[0]?.id || '');
  useEffect(() => {
    setSelectedTplId((id) => (caseTemplates.some((t) => t.id === id) ? id : (caseTemplates[0]?.id || '')));
  }, [caseTemplates]);
  const selectedTpl = caseTemplates.find((t) => t.id === selectedTplId) || null;
  /* A picked template's tags win over the caller-supplied recommended. */
  const effectiveRecommended = selectedTpl ? recommendedFromTemplate(selectedTpl) : recommended;
  const [focused, setFocused] = useState(null);
  const isCase = viewMode === 'case';
  /* FloatingPanel hands its animated-close fn to bindClose; capture
     it so the header X (and the mount host) can both trigger the
     graceful close + unmount. */
  const closeRef = useRef(null);
  const requestClose = () => closeRef.current?.();

  const subject = email?.subject || meta?.subject || '(no subject)';
  const sender = splitAddress(email?.from || meta?.from || '');
  const recipient = splitAddress(email?.to || meta?.to || '');
  const applied = applyState && applyState.category ? applyState : null;
  const sections = categorySections();

  /* Thread cards — split the reply body on Outlook's quoted-reply
     dividers so a reply chain reads as separate messages. Newest
     (index 0) is expanded by default once the body lands. */
  const thread = useMemo(() => (email ? buildThread(email, meta) : []), [email, meta]);
  const [expanded, setExpanded] = useState(() => new Set());
  useEffect(() => {
    // Expand every message by default once the body lands.
    if (thread.length) setExpanded(new Set(thread.map((m) => m.id)));
  }, [email?.bodyHtml]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleMsg = (id) => setExpanded((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  return (
    <FloatingPanel
      draggable={false}
      backdrop
      width={1320}
      maxHeight={900}
      onClose={onClosed}
      bindClose={(fn) => { closeRef.current = fn; bindClose?.(fn); }}
    >
      <div style={{
        display: 'flex', flexDirection: 'column',
        height: 'min(860px, calc(100vh - 48px))',
        background: 'var(--gb-surface-canvas)',
        color: 'var(--gb-text-secondary)',
        overflow: 'hidden',
      }}>
        <HeaderBar
          subject={subject}
          sender={sender}
          caseId={caseId}
          viewMode={defaultCase ? viewMode : null}
          onViewModeChange={defaultCase ? setViewMode : null}
          onClose={requestClose}
        />

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* LEFT — meta + email body + reply composer */}
          <div style={{
            flex: 1, minWidth: 0,
            display: 'flex', flexDirection: 'column',
            borderRight: isCase ? '1px solid var(--gb-border-default)' : 'none',
          }}>
            {/* Block (not flex) scroll container — flex-column let the
               message cards shrink to fit instead of overflowing, so a
               tall email got clipped before its signature. Plain block
               flow lets them stack at full height and the column
               scrolls. */}
            <div style={{
              flex: 1, minHeight: 0, overflow: 'auto',
              padding: '16px 20px',
            }}>
              {/* Loading screen — a clean centered panel while the EML
                  fetches. Keeping a dedicated loading state means the
                  thread renders in its final (all-expanded) layout in
                  one go and fades in softly, instead of cards popping +
                  height-animating open as data lands. */}
              {loading ? (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 12, color: 'var(--gb-text-muted)', fontSize: 12, minHeight: 320,
                }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: 'var(--gb-brand-tint-medium)',
                    border: '1px solid var(--gb-brand-tint-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--gb-brand-label)',
                  }}>
                    <Spinner size={18} />
                  </div>
                  <span>Loading email…</span>
                </div>
              ) : thread.length > 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                >
                  {/* Thread summary line */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
                    fontSize: 10.5, fontWeight: 700, letterSpacing: 1,
                    textTransform: 'uppercase', color: 'var(--gb-text-muted)',
                  }}>
                    <span>Thread</span>
                    <span style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />
                    <span style={{
                      fontFamily: 'var(--gb-font-mono)', letterSpacing: 0, textTransform: 'none',
                      color: 'var(--gb-text-tertiary)', fontWeight: 600,
                    }}>{thread.length} message{thread.length === 1 ? '' : 's'}</span>
                  </div>
                  {thread.map((msg) => (
                    <MessageCard
                      key={msg.id}
                      msg={msg}
                      expanded={expanded.has(msg.id)}
                      onToggle={() => toggleMsg(msg.id)}
                    />
                  ))}
                </motion.div>
              ) : (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--gb-text-muted)', fontSize: 12, minHeight: 200,
                }}>
                  Couldn't load the email body.
                </div>
              )}

              {/* Composer only after load — rendering it during the
                  loading state parked it under the spinner, then it
                  jolted to the bottom when the (tall) thread arrived.
                  Reply target is always the CUSTOMER (the non-golfballs
                  party), so opening a message we sent still drafts a
                  reply TO them, not back to ourselves. */}
              {!loading && thread.length > 0 && (() => {
                const cust = splitAddress(findCustomerAddress(thread, email?.from || meta?.from));
                return (
                  <ReplyComposer
                    replyTo={cust.email ? `${cust.name} <${cust.email}>` : cust.name}
                    subject={`RE: ${subject}`}
                  />
                );
              })()}
            </div>
          </div>

          {/* RIGHT — Categorize rail (case mode only) */}
          {isCase && (
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <CategorizeRail
                sections={sections}
                recommended={effectiveRecommended}
                applied={applied}
                focused={focused}
                onFocus={setFocused}
                onApply={(c, s) => onApplyCategory?.(c, s)}
                topSlot={
                  <TemplateSendBar
                    templates={caseTemplates}
                    selectedId={selectedTplId}
                    onSelect={setSelectedTplId}
                    onSend={() => selectedTpl && onSendTemplate?.(selectedTpl)}
                    sending={sendingTemplate}
                  />
                }
              />
              {/* Junk action pinned under the rail */}
              <div style={{
                padding: '10px 16px', flexShrink: 0,
                borderTop: '1px solid var(--gb-border-subtle)',
                background: 'var(--gb-surface-1)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ flex: 1, fontSize: 10.5, color: 'var(--gb-text-muted)' }}>
                  {applyState === 'saving' ? 'Saving…' : applied
                    ? `Applied: ${applied.subcategory}` : 'Pick a category or mark junk'}
                </span>
                <Btn
                  size="sm" variant="secondary" status="error"
                  icon={<I.alert size={11} />}
                  onClick={() => onJunk?.()}
                  disabled={applyState === 'saving'}
                >Junk</Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    </FloatingPanel>
  );
}
