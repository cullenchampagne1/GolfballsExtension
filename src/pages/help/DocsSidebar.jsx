import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { I } from '../../ui/index.js';

/* ───────────────────────────────────────────────────────────────
   DocsSidebar.jsx — the Help nav tree. Renders HELP_TREE:
   top-level sections with either flat items or nested groups
   (Core Features / Workflows). Items reference an article slug
   or a tutorial id; the active row gets the brand tint, matching
   the template sidebar's row language.
─────────────────────────────────────────────────────────────── */

const SOFT = { duration: 0.22, ease: [0.32, 0.72, 0, 1] };

function refKey(item) {
  return item.article ? `a:${item.article}` : `t:${item.tutorial}`;
}

function NavRow({ item, label, icon, active, onSelect }) {
  const IconCmp = (icon && I[icon]) || (item.tutorial ? I.play : null);
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="gb-help-row"
      style={{
        display: 'flex', alignItems: 'center', gap: 7, width: '100%',
        padding: '5px 8px', borderRadius: 'var(--gb-r-sm)',
        border: 'none', cursor: 'pointer', textAlign: 'left',
        font: 'inherit', fontSize: 11.5,
        fontWeight: active ? 700 : 500,
        background: active ? 'var(--gb-brand-tint-soft)' : 'transparent',
        color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)',
        boxShadow: active ? 'inset 0 0 0 1px var(--gb-brand-tint-border)' : 'none',
        transition: 'background .12s, color .12s',
      }}
    >
      {IconCmp && (
        <IconCmp size={11} style={{
          flexShrink: 0,
          color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
        }} />
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  );
}

function Group({ title, icon, children, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const IconCmp = icon && I[icon];
  return (
    <div style={{ marginBottom: 2 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="gb-help-row"
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          padding: '6px 8px', borderRadius: 'var(--gb-r-sm)',
          border: 'none', background: 'transparent', cursor: 'pointer',
          textAlign: 'left', font: 'inherit',
          fontSize: 10, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase',
          color: 'var(--gb-text-tertiary)',
        }}
      >
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ type: 'spring', stiffness: 480, damping: 26 }}
          style={{ display: 'inline-flex', color: 'var(--gb-text-muted)' }}
        >
          <I.chevr size={8} />
        </motion.span>
        {IconCmp && <IconCmp size={11} style={{ color: 'var(--gb-text-muted)' }} />}
        <span style={{ flex: 1 }}>{title}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SOFT}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '1px 0 4px 12px', display: 'flex', flexDirection: 'column', gap: 1 }}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function DocsSidebar({ tree, active, labelFor, iconFor, onSelect }) {
  const activeKey = active ? refKey(active) : null;

  const renderItems = (items) => items.map((item) => (
    <NavRow
      key={refKey(item)}
      item={item}
      label={labelFor(item)}
      icon={iconFor(item)}
      active={refKey(item) === activeKey}
      onSelect={onSelect}
    />
  ));

  // A section opens by default when it contains the active item.
  const containsActive = (section) => {
    const all = [
      ...(section.items || []),
      ...(section.groups || []).flatMap((g) => g.items || []),
    ];
    return all.some((i) => refKey(i) === activeKey);
  };

  return (
    <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {tree.map((section, i) => (
        <Group
          key={section.title}
          title={section.title}
          icon={section.icon}
          defaultOpen={i === 0 || containsActive(section)}
        >
          {section.items && renderItems(section.items)}
          {section.groups && section.groups.map((g) => (
            <Group key={g.title} title={g.title} icon={g.icon} defaultOpen={containsActive({ items: g.items })}>
              {renderItems(g.items)}
            </Group>
          ))}
        </Group>
      ))}
    </nav>
  );
}
