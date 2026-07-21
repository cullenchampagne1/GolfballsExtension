import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  FloatingPanel, ModalHeader, Btn, Input, Segmented, formatHumanDate, I,
} from '../ui/index.js';
import { useToast } from '../ui/components/ToastHost.jsx';

/* ───────────────────────────────────────────────────────────────
   Notifications — tracks relayed customer-email replies. Mirrors the
   Watch List modal (FloatingPanel + ModalHeader + Segmented filter +
   searchable scroll list) so it reads as part of the same system.

   Each notification is written by the background email-relay poll
   (notifications-store.js) and auto-completed when the rep replies to
   the contact (background paAutomate hook). The rep can also mark one
   done by hand, open the contact account, or view the email in the
   existing email render window.

   Shape (see notifications-store.js):
     { id, type:'email', status:'open'|'done', contactEmail, contactName,
       subject, preview, body, messageId, viewUrl, receivedAt, createdAt,
       completedAt, completedReason }

   Storage: chrome.storage.local `gbNotifications` (localStorage fallback
   for the playground). The store is shared with the worker, so writes
   here and there stay in sync via chrome.storage.onChanged.
─────────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'gbNotifications';
const hasChromeStorage = (() => {
  try { return typeof chrome !== 'undefined' && !!chrome.storage?.local; }
  catch { return false; }
})();

function loadItems() {
  return new Promise((resolve) => {
    if (hasChromeStorage) {
      chrome.storage.local.get(STORAGE_KEY, (data) => resolve(Array.isArray(data?.[STORAGE_KEY]) ? data[STORAGE_KEY] : []));
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      resolve(raw ? JSON.parse(raw) : []);
    } catch { resolve([]); }
  });
}
function saveItems(list) {
  if (hasChromeStorage) { chrome.storage.local.set({ [STORAGE_KEY]: list }); return; }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
}
function subscribeItems(onChange) {
  if (hasChromeStorage) {
    const fn = (changes, area) => {
      if (area === 'local' && changes[STORAGE_KEY]) onChange(Array.isArray(changes[STORAGE_KEY].newValue) ? changes[STORAGE_KEY].newValue : []);
    };
    chrome.storage.onChanged.addListener(fn);
    return () => chrome.storage.onChanged.removeListener(fn);
  }
  const fn = (e) => {
    if (e.key === STORAGE_KEY) { try { onChange(e.newValue ? JSON.parse(e.newValue) : []); } catch {} }
  };
  window.addEventListener('storage', fn);
  return () => window.removeEventListener('storage', fn);
}

const FILTERS = [
  { key: 'open', label: 'Open' },
  { key: 'all', label: 'All' },
  { key: 'done', label: 'Done' },
];

function FilterLabel({ text, count, active }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {text}
      {count > 0 && (
        <span style={{
          fontSize: 9.5, fontWeight: 700, lineHeight: 1,
          padding: '2px 5px', borderRadius: 999,
          background: active ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-subtle)',
          color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
        }}>{count}</span>
      )}
    </span>
  );
}

/* Open the relayed email in the existing email render window. Passes the body
   directly (payload path added to email-preview.jsx) since a relayed email has
   no CRM message id to fetch. Closing that window returns to this modal. */
function openEmail(item) {
  const bodyHtml = item.body || (item.preview ? `<p>${escapeHtml(item.preview)}</p>` : '');
  const email = {
    from: item.contactName ? `${item.contactName} <${item.contactEmail}>` : item.contactEmail,
    to: '',
    subject: item.subject || '(no subject)',
    date: item.receivedAt || '',
    bodyHtml,
  };
  if (typeof window.__gbOpenEmailPreview === 'function') {
    window.__gbOpenEmailPreview({ email, meta: email });
    return true;
  }
  return false;
}
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => (
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  ));
}

