import React from 'react';
import { Icon } from './icons.jsx';

/**
 * TYPE_ICONS — single source of truth for template-type icons.
 *
 * Previously each editor inlined its own SVGs and the sidebar's note/task
 * glyphs didn't match the notes editor's (different paths for the same
 * concept). Everything imports from here now so the icon for "task"
 * looks identical wherever it renders.
 *
 * Email-template types:  order · case · account
 * Note-template types:   note · task · call_log
 */
export const TYPE_ICONS = {
  order:    (p) => <Icon {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></Icon>,
  account:  (p) => <Icon {...p}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></Icon>,
  case:     (p) => <Icon {...p}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></Icon>,
  note:     (p) => <Icon {...p}><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></Icon>,
  task:     (p) => <Icon {...p}><polyline points="20 6 9 17 4 12"/></Icon>,
  call_log: (p) => <Icon {...p}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/></Icon>,
};

/* Type-color tokens — kept here next to the icons since they vary by
   type the same way (used in sidebar stripes, header tiles, etc). */
export const TYPE_COLORS = {
  order:    'var(--gb-brand-label)',
  account:  'var(--gb-info-fg)',
  case:     'var(--gb-warning-fg)',
  note:     'var(--gb-text-tertiary)',
  task:     'var(--gb-brand-label)',
  call_log: 'var(--gb-info-fg)',
};
