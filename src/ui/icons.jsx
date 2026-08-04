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
  phone:  (p) => <Icon {...p}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.37 1.9.72 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0122 16.92z" /></Icon>,
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
  lock:   (p) => <Icon {...p}><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /><path d="M12 14v3" /></Icon>,
  filter: (p) => <Icon {...p}><path d="M22 3H2l8 9.5V19l4 2v-8.5z" /></Icon>,
  more:   (p) => <Icon {...p}><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></Icon>,
  sun:    (p) => <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></Icon>,
  moon:   (p) => <Icon {...p}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></Icon>,
  calc:   (p) => <Icon {...p}><rect x="4" y="2" width="16" height="20" rx="2" /><line x1="8" y1="6" x2="16" y2="6" /><line x1="8" y1="11" x2="8" y2="11" /><line x1="12" y1="11" x2="12" y2="11" /><line x1="16" y1="11" x2="16" y2="11" /><line x1="8" y1="15" x2="8" y2="15" /><line x1="12" y1="15" x2="12" y2="15" /><line x1="16" y1="15" x2="16" y2="15" /><line x1="8" y1="19" x2="8" y2="19" /><line x1="12" y1="19" x2="12" y2="19" /><line x1="16" y1="19" x2="16" y2="19" /></Icon>,
  refresh: (p) => <Icon {...p}><path d="M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0114.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0020.5 15" /></Icon>,
  shuffle: (p) => <Icon {...p}><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></Icon>,
  // download = export a preset to a file (arrow into tray)
  download: (p) => <Icon {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></Icon>,
  // upload = import a preset from a file (arrow out of tray)
  upload:   (p) => <Icon {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></Icon>,
  save:     (p) => <Icon {...p}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></Icon>,
  bookmark: (p) => <Icon {...p}><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" /></Icon>,
  cube:    (p) => <Icon {...p}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></Icon>,
  gift:    (p) => <Icon {...p}><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" /></Icon>,
  // ── Workflow Manager glyphs ──
  megaphone: (p) => <Icon {...p}><path d="M3 11v2a4 4 0 004 4l1 5h3l-1-5h2l8 5V3l-8 5H7a4 4 0 00-4 3z" /></Icon>,
  flow:    (p) => <Icon {...p}><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="15" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" /><path d="M9 6h-3v3M18 15v-3h-3" /></Icon>,
  branch:  (p) => <Icon {...p}><circle cx="6" cy="3" r="2" /><circle cx="6" cy="21" r="2" /><circle cx="18" cy="9" r="2" /><path d="M6 5v14M6 13c0-4 4-4 12-4" /></Icon>,
  clock:   (p) => <Icon {...p}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></Icon>,
  users:   (p) => <Icon {...p}><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></Icon>,
  play:    (p) => <Icon {...p}><polygon points="6 4 20 12 6 20 6 4" /></Icon>,
  pause:   (p) => <Icon {...p}><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></Icon>,
  rewind:  (p) => <Icon {...p}><polygon points="11 19 2 12 11 5 11 19" /><polygon points="22 19 13 12 22 5 22 19" /></Icon>,
  target:  (p) => <Icon {...p}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></Icon>,
  grip:    (p) => <Icon {...p}><circle cx="9" cy="5" r="1.4" /><circle cx="15" cy="5" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="9" cy="19" r="1.4" /><circle cx="15" cy="19" r="1.4" /></Icon>,
  sliders: (p) => <Icon {...p}><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></Icon>,
  history: (p) => <Icon {...p}><path d="M3 12a9 9 0 109-9 9.8 9.8 0 00-6.7 2.7L3 8" /><path d="M3 3v5h5M12 7v5l4 2" /></Icon>,
  sparkle: (p) => <Icon {...p}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /><circle cx="12" cy="12" r="2.5" /></Icon>,
  zap:     (p) => <Icon {...p}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></Icon>,
  flag:    (p) => <Icon {...p}><path d="M4 22V4M4 4h13l-2 5 2 5H4" /></Icon>,
  link:    (p) => <Icon {...p}><path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1" /></Icon>,
  ext:     (p) => <Icon {...p}><path d="M14 3h7v7M10 14L21 3" /><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /></Icon>,
  task:    (p) => <Icon {...p}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></Icon>,
  code:    (p) => <Icon {...p}><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></Icon>,
};
