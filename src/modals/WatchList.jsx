import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  FloatingPanel, ModalHeader, Btn, I,
} from '../ui/index.js';
import { useToast } from '../ui/components/ToastHost.jsx';

/* ───────────────────────────────────────────────────────────────
   WatchList — React port of content/watchlist-modal.js.

   Surfaces orders, contacts, and accounts flagged for follow-up.
   Each item has a live ticking timer with four urgency tiers tied
   to design-system tokens (brand → warning → orange → error).

     <1 hour   → normal   (brand)
     1–4 hr    → moderate (warning amber)
     4–6 hr    → high     (orange)
     6+ hr     → critical (error red, pulses)

   Items are sorted oldest-first. Resolve animates a slide-out + height
   collapse; Clear all needs a two-tap confirm. ESC + backdrop click
   close the modal (handled by FloatingPanel).

   Storage:
     • In the live extension, this reads/writes chrome.storage.local
       under the `watchList` key.
     • In the playground (no chrome.storage), an in-memory + localStorage
       fallback keeps state stable across reloads.
─────────────────────────────────────────────────────────────── */

// Urgency thresholds (ms)
const T_MODERATE = 60 * 60 * 1000;
const T_HIGH     = 4 * 60 * 60 * 1000;
const T_CRITICAL = 6 * 60 * 60 * 1000;

