import React, { useState } from 'react';
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

function AccountGlyph({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0 }}>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2" />
    </svg>
  );
}

function initialsOf(name) {
  return (name || '').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
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
        <span style={{ color: 'var(--gb-text-muted)', display: 'inline-flex' }}>
          <AccountGlyph />
        </span>
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

const overlayBtnStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 24, height: 24,
  borderRadius: 'var(--gb-r-sm)',
  background: 'color-mix(in srgb, var(--gb-surface-deep) 70%, transparent)',
  backdropFilter: 'blur(6px)',
  border: '1px solid color-mix(in srgb, var(--gb-text-primary) 18%, transparent)',
  color: 'var(--gb-text-secondary)',
  cursor: 'pointer',
  pointerEvents: 'auto',
};

export function ProofCard({
  proof,
  index = 0,
  onOpen,
  onCopy,
  focused = false,
  onFocus,
}) {
  const [hover, setHover] = useState(false);
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
  };

  const handleCopy = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (onCopy) onCopy(proof);
    else if (proof.proofLink) {
      try { navigator.clipboard?.writeText(proof.proofLink); } catch { /* ignore */ }
    }
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
        transition: 'transform .22s cubic-bezier(.34,1.4,.64,1)',
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
        boxShadow: lift
          ? '0 12px 28px -10px rgba(0,0,0,.55), 0 0 0 1px color-mix(in srgb, var(--gb-brand-label) 18%, transparent)'
          : 'none',
        transition: 'box-shadow .22s, border-color .22s, background-color .22s',
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
        <div style={{
          position: 'absolute', right: 8, top: 8,
          display: 'flex', gap: 6,
          opacity: lift ? 1 : 0,
          transform: lift ? 'translateY(0)' : 'translateY(-4px)',
          transition: 'opacity .22s, transform .22s',
        }}>
          <span
            role="button"
            tabIndex={-1}
            onClick={handleCopy}
            style={overlayBtnStyle}
            title="Copy proof link"
          ><I.copy size={11} /></span>
          <span style={overlayBtnStyle} title="Open">
            <I.chevr size={11} />
          </span>
        </div>
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
        {(proof.item || proof.notes) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 10.5,
            color: 'var(--gb-text-muted)',
            fontFamily: 'var(--gb-font-mono)',
          }}>
            {proof.item && (
              <span style={{
                padding: '1px 6px',
                background: 'var(--gb-fill-subtle)',
                border: '1px solid var(--gb-border-default)',
                borderRadius: 4,
                color: 'var(--gb-text-tertiary)',
                fontSize: 9.5, letterSpacing: .3,
              }}>{proof.item}</span>
            )}
            {proof.notes && (
              <span style={{
                flex: 1, minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: 'var(--gb-text-muted)',
                fontFamily: 'var(--gb-font-sans)',
                fontSize: 10.5,
              }} title={proof.notes}>{proof.notes}</span>
            )}
          </div>
        )}

        {hasConnection && (
          <ConnectionStrip account={proof.account} contacts={proof.contacts} />
        )}
      </div>
    </button>
  );
}
