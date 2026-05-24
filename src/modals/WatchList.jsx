import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  FloatingPanel, ModalHeader, Btn, Card, Input, Tag, I,
} from '../ui/index.js';
import { useToast } from '../ui/components/ToastHost.jsx';
import { useDevSetting } from '../lib/devSettings.js';

/* ───────────────────────────────────────────────────────────────
   WatchList — React port of content/watchlist-modal.js, rebuilt
   to match the redesign in design_handoff/Golfballs Extension
   Redesign.html (WatchListView in surfaces-1.jsx).

   Visual structure per row:
     • 26×26 type-icon tile on the LEFT, color-shifted on critical
     • meta row: tiny type tag, mono ID, age, optional CRITICAL badge
     • name (or short title)
     • reason text
     • action row: Open · Edit reason · Resolve (right-aligned)

   Top toolbar: search input + filter button.

   Three urgency tiers gated by dev settings (hours):
     watchList.thresholdModerateH  (default 1)
     watchList.thresholdHighH       (default 4)
     watchList.thresholdCriticalH   (default 6)

   Storage: chrome.storage.local with `watchList` key when available,
   localStorage fallback for the playground.
─────────────────────────────────────────────────────────────── */

function getTimerInfo(addedAt, nowMs, thresholdsMs) {
  const ms = Math.max(0, nowMs - addedAt);
  const s  = Math.floor(ms / 1000);
  const h  = Math.floor(s / 3600);
  const d  = Math.floor(h / 24);
  const m  = Math.floor((s % 3600) / 60);
  const sc = s % 60;

  // Compact age label: <1m → seconds, <1h → minutes, <1d → "Xh Ym",
  // ≥1d → "Xd". Mirrors the design which uses "8h", "1d", "22d".
  let age;
  if (d > 0)        age = `${d}d`;
  else if (h > 0)   age = `${h}h ${m}m`;
  else if (m > 0)   age = `${m}m ${sc}s`;
  else              age = `${sc}s`;

  const urgency =
    ms >= thresholdsMs.critical ? 'critical' :
    ms >= thresholdsMs.high     ? 'high'     :
    ms >= thresholdsMs.moderate ? 'moderate' : 'normal';
  return { age, urgency };
}

/* ── Storage shim — chrome.storage.local when available, localStorage
   fallback so the modal works inside the playground page too. */
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
  if (hasChromeStorage) { chrome.storage.local.set({ [STORAGE_KEY]: list }); return; }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
}
function subscribeWatchList(onChange) {
  if (hasChromeStorage) {
    const fn = (changes, area) => {
      if (area === 'local' && changes[STORAGE_KEY]) onChange(changes[STORAGE_KEY].newValue || []);
    };
    chrome.storage.onChanged.addListener(fn);
    return () => chrome.storage.onChanged.removeListener(fn);
  }
  const fn = (e) => {
    if (e.key === STORAGE_KEY) {
      try { onChange(e.newValue ? JSON.parse(e.newValue) : []); } catch {}
    }
  };
  window.addEventListener('storage', fn);
  return () => window.removeEventListener('storage', fn);
}

function buildEntityUrl(item) {
  if (item.orderUrl) return item.orderUrl;
  const id = item.orderId || '';
  if (!id) return '';
  const t = item.entityType || 'order';
  if (t === 'contact') return `https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=240&customerID=${id}`;
  if (t === 'account') return `https://api.golfballs.com/golfballs/adminNew/default.aspx?Page=271&accountID=${id}`;
  return '';
}

function entityName(item) {
  // Prefer a friendly display name when present (added by future
  // capture flows); else use the entity id.
  if (item.name) return item.name;
  const t = item.entityType || 'order';
  const id = item.orderId || '';
  if (t === 'order')   return id ? `Order ${id}` : 'Order';
  if (t === 'contact') return id ? `Contact ${id}` : 'Contact';
  if (t === 'account') return id ? `Account ${id}` : 'Account';
  return id || 'Item';
}