function getTimerInfo(addedAt, nowMs) {
  const ms = nowMs - addedAt;
  const s  = Math.max(0, Math.floor(ms / 1000));
  const h  = Math.floor(s / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const sc = s % 60;
  const text = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${sc}s` : `${sc}s`;
  const urgency =
    ms >= T_CRITICAL ? 'critical' :
    ms >= T_HIGH     ? 'high'     :
    ms >= T_MODERATE ? 'moderate' : 'normal';
  return { text, urgency };
}

/* ── Storage shim ─────────────────────────────────────────────
   The extension uses chrome.storage.local for cross-tab sync; the
   playground has no extension API so we fall back to localStorage
   (in-memory state already lives in React, this just persists). */
const STORAGE_KEY = 'watchList';
const hasChromeStorage = (() => {
  try { return typeof chrome !== 'undefined' && !!chrome.storage?.local; }
  catch { return false; }
})();

function loadWatchList() {
  return new Promise((resolve) => {
    if (hasChromeStorage) {
      chrome.storage.local.get(STORAGE_KEY, (data) => resolve(data?.[STORAGE_KEY] || []));
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      resolve(raw ? JSON.parse(raw) : []);
    } catch { resolve([]); }
  });
}
function saveWatchList(list) {
  if (hasChromeStorage) {
    chrome.storage.local.set({ [STORAGE_KEY]: list });
    return;
  }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
}
function subscribeWatchList(onChange) {
  if (hasChromeStorage) {
    const fn = (changes, area) => {
      if (area === 'local' && changes[STORAGE_KEY]) {
        onChange(changes[STORAGE_KEY].newValue || []);
      }
    };
    chrome.storage.onChanged.addListener(fn);
    return () => chrome.storage.onChanged.removeListener(fn);
  }
  // localStorage 'storage' event fires only across tabs — fine for parity.
  const fn = (e) => {
    if (e.key === STORAGE_KEY) {
      try { onChange(e.newValue ? JSON.parse(e.newValue) : []); } catch {}
    }
  };
  window.addEventListener('storage', fn);
  return () => window.removeEventListener('storage', fn);
}

/* Entity helpers — types map to admin URLs in the live extension. */
function buildEntityUrl(item) {
  if (item.orderUrl) return item.orderUrl;
  const id = item.orderId || '';
  if (!id) return '';
  const t = item.entityType || 'order';
  if (t === 'contact') return `https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=240&customerID=${id}`;
  if (t === 'account') return `https://api.golfballs.com/golfballs/adminNew/default.aspx?Page=271&accountID=${id}`;
  return '';
}
function entityLabel(item) {
  const t = item.entityType || 'order';
  const id = item.orderId || '';
  if (t === 'order')   return id ? `#${id}` : 'Order';
  if (t === 'contact') return id ? `Contact ${id}` : 'Contact';
  if (t === 'account') return id ? `Account ${id}` : 'Account';
  return id || 'Item';
}

/* ── Public component ────────────────────────────────────────── */
export function WatchList({ onClosed, bindClose }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  // resolvingIds collects items mid-exit-animation so AnimatePresence can
  // play their out-animation BEFORE we remove them from the source list.
  const [resolvingIds, setResolvingIds] = useState(() => new Set());
  // Confirm gate for Clear All — two-tap pattern.
  const [confirmClear, setConfirmClear] = useState(false);
  const confirmTimerRef = useRef(null);
  // Tick state — refreshes timer labels + urgency tiers every second.
  const [now, setNow] = useState(() => Date.now());

  // Load + subscribe to storage.
  useEffect(() => {
    let alive = true;
    loadWatchList().then((list) => {
      if (alive) { setItems(list); setLoaded(true); }
    });
    return subscribeWatchList((next) => { if (alive) setItems(next); });
  }, []);

  // Tick timers — 1s while any item exists.
  useEffect(() => {
    if (items.length === 0) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [items.length]);

  const persist = useCallback((next) => {
    setItems(next);
    saveWatchList(next);
  }, []);

  const resolve = useCallback((id) => {
    setResolvingIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    // After the exit animation, remove for real + persist.
    setTimeout(() => {
      setResolvingIds((prev) => {
        const n = new Set(prev); n.delete(id); return n;
      });
      setItems((cur) => {
        const next = cur.filter((i) => i.id !== id);
        saveWatchList(next);
        return next;
      });
    }, 260);
  }, []);

  const onClearAll = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => setConfirmClear(false), 2500);
      return;
    }
    clearTimeout(confirmTimerRef.current);
    setConfirmClear(false);
    // Mark every visible item resolving for a coordinated fade-out.
    setResolvingIds(new Set(items.map((i) => i.id)));
    setTimeout(() => {
      persist([]);
      setResolvingIds(new Set());
    }, 320);
  };
  useEffect(() => () => clearTimeout(confirmTimerRef.current), []);

  // Sorted oldest-first.
  const sorted = React.useMemo(
    () => [...items].sort((a, b) => a.addedAt - b.addedAt),
    [items],
  );
  const hasCritical = items.some((i) => (now - i.addedAt) >= T_CRITICAL);
  const countLabel =
    items.length === 0 ? 'Empty' :
    items.length === 1 ? '1 item' : `${items.length} items`;

  return (
    <FloatingPanel width={780} backdrop onClose={onClosed} bindClose={bindClose}>
      <ModalHeader
        icon={<ClockIcon />}
        title="Watch List"
        subtitle="Orders, contacts & accounts needing follow-up"
        right={
          <motion.span
            layout
            animate={{
              backgroundColor: hasCritical
                ? 'var(--gb-error-tint-medium)'
                : 'var(--gb-fill-soft)',
              color: hasCritical
                ? 'var(--gb-error-fg)'
                : 'var(--gb-text-secondary)',
              borderColor: hasCritical
                ? 'var(--gb-error-tint-border)'
                : 'var(--gb-border-default)',
            }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            style={{
              fontSize: 10, fontWeight: 800, letterSpacing: 0.4,
              padding: '4px 10px', borderRadius: 'var(--gb-r-sm)',
              border: '1px solid transparent',
              fontFamily: 'var(--gb-font-mono)',
              whiteSpace: 'nowrap',
            }}
          >{countLabel}</motion.span>
        }
      />

      {/* Legend bar — visual key for the four urgency tiers. */}
      <div style={{
        display: 'flex', gap: 14, alignItems: 'center',
        padding: '8px 16px',
        background: 'var(--gb-surface-1)',
        borderBottom: '1px solid var(--gb-border-subtle)',
      }}>
        <LegendDot color="var(--gb-brand-label)"   label="<1 hr" />
        <LegendDot color="var(--gb-warning-fg)"     label="1-4 hr" />
        <LegendDot color="#e07b30"                  label="4-6 hr" />
        <LegendDot color="var(--gb-error-fg)"       label="6+ hr" />
      </div>

      {/* Body — scrollable list. Max height keeps the footer pinned. */}
      <div style={{
        maxHeight: 'min(52vh, 480px)',
        overflowY: 'auto', overflowX: 'hidden',
        padding: '12px 14px',
      }}>
        {loaded && sorted.length === 0 ? (
          <EmptyState />
        ) : (
          <motion.ul layout style={{
            margin: 0, padding: 0, listStyle: 'none',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <AnimatePresence initial={false}>
              {sorted.map((item, idx) => {
                const { text, urgency } = getTimerInfo(item.addedAt, now);
                const isResolving = resolvingIds.has(item.id);
                return (
                  <WatchItem
                    key={item.id}
                    item={item}
                    timerText={text}
                    urgency={urgency}
                    index={idx}
                    isResolving={isResolving}
                    onResolve={() => resolve(item.id)}
                  />
                );
              })}
            </AnimatePresence>
          </motion.ul>
        )}
      </div>

      {/* Footer — hint + clear all */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 16px',
        borderTop: '1px solid var(--gb-border-subtle)',
        background: 'var(--gb-surface-1)',
      }}>
        <div style={{
          flex: 1,
          fontSize: 11, fontWeight: 500,
          color: 'var(--gb-text-tertiary)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <I.alert size={11} />
          <span>Sorted oldest first</span>
        </div>
        <AnimatePresence initial={false}>
          {sorted.length > 0 && (
            <motion.div
              key="clear-btn"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.16 }}
            >
              <Btn
                size="sm"
                variant={confirmClear ? 'tinted' : 'secondary'}
                status={confirmClear ? 'error' : undefined}
                onClick={onClearAll}
                icon={confirmClear ? <I.alert /> : <I.trash />}
              >
                {confirmClear ? 'Confirm clear all' : 'Clear all'}
              </Btn>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </FloatingPanel>
  );
}

/* ── Subcomponents ───────────────────────────────────────────── */

function WatchItem({ item, timerText, urgency, index, isResolving, onResolve }) {
  const link = buildEntityUrl(item);
  const label = entityLabel(item);
  const type = item.entityType || 'order';
  const isCrit = urgency === 'critical';

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={isResolving
        ? { opacity: 0, x: 24, height: 0, marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }
        : { opacity: 1, y: 0 }
      }
      exit={{ opacity: 0, x: 24, height: 0, marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={isResolving
        ? { duration: 0.26, ease: [0.4, 0, 0.2, 1] }
        : { duration: 0.22, delay: Math.min(index, 8) * 0.035, ease: [0.4, 0, 0.2, 1] }
      }
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 12px',
        background: isCrit ? 'var(--gb-error-tint-soft)' : 'var(--gb-surface-1)',
        border: '1px solid ' + (isCrit ? 'var(--gb-error-tint-border)' : 'var(--gb-border-subtle)'),
        borderRadius: 'var(--gb-r-md)',
        overflow: 'hidden',
        transition: 'background-color 0.3s, border-color 0.3s',
      }}
    >
      <UrgencyTimer text={timerText} urgency={urgency} />
      <TypeBadge type={type} />
      <div style={{
        flex: 1, minWidth: 0,
        display: 'flex', alignItems: 'center', gap: 8,
        flexWrap: 'wrap',
        fontSize: 13, lineHeight: 1.4,
        color: 'var(--gb-text-secondary)',
      }}>
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 13, fontWeight: 700,
              color: 'var(--gb-brand-label)',
              textDecoration: 'none',
              letterSpacing: 0.2,
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
            onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
          >{label}</a>
        ) : (
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: 'var(--gb-text-primary)',
            flexShrink: 0,
          }}>{label}</span>
        )}
        {item.reason && (
          <span style={{
            fontSize: 12.5,
            color: 'var(--gb-text-tertiary)',
            fontWeight: 500,
          }}>{item.reason}</span>
        )}
      </div>
      <motion.button
        type="button"
        whileTap={{ scale: 0.95 }}
        onClick={onResolve}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '5px 10px',
          fontSize: 11, fontWeight: 600,
          color: 'var(--gb-text-tertiary)',
          background: 'transparent',
          border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-sm)',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'background-color .15s, border-color .15s, color .15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--gb-fill-soft)';
          e.currentTarget.style.color = 'var(--gb-text-primary)';
          e.currentTarget.style.borderColor = 'var(--gb-border-strong)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--gb-text-tertiary)';
          e.currentTarget.style.borderColor = 'var(--gb-border-default)';
        }}
      >
        <I.check size={11} />
        Resolve
      </motion.button>
    </motion.li>
  );
}

