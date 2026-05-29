import React, { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { I } from '../icons.jsx';
import { Tag } from './Tag.jsx';

/* ───────────────────────────────────────────────────────────────
   ProofCard — single source of truth for a proof tile.

   Used by:
     • SubmitProof sidebar (right-column list, single-col flow)
     • Proof Gallery page  (grid layout)

   Layout: square thumb (ProofSphere placeholder or real <img>)
   welded to an info row underneath. Hover surfaces a copy / open
   overlay over the thumb and lifts the whole card 2 px. When the
   parent passes `account` + `contacts`, a ConnectionStrip slides
   in showing who the proof is tied to. When they're absent (the
   SubmitProof case until the API ships it) the strip is omitted
   so the card collapses to the legacy 2-line layout.

   Status colors come from STATUS_TONE / statusTone — exported so
   callers building filter chips or summary pills share the map.

   Click semantics: the WHOLE card surface fires `onOpen(proof)`.
   The copy button stops propagation and fires `onCopy(proof)`.
   Both are optional — when missing, the card still renders fine.
─────────────────────────────────────────────────────────────── */

export const STATUS_TONE = {
  Approved: 'brand',
  Revised:  'warning',
  Rejected: 'error',
  Pending:  'neutral',
};
export function statusTone(status) {
  return STATUS_TONE[status] || 'neutral';
}

/* ── ProofSphere — placeholder for proofs without thumbUrl. The
   hue offset stops adjacent tiles from looking identical when the
   gallery is dense, and the status dot in the top-right gives a
   read-at-a-glance signal without forcing the eye to the badge. */
export function ProofSphere({ label, hue = 90, status }) {
  const accent     = `oklch(0.75 0.18 ${hue})`;
  const accentDeep = `oklch(0.40 0.14 ${hue})`;
  return (
    <div style={{
      width: '60%', aspectRatio: '1',
      borderRadius: '50%',
      background: `radial-gradient(circle at 32% 28%,
        color-mix(in srgb, ${accent} 80%, var(--gb-surface-canvas)) 0%,
        color-mix(in srgb, ${accentDeep} 60%, var(--gb-surface-canvas)) 55%,
        var(--gb-surface-canvas) 92%)`,
      boxShadow: `
        inset 0 -14px 36px rgba(0,0,0,0.55),
        inset 0 6px 14px color-mix(in srgb, ${accent} 25%, transparent),
        0 4px 14px -4px rgba(0,0,0,0.4)`,
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute',
        top: '11%', left: '22%',
        width: '22%', height: '14%',
        borderRadius: '50%',
        background: 'radial-gradient(circle, color-mix(in srgb, white 70%, transparent) 0%, transparent 70%)',
        filter: 'blur(1px)',
        pointerEvents: 'none',
      }} />
      {label && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: 22, fontWeight: 800,
          color: 'color-mix(in srgb, var(--gb-text-primary) 92%, transparent)',
          fontFamily: 'var(--gb-font-mono)',
          letterSpacing: -0.5,
          whiteSpace: 'nowrap',
          mixBlendMode: 'soft-light',
          textShadow: '0 1px 0 rgba(0,0,0,0.45)',
        }}>{label}</div>
      )}
      {status && (
        <span style={{
          position: 'absolute',
          right: '8%', top: '8%',
          width: 8, height: 8, borderRadius: '50%',
          background: status === 'Approved' ? 'var(--gb-brand-label)'
                    : status === 'Revised'  ? 'var(--gb-warning)'
                    : status === 'Rejected' ? 'var(--gb-error)'
                    : 'var(--gb-text-muted)',
          boxShadow: '0 0 0 2px var(--gb-surface-canvas), 0 0 10px currentColor',
          color: status === 'Approved' ? 'var(--gb-brand-label)'
               : status === 'Revised'  ? 'var(--gb-warning)'
               : status === 'Rejected' ? 'var(--gb-error)'
               : 'transparent',
        }} />
      )}
    </div>
  );
}

