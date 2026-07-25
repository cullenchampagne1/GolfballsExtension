import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  FloatingPanel, ModalHeader, ModalFooter, EmptyState, Btn, IconBtn,
  Input, Segmented, formatHumanDate, Icon, I,
} from '../ui/index.js';
import { useToast } from '../ui/components/ToastHost.jsx';

/* Durable, installation-scoped notification center. The worker owns server
   synchronization and receipts; this surface renders its offline cache and
   executes only the typed actions reconstructed by content/main.js. */

const STORAGE_KEY = 'gbNotifications';
const FILTERS = [
  { key: 'unread', label: 'Unread' },
  { key: 'active', label: 'Active' },
  { key: 'dismissed', label: 'Archived' },
];
const NotificationBell = (props) => (
  <Icon {...props}>
    <path d="M18 8a6 6 0 00-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
    <path d="M10 21h4" />
  </Icon>
);
const hasChromeStorage = (() => {
  try { return typeof chrome !== 'undefined' && !!chrome.storage?.local; }
  catch { return false; }
})();

function loadItems() {
  return new Promise((resolve) => {
    if (hasChromeStorage) {
      chrome.storage.local.get(STORAGE_KEY, (data) => {
        resolve(Array.isArray(data?.[STORAGE_KEY]) ? data[STORAGE_KEY] : []);
      });
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      resolve(raw ? JSON.parse(raw) : []);
    } catch { resolve([]); }
  });
}

function saveFallback(items) {
  if (hasChromeStorage) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
}

function subscribeItems(onChange) {
  if (hasChromeStorage) {
    const listener = (changes, area) => {
      if (area === 'local' && changes[STORAGE_KEY]) {
        onChange(Array.isArray(changes[STORAGE_KEY].newValue)
          ? changes[STORAGE_KEY].newValue : []);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }
  const listener = (event) => {
    if (event.key !== STORAGE_KEY) return;
    try { onChange(event.newValue ? JSON.parse(event.newValue) : []); } catch {}
  };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}

function sendReceipt(item, state) {
  const remoteId = Number(item?.remoteId);
  if (!Number.isSafeInteger(remoteId) || remoteId < 1 || !hasChromeStorage) {
    return;
  }
  try {
    chrome.runtime.sendMessage({
      action: 'notificationReceipt',
      notificationIds: [remoteId],
      state,
    });
  } catch { /* worker may be waking; local cache still reflects the action */ }
}

function nextState(item, state) {
  const now = Date.now();
  return {
    ...item,
    status: state === 'dismissed' ? 'dismissed' : 'read',
    readAt: item.readAt || now,
    dismissedAt: state === 'dismissed' ? (item.dismissedAt || now) : item.dismissedAt,
    actedAt: state === 'acted' ? (item.actedAt || now) : item.actedAt,
    updatedAt: now,
  };
}

function FilterLabel({ text, count, active }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {text}
      {count > 0 && (
        <span style={{
          fontSize: 9.5,
          fontWeight: 750,
          lineHeight: 1,
          padding: '2px 5px',
          borderRadius: 999,
          background: active ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-subtle)',
          color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
        }}
        >
          {count}
        </span>
      )}
    </span>
  );
}

function NotificationEmptyState({ filter, searching }) {
  if (searching) {
    return (
      <EmptyState
        icon={<I.search size={19} />}
        title="No matching notifications"
        subtitle="Try a different title, message, or topic."
        style={{ height: '100%', justifyContent: 'center', padding: '28px 24px' }}
      />
    );
  }
  const copy = filter === 'dismissed'
    ? { title: 'Nothing archived', body: 'Dismissed notifications stay here for reference.' }
    : filter === 'active'
      ? { title: 'No notifications yet', body: 'Updates from your tools will appear here.' }
      : { title: 'You’re all caught up', body: 'New updates will appear here when they arrive.' };
  return (
    <EmptyState
      icon={filter === 'unread' ? <I.check size={20} /> : <I.alert size={19} />}
      title={copy.title}
      subtitle={copy.body}
      style={{ height: '100%', justifyContent: 'center', padding: '28px 24px' }}
    />
  );
}