function Row({ item, onView, onAccount, onToggleDone }) {
  const [hover, setHover] = useState(false);
  const who = item.contactName || item.contactEmail;
  const done = item.status === 'done';
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.14 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onView(item)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '9px 10px', borderRadius: 8, cursor: 'pointer',
        background: hover ? 'var(--gb-surface-1)' : 'transparent',
        border: `1px solid ${hover ? 'var(--gb-border-default)' : 'transparent'}`,
        opacity: done ? 0.62 : 1,
      }}
    >
      <div style={{
        width: 26, height: 26, flexShrink: 0, borderRadius: 'var(--gb-r-sm)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: done ? 'var(--gb-fill-subtle)' : 'var(--gb-brand-tint-soft)',
        color: done ? 'var(--gb-text-muted)' : 'var(--gb-brand-label)',
        border: `1px solid ${done ? 'var(--gb-border-subtle)' : 'var(--gb-brand-tint-border)'}`,
      }}>{done ? <I.check size={13} /> : <I.mail size={13} />}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 6,
          fontSize: 12.5, fontWeight: 600, color: 'var(--gb-text-primary)',
          textDecoration: done ? 'line-through' : 'none',
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{who}</span>
          {done && <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--gb-success-fg)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Done</span>}
        </div>
        {item.subject && (
          <div style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{item.subject}</div>
        )}
        {item.preview && (
          <div style={{ fontSize: 11, color: 'var(--gb-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{item.preview}</div>
        )}
      </div>

      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        {hover ? (
          <div style={{ display: 'flex', gap: 3 }} onClick={(e) => e.stopPropagation()}>
            <RowAction title="View account" disabled={!item.viewUrl} onClick={() => onAccount(item)}><I.user size={12} /></RowAction>
            <RowAction title="View email" onClick={() => onView(item)}><I.mail size={12} /></RowAction>
            <RowAction title={done ? 'Reopen' : 'Mark done'} status={done ? undefined : 'brand'} onClick={() => onToggleDone(item)}>
              {done ? <I.history size={12} /> : <I.check size={12} />}
            </RowAction>
          </div>
        ) : (
          <span style={{ fontSize: 10, color: 'var(--gb-text-muted)', whiteSpace: 'nowrap' }}>
            {formatHumanDate(item.createdAt || item.receivedAt)}
          </span>
        )}
      </div>
    </motion.li>
  );
}

function RowAction({ children, title, onClick, disabled, status }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 'var(--gb-r-sm)', border: '1px solid transparent',
        background: 'transparent', cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? 'var(--gb-text-ghost)' : (status === 'brand' ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)'),
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = 'var(--gb-fill-subtle)'; e.currentTarget.style.borderColor = 'var(--gb-border-default)'; } }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
    >{children}</button>
  );
}

function EmptyState({ filter }) {
  const copy = filter === 'done'
    ? { strong: 'No completed notifications', hint: 'Replies you resolve show up here.' }
    : filter === 'all'
      ? { strong: 'No notifications yet', hint: 'Customer replies will appear here as they arrive.' }
      : { strong: 'You’re all caught up', hint: 'New customer replies will show up here.' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '52px 24px', textAlign: 'center' }}>
      <div style={{
        width: 42, height: 42, borderRadius: 'var(--gb-r-md)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--gb-brand-tint-soft)', color: 'var(--gb-brand-label)',
        border: '1px solid var(--gb-brand-tint-border)',
      }}><I.mail size={18} /></div>
      <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--gb-text-primary)' }}>{copy.strong}</div>
      <div style={{ fontSize: 11.5, color: 'var(--gb-text-tertiary)', maxWidth: 260 }}>{copy.hint}</div>
    </div>
  );
}