function initialsOf(name) {
  return (name || '').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

/* Account avatar — first/last initials in a small circle. Uses
   a slightly darker brand fill than the contact MiniAvatar so
   the eye can tell the account row apart from the contact row
   without reading labels. */
function AccountAvatar({ name, size = 20 }) {
  return (
    <span
      title={name}
      style={{
        width: size, height: size, borderRadius: '50%',
        background: 'color-mix(in srgb, var(--gb-brand-label) 22%, var(--gb-surface-canvas))',
        border: '1.5px solid var(--gb-surface-2)',
        boxShadow: '0 0 0 1px var(--gb-brand-tint-border)',
        color: 'var(--gb-brand-label)',
        fontSize: 8.5, fontWeight: 800, letterSpacing: -.2,
        fontFamily: 'var(--gb-font-mono)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}
    >{initialsOf(name)}</span>
  );
}

function MiniAvatar({ name, i = 0, ring = 'var(--gb-surface-2)' }) {
  return (
    <span
      title={name}
      style={{
        width: 18, height: 18, borderRadius: '50%',
        background: 'var(--gb-brand-tint-medium)',
        border: `1.5px solid ${ring}`,
        color: 'var(--gb-brand-label)',
        fontSize: 7.5, fontWeight: 800, letterSpacing: -.2,
        fontFamily: 'var(--gb-font-mono)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        marginLeft: i > 0 ? -6 : 0,
        position: 'relative', zIndex: 20 - i,
        flexShrink: 0,
      }}
    >{initialsOf(name)}</span>
  );
}

function ConnectionStrip({ account, contacts = [] }) {
  const hasContacts = contacts.length > 0;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 5,
      marginTop: 7, paddingTop: 7,
      borderTop: '1px solid var(--gb-border-subtle)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <AccountAvatar name={account.name} />
        <span
          title={account.id ? `${account.name} · ${account.id}` : account.name}
          style={{
            fontSize: 10.5, fontWeight: 700,
            color: 'var(--gb-text-secondary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >{account.name}</span>
        {account.id && (
          <span style={{
            marginLeft: 'auto', flexShrink: 0,
            fontSize: 8.5, fontFamily: 'var(--gb-font-mono)',
            color: 'var(--gb-text-ghost)', letterSpacing: .2,
          }}>{account.id}</span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        {hasContacts ? (
          <>
            <span style={{ display: 'inline-flex' }}>
              {contacts.slice(0, 3).map((c, i) => <MiniAvatar key={c} name={c} i={i} />)}
            </span>
            <span
              title={contacts.join(', ')}
              style={{
                fontSize: 10.5, fontWeight: 500,
                color: 'var(--gb-text-tertiary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {contacts.length === 1
                ? contacts[0]
                : <>{contacts[0]} <span style={{ color: 'var(--gb-text-muted)', fontWeight: 600 }}>+{contacts.length - 1}</span></>}
            </span>
          </>
        ) : (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '1px 8px 1px 6px',
            border: '1px dashed var(--gb-border-default)',
            borderRadius: 'var(--gb-r-pill)',
            fontSize: 9, fontWeight: 700, letterSpacing: .4,
            textTransform: 'uppercase',
            color: 'var(--gb-text-muted)',
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: 'var(--gb-text-ghost)',
            }} />
            Account-level
          </span>
        )}
      </div>
    </div>
  );
}

function relTime(days) {
  if (days === 0) return 'today';
  if (days === 1) return '1 d';
  return `${days} d`;
}

const overlayBtnBaseStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 26, height: 26,
  padding: 0,
  borderRadius: 'var(--gb-r-sm)',
  background: 'color-mix(in srgb, var(--gb-surface-deep) 70%, transparent)',
  backdropFilter: 'blur(6px)',
  border: '1px solid color-mix(in srgb, var(--gb-text-primary) 18%, transparent)',
  color: 'var(--gb-text-secondary)',
  cursor: 'pointer',
  pointerEvents: 'auto',
  outline: 'none',
};

/* Overlay action button — copy / open. Wrapping in motion.button
   gives us a unified tap+hover scale and lets the icon swap
   between copy and check using AnimatePresence when a click
   succeeds. */
function OverlayActionBtn({ title, onClick, children }) {
  return (
    <motion.button
      type="button"
      title={title}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClick?.(e); }}
      whileHover={{ scale: 1.08, backgroundColor: 'color-mix(in srgb, var(--gb-surface-deep) 88%, transparent)' }}
      whileTap={{ scale: 0.88 }}
      transition={{ type: 'spring', stiffness: 480, damping: 26 }}
      style={overlayBtnBaseStyle}
    >{children}</motion.button>
  );
}

export function ProofCard({
  proof,
  index = 0,
  onOpen,
  onCopy,
  focused = false,
  onFocus,
}) {
  const [hover, setHover] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef(null);
  const lift = hover || focused;
  /* Alternating-but-deterministic backdrop. Seeded off the id (or
     index when no id) so re-renders don't reshuffle the rhythm. */
  const seed = proof.id ? proof.id.charCodeAt(proof.id.length - 1) : index;
  const altBg = (seed % 2) === 0
    ? 'linear-gradient(135deg, var(--gb-surface-2) 0%, var(--gb-surface-canvas) 50%, var(--gb-surface-2) 100%)'
    : 'linear-gradient(135deg, var(--gb-surface-2) 0%, var(--gb-surface-canvas) 100%)';

  const handleOpen = () => {
    if (onOpen) onOpen(proof);
    else if (proof.proofLink && proof.proofLink !== '#') {
      window.open(proof.proofLink, '_blank', 'noopener,noreferrer');
    }
    /* Null link → no-op; the motion.button still plays the press
       animation so template data feels alive. */
  };

  const handleCopy = () => {
    if (onCopy) onCopy(proof);
    else if (proof.proofLink && proof.proofLink !== '#') {
      try { navigator.clipboard?.writeText(proof.proofLink); } catch { /* ignore */ }
    }
    /* Feedback flash regardless of whether anything was actually
       copied — the icon swap reads as a confirmation gesture and
       gives template data the same micro-interaction as live data. */
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1100);
  };

  const showAge = Number.isFinite(proof.addedDays);
  const hasConnection = !!proof.account;

  return (
    <button
      type="button"
      onClick={handleOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => onFocus?.(proof.id)}
      style={{
        display: 'flex', flexDirection: 'column',
        background: 'transparent',
        border: 'none', padding: 0,
        cursor: 'pointer',
        textAlign: 'left',
        outline: 'none',
        transform: lift ? 'translateY(-2px)' : 'translateY(0)',
        /* Card-level lift shadow — owning it on the outer button
           (not the thumb) keeps the thumb + info row visually
           glued so the card lifts as ONE element. */
        filter: lift
          ? 'drop-shadow(0 4px 8px rgba(0,0,0,.18))'
          : 'drop-shadow(0 0 0 transparent)',
        transition: 'transform .22s cubic-bezier(.34,1.4,.64,1), filter .22s',
        width: '100%',
      }}
    >
      <div style={{
        width: '100%', aspectRatio: '1',
        borderRadius: 'var(--gb-r-md) var(--gb-r-md) 0 0',
        background: altBg,
        border: '1px solid ' + (lift ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-subtle)'),
        borderBottom: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden',
        transition: 'border-color .22s, background-color .22s',
      }}>
        {proof.thumbUrl ? (
          <img
            src={proof.thumbUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <ProofSphere
            label={proof.label || (proof.name?.match(/v\d+/i)?.[0] || '')}
            hue={proof.hue ?? 90}
            status={proof.status}
          />
        )}

        <div style={{
          position: 'absolute', inset: 0,
          background: lift
            ? 'linear-gradient(180deg, transparent 55%, color-mix(in srgb, var(--gb-surface-deep) 80%, transparent) 100%)'
            : 'transparent',
          opacity: lift ? 1 : 0,
          transition: 'opacity .25s',
          pointerEvents: 'none',
        }} />
        <motion.div
          animate={{ opacity: lift ? 1 : 0, y: lift ? 0 : -4 }}
          transition={{ duration: 0.22 }}
          style={{
            position: 'absolute', right: 8, top: 8,
            display: 'flex', gap: 6,
            pointerEvents: lift ? 'auto' : 'none',
          }}
        >
          <OverlayActionBtn title={copied ? 'Copied' : 'Copy proof link'} onClick={handleCopy}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={copied ? 'check' : 'copy'}
                initial={{ scale: 0.6, opacity: 0, rotate: -10 }}
                animate={{ scale: 1,   opacity: 1, rotate: 0 }}
                exit={{    scale: 0.6, opacity: 0, rotate:  10 }}
                transition={{ duration: 0.16 }}
                style={{ display: 'inline-flex', color: copied ? 'var(--gb-brand-label)' : 'inherit' }}
              >
                {copied ? <I.check size={12} /> : <I.copy size={11} />}
              </motion.span>
            </AnimatePresence>
          </OverlayActionBtn>
          <OverlayActionBtn title="Open" onClick={handleOpen}>
            <I.chevr size={11} />
          </OverlayActionBtn>
        </motion.div>
        {showAge && (
          <span style={{
            position: 'absolute', left: 8, bottom: 8,
            padding: '2px 7px',
            background: 'color-mix(in srgb, var(--gb-surface-deep) 78%, transparent)',
            border: '1px solid var(--gb-border-subtle)',
            borderRadius: 'var(--gb-r-pill)',
            fontSize: 9.5, fontWeight: 700, letterSpacing: .4,
            fontFamily: 'var(--gb-font-mono)',
            color: 'var(--gb-text-tertiary)',
            textTransform: 'uppercase',
            opacity: lift ? 1 : 0.7,
            transition: 'opacity .2s',
          }}>{relTime(proof.addedDays)}</span>
        )}
      </div>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        background: 'var(--gb-surface-2)',
        border: '1px solid ' + (lift ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-subtle)'),
        borderRadius: '0 0 var(--gb-r-md) var(--gb-r-md)',
        padding: '8px 10px 9px',
        transition: 'border-color .22s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            flex: 1, minWidth: 0,
            fontSize: 12, fontWeight: 700,
            color: 'var(--gb-text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }} title={proof.name}>{proof.name}</span>
          {proof.status && (
            <Tag tone={statusTone(proof.status)} size="xs">{proof.status}</Tag>
          )}
        </div>
        {hasConnection && (
          <ConnectionStrip account={proof.account} contacts={proof.contacts} />
        )}
      </div>
    </button>
  );
}