function UrgencyTimer({ text, urgency }) {
  // Per-urgency styling. The 'critical' tier pulses subtly via opacity.
  const styles = {
    normal: {
      color: 'var(--gb-brand-label)',
      background: 'var(--gb-brand-tint-soft)',
      borderColor: 'var(--gb-brand-tint-border)',
    },
    moderate: {
      color: '#fce8b2',
      background: 'rgba(224, 160, 48, 0.15)',
      borderColor: 'rgba(224, 160, 48, 0.3)',
    },
    high: {
      color: '#fcdab2',
      background: 'rgba(224, 123, 48, 0.15)',
      borderColor: 'rgba(224, 123, 48, 0.3)',
    },
    critical: {
      color: 'var(--gb-error-fg)',
      background: 'var(--gb-error-tint-medium)',
      borderColor: 'var(--gb-error-tint-border)',
    },
  }[urgency] || {};

  return (
    <motion.span
      layout
      animate={{
        ...styles,
        opacity: urgency === 'critical' ? [1, 0.55, 1] : 1,
      }}
      transition={{
        backgroundColor: { duration: 0.6 },
        color: { duration: 0.6 },
        borderColor: { duration: 0.6 },
        opacity: urgency === 'critical'
          ? { duration: 1.9, ease: 'easeInOut', repeat: Infinity }
          : { duration: 0.3 },
      }}
      style={{
        fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
        padding: '3px 8px',
        borderRadius: 'var(--gb-r-sm)',
        border: '1px solid transparent',
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        fontFamily: 'var(--gb-font-mono)',
      }}
    >{text}</motion.span>
  );
}