function NotificationSkeleton() {
  return (
    <div style={{
      height: '100%', padding: 10, display: 'flex',
      flexDirection: 'column', gap: 7,
    }}>
      {[0, 1, 2].map((index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.45, 0.8, 0.45] }}
          transition={{
            duration: 1.35, repeat: Infinity, delay: index * 0.08,
          }}
          style={{
            height: 76, padding: 10, display: 'flex', gap: 10,
            borderRadius: 'var(--gb-r-md)',
            background: 'var(--gb-surface-1)',
            border: '1px solid var(--gb-border-subtle)',
          }}
        >
          <span style={{
            width: 28, height: 28, flexShrink: 0,
            borderRadius: 'var(--gb-r-sm)',
            background: 'var(--gb-fill-soft)',
          }} />
          <span style={{ flex: 1 }}>
            <span style={{
              display: 'block', width: `${52 + index * 9}%`, height: 8,
              margin: '2px 0 10px', borderRadius: 999,
              background: 'var(--gb-fill-soft)',
            }} />
            <span style={{
              display: 'block', width: '84%', height: 7,
              marginBottom: 6, borderRadius: 999,
              background: 'var(--gb-fill-subtle)',
            }} />
            <span style={{
              display: 'block', width: '58%', height: 7,
              borderRadius: 999, background: 'var(--gb-fill-subtle)',
            }} />
          </span>
        </motion.div>
      ))}
    </div>
  );
}

function LevelIcon({ level }) {
  const tones = {
    success: {
      fg: 'var(--gb-success-fg)',
      bg: 'var(--gb-success-tint-soft)',
      border: 'var(--gb-success-tint-border)',
      icon: <I.check size={13} />,
    },
    warning: {
      fg: 'var(--gb-warning-fg)',
      bg: 'var(--gb-warning-tint-soft)',
      border: 'var(--gb-warning-tint-border)',
      icon: <I.alert size={13} />,
    },
    error: {
      fg: 'var(--gb-error-fg)',
      bg: 'var(--gb-error-tint-soft)',
      border: 'var(--gb-error-tint-border)',
      icon: <I.alert size={13} />,
    },
  };
  const tone = tones[level] || {
    fg: 'var(--gb-brand-label)',
    bg: 'var(--gb-brand-tint-soft)',
    border: 'var(--gb-brand-tint-border)',
    icon: <I.bolt size={13} />,
  };
  return (
    <span style={{
      width: 28,
      height: 28,
      flex: '0 0 auto',
      display: 'grid',
      placeItems: 'center',
      borderRadius: 'var(--gb-r-sm)',
      color: tone.fg,
      background: tone.bg,
      border: `1px solid ${tone.border}`,
    }}
    >
      {tone.icon}
    </span>
  );
}

