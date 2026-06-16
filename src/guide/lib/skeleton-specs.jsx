/* skeleton-specs.jsx — one wireframe spec per article-rendered guide
   route. Each drives a SkeletonStage (Tour + Play walkthrough + Try-it).
   Region hints are the real controls of each feature, kept in sync with
   the verified manual (helpContent.js). Keyed by nav route id. */

export const PAGE_SPECS = {
  start: {
    title: 'The Popup — your home base', icon: 'mail', frameLabel: 'toolbar · popup', width: 460,
    regions: [
      { key: 'st-matched', label: 'Matched templates', kind: 'list', lines: 2, hint: 'Templates whose type and rules fit the current page jump to the top, ready to send.' },
      { key: 'st-vars', label: 'Live variables', kind: 'row', hint: "Each template's variables resolve against the page you're on — green chips mean they filled." },
      { key: 'st-actions', label: 'Quick actions', kind: 'buttons', cols: 3, hint: 'Charge, watch, task, and proof actions for the current order or contact.' },
      { key: 'st-manage', label: 'Manage gear', kind: 'row', hint: 'Opens Settings and the Template Manager — themes, toggles, shortcuts, presets.' },
    ],
    note: 'A wireframe of the popup (the home base). Hover the pins (Tour), press Play, or Try it — every other page in this guide works the same way.',
  },
  charge: {
    title: 'Charge / Refund & Order Edit', icon: 'card', frameLabel: 'order · charge', width: 460,
    regions: [
      { key: 'ch-amount', label: 'Amount', kind: 'field', hint: 'The charge or refund amount — pre-filled from the order balance, editable for partials.' },
      { key: 'ch-reason', label: 'Reason / note', kind: 'field', hint: 'Required context that gets logged with the transaction.' },
      { key: 'ch-method', label: 'Payment method', kind: 'row', hint: "The card on file (last 4) the charge runs against — the order's saved payment." },
      { key: 'ch-actions', label: 'Charge · Refund', kind: 'buttons', cols: 2, hint: 'Runs the transaction through the saved payment; a refund returns funds to the same card.' },
      { key: 'ch-edit', label: 'Edit order', kind: 'list', lines: 3, hint: 'The Order Edit modal: adjust line items, quantities, and shipping inline without leaving the page.' },
    ],
  },
  proof: {
    title: 'Submit Proof', icon: 'send', frameLabel: 'order · submit proof', width: 460,
    regions: [
      { key: 'pf-image', label: 'Proof image', kind: 'preview', hint: 'The artwork or 3D render being sent for the customer to approve.' },
      { key: 'pf-spec', label: 'Decoration spec', kind: 'list', lines: 2, hint: 'Imprint method, colors, and placement — carried straight from the Image Viewer.' },
      { key: 'pf-recipient', label: 'Recipient', kind: 'field', hint: "Pre-filled from the order's contact; editable before sending." },
      { key: 'pf-send', label: 'Send proof', kind: 'buttons', cols: 2, hint: 'Emails the customer a branded approval request with the image embedded.' },
    ],
  },
  themes: {
    title: 'Themes & UI Scale', icon: 'sun', frameLabel: 'settings · appearance', width: 440,
    regions: [
      { key: 'th-swatch', label: 'Theme', kind: 'swatches', hint: 'Dark, Slate, Light, or Cream — applies live to every surface, including this guide.' },
      { key: 'th-scale', label: 'UI scale', kind: 'field', hint: 'Per-surface size sliders for the popup, modals, and the Actions Shelf.' },
      { key: 'th-preview', label: 'Live preview', kind: 'row', hint: 'Every surface re-themes and re-scales instantly as you change it — no reload.' },
    ],
  },
  shortcuts: {
    title: 'Keyboard Shortcuts', icon: 'code', frameLabel: 'settings · shortcuts', width: 500,
    regions: [
      { key: 'sc-global', label: 'Global shortcuts', kind: 'table', lines: 3, cols: 2, hint: 'Ctrl+K Search, Ctrl+M Margin, Ctrl+Q New Contact, double-tap Shift for the shelf, and more.' },
      { key: 'sc-composer', label: 'In-composer keys', kind: 'table', lines: 2, cols: 2, hint: 'Number keys pick a template, Tab moves fields, Enter sends — inside Quick Task and Call Log.' },
      { key: 'sc-settings', label: 'Rebind / disable', kind: 'list', lines: 2, hint: 'Every shortcut is configurable under Settings → Keyboard Shortcuts; a disabled feature drops its key.' },
    ],
  },
  'viewer-email': {
    title: 'Email / Chat Viewer', icon: 'mail', frameLabel: 'crm · email preview', width: 500,
    regions: [
      { key: 've-header', label: 'Thread header', kind: 'row', hint: 'Sender, subject, and date — surfaced by hovering an email row on a CRM page.' },
      { key: 've-body', label: 'Messages', kind: 'list', lines: 3, hint: 'The full conversation expanded inline, including quoted history.' },
      { key: 've-reply', label: 'Reply bar', kind: 'toolbar', hint: 'Fire a case-template reply right from the preview (sends via mailto).' },
    ],
  },
  'viewer-image': {
    title: 'Image Viewer & Logo Extraction', icon: 'eye', frameLabel: 'order · image viewer', width: 480,
    regions: [
      { key: 'vi-surface', label: 'Image surface', kind: 'preview', hint: 'Zoom and pan the best original it can resolve — direct file, raw upload, CDN, or page render.' },
      { key: 'vi-tools', label: 'Align · 3D · Mockup', kind: 'buttons', cols: 3, hint: 'Extract a clean decal with the alignment ring, project it on the 3D ball, or render a grass mockup.' },
      { key: 'vi-eyedrop', label: 'Size + eyedropper', kind: 'row', hint: 'Natural pixel size, plus pick a color off the image to swap it for another.' },
      { key: 'vi-zoom', label: 'Zoom controls', kind: 'buttons', cols: 3, hint: 'Out · 1:1 · in (the wheel zooms and double-click toggles 1× ↔ 2×).' },
      { key: 'vi-actions', label: 'Copy · Download · Submit Proof', kind: 'buttons', cols: 3, hint: 'Carry the image onward — copy its URL, download it, or push it into Submit Proof.' },
    ],
  },
  'viewer-3d': {
    title: '3D Product Viewer', icon: 'cube', frameLabel: 'preview · 3d viewer', width: 480,
    regions: [
      { key: 'v3-canvas', label: '3D canvas', kind: 'preview', hint: 'Your extracted decal projected onto the chosen model, fully rotatable.' },
      { key: 'v3-model', label: 'Model', kind: 'buttons', cols: 3, hint: 'Ball, poker chip, divot tool, bartender tool, or marker — and assembled gift boxes.' },
      { key: 'v3-tint', label: 'Tint + scene', kind: 'row', hint: 'Recolor the product and pick an HDRI lighting scene.' },
      { key: 'v3-snap', label: 'Snapshot', kind: 'buttons', cols: 2, hint: 'Copy / Download a fixed-pose transparent PNG — every export frames identically.' },
    ],
  },
  margin: {
    title: 'Margin Calculator', icon: 'calc', frameLabel: 'order · margin', width: 440,
    regions: [
      { key: 'mc-cost', label: 'Cost', kind: 'field', hint: 'Pulled from the inventory cache when the SKU is known; otherwise enter it.' },
      { key: 'mc-price', label: 'Sell price', kind: 'field', hint: "What you're quoting the customer." },
      { key: 'mc-margin', label: 'Margin %', kind: 'row', hint: 'Computed live and color-coded against your margin targets.' },
      { key: 'mc-breakdown', label: 'Breakdown', kind: 'list', lines: 2, hint: 'Revenue, cost, and profit — per unit and for the whole order.' },
    ],
  },
  catalog: {
    title: 'Gift Catalog', icon: 'gift', frameLabel: 'golfballs · gift catalog', width: 540,
    regions: [
      { key: 'gc-search', label: 'Search & filters', kind: 'toolbar', hint: 'Type / for the filter palette — categories, brands, On sale / promo, Commissionable only.' },
      { key: 'gc-sidebar', label: 'Departments', kind: 'list', lines: 3, hint: 'Gift Sets, Apparel, Drinkware, Custom Logo… filter the grid to a department.' },
      { key: 'gc-grid', label: 'Product grid', kind: 'grid', cols: 3, hint: 'Every product on the site, with Sale (red) and Promo (green) badges.' },
      { key: 'gc-detail', label: 'Detail & imprint', kind: 'split', hint: 'Open a product for its pricing tiers, options, and the logo / monogram / text imprint controls.' },
      { key: 'gc-cart', label: 'Add to proposal', kind: 'buttons', cols: 2, hint: 'Drops the configured item into the quote with its tiered pricing.' },
    ],
  },
  proposals: {
    title: 'Proposals & Quotes', icon: 'sparkle', frameLabel: 'proposal · panel', width: 520,
    regions: [
      { key: 'pq-lines', label: 'Line items', kind: 'list', lines: 3, hint: 'Each product with its split quantity tiers and draggable imprint pills.' },
      { key: 'pq-promo', label: 'Promo block', kind: 'row', hint: 'Apply a code — only promotions that actually fit the cart are offered, with their real value.' },
      { key: 'pq-totals', label: 'Totals', kind: 'split', hint: 'Subtotal → Promotion → Estimated total, with old-price strikethrough.' },
      { key: 'pq-actions', label: 'Save & generate', kind: 'buttons', cols: 3, hint: 'Save a draft, save to a CRM opportunity, or generate the customer-facing proposal email.' },
    ],
  },
  quicksend: {
    title: 'Quick Send (Bulk Email)', icon: 'megaphone', frameLabel: 'bulk · quick send', width: 480,
    regions: [
      { key: 'qs-template', label: 'Template', kind: 'field', hint: 'Pick the email — with weighted variation splits when it has variations.' },
      { key: 'qs-delay', label: 'Send delay', kind: 'row', hint: 'A random range between sends so a blast looks human.' },
      { key: 'qs-run', label: 'Run', kind: 'buttons', cols: 2, hint: 'Opens each contact in a background tab, resolves their variables, sends, and closes it.' },
      { key: 'qs-progress', label: 'Progress ring', kind: 'ring', hint: 'Live %, a "now sending" card, a pacing countdown, and sent / queued chips.' },
      { key: 'qs-results', label: 'Results', kind: 'list', lines: 2, hint: 'Sent / Success % / Elapsed stat tiles and a per-contact timeline.' },
    ],
  },
  campaigns: {
    title: 'Campaign Manager', icon: 'flow', frameLabel: 'campaign · builder', width: 540,
    regions: [
      { key: 'cm-timeline', label: 'Steps', kind: 'timeline', lines: 4, hint: 'Email, call, and task steps with branch and group routing between them.' },
      { key: 'cm-inspector', label: 'Step inspector', kind: 'list', lines: 2, hint: 'Per-step template, delay, variation split, and branch membership.' },
      { key: 'cm-conditions', label: 'Conditions', kind: 'split', hint: 'Grouped AND/OR over campaign signals — order count, days since last order, lifetime spend, brand owned.' },
      { key: 'cm-run', label: 'Simulate · Dry-run · Run', kind: 'buttons', cols: 3, hint: 'Animate the routing, do a zero-send dry run against the real audience, or execute.' },
    ],
  },
  troubleshooting: {
    title: 'Troubleshooting', icon: 'alert', frameLabel: 'reference · fixes', width: 480,
    regions: [
      { key: 'ts-symptom', label: 'Symptom', kind: 'row', hint: 'Pick what you are seeing — e.g. "Send opened an Outlook window" or "a variable shows {{name}}".' },
      { key: 'ts-cause', label: 'Likely cause', kind: 'list', lines: 2, hint: 'The common reason, explained — usually a toggle, a stale cache, or an unresolved field.' },
      { key: 'ts-fix', label: 'The fix', kind: 'buttons', cols: 2, hint: 'The exact setting or step that resolves it.' },
    ],
  },
  faq: {
    title: 'Frequently Asked Questions', icon: 'more', frameLabel: 'reference · faq', width: 480,
    regions: [
      { key: 'faq-q', label: 'Questions', kind: 'list', lines: 3, hint: 'The things every new user asks — why no success toast, why Send opened Outlook, who sees my data…' },
      { key: 'faq-a', label: 'Answers', kind: 'row', hint: 'Short answers, each linking to the full article.' },
    ],
  },
  power: {
    title: 'Power User', icon: 'zap', frameLabel: 'advanced · power user', width: 500,
    regions: [
      { key: 'pu-code', label: 'Code variable', kind: 'field', hint: 'Sandboxed JS resolving against the page, with the h.* helper API (fetch, catalog, format).' },
      { key: 'pu-console', label: 'Console commands', kind: 'list', lines: 2, hint: '__gbSecret and friends — toggle hidden settings and inspect state.' },
      { key: 'pu-flags', label: 'Hidden settings & flags', kind: 'row', hint: 'Admin-locked toggles that keep working while hidden from the Settings UI.' },
      { key: 'pu-playground', label: 'Playground & storage', kind: 'buttons', cols: 2, hint: 'The modal playground and the chrome.storage maps behind everything.' },
    ],
  },
  'order-extras': {
    title: 'Order IDs & Risk Glow', icon: 'copy', frameLabel: 'order index · helpers', width: 480,
    regions: [
      { key: 'oe-copy', label: 'Copy Order IDs', kind: 'row', hint: 'The shelf action copies every listed order ID on the index page in one click.' },
      { key: 'oe-glow', label: 'Signifyd glow', kind: 'list', lines: 3, hint: 'Order rows tint by their Signifyd fraud score so risky orders stand out at a glance.' },
    ],
  },
  whatsnew: {
    title: "What's New", icon: 'sparkle', frameLabel: 'reference · changelog', width: 480,
    regions: [
      { key: 'wn-list', label: 'Changelog', kind: 'timeline', lines: 4, hint: 'The latest additions and fixes, newest first.' },
    ],
  },
};