export function Notifications({ onClosed, bindClose }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState('open');
  const [search, setSearch] = useState('');
  const [clearArmed, setClearArmed] = useState(false);
  const draggable = false;

  useEffect(() => {
    let alive = true;
    loadItems().then((list) => { if (alive) { setItems(list); setLoaded(true); } });
    const unsub = subscribeItems((list) => { if (alive) setItems(list); });
    return () => { alive = false; unsub(); };
  }, []);

  const persist = useCallback((next) => { setItems(next); saveItems(next); }, []);

  const counts = useMemo(() => ({
    open: items.filter((n) => n.status === 'open').length,
    all: items.length,
    done: items.filter((n) => n.status === 'done').length,
  }), [items]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((n) => (filter === 'all' ? true : n.status === filter))
      .filter((n) => !q
        || String(n.contactName || '').toLowerCase().includes(q)
        || String(n.contactEmail || '').toLowerCase().includes(q)
        || String(n.subject || '').toLowerCase().includes(q))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [items, filter, search]);

  const onView = useCallback((item) => {
    if (!openEmail(item)) toast?.error?.('Email viewer isn’t loaded on this page', { duration: 3500 });
  }, [toast]);

  const onAccount = useCallback((item) => {
    if (item.viewUrl) window.open(item.viewUrl, '_blank', 'noopener');
    else toast?.info?.('No contact is linked to this email yet', { duration: 3500 });
  }, [toast]);

  const onToggleDone = useCallback((item) => {
    const done = item.status === 'done';
    persist(items.map((n) => (n.id === item.id
      ? { ...n, status: done ? 'open' : 'done', completedAt: done ? null : Date.now(), completedReason: done ? '' : 'manual' }
      : n)));
  }, [items, persist]);

  const clearDone = useCallback(() => {
    if (!clearArmed) { setClearArmed(true); return; }
    persist(items.filter((n) => n.status !== 'done'));
    setClearArmed(false);
    toast?.success?.('Cleared completed notifications', { duration: 2000 });
  }, [clearArmed, items, persist, toast]);

  const subtitle = counts.open > 0
    ? `${counts.open} open notification${counts.open === 1 ? '' : 's'}`
    : 'All caught up';

  return (
    <FloatingPanel width={560} backdrop draggable={draggable} onClose={onClosed} bindClose={bindClose}>
      <ModalHeader accent icon={<I.alert size={14} />} title="Notifications" subtitle={subtitle} />

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 14px',
        background: 'var(--gb-surface-1)', borderBottom: '1px solid var(--gb-border-subtle)', flexShrink: 0,
      }}>
        <Segmented
          full size="md" value={filter} onChange={setFilter}
          options={FILTERS.map((f) => ({ id: f.key, label: <FilterLabel text={f.label} count={counts[f.key]} active={filter === f.key} /> }))}
        />
        <Input value={search} onChange={setSearch} placeholder="Search contact or subject…" leading={<I.search size={12} />} />
      </div>

      <div style={{ minHeight: 320, maxHeight: 'min(56vh, 480px)', overflowY: 'auto', overflowX: 'hidden', padding: 8 }}>
        <AnimatePresence mode="popLayout" initial={false}>
          {loaded && visible.length === 0 && (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
              <EmptyState filter={filter} />
            </motion.div>
          )}
        </AnimatePresence>
        <motion.ul layout style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((item) => (
              <Row key={item.id} item={item} onView={onView} onAccount={onAccount} onToggleDone={onToggleDone} />
            ))}
          </AnimatePresence>
        </motion.ul>
      </div>

      {counts.done > 0 && (
        <div style={{
          padding: '8px 14px', borderTop: '1px solid var(--gb-border-subtle)',
          background: 'var(--gb-surface-1)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{ flex: 1, fontSize: 10.5, color: 'var(--gb-text-muted)' }}>
            {clearArmed
              ? <span style={{ color: 'var(--gb-error-fg)', fontWeight: 600 }}>Click again to remove {counts.done} completed</span>
              : `${counts.done} completed`}
          </div>
          <Btn size="sm" variant="ghost" status={clearArmed ? 'error' : undefined} icon={<I.trash size={11} />} onClick={clearDone}>
            {clearArmed ? 'Confirm clear' : 'Clear completed'}
          </Btn>
        </div>
      )}
    </FloatingPanel>
  );
}

export default Notifications;