function NotificationRow({
  item, onOpen, onRead, onDismiss,
}) {
  const [hovered, setHovered] = useState(false);
  const unread = item.status === 'unread';
  const archived = item.status === 'dismissed';
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.985 }}
      transition={{ duration: 0.15 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 10px 9px',
        borderRadius: 'var(--gb-r-md)',
        border: `1px solid ${hovered ? 'var(--gb-border-default)' : 'var(--gb-border-subtle)'}`,
        background: unread ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-1)',
        opacity: archived ? 0.68 : 1,
        boxShadow: hovered ? 'var(--gb-shadow-sm)' : 'none',
        transition: 'background .15s, border-color .15s, box-shadow .15s, opacity .15s',
      }}
    >
      {unread && (
        <span style={{
          position: 'absolute',
          left: -2,
          top: 18,
          width: 5,
          height: 5,
          borderRadius: 999,
          background: 'var(--gb-brand-label)',
          boxShadow: '0 0 0 2px var(--gb-surface-2)',
        }}
        />
      )}
      <LevelIcon level={item.level} />
      <button
        type="button"
        onClick={() => (item.action ? onOpen(item) : onRead(item))}
        style={{
          flex: 1,
          minWidth: 0,
          padding: 0,
          textAlign: 'left',
          border: 0,
          background: 'transparent',
          cursor: 'pointer',
          font: 'inherit',
        }}
      >
        <span style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 7,
          minWidth: 0,
        }}
        >
          <strong style={{
            flex: 1,
            minWidth: 0,
            color: 'var(--gb-text-primary)',
            fontSize: 12.25,
            fontWeight: unread ? 750 : 650,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          >
            {item.title}
          </strong>
          <span style={{
            color: 'var(--gb-text-muted)',
            fontSize: 9.75,
            whiteSpace: 'nowrap',
          }}
          >
            {formatHumanDate(item.updatedAt || item.createdAt)}
          </span>
        </span>
        <span style={{
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: 2,
          overflow: 'hidden',
          marginTop: 3,
          color: 'var(--gb-text-tertiary)',
          fontSize: 11,
          lineHeight: 1.42,
        }}
        >
          {item.body}
        </span>
        {item.action?.label && !archived && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            marginTop: 6,
            color: 'var(--gb-brand-label)',
            fontSize: 10.25,
            fontWeight: 700,
          }}
          >
            {item.action.label}
            <I.chevr size={10} />
          </span>
        )}
      </button>
      {!archived && (
        <div style={{
          flex: '0 0 auto',
          display: 'flex',
          gap: 3,
          opacity: hovered ? 1 : 0,
          transition: 'opacity 120ms ease',
        }}
        >
          {unread && (
            <IconBtn
              size="sm"
              variant="ghost"
              title="Mark read"
              aria-label="Mark read"
              icon={<I.check />}
              onClick={() => onRead(item)}
            />
          )}
          <IconBtn
            size="sm"
            variant="ghost"
            title="Archive"
            aria-label="Archive"
            icon={<I.close />}
            onClick={() => onDismiss(item)}
          />
        </div>
      )}
    </motion.li>
  );
}