function TypeBadge({ type }) {
  const config = {
    order: {
      label: 'Order',
      color: 'var(--gb-brand-label)',
      background: 'var(--gb-brand-tint-soft)',
      borderColor: 'var(--gb-brand-tint-border)',
    },
    contact: {
      label: 'Contact',
      color: '#60a0d8',
      background: 'rgba(96, 150, 200, 0.12)',
      borderColor: 'rgba(96, 150, 200, 0.3)',
    },
    account: {
      label: 'Account',
      color: '#b87cdc',
      background: 'rgba(180, 120, 220, 0.12)',
      borderColor: 'rgba(180, 120, 220, 0.3)',
    },
  }[type] || { label: 'Order' };
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, letterSpacing: 0.6,
      textTransform: 'uppercase',
      padding: '2px 6px',
      borderRadius: 'var(--gb-r-xs)',
      color: config.color,
      background: config.background,
      border: `1px solid ${config.borderColor}`,
      flexShrink: 0, lineHeight: 1.4,
    }}>{config.label}</span>
  );
}

function LegendDot({ color, label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 9.5, fontWeight: 800, letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: 'var(--gb-text-tertiary)',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: color,
        boxShadow: `0 0 6px ${color}`,
      }} />
      {label}
    </div>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 12, padding: '36px 20px',
        textAlign: 'center',
        color: 'var(--gb-text-tertiary)',
      }}
    >
      <div style={{
        width: 44, height: 44,
        background: 'var(--gb-surface-2)',
        border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-md)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--gb-text-secondary)',
      }}>
        <I.eye size={20} />
      </div>
      <div>
        <strong style={{
          display: 'block',
          color: 'var(--gb-text-primary)',
          fontSize: 14, fontWeight: 700,
        }}>Nothing on the watch list</strong>
        <p style={{
          margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.6,
          maxWidth: 280,
        }}>
          Use <em>Watch Order</em>, <em>Watch Contact</em>, or <em>Watch Account</em> in
          the extension popup to flag items that need follow-up.
        </p>
      </div>
    </motion.div>
  );
}

/* Clock icon — header glyph, not in shared icon set. */
const ClockIcon = (p) => (
  <svg
    width={p?.size || 16} height={p?.size || 16}
    viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);
