import React, { useEffect, useRef, useState } from 'react';
import { FloatingPanel, IconBtn, Btn, Tag, I, Spinner } from '../ui/index.js';
import { EmailHtmlView } from '../ui/components/EmailHtmlView.jsx';
import { CategorizeRail } from '../ui/components/CategorizeRail.jsx';
import { categorySections } from '../lib/caseMatch.js';

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
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%',
      background: `oklch(0.30 0.07 ${hue})`,
      color: `oklch(0.86 0.10 ${hue})`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 700,
      fontFamily: 'var(--gb-font-mono)', letterSpacing: -0.3,
      flexShrink: 0,
      border: '1px solid color-mix(in srgb, currentColor 30%, transparent)',
      boxShadow: ring
        ? `0 0 0 2px var(--gb-surface-canvas), 0 0 0 3px color-mix(in srgb, oklch(0.78 0.18 ${hue}) 50%, transparent)`
        : 'none',
    }}>{initials}</span>
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

/* Sticky reply composer — UI only for now (no send wiring). */
function ReplyComposer({ replyTo, subject }) {
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState('');
  const taRef = useRef(null);
  useEffect(() => {
    if (expanded) requestAnimationFrame(() => { try { taRef.current?.focus({ preventScroll: true }); } catch { /* ignore */ } });
  }, [expanded]);

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
        {!expanded ? (
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
                Click to write a draft · ⌘↩ to send
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
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
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
            <textarea
              ref={taRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your reply…"
              rows={5}
              style={{
                width: '100%', padding: 14,
                background: 'transparent', border: 'none', outline: 'none', resize: 'vertical',
                color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-sans)',
                fontSize: 12.5, lineHeight: 1.6, minHeight: 96,
              }}
            />
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderTop: '1px solid var(--gb-border-subtle)',
              background: 'var(--gb-surface-2)',
            }}>
              <IconBtn size="sm" variant="ghost" icon={<I.bolt />} tooltip="Pick template" />
              <IconBtn size="sm" variant="ghost" icon={<I.copy />} tooltip="Attach" />
              <span style={{ flex: 1 }} />
              <Btn size="sm" variant="ghost" onClick={() => { setBody(''); setExpanded(false); }}>Discard</Btn>
              <Btn size="sm" variant="primary" status="brand" icon={<I.send size={11} />} disabled={!body.trim()}>
                Send · ⌘↩
              </Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function EmailPreview({
  email, meta, loading,
  defaultCase = false,
  caseId,
  recommended = [],
  onApplyCategory,
  onJunk,
  applyState,
  onClosed, bindClose,
}) {
  const [viewMode, setViewMode] = useState(defaultCase ? 'case' : 'inbox');
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
            <div style={{
              flex: 1, minHeight: 0, overflow: 'auto',
              padding: '16px 20px',
              display: 'flex', flexDirection: 'column',
            }}>
              {/* Meta strip */}
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 3,
                marginBottom: 14,
                padding: '10px 12px',
                background: 'var(--gb-surface-1)',
                border: '1px solid var(--gb-border-subtle)',
                borderRadius: 'var(--gb-r-md)',
              }}>
                <MetaRow k="From">{email?.from || meta?.from || '—'}</MetaRow>
                <MetaRow k="To">{email?.to || meta?.to || '—'}</MetaRow>
                {(email?.date || meta?.date) && <MetaRow k="Date">{email?.date || meta?.date}</MetaRow>}
              </div>

              {/* Email body — Shadow DOM dark-mode render, or spinner / error */}
              {loading ? (
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 10, color: 'var(--gb-text-muted)', fontSize: 12, minHeight: 200,
                }}>
                  <Spinner size={16} /> Loading email…
                </div>
              ) : email?.bodyHtml ? (
                <EmailHtmlView html={email.bodyHtml} style={{ flex: '0 0 auto' }} />
              ) : (
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--gb-text-muted)', fontSize: 12, minHeight: 200,
                }}>
                  Couldn't load the email body.
                </div>
              )}

              <ReplyComposer
                replyTo={recipient.email ? `${sender.name} <${sender.email}>` : sender.name}
                subject={`RE: ${subject}`}
              />
            </div>
          </div>

          {/* RIGHT — Categorize rail (case mode only) */}
          {isCase && (
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <CategorizeRail
                sections={sections}
                recommended={recommended}
                applied={applied}
                focused={focused}
                onFocus={setFocused}
                onApply={(c, s) => onApplyCategory?.(c, s)}
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
