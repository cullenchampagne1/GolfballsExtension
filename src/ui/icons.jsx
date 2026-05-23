import React from 'react';

/* ───────────────────────────────────────────────────────────────
   icons.jsx — the shared inline-SVG registry.
   Every component pulls icons from `I`. Icons inherit currentColor
   and accept `size` / `strokeWidth`; never hard-code their color.
─────────────────────────────────────────────────────────────── */

/** Base SVG wrapper. All registry icons render through this. */
export const Icon = ({ size = 14, strokeWidth = 2, children, style, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ display: 'block', flexShrink: 0, ...style }}
    {...rest}
  >
    {children}
  </svg>
);

/** Icon registry — `<I.mail size={16} />`. */
export const I = {
  mail:   (p) => <Icon {...p}><path d="M3 8l8.5 5.5a2 2 0 002 0L22 8" /><path d="M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></Icon>,
  cog:    (p) => <Icon {...p}><path d="M10.3 4.3c.4-1.7 2.9-1.7 3.3 0a1.7 1.7 0 002.6 1.1c1.5-.9 3.3.8 2.4 2.4a1.7 1.7 0 001 2.5c1.8.5 1.8 3 0 3.4a1.7 1.7 0 00-1 2.6c.9 1.5-.9 3.3-2.4 2.4a1.7 1.7 0 00-2.6 1c-.4 1.8-2.9 1.8-3.3 0a1.7 1.7 0 00-2.6-1c-1.5.9-3.3-.8-2.4-2.4a1.7 1.7 0 00-1-2.6c-1.8-.4-1.8-2.9 0-3.4a1.7 1.7 0 001-2.5c-.9-1.6.9-3.3 2.4-2.4 1 .6 2.3.1 2.6-1.1z" /><circle cx="12" cy="12" r="3" /></Icon>,
  card:   (p) => <Icon {...p}><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M7 16h2" /></Icon>,
  edit:   (p) => <Icon {...p}><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></Icon>,
  eye:    (p) => <Icon {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></Icon>,
  check:  (p) => <Icon {...p} strokeWidth={2.4}><path d="M20 6L9 17l-5-5" /></Icon>,
  send:   (p) => <Icon {...p}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></Icon>,
  search: (p) => <Icon {...p}><circle cx="11" cy="11" r="7.5" /><path d="M20.5 20.5L17 17" /></Icon>,
  close:  (p) => <Icon {...p} strokeWidth={2.2}><path d="M18 6L6 18M6 6l12 12" /></Icon>,
  plus:   (p) => <Icon {...p} strokeWidth={2.4}><path d="M12 5v14M5 12h14" /></Icon>,
  chevd:  (p) => <Icon {...p} strokeWidth={2.2}><path d="M6 9l6 6 6-6" /></Icon>,
  chevr:  (p) => <Icon {...p} strokeWidth={2.2}><path d="M9 6l6 6-6 6" /></Icon>,
  trash:  (p) => <Icon {...p}><path d="M3 6h18M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></Icon>,
  alert:  (p) => <Icon {...p}><path d="M10.3 3.86L1.82 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.86a2 2 0 00-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></Icon>,
  bolt:   (p) => <Icon {...p}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></Icon>,
  copy:   (p) => <Icon {...p}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></Icon>,
  user:   (p) => <Icon {...p}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></Icon>,
  filter: (p) => <Icon {...p}><path d="M22 3H2l8 9.5V19l4 2v-8.5z" /></Icon>,
  more:   (p) => <Icon {...p}><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></Icon>,
  sun:    (p) => <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></Icon>,
  moon:   (p) => <Icon {...p}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></Icon>,
  calc:   (p) => <Icon {...p}><rect x="4" y="2" width="16" height="20" rx="2" /><line x1="8" y1="6" x2="16" y2="6" /><line x1="8" y1="11" x2="8" y2="11" /><line x1="12" y1="11" x2="12" y2="11" /><line x1="16" y1="11" x2="16" y2="11" /><line x1="8" y1="15" x2="8" y2="15" /><line x1="12" y1="15" x2="12" y2="15" /><line x1="16" y1="15" x2="16" y2="15" /><line x1="8" y1="19" x2="8" y2="19" /><line x1="12" y1="19" x2="12" y2="19" /><line x1="16" y1="19" x2="16" y2="19" /></Icon>,
  refresh: (p) => <Icon {...p}><path d="M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0114.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0020.5 15" /></Icon>,
  shuffle: (p) => <Icon {...p}><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></Icon>,
};