export function Notifications({ onClosed, bindClose }) {
  const toast = useToast();
  const closeRef = useRef(onClosed);
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState('unread');
  const [search, setSearch] = useState('');
  const handleBindClose = useCallback((close) => {
    closeRef.current = close;
    bindClose?.(close);
  }, [bindClose]);

  useEffect(() => {
    let active = true;
    loadItems().then((list) => {
      if (active) {
        setItems(list);
        setLoaded(true);
      }
    });
    const unsubscribe = subscribeItems((list) => {
      if (active) setItems(list);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const update = useCallback((item, state) => {
    setItems((current) => {
      const next = current.map((row) => (
        row.id === item.id ? nextState(row, state) : row
      ));
      saveFallback(next);
      return next;
    });
    sendReceipt(item, state);
  }, []);

  const runAction = useCallback((item) => {
    if (!item.action) {
      update(item, 'read');
      return;
    }
    if (window.__gbCanRunNotificationAction?.(item) !== true) {
      toast?.warning?.('That action is not available on this page', {
        duration: 3200,
      });
      return;
    }
    // Let the notification center finish its exit before opening the target
    // modal. Opening first toggled same-page floating surfaces into each other
    // and made the batch gallery appear behind the center.
    closeRef.current?.();
    setTimeout(() => {
      Promise.resolve(window.__gbRunNotificationAction?.(item))
        .then((handled) => {
          if (handled) return;
          window.__gbToast?.warning?.(
            'That action is not available on this page',
            { duration: 3200, placement: 'top-right' },
          );
        })
        .catch(() => {
          window.__gbToast?.warning?.(
            'That action could not be completed',
            { duration: 3200, placement: 'top-right' },
          );
        });
    }, 240);
  }, [toast, update]);

  const counts = useMemo(() => ({
    unread: items.filter((item) => item.status === 'unread').length,
    active: items.filter((item) => item.status !== 'dismissed').length,
    dismissed: items.filter((item) => item.status === 'dismissed').length,
  }), [items]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items
      .filter((item) => {
        if (filter === 'active') return item.status !== 'dismissed';
        return item.status === filter;
      })
      .filter((item) => !query
        || String(item.title || '').toLowerCase().includes(query)
        || String(item.body || '').toLowerCase().includes(query)
        || String(item.topic || '').toLowerCase().includes(query))
      .sort((a, b) => Number(b.updatedAt || b.createdAt || 0)
        - Number(a.updatedAt || a.createdAt || 0));
  }, [filter, items, search]);

  const subtitle = counts.unread
    ? `${counts.unread} unread update${counts.unread === 1 ? '' : 's'}`
    : 'Everything is up to date';

  return (
    <FloatingPanel
      width={580}
      height={620}
      backdrop
      draggable={false}
      onClose={onClosed}
      bindClose={handleBindClose}
    >
      <ModalHeader
        icon={<NotificationBell />}
        title="Notifications"
        subtitle={subtitle}
      />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(250px, .9fr) minmax(230px, 1.1fr)',
        gap: 8,
        padding: '10px 12px',
        flexShrink: 0,
        background: 'var(--gb-surface-1)',
        borderBottom: '1px solid var(--gb-border-subtle)',
      }}
      >
        <Segmented
          full
          size="md"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((entry) => ({
            id: entry.key,
            label: (
              <FilterLabel
                text={entry.label}
                count={counts[entry.key]}
                active={filter === entry.key}
              />
            ),
          }))}
        />
        <Input
          value={search}
          onChange={setSearch}
          placeholder="Search notifications…"
          leading={<I.search size={12} />}
          trailing={search ? (
            <IconBtn
              size="xs"
              variant="ghost"
              title="Clear search"
              aria-label="Clear search"
              icon={<I.close />}
              onClick={() => setSearch('')}
              style={{ marginRight: -4 }}
            />
          ) : null}
        />
      </div>
      <div
        style={{
          flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden',
          background: 'var(--gb-surface-2)',
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {!loaded ? (
            <motion.div
              key="loading"
              style={{ position: 'absolute', inset: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              <NotificationSkeleton />
            </motion.div>
          ) : (
            <motion.div
              key={filter}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
              className="gb-thin-scroll"
              style={{
                position: 'absolute', inset: 0,
                overflowY: 'auto', overflowX: 'hidden', padding: 10,
              }}
            >
              {visible.length === 0 ? (
                <NotificationEmptyState
                  filter={filter}
                  searching={Boolean(search.trim())}
                />
              ) : (
                <motion.ul
                  layout
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 7,
                    margin: 0,
                    padding: 0,
                    listStyle: 'none',
                  }}
                >
                  <AnimatePresence initial={false} mode="popLayout">
                    {visible.map((item) => (
                      <NotificationRow
                        key={item.id}
                        item={item}
                        onOpen={runAction}
                        onRead={(row) => update(row, 'read')}
                        onDismiss={(row) => update(row, 'dismissed')}
                      />
                    ))}
                  </AnimatePresence>
                </motion.ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <ModalFooter style={{ padding: '9px 12px' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          minWidth: 0, color: 'var(--gb-text-muted)', fontSize: 10.25,
        }}>
          <I.check size={11} />
          {counts.active} active · {counts.dismissed} archived
        </span>
        <span style={{ flex: 1 }} />
        <Btn
          size="sm"
          variant="secondary"
          onClick={() => closeRef.current?.()}
        >
          Done
        </Btn>
      </ModalFooter>
    </FloatingPanel>
  );
}

export default Notifications;