/* ── Public component ────────────────────────────────────────── */
export function WatchList({ onClosed, bindClose }) {
  const toast = useToast();

  // Dev-setting-driven thresholds. Values come back in hours, converted
  // to ms here. Live — flipping the setting reflects immediately because
  // the next render re-reads them.
  const modH  = Number(useDevSetting('watchList.thresholdModerateH') ?? 1);
  const highH = Number(useDevSetting('watchList.thresholdHighH')     ?? 4);
  const critH = Number(useDevSetting('watchList.thresholdCriticalH') ?? 6);
  // Defensive: make sure they don't cross (moderate ≤ high ≤ critical),
  // otherwise tier transitions look wrong.
  const thresholdsMs = useMemo(() => {
    const m = modH;
    const h = Math.max(m, highH);
    const c = Math.max(h, critH);
    return { moderate: m * 3600000, high: h * 3600000, critical: c * 3600000 };
  }, [modH, highH, critH]);

  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [resolvingIds, setResolvingIds] = useState(() => new Set());
  // Edit-reason inline state: which item id is being edited + draft text.
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  // Filter state — matches the design's "All" button. For now just a
  // single quick filter; can grow into a dropdown later.
  const [filter, setFilter] = useState('all'); // 'all' | 'critical'
  const [search, setSearch] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const confirmTimerRef = useRef(null);
  const [now, setNow] = useState(() => Date.now());

  // Load + subscribe.
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
    setResolvingIds((prev) => { const n = new Set(prev); n.add(id); return n; });
    setTimeout(() => {
      setResolvingIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      setItems((cur) => {
        const next = cur.filter((i) => i.id !== id);
        saveWatchList(next);
        return next;
      });
    }, 260);
  }, []);

  const startEditReason = (item) => {
    setEditingId(item.id);
    setEditDraft(item.reason || '');
  };
  const commitEditReason = () => {
    if (!editingId) return;
    setItems((cur) => {
      const next = cur.map((i) => i.id === editingId ? { ...i, reason: editDraft.trim() } : i);
      saveWatchList(next);
      return next;
    });
    setEditingId(null);
    setEditDraft('');
  };
  const cancelEditReason = () => { setEditingId(null); setEditDraft(''); };

  const onClearAll = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => setConfirmClear(false), 2500);
      return;
    }
    clearTimeout(confirmTimerRef.current);
    setConfirmClear(false);
    setResolvingIds(new Set(items.map((i) => i.id)));
    setTimeout(() => {
      persist([]);
      setResolvingIds(new Set());
    }, 320);
  };
  useEffect(() => () => clearTimeout(confirmTimerRef.current), []);

  // Derived list — sort oldest-first, then filter.
  const filtered = useMemo(() => {
    const sorted = [...items].sort((a, b) => a.addedAt - b.addedAt);
    const q = search.trim().toLowerCase();
    return sorted.filter((it) => {
      if (filter === 'critical') {
        const ageMs = now - it.addedAt;
        if (ageMs < thresholdsMs.critical) return false;
      }
      if (!q) return true;
      const hay = `${it.reason || ''} ${it.orderId || ''} ${entityName(it)} ${it.entityType || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, filter, search, now, thresholdsMs.critical]);

  const criticalCount = items.filter((i) => (now - i.addedAt) >= thresholdsMs.critical).length;
  const hasCritical = criticalCount > 0;
  const subtitle = items.length === 0
    ? 'Nothing on the watch list'
    : `${items.length} ${items.length === 1 ? 'item' : 'items'}${criticalCount > 0 ? ` · ${criticalCount} critical` : ''}`;

  return (
    <FloatingPanel width={520} backdrop onClose={onClosed} bindClose={bindClose}>
      <ModalHeader
        accent
        icon={<I.eye size={14} />}
        title="Watch List"
        subtitle={subtitle}
      />

      {/* Toolbar — search + quick filter. Matches the redesign. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px',
        background: 'var(--gb-surface-1)',
        borderBottom: '1px solid var(--gb-border-subtle)',
        flexShrink: 0,
      }}>
        <Input
          placeholder="Search reason or ID…"
          value={search}
          onChange={setSearch}
          leading={<I.search size={12} />}
          style={{ flex: 1 }}
        />
        <Btn
          size="sm"
          variant={filter === 'critical' ? 'tinted' : 'secondary'}
          status={filter === 'critical' ? 'error' : undefined}
          icon={<I.filter size={11} />}
          onClick={() => setFilter((f) => f === 'critical' ? 'all' : 'critical')}
        >
          {filter === 'critical' ? `Critical (${criticalCount})` : 'All'}
        </Btn>
      </div>

      {/* Body */}
      <div style={{
        maxHeight: 'min(54vh, 460px)',
        overflowY: 'auto', overflowX: 'hidden',
        padding: 8,
      }}>
        {loaded && filtered.length === 0 ? (
          <EmptyState searching={!!search || filter !== 'all'} />
        ) : (
          <motion.ul layout style={{
            margin: 0, padding: 0, listStyle: 'none',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <AnimatePresence initial={false}>
              {filtered.map((item, idx) => {
                const { age, urgency } = getTimerInfo(item.addedAt, now, thresholdsMs);
                return (
                  <WatchItem
                    key={item.id}
                    item={item}
                    age={age}
                    urgency={urgency}
                    index={idx}
                    isResolving={resolvingIds.has(item.id)}
                    isEditing={editingId === item.id}
                    editDraft={editDraft}
                    onEditDraft={setEditDraft}
                    onStartEdit={() => startEditReason(item)}
                    onCommitEdit={commitEditReason}
                    onCancelEdit={cancelEditReason}
                    onResolve={() => resolve(item.id)}
                  />
                );
              })}
            </AnimatePresence>
          </motion.ul>
        )}
      </div>

      {/* Footer — hint + clear-all */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px',
        borderTop: '1px solid var(--gb-border-subtle)',
        background: 'var(--gb-surface-1)',
      }}>
        <div style={{
          flex: 1,
          fontSize: 10.5, fontWeight: 500,
          color: 'var(--gb-text-tertiary)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <I.alert size={11} />
          <span>Sorted oldest first</span>
        </div>
        <AnimatePresence initial={false}>
          {items.length > 0 && (
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

/* ── WatchItem ────────────────────────────────────────────────── */

function WatchItem({
  item, age, urgency, index, isResolving,
  isEditing, editDraft, onEditDraft, onStartEdit, onCommitEdit, onCancelEdit,
  onResolve,
}) {
  const isCrit = urgency === 'critical';
  const type = item.entityType || 'order';
  const link = buildEntityUrl(item);
  const name = entityName(item);
  const idLabel = item.orderId ? `#${item.orderId}` : '';

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={isResolving
        ? { opacity: 0, x: 20, height: 0, marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }
        : { opacity: 1, y: 0 }
      }
      exit={{ opacity: 0, x: 20, height: 0, marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={isResolving
        ? { duration: 0.26, ease: [0.4, 0, 0.2, 1] }
        : { duration: 0.22, delay: Math.min(index, 8) * 0.03, ease: [0.4, 0, 0.2, 1] }
      }
      style={{ overflow: 'hidden', listStyle: 'none' }}
    >
      <Card padding={10} style={{
        borderColor: isCrit ? 'var(--gb-error-tint-border)' : 'var(--gb-border-subtle)',
        background: isCrit ? 'var(--gb-error-tint-soft)' : undefined,
        transition: 'border-color .3s, background-color .3s',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          {/* Type icon tile — replaces the text "Order"/"Contact"/"Account"
              label to save vertical space, per request. */}
          <EntityIconTile type={type} critical={isCrit} />

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Meta row */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              marginBottom: 2,
              flexWrap: 'wrap',
            }}>
              {idLabel && (
                <span style={{
                  fontFamily: 'var(--gb-font-mono)',
                  fontSize: 10.5, fontWeight: 700,
                  color: 'var(--gb-text-secondary)',
                  letterSpacing: 0.2,
                }}>{idLabel}</span>
              )}
              {idLabel && (
                <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)' }}>·</span>
              )}
              <UrgencyAge age={age} urgency={urgency} />
              {isCrit && <Tag tone="error" size="sm">CRITICAL</Tag>}
            </div>

            {/* Name */}
            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  fontSize: 12.5, fontWeight: 600,
                  color: 'var(--gb-text-primary)',
                  textDecoration: 'none',
                  letterSpacing: 0.1,
                  marginTop: 1,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gb-brand-label)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--gb-text-primary)'; }}
              >{name}</a>
            ) : (
              <div style={{
                fontSize: 12.5, fontWeight: 600,
                color: 'var(--gb-text-primary)',
                marginTop: 1,
              }}>{name}</div>
            )}

            {/* Reason — inline-edit on click of "Edit reason". */}
            {isEditing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                <Input
                  value={editDraft}
                  onChange={onEditDraft}
                  autoFocus
                  placeholder="Why is this on the watch list?"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter')  { e.preventDefault(); onCommitEdit(); }
                    if (e.key === 'Escape') { e.preventDefault(); onCancelEdit(); }
                  }}
                />
                <div style={{ display: 'flex', gap: 5 }}>
                  <Btn size="sm" variant="tinted" status="brand" icon={<I.check size={10} />} onClick={onCommitEdit}>Save</Btn>
                  <Btn size="sm" variant="ghost" onClick={onCancelEdit}>Cancel</Btn>
                </div>
              </div>
            ) : item.reason ? (
              <div style={{
                fontSize: 11.5,
                color: 'var(--gb-text-tertiary)',
                marginTop: 3, lineHeight: 1.4,
                wordBreak: 'break-word',
              }}>{item.reason}</div>
            ) : (
              <div style={{
                fontSize: 11.5,
                color: 'var(--gb-text-ghost)',
                marginTop: 3, fontStyle: 'italic',
              }}>No reason given — click Edit to add one.</div>
            )}

            {/* Action row */}
            {!isEditing && (
              <div style={{
                display: 'flex', gap: 4,
                marginTop: 7,
              }}>
                {link && (
                  <Btn
                    size="sm"
                    variant="ghost"
                    onClick={() => window.open(link, '_blank', 'noopener')}
                  >Open</Btn>
                )}
                <Btn size="sm" variant="ghost" onClick={onStartEdit}>Edit reason</Btn>
                <Btn
                  size="sm"
                  variant="ghost"
                  onClick={onResolve}
                  icon={<I.check size={10} />}
                  style={{ marginLeft: 'auto' }}
                >Resolve</Btn>
              </div>
            )}
          </div>
        </div>
      </Card>
    </motion.li>
  );
}

/* ── EntityIconTile — 26×26 rounded square with the type glyph. ───── */
function EntityIconTile({ type, critical }) {
  return (
    <div
      title={type[0].toUpperCase() + type.slice(1)}
      style={{
        width: 26, height: 26,
        flexShrink: 0,
        marginTop: 1,
        borderRadius: 'var(--gb-r-sm)',
        background: critical ? 'var(--gb-error-tint-medium)' : 'var(--gb-fill-soft)',
        border: '1px solid ' + (critical ? 'var(--gb-error-tint-border)' : 'var(--gb-border-subtle)'),
        color: critical ? 'var(--gb-error-fg)' : 'var(--gb-text-tertiary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background-color .3s, border-color .3s, color .3s',
      }}
    >
      {type === 'order' ? <DocIcon size={12} /> :
       type === 'contact' ? <I.user size={12} /> :
       <UsersIcon size={12} />}
    </div>
  );
}

/* ── UrgencyAge — the compact ticking age pill (Xd / Xh Ym / Xm Xs). ── */
function UrgencyAge({ age, urgency }) {
  const styles = {
    normal: {
      color: 'var(--gb-brand-label)',
      background: 'var(--gb-brand-tint-soft)',
      borderColor: 'var(--gb-brand-tint-border)',
    },
    moderate: {
      color: 'var(--gb-warning-fg)',
      background: 'var(--gb-warning-tint-soft)',
      borderColor: 'var(--gb-warning-tint-border)',
    },
    high: {
      color: '#e07b30',
      background: 'rgba(224, 123, 48, 0.12)',
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
      animate={{
        ...styles,
        opacity: urgency === 'critical' ? [1, 0.6, 1] : 1,
      }}
      transition={{
        backgroundColor: { duration: 0.6 },
        color:           { duration: 0.6 },
        borderColor:     { duration: 0.6 },
        opacity: urgency === 'critical'
          ? { duration: 1.9, ease: 'easeInOut', repeat: Infinity }
          : { duration: 0.3 },
      }}
      style={{
        fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4,
        padding: '1px 6px',
        borderRadius: 'var(--gb-r-xs)',
        border: '1px solid transparent',
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        fontFamily: 'var(--gb-font-mono)',
        textTransform: 'uppercase',
      }}
    >{age}</motion.span>
  );
}

function EmptyState({ searching }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 10, padding: '32px 20px',
        textAlign: 'center',
        color: 'var(--gb-text-tertiary)',
      }}
    >
      <div style={{
        width: 40, height: 40,
        background: 'var(--gb-surface-2)',
        border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-md)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--gb-text-secondary)',
      }}>
        <I.eye size={18} />
      </div>
      <div>
        <strong style={{
          display: 'block',
          color: 'var(--gb-text-primary)',
          fontSize: 13, fontWeight: 700,
        }}>{searching ? 'No matches' : 'Nothing on the watch list'}</strong>
        <p style={{
          margin: '4px 0 0', fontSize: 11.5, lineHeight: 1.55,
          maxWidth: 260,
        }}>
          {searching
            ? 'Try a different search term or clear the filter.'
            : <>Use <em>Watch Order</em>, <em>Watch Contact</em>, or <em>Watch Account</em> in the extension popup to flag items.</>}
        </p>
      </div>
    </motion.div>
  );
}

/* Inline glyphs not in the shared icon registry. */
const DocIcon = (p) => (
  <svg width={p?.size || 12} height={p?.size || 12} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);
const UsersIcon = (p) => (
  <svg width={p?.size || 12} height={p?.size || 12} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
