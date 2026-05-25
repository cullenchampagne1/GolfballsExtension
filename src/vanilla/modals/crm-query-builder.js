// crm-query-builder.js — Solr query builder for the CRM Search page (Page=360).
// Injects a small funnel icon button directly inside the iframe's search input,
// and opens a full query-builder modal in the parent page when clicked.

if (!window.__gbCrmQueryBuilderLoaded) {
window.__gbCrmQueryBuilderLoaded = true;

// ── Field definitions ─────────────────────────────────────────────────────────

const QB_FIELDS = [
  { key: 'recordType_s',        label: 'Record Type',        type: 'enum',  options: ['Contact', 'Account'] },
  { key: 'salesRep_s',          label: 'Sales Rep',          type: 'text' },
  { key: 'podID_i',             label: 'Pod ID',             type: 'int'  },
  { key: 'role_s',              label: 'Role',               type: 'enum',  options: ['BDR', 'AE', 'CSM', 'SE', 'Manager'] },
  { key: 'contactName_t',       label: 'Contact Name',       type: 'text' },
  { key: 'accountName_t',       label: 'Account Name',       type: 'text' },
  { key: 'accountID_s',         label: 'Account ID',         type: 'text' },
  { key: 'emails_tps',          label: 'Email',              type: 'text' },
  { key: 'phones_ss',           label: 'Phone',              type: 'text' },
  { key: 'orderCount_i',        label: 'Order Count',        type: 'int'  },
  { key: 'lastOrderDate_dt',    label: 'Last Order Date',    type: 'date' },
  { key: 'nextTaskDate_dt',     label: 'Next Task Date',     type: 'date' },
  { key: 'priorYearRevenue_f',  label: 'Prior Year Revenue', type: 'float'},
  { key: 'yearToDateRevenue_f', label: 'YTD Revenue',        type: 'float'},
  { key: 'salesRepID_s',        label: 'Sales Rep ID',       type: 'text' },
];

const QB_OPS = {
  text:  [
    { value: 'is',         label: 'is (exact)'     },
    { value: 'contains',   label: 'contains'       },
    { value: 'starts',     label: 'starts with'    },
    { value: 'exists',     label: 'is set'         },
    { value: 'not_exists', label: 'is not set'     },
  ],
  enum:  [
    { value: 'is',         label: 'is'             },
    { value: 'is_not',     label: 'is not'         },
  ],
  int:   [
    { value: 'eq',         label: '='              },
    { value: 'ne',         label: '≠'              },
    { value: 'gt',         label: '>'              },
    { value: 'gte',        label: '≥'              },
    { value: 'lt',         label: '<'              },
    { value: 'lte',        label: '≤'              },
    { value: 'between',    label: 'between'        },
    { value: 'exists',     label: 'is set'         },
    { value: 'not_exists', label: 'is not set'     },
  ],
  float: [
    { value: 'eq',         label: '='              },
    { value: 'gt',         label: '>'              },
    { value: 'gte',        label: '≥'              },
    { value: 'lt',         label: '<'              },
    { value: 'lte',        label: '≤'              },
    { value: 'between',    label: 'between'        },
    { value: 'exists',     label: 'is set'         },
    { value: 'not_exists', label: 'is not set'     },
  ],
  date:  [
    { value: 'rel_past',     label: 'more than … ago'  },
    { value: 'rel_future',   label: 'within next …'    },
    { value: 'before',       label: 'before date'      },
    { value: 'after',        label: 'after date'       },
    { value: 'after_today',  label: 'after today'      },
    { value: 'before_today', label: 'before today'     },
    { value: 'exists',       label: 'is set'           },
    { value: 'not_exists',   label: 'is not set'       },
  ],
};

const QB_UNITS     = ['days', 'weeks', 'months', 'years'];
const QB_UNIT_SOLR = { days: 'DAY', weeks: 'WEEK', months: 'MONTH', years: 'YEAR' };

// ── State ─────────────────────────────────────────────────────────────────────

let qbConditions = [];
let qbNextId     = 1;

function qbNewCondition() {
  // Pre-populate val for enum fields so the Solr query is valid immediately.
  const defaultField = QB_FIELDS[0];
  const defaultVal   = defaultField.type === 'enum' ? (defaultField.options[0] ?? '') : '';
  return { id: qbNextId++, fieldKey: defaultField.key, op: 'is', val: defaultVal, val2: '', unit: 'years', num: '1' };
}

// ── Solr query ────────────────────────────────────────────────────────────────

function qbBuildQuery() {
  return qbConditions.map(c => {
    const fld = QB_FIELDS.find(f => f.key === c.fieldKey);
    return fld ? qbConditionToSolr(fld, c) : null;
  }).filter(Boolean).join(' AND ');
}

function qbQuote(v) { return v.includes(' ') ? `"${v}"` : v; }

function qbConditionToSolr(fld, c) {
  const k = fld.key, v = (c.val||'').trim(), v2 = (c.val2||'').trim();
  const n = c.num || '1', u = QB_UNIT_SOLR[c.unit] || 'YEAR';
  switch (c.op) {
    case 'is':           return v  ? `${k}:${qbQuote(v)}` : null;
    case 'contains':     return v  ? `${k}:*${v}*`        : null;
    case 'starts':       return v  ? `${k}:${v}*`         : null;
    case 'is_not':       return v  ? `-${k}:${qbQuote(v)}`  : null;
    case 'exists':       return `${k}:[* TO *]`;
    case 'not_exists':   return `-${k}:[* TO *]`;
    case 'eq':           return v  ? `${k}:${v}`           : null;
    case 'ne':           return v  ? `-${k}:${v}`          : null;
    case 'gt':           return v  ? `${k}:{${v} TO *}`    : null;
    case 'gte':          return v  ? `${k}:[${v} TO *]`    : null;
    case 'lt':           return v  ? `${k}:{* TO ${v}}`    : null;
    case 'lte':          return v  ? `${k}:[* TO ${v}]`    : null;
    case 'between':      return (v && v2) ? `${k}:[${v} TO ${v2}]` : null;
    case 'rel_past':     return `${k}:[* TO NOW-${n}${u}]`;
    case 'rel_future':   return `${k}:[NOW TO NOW%2B${n}${u}]`;
    case 'after_today':  return `${k}:[NOW TO *]`;
    case 'before_today': return `${k}:[* TO NOW]`;
    case 'before':       return v  ? `${k}:[* TO ${v}T00:00:00Z]` : null;
    case 'after':        return v  ? `${k}:[${v}T00:00:00Z TO *]` : null;
    default:             return null;
  }
}

// ── Execute in iframe ─────────────────────────────────────────────────────────

function qbRunQuery(queryStr) {
  const iframe = document.getElementById('react-next-iframe');
  if (!iframe) return false;
  try {
    const iDoc = iframe.contentDocument || iframe.contentWindow?.document;
    const iWin = iframe.contentWindow;
    if (!iDoc || !iWin) return false;

    const input = iDoc.querySelector(
      'input[type="search"], input[type="text"][class*="search"], input[placeholder*="earch"], input[placeholder*="uery"], input[class*="query"], input[type="text"]'
    );
    if (!input) return false;

    const setter = Object.getOwnPropertyDescriptor(iWin.HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, queryStr);
    else input.value = queryStr;

    input.dispatchEvent(new iWin.Event('input',  { bubbles: true }));
    input.dispatchEvent(new iWin.Event('change', { bubbles: true }));
    ['keydown','keypress','keyup'].forEach(t =>
      input.dispatchEvent(new iWin.KeyboardEvent(t, { key:'Enter', code:'Enter', keyCode:13, bubbles:true }))
    );
    const submitBtn = iDoc.querySelector('button[type="submit"], form button');
    if (submitBtn) submitBtn.click();
    return true;
  } catch(e) { return false; }
}

// ── Parent-page modal CSS ─────────────────────────────────────────────────────

function qbInjectModalStyles() {
  if (document.getElementById('__gb-qb-css')) return;
  const s = document.createElement('style');
  s.id = '__gb-qb-css';
  s.textContent = `
    @keyframes __gbQbIn  { from{opacity:0} to{opacity:1} }
    @keyframes __gbQbUp  { from{opacity:0;transform:translateY(18px) scale(.93)} to{opacity:1;transform:none} }
    @keyframes __gbQbRow { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:none} }

    #__gb-qb-overlay {
      position:fixed!important; inset:0!important; z-index: 999990 !important;
      display:flex!important; align-items:center!important; justify-content:center!important;
      background:rgba(0,0,0,.62)!important;
      backdrop-filter:blur(8px)!important; -webkit-backdrop-filter:blur(8px)!important;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;
      animation:__gbQbIn .18s ease!important;
    }
    #__gb-qb-card {
      background:rgba(14,14,14,.93)!important;
      backdrop-filter:blur(22px)!important; -webkit-backdrop-filter:blur(22px)!important;
      border:1px solid rgba(255,255,255,.08)!important; border-radius:18px!important;
      width:min(840px,calc(100vw - 28px))!important;
      max-height:min(680px,84vh)!important;
      display:flex!important; flex-direction:column!important; overflow:hidden!important;
      box-shadow:0 28px 80px rgba(0,0,0,.92),inset 0 0 0 1px rgba(255,255,255,.03)!important;
      animation:__gbQbUp .3s cubic-bezier(.34,1.56,.64,1)!important;
    }

    /* ── Header ── */
    #__gb-qb-hdr {
      padding:14px 20px 12px!important; flex-shrink:0!important;
      background:rgba(0,0,0,.4)!important; border-bottom:1px solid rgba(255,255,255,.06)!important;
      display:flex!important; align-items:center!important; gap:12px!important;
    }
    .__gb-qb-hdr-icon {
      width:34px!important; height:34px!important; border-radius:9px!important; flex-shrink:0!important;
      background:rgba(var(--gb-brand-label-rgb,148,163,184),.12)!important;
      border:1px solid rgba(var(--gb-brand-label-rgb,148,163,184),.22)!important;
      display:flex!important; align-items:center!important; justify-content:center!important;
      color:var(--gb-brand-label,#94a3b8)!important;
    }
    .__gb-qb-hdr-icon svg { width:16px!important; height:16px!important; }
    .__gb-qb-hdr-text  { flex:1!important; min-width:0!important; }
    .__gb-qb-hdr-text h3 { margin:0!important; font-size:14px!important; font-weight:700!important; color:#fff!important; }
    .__gb-qb-hdr-text p  { margin:2px 0 0!important; font-size:11px!important; color:rgba(255,255,255,.42)!important; }
    #__gb-qb-close {
      background:rgba(255,255,255,.06)!important; border:1px solid rgba(255,255,255,.1)!important;
      border-radius:7px!important; color:rgba(255,255,255,.7)!important; cursor:pointer!important;
      padding:7px 13px!important; font:600 11px/1 inherit!important;
      display:flex!important; align-items:center!important; gap:5px!important; transition:all .18s!important;
    }
    #__gb-qb-close:hover { background:rgba(255,255,255,.12)!important; color:#fff!important; }
    #__gb-qb-close svg { width:10px!important; height:10px!important; }

    /* ── Body (scrollable, capped) ── */
    #__gb-qb-body {
      overflow-y:auto!important; padding:14px 20px 6px!important;
      max-height:320px!important;
      scrollbar-width:thin!important; scrollbar-color:rgba(255,255,255,.1) transparent!important;
    }
    #__gb-qb-body::-webkit-scrollbar { width:4px!important; }
    #__gb-qb-body::-webkit-scrollbar-track { background:transparent!important; }
    #__gb-qb-body::-webkit-scrollbar-thumb { background:rgba(255,255,255,.12)!important; border-radius:4px!important; }

    /* ── Empty ── */
    .__gb-qb-empty {
      display:flex!important; flex-direction:column!important; align-items:center!important;
      padding:28px 20px!important; gap:9px!important; text-align:center!important;
    }
    .__gb-qb-empty-icon {
      width:44px!important; height:44px!important; border-radius:12px!important;
      background:rgba(255,255,255,.04)!important; border:1px solid rgba(255,255,255,.08)!important;
      display:flex!important; align-items:center!important; justify-content:center!important;
      color:rgba(255,255,255,.3)!important;
    }
    .__gb-qb-empty-icon svg { width:20px!important; height:20px!important; }
    .__gb-qb-empty strong { color:#fff!important; font-size:13px!important; display:block!important; }
    .__gb-qb-empty span   { font-size:12px!important; color:rgba(255,255,255,.38)!important; }

    /* ── Condition rows ── */
    .qb-row {
      display:flex!important; align-items:center!important; gap:7px!important;
      margin-bottom:7px!important; animation:__gbQbRow .18s ease!important;
    }
    .qb-row-num {
      width:18px!important; flex-shrink:0!important; font-size:10px!important;
      font-weight:700!important; color:rgba(255,255,255,.2)!important; text-align:right!important;
    }
    .qb-row-inner {
      flex:1!important; min-width:0!important;
      display:flex!important; align-items:center!important; gap:6px!important; flex-wrap:wrap!important;
      background:rgba(255,255,255,.03)!important; border:1px solid rgba(255,255,255,.07)!important;
      border-radius:10px!important; padding:7px 9px!important; transition:border-color .2s!important;
    }
    .qb-row-inner:focus-within {
      border-color:rgba(var(--gb-brand-label-rgb,148,163,184),.28)!important;
      background:rgba(var(--gb-brand-label-rgb,148,163,184),.03)!important;
    }
    .qb-del {
      flex-shrink:0!important;
      background:none!important; border:none!important; cursor:pointer!important;
      color:rgba(255,255,255,.22)!important; padding:5px!important; border-radius:5px!important;
      display:flex!important; align-items:center!important; transition:all .15s!important;
    }
    .qb-del:hover { color:var(--gb-error,#c86060)!important; background:rgba(200,96,96,.1)!important; }
    .qb-del svg { width:13px!important; height:13px!important; }

    /* ── AND separator ── */
    .qb-and-sep {
      display:flex!important; align-items:center!important; gap:8px!important;
      margin:3px 0 3px 26px!important;
    }
    .qb-and-sep::before,.qb-and-sep::after {
      content:''!important; flex:1!important; height:1px!important;
      background:rgba(255,255,255,.05)!important;
    }
    .qb-and-chip {
      font-size:9px!important; font-weight:800!important; letter-spacing:.8px!important;
      color:rgba(255,255,255,.16)!important; text-transform:uppercase!important;
    }

    /* ── Custom dropdown ── */
    .qb-dd-wrap {
      flex-shrink:0!important;
    }
    .qb-dd-btn {
      display:flex!important; align-items:center!important; gap:6px!important;
      height:32px!important; padding:0 26px 0 10px!important;
      background:rgba(255,255,255,.06)!important;
      border:1px solid rgba(255,255,255,.1)!important;
      border-radius:7px!important; color:#fff!important;
      font:500 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;
      cursor:pointer!important; white-space:nowrap!important;
      position:relative!important; box-sizing:border-box!important;
      transition:border-color .18s,background .18s,box-shadow .18s!important;
    }
    .qb-dd-btn:hover {
      background:rgba(255,255,255,.1)!important;
      border-color:rgba(255,255,255,.22)!important;
    }
    .qb-dd-btn.open {
      border-color:var(--gb-brand-label,#94a3b8)!important;
      background:rgba(255,255,255,.1)!important;
      box-shadow:0 0 0 2px rgba(var(--gb-brand-label-rgb,148,163,184),.15)!important;
    }
    .qb-dd-label {
      overflow:hidden!important; text-overflow:ellipsis!important; white-space:nowrap!important;
    }
    .qb-dd-chev {
      position:absolute!important; right:7px!important; top:50%!important;
      transform:translateY(-50%)!important; pointer-events:none!important;
      color:rgba(255,255,255,.38)!important;
      transition:transform .22s cubic-bezier(.34,1.56,.64,1),color .18s!important;
      width:10px!important; height:10px!important;
    }
    .qb-dd-btn.open .qb-dd-chev {
      transform:translateY(-50%) rotate(180deg)!important;
      color:var(--gb-brand-label,#94a3b8)!important;
    }
    .qb-dd-menu {
      position:fixed!important;
      background:rgba(18,18,18,.98)!important;
      border:1px solid rgba(255,255,255,.1)!important; border-radius:9px!important;
      z-index: 999990 !important;
      max-height:200px!important; overflow-y:auto!important;
      scrollbar-width:thin!important; scrollbar-color:rgba(255,255,255,.1) transparent!important;
      opacity:0!important; transform:translateY(-5px) scaleY(.93)!important;
      transform-origin:top center!important; pointer-events:none!important;
      transition:opacity .16s ease,transform .18s cubic-bezier(.34,1.4,.64,1)!important;
      box-shadow:0 12px 36px rgba(0,0,0,.85),0 0 0 1px rgba(255,255,255,.04)!important;
    }
    .qb-dd-menu::-webkit-scrollbar { width:4px!important; }
    .qb-dd-menu::-webkit-scrollbar-track { background:transparent!important; }
    .qb-dd-menu::-webkit-scrollbar-thumb { background:rgba(255,255,255,.12)!important; border-radius:4px!important; }
    .qb-dd-menu.open {
      opacity:1!important; transform:translateY(0) scaleY(1)!important; pointer-events:auto!important;
    }
    .qb-dd-menu.above {
      transform-origin:bottom center!important;
    }
    .qb-dd-menu.above:not(.open) { transform:translateY(5px) scaleY(.93)!important; }
    .qb-dd-opt {
      padding:8px 11px!important; font-size:12px!important; font-weight:500!important;
      color:rgba(255,255,255,.75)!important; cursor:pointer!important;
      border-bottom:1px solid rgba(255,255,255,.05)!important;
      transition:background .1s!important; white-space:nowrap!important;
    }
    .qb-dd-opt:last-child { border-bottom:none!important; }
    .qb-dd-opt:hover { background:rgba(255,255,255,.08)!important; color:#fff!important; }
    .qb-dd-opt.selected {
      background:rgba(var(--gb-brand-label-rgb,148,163,184),.12)!important;
      color:var(--gb-brand-label,#94a3b8)!important; font-weight:600!important;
    }
    /* Size variants */
    .qb-dd-field .qb-dd-btn { min-width:158px!important; }
    .qb-dd-op    .qb-dd-btn { min-width:140px!important; }
    .qb-dd-unit  .qb-dd-btn { min-width:95px!important; }
    .qb-dd-enum  .qb-dd-btn { min-width:120px!important; }

    /* ── Text / number / date inputs — match dropdown height exactly ── */
    .qb-inp, .qb-num, .qb-date {
      height:32px!important; box-sizing:border-box!important;
      background:rgba(255,255,255,.06)!important; border:1px solid rgba(255,255,255,.1)!important;
      border-radius:7px!important; color:#fff!important; outline:none!important;
      font:500 12px/32px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;
      padding:0 9px!important; margin:0!important;
      display:inline-block!important; vertical-align:middle!important;
      transition:border-color .18s,background .18s,box-shadow .18s!important;
      flex-shrink:0!important;
    }
    .qb-inp:focus, .qb-num:focus, .qb-date:focus {
      border-color:var(--gb-brand-label,#7db82a)!important;
      background:rgba(255,255,255,.1)!important;
      box-shadow:0 0 0 2px rgba(125,184,42,.15)!important;
    }
    .qb-inp  { min-width:140px!important; flex:1!important; }
    .qb-num  { width:72px!important; text-align:center!important; }
    .qb-date { width:152px!important; color-scheme:dark!important; }
    .qb-inp::placeholder { color:rgba(255,255,255,.28)!important; }
    .qb-label {
      font-size:11px!important; font-weight:600!important; color:rgba(255,255,255,.3)!important;
      white-space:nowrap!important; line-height:32px!important; flex-shrink:0!important;
    }

    /* ── Add condition button ── */
    #__gb-qb-add-btn {
      display:flex!important; align-items:center!important; justify-content:center!important; gap:6px!important;
      width:100%!important; margin-top:8px!important; padding:9px 16px!important;
      background:rgba(var(--gb-brand-label-rgb,148,163,184),.06)!important;
      border:1px dashed rgba(var(--gb-brand-label-rgb,148,163,184),.2)!important;
      border-radius:9px!important; color:var(--gb-brand-label,#94a3b8)!important;
      font:600 12px/1 inherit!important; cursor:pointer!important; transition:all .2s!important;
    }
    #__gb-qb-add-btn:hover {
      background:rgba(var(--gb-brand-label-rgb,148,163,184),.12)!important;
      border-color:rgba(var(--gb-brand-label-rgb,148,163,184),.36)!important; color:#fff!important;
    }
    #__gb-qb-add-btn svg { width:12px!important; height:12px!important; }

    /* ── Preview bar ── */
    #__gb-qb-preview {
      padding:10px 20px!important; flex-shrink:0!important;
      border-top:1px solid rgba(255,255,255,.06)!important; background:rgba(0,0,0,.2)!important;
    }
    .__gb-qb-pre-lbl {
      font-size:10px!important; font-weight:700!important; letter-spacing:.5px!important;
      text-transform:uppercase!important; color:rgba(255,255,255,.26)!important; margin-bottom:5px!important;
    }
    #__gb-qb-pre-code {
      font:11px/1.55 "SFMono-Regular",Consolas,monospace!important;
      color:var(--gb-brand-label,#94a3b8)!important;
      background:rgba(var(--gb-brand-label-rgb,148,163,184),.05)!important;
      border:1px solid rgba(var(--gb-brand-label-rgb,148,163,184),.11)!important;
      border-radius:7px!important; padding:8px 12px!important;
      word-break:break-all!important; min-height:34px!important;
      max-height:64px!important; overflow-y:auto!important; white-space:pre-wrap!important;
    }
    #__gb-qb-pre-code.empty { color:rgba(255,255,255,.2)!important; font-style:italic!important; }

    /* ── Error ── */
    #__gb-qb-err {
      display:none; margin:6px 20px 0!important; flex-shrink:0!important;
      font-size:11px!important; color:var(--gb-error,#c86060)!important;
      background:rgba(200,96,96,.08)!important; border:1px solid rgba(200,96,96,.18)!important;
      border-radius:6px!important; padding:6px 10px!important;
    }

    /* ── Footer ── */
    #__gb-qb-footer {
      padding:11px 20px!important; flex-shrink:0!important;
      border-top:1px solid rgba(255,255,255,.06)!important; background:rgba(0,0,0,.3)!important;
      display:flex!important; align-items:center!important; gap:8px!important;
    }
    .__gb-qb-foot-hint {
      flex:1!important; font-size:11px!important; color:rgba(255,255,255,.26)!important;
      display:flex!important; align-items:center!important; gap:5px!important;
    }
    .__gb-qb-foot-hint svg { width:11px!important; height:11px!important; flex-shrink:0!important; }
    .qb-btn {
      border-radius:7px!important; font:600 12px/1 inherit!important; cursor:pointer!important;
      padding:8px 14px!important; display:inline-flex!important; align-items:center!important;
      gap:6px!important; border:1px solid transparent!important; transition:all .18s!important; white-space:nowrap!important;
    }
    .qb-btn svg { width:11px!important; height:11px!important; }
    .qb-btn-ghost {
      background:transparent!important; color:rgba(255,255,255,.48)!important;
      border-color:rgba(255,255,255,.11)!important;
    }
    .qb-btn-ghost:hover { background:rgba(255,255,255,.06)!important; color:#fff!important; }
    .qb-btn-copy {
      background:rgba(var(--gb-brand-label-rgb,148,163,184),.09)!important;
      color:var(--gb-brand-label,#94a3b8)!important;
      border-color:rgba(var(--gb-brand-label-rgb,148,163,184),.18)!important;
    }
    .qb-btn-copy:hover { background:rgba(var(--gb-brand-label-rgb,148,163,184),.18)!important; color:#fff!important; }
    .qb-btn-run {
      background:linear-gradient(180deg,var(--gb-brand,#64748b) 0%,var(--gb-brand-dark,#4f5f74) 100%)!important;
      color:var(--gb-brand-text,#e2e8f0)!important; border-color:var(--gb-brand-border,#334155)!important;
    }
    .qb-btn-run:hover { filter:brightness(1.18)!important; box-shadow:0 3px 12px rgba(var(--gb-brand-rgb,100,116,139),.4)!important; }
    .qb-btn-run:disabled { opacity:.38!important; pointer-events:none!important; }
  `;
  document.head.appendChild(s);
}

// ── Inject button into PARENT page, positioned over the iframe ───────────────

const FUNNEL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" width="14" height="14"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`;

// ── Inject button into the IFRAME DOM (same-origin) ───────────────────────────
// Injecting into the iframe's own document means the button naturally scrolls
// with the iframe content — no position:fixed fighting the parent page CSS.

function qbFindIframeInput(iDoc) {
  return iDoc?.querySelector(
    'input[type="search"], input[type="text"][class*="search"], ' +
    'input[placeholder*="earch"], input[placeholder*="uery"], ' +
    'input[class*="query"], input[class*="Search"], input[type="text"]'
  );
}

function qbInjectIframeButton() {
  const iframe = document.getElementById('react-next-iframe');
  if (!iframe) return;

  let iDoc;
  try { iDoc = iframe.contentDocument; } catch(e) { return; }
  if (!iDoc?.body) return;

  // Already injected
  if (iDoc.getElementById('__gb-qb-icon-btn')) return;

  const input = qbFindIframeInput(iDoc);
  if (!input) return;

  // Read theme values from the parent page (where theme.js ran)
  const cs          = getComputedStyle(document.documentElement);
  const brandDark   = cs.getPropertyValue('--gb-brand-dark').trim()   || '#5f7d18';
  const brandLabel  = cs.getPropertyValue('--gb-brand-label').trim()  || '#7db82a';
  const brandBorder = cs.getPropertyValue('--gb-brand-border').trim() || 'rgba(125,184,42,.35)';
  const brandText   = cs.getPropertyValue('--gb-brand-text').trim()   || '#d8eeaa';
  const brand       = cs.getPropertyValue('--gb-brand').trim()        || '#6e901d';

  // Inject styles into the iframe's own document
  if (!iDoc.getElementById('__gb-qb-iframe-btn-css')) {
    const st = iDoc.createElement('style');
    st.id = '__gb-qb-iframe-btn-css';
    st.textContent = `
      #__gb-qb-icon-btn {
        position: absolute !important;
        z-index: 999999 !important;
        width: 28px !important; height: 28px !important; padding: 0 !important;
        display: flex !important; align-items: center !important; justify-content: center !important;
        background: ${brandDark} !important;
        border: 1px solid ${brandBorder} !important;
        border-radius: 6px !important;
        color: ${brandLabel} !important;
        cursor: pointer !important;
        box-sizing: border-box !important;
        outline: none !important; margin: 0 !important;
        transition: background .18s, color .18s, border-color .18s, box-shadow .18s !important;
      }
      #__gb-qb-icon-btn:hover {
        background: ${brand} !important;
        border-color: ${brandLabel} !important;
        color: ${brandText} !important;
        box-shadow: 0 0 0 2px rgba(125,184,42,.2) !important;
      }
      #__gb-qb-icon-btn.active {
        background: ${brand} !important;
        border-color: ${brandLabel} !important;
        color: ${brandText} !important;
        box-shadow: 0 0 0 3px rgba(125,184,42,.25) !important;
      }
      #__gb-qb-icon-btn svg { pointer-events: none !important; }
    `;
    (iDoc.head || iDoc.documentElement).appendChild(st);
  }

  // Make the input's parent the positioning anchor
  const inputParent = input.parentElement;
  const parentPos = iDoc.defaultView.getComputedStyle(inputParent).position;
  if (parentPos === 'static') inputParent.style.setProperty('position', 'relative', 'important');

  const btn = iDoc.createElement('button');
  btn.id    = '__gb-qb-icon-btn';
  btn.type  = 'button';
  btn.title = 'Build Query';
  btn.innerHTML = FUNNEL_SVG;

  // Position: vertically centred, 4px from the right edge of the input
  const inputH = input.offsetHeight || 32;
  btn.style.top  = Math.round(input.offsetTop  + (inputH - 28) / 2) + 'px';
  btn.style.left = Math.round(input.offsetLeft + input.offsetWidth - 32) + 'px';

  inputParent.appendChild(btn);

  // Click opens the modal in the PARENT page context
  btn.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    btn.classList.add('active');
    qbOpenModal(() => btn.classList.remove('active'));
  });
}

// ── Watch iframe and keep button alive after React re-renders ─────────────────

function qbWatchIframe() {
  const iframe = document.getElementById('react-next-iframe');
  if (!iframe) {
    const obs = new MutationObserver(() => {
      if (document.getElementById('react-next-iframe')) { obs.disconnect(); qbWatchIframe(); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return;
  }

  const tryInject = () => qbInjectIframeButton();

  // Re-inject when iframe loads/navigates
  iframe.addEventListener('load', () => {
    [100, 300, 600, 1200].forEach(ms => setTimeout(tryInject, ms));
  });

  // Re-inject if React removes and re-mounts the input
  const watchIframeDOM = () => {
    try {
      const iDoc = iframe.contentDocument;
      if (!iDoc?.body) return;
      let obs = new MutationObserver(() => {
        if (!iDoc.getElementById('__gb-qb-icon-btn')) tryInject();
      });
      obs.observe(iDoc.body, { childList: true, subtree: true });
    } catch(e) {}
  };

  iframe.addEventListener('load', () => setTimeout(watchIframeDOM, 200));

  // Initial inject attempts
  [100, 300, 600, 1200].forEach(ms => setTimeout(tryInject, ms));
  setTimeout(watchIframeDOM, 300);
}


// ── Saved queries storage ─────────────────────────────────────────────────────

const QB_STORAGE_KEY = 'crmSavedQueries';

async function qbLoadSaved() {
  return new Promise(res => chrome.storage.local.get(QB_STORAGE_KEY, d => res(d[QB_STORAGE_KEY] || [])));
}

async function qbSaveQuery(name, queryStr, conditions) {
  const list = await qbLoadSaved();
  const entry = { id: Date.now().toString(36), name, query: queryStr, conditions: JSON.parse(JSON.stringify(conditions)), savedAt: Date.now() };
  const updated = [entry, ...list.filter(q => q.name !== name)]; // replace same-name
  await new Promise(res => chrome.storage.local.set({ [QB_STORAGE_KEY]: updated }, res));
  return updated;
}

async function qbDeleteSaved(id) {
  const list = await qbLoadSaved();
  const updated = list.filter(q => q.id !== id);
  await new Promise(res => chrome.storage.local.set({ [QB_STORAGE_KEY]: updated }, res));
  return updated;
}

// ── Saved queries CSS (appended to existing styles) ───────────────────────────

function qbInjectSavedStyles() {
  if (document.getElementById('__gb-qb-saved-css')) return;
  const s = document.createElement('style');
  s.id = '__gb-qb-saved-css';
  s.textContent = `
    /* Save bar */
    #__gb-qb-save-bar {
      padding:9px 20px!important; flex-shrink:0!important;
      border-top:1px solid rgba(255,255,255,.06)!important;
      background:rgba(0,0,0,.18)!important;
      display:flex!important; align-items:center!important; gap:8px!important;
    }
    #__gb-qb-save-name {
      flex:1!important; height:32px!important; box-sizing:border-box!important;
      background:rgba(255,255,255,.06)!important; border:1px solid rgba(255,255,255,.1)!important;
      border-radius:7px!important; color:#fff!important; outline:none!important;
      font:500 12px/32px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;
      padding:0 10px!important; margin:0!important;
      display:inline-block!important; vertical-align:middle!important;
      transition:border-color .18s,background .18s,box-shadow .18s!important;
    }
    #__gb-qb-save-name::placeholder { color:rgba(255,255,255,.28)!important; }
    #__gb-qb-save-name:focus {
      border-color:var(--gb-brand-label,#94a3b8)!important;
      background:rgba(255,255,255,.1)!important;
      box-shadow:0 0 0 2px rgba(var(--gb-brand-label-rgb,148,163,184),.15)!important;
    }
    #__gb-qb-save-btn {
      height:32px!important; padding:0 14px!important; flex-shrink:0!important;
      box-sizing:border-box!important; margin:0!important; vertical-align:middle!important;
      background:rgba(var(--gb-brand-label-rgb,148,163,184),.09)!important;
      border:1px solid rgba(var(--gb-brand-label-rgb,148,163,184),.2)!important;
      border-radius:7px!important; color:var(--gb-brand-label,#94a3b8)!important;
      font:600 11px/1 inherit!important; cursor:pointer!important;
      display:inline-flex!important; align-items:center!important; justify-content:center!important; gap:5px!important;
      transition:all .18s!important; white-space:nowrap!important;
    }
    #__gb-qb-save-btn:hover { background:rgba(var(--gb-brand-label-rgb,148,163,184),.18)!important; color:#fff!important; }
    #__gb-qb-save-btn:disabled { opacity:.38!important; pointer-events:none!important; }
    #__gb-qb-save-btn svg { width:11px!important; height:11px!important; }

    /* Saved list panel */
    #__gb-qb-saved-panel {
      flex-shrink:0!important; border-top:1px solid rgba(255,255,255,.06)!important;
      background:rgba(0,0,0,.22)!important;
    }
    .__gb-qb-saved-hdr {
      padding:8px 20px!important; display:flex!important; align-items:center!important; gap:8px!important;
      cursor:pointer!important; user-select:none!important;
    }
    .__gb-qb-saved-hdr-lbl {
      font-size:10px!important; font-weight:700!important; letter-spacing:.5px!important;
      text-transform:uppercase!important; color:rgba(255,255,255,.3)!important; flex:1!important;
    }
    .__gb-qb-saved-count {
      font-size:9px!important; font-weight:700!important;
      background:rgba(var(--gb-brand-label-rgb,148,163,184),.12)!important;
      color:var(--gb-brand-label,#94a3b8)!important;
      border-radius:10px!important; padding:2px 7px!important;
    }
    .__gb-qb-saved-chev {
      color:rgba(255,255,255,.3)!important; transition:transform .2s!important;
      width:10px!important; height:10px!important;
    }
    .__gb-qb-saved-hdr.open .__gb-qb-saved-chev { transform:rotate(180deg)!important; }
    .__gb-qb-saved-list {
      max-height:0!important; overflow:hidden!important;
      transition:max-height .25s cubic-bezier(.4,0,.2,1)!important;
    }
    .__gb-qb-saved-list.open { max-height:200px!important; overflow-y:auto!important; }
    .__gb-qb-saved-list::-webkit-scrollbar { width:4px!important; }
    .__gb-qb-saved-list::-webkit-scrollbar-track { background:transparent!important; }
    .__gb-qb-saved-list::-webkit-scrollbar-thumb { background:rgba(255,255,255,.1)!important; border-radius:4px!important; }
    .__gb-qb-saved-item {
      padding:7px 20px!important; display:flex!important; align-items:center!important; gap:8px!important;
      border-top:1px solid rgba(255,255,255,.04)!important;
      transition:background .12s!important; cursor:pointer!important;
    }
    .__gb-qb-saved-item:hover { background:rgba(255,255,255,.04)!important; }
    .__gb-qb-saved-name {
      flex:1!important; font-size:12px!important; font-weight:500!important;
      color:rgba(255,255,255,.75)!important; overflow:hidden!important;
      text-overflow:ellipsis!important; white-space:nowrap!important;
    }
    .__gb-qb-saved-date {
      font-size:10px!important; color:rgba(255,255,255,.28)!important; white-space:nowrap!important;
    }
    .__gb-qb-saved-load {
      font-size:10px!important; font-weight:700!important;
      color:var(--gb-brand-label,#94a3b8)!important;
      background:rgba(var(--gb-brand-label-rgb,148,163,184),.1)!important;
      border:1px solid rgba(var(--gb-brand-label-rgb,148,163,184),.2)!important;
      border-radius:5px!important; padding:3px 8px!important; cursor:pointer!important;
      transition:all .15s!important; white-space:nowrap!important; flex-shrink:0!important;
    }
    .__gb-qb-saved-load:hover { background:rgba(var(--gb-brand-label-rgb,148,163,184),.2)!important; color:#fff!important; }
    .__gb-qb-saved-del {
      background:none!important; border:none!important; cursor:pointer!important;
      color:rgba(255,255,255,.2)!important; padding:3px!important; border-radius:4px!important;
      display:flex!important; align-items:center!important; flex-shrink:0!important;
      transition:all .15s!important;
    }
    .__gb-qb-saved-del:hover { color:var(--gb-error,#c86060)!important; background:rgba(200,96,96,.1)!important; }
    .__gb-qb-saved-del svg { width:11px!important; height:11px!important; }
    .__gb-qb-saved-empty {
      padding:12px 20px!important; font-size:11px!important;
      color:rgba(255,255,255,.25)!important; font-style:italic!important;
    }
  `;
  document.head.appendChild(s);
}

function qbFormatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month:'short', day:'numeric' });
}

async function qbRenderSavedPanel(panelEl) {
  const list = await qbLoadSaved();
  const hdr  = panelEl.querySelector('.__gb-qb-saved-hdr');
  const cnt  = panelEl.querySelector('.__gb-qb-saved-count');
  const listEl = panelEl.querySelector('.__gb-qb-saved-list');
  if (cnt) cnt.textContent = list.length || '';

  listEl.innerHTML = '';
  if (list.length === 0) {
    listEl.innerHTML = '<div class="__gb-qb-saved-empty">No saved queries yet.</div>';
    return;
  }
  list.forEach(q => {
    const item = document.createElement('div');
    item.className = '__gb-qb-saved-item';
    item.innerHTML = `
      <span class="__gb-qb-saved-name" title="${_qesc(q.query)}">${_qesc(q.name)}</span>
      <span class="__gb-qb-saved-date">${qbFormatDate(q.savedAt)}</span>
      <button class="__gb-qb-saved-load">Load</button>
      <button class="__gb-qb-saved-del" title="Delete">
        <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;
    item.querySelector('.__gb-qb-saved-load').addEventListener('click', e => {
      e.stopPropagation();
      // Restore conditions from saved snapshot
      qbConditions = q.conditions.map(c => ({ ...c }));
      qbNextId = Math.max(qbNextId, ...qbConditions.map(c => c.id + 1));
      qbRenderRows();
      // Populate save-name field
      const nameInput = document.getElementById('__gb-qb-save-name');
      if (nameInput) nameInput.value = q.name;
    });
    item.querySelector('.__gb-qb-saved-del').addEventListener('click', async e => {
      e.stopPropagation();
      await qbDeleteSaved(q.id);
      qbRenderSavedPanel(panelEl);
    });
    listEl.appendChild(item);
  });
}

// ── Open modal ────────────────────────────────────────────────────────────────

function qbOpenModal(onClose) {
  if (document.getElementById('__gb-qb-overlay')) return;
  qbInjectModalStyles();
  qbInjectSavedStyles();

  const overlay = document.createElement('div');
  overlay.id = '__gb-qb-overlay';
  overlay.innerHTML = `
    <div id="__gb-qb-card">
      <div id="__gb-qb-hdr">
        <div class="__gb-qb-hdr-icon">
          <svg fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        </div>
        <div class="__gb-qb-hdr-text">
          <h3>Query Builder</h3>
          <p>All conditions joined with AND. Queries run directly against the Solr index.</p>
        </div>
        <button id="__gb-qb-close">
          <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Close
        </button>
      </div>

      <div id="__gb-qb-body">
        <div id="__gb-qb-rows"></div>
        <div id="__gb-qb-empty-state" class="__gb-qb-empty">
          <div class="__gb-qb-empty-icon">
            <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          </div>
          <strong>No conditions yet</strong>
          <span>Click "Add Condition" to start building your query.</span>
        </div>
        <button id="__gb-qb-add-btn">
          <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          Add Condition
        </button>
      </div>

      <div id="__gb-qb-preview">
        <div class="__gb-qb-pre-lbl">Query Preview</div>
        <div id="__gb-qb-pre-code" class="empty">— add conditions above —</div>
      </div>

      <div id="__gb-qb-save-bar">
        <input id="__gb-qb-save-name" type="text" placeholder="Name this query to save it…" maxlength="60">
        <button id="__gb-qb-save-btn" disabled>
          <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          Save
        </button>
      </div>

      <div id="__gb-qb-saved-panel">
        <div class="__gb-qb-saved-hdr">
          <span class="__gb-qb-saved-hdr-lbl">Saved Queries</span>
          <span class="__gb-qb-saved-count"></span>
          <svg class="__gb-qb-saved-chev" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="__gb-qb-saved-list"></div>
      </div>

      <div id="__gb-qb-err"></div>

      <div id="__gb-qb-footer">
        <div class="__gb-qb-foot-hint">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Conditions joined with AND · "is not set" applies negation automatically
        </div>
        <button class="qb-btn qb-btn-ghost" id="__gb-qb-reset">
          <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-6"/></svg>
          Reset
        </button>
        <button class="qb-btn qb-btn-copy" id="__gb-qb-copy">
          <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy
        </button>
        <button class="qb-btn qb-btn-run" id="__gb-qb-run" disabled>
          <svg fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Run Query
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const savedPanel = overlay.querySelector('#__gb-qb-saved-panel');
  const savedHdr   = overlay.querySelector('.__gb-qb-saved-hdr');
  const savedList  = overlay.querySelector('.__gb-qb-saved-list');

  // Saved panel toggle
  savedHdr.addEventListener('click', () => {
    const open = savedList.classList.toggle('open');
    savedHdr.classList.toggle('open', open);
    if (open) qbRenderSavedPanel(savedPanel);
  });

  // Save button wiring
  const saveNameInput = overlay.querySelector('#__gb-qb-save-name');
  const saveBtn       = overlay.querySelector('#__gb-qb-save-btn');
  saveNameInput.addEventListener('input', () => {
    saveBtn.disabled = !saveNameInput.value.trim() || qbConditions.length === 0;
  });
  saveBtn.addEventListener('click', async () => {
    const name = saveNameInput.value.trim();
    const q    = qbBuildQuery();
    if (!name || !q) return;
    await qbSaveQuery(name, q, qbConditions);
    saveBtn.innerHTML = `<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Saved!`;
    setTimeout(() => {
      saveBtn.innerHTML = `<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save`;
    }, 1800);
    if (savedList.classList.contains('open')) qbRenderSavedPanel(savedPanel);
  });

  const closeModal = () => {
    document.removeEventListener('keydown', escHandler);
    // Destroy all portaled dropdown menus that belong to this modal
    document.querySelectorAll('.__gb-qb-portal-menu').forEach(m => m.parentNode?.removeChild(m));
    _qbRenderedIds.clear();
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity .18s';
    setTimeout(() => { overlay.remove(); if (onClose) onClose(); }, 200);
  };
  const escHandler = e => { if (e.key === 'Escape') closeModal(); };

  overlay.querySelector('#__gb-qb-close').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', escHandler);

  overlay.querySelector('#__gb-qb-add-btn').addEventListener('click', () => {
    qbConditions.push(qbNewCondition());
    saveBtn.disabled = !saveNameInput.value.trim() || qbConditions.length === 0;
    qbRenderRows();
  });
  overlay.querySelector('#__gb-qb-reset').addEventListener('click', () => {
    // Destroy all portaled menus before clearing rows
    document.querySelectorAll('.__gb-qb-portal-menu').forEach(m => m.parentNode?.removeChild(m));
    _qbRenderedIds.clear();
    qbConditions = [];
    saveBtn.disabled = true;
    qbRenderRows();
  });
  overlay.querySelector('#__gb-qb-copy').addEventListener('click', () => {
    const q = qbBuildQuery();
    if (!q) return;
    navigator.clipboard.writeText(q).catch(() => {});
    const btn = overlay.querySelector('#__gb-qb-copy');
    const orig = btn.innerHTML;
    btn.innerHTML = `<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
    setTimeout(() => { if (btn) btn.innerHTML = orig; }, 1800);
  });
  overlay.querySelector('#__gb-qb-run').addEventListener('click', () => {
    const q = qbBuildQuery();
    if (!q) return;
    const ok = qbRunQuery(q);
    if (!ok) {
      const err = overlay.querySelector('#__gb-qb-err');
      if (err) { err.textContent = 'Could not locate search input in the CRM frame.'; err.style.display = 'block'; }
    } else {
      closeModal();
    }
  });

  qbRenderRows();

  // Auto-open saved panel if there are any saved queries
  qbLoadSaved().then(list => {
    if (list.length > 0) {
      savedList.classList.add('open');
      savedHdr.classList.add('open');
      qbRenderSavedPanel(savedPanel);
    }
  });
}

// ── Track already-rendered row IDs to avoid re-animating on re-renders ────────
const _qbRenderedIds = new Set();

// ── Custom dropdown factory ───────────────────────────────────────────────────

const CHEV_SVG = `<svg class="qb-dd-chev" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>`;

function qbCustomSelect({ options, value, cls = '', onChange }) {
  const wrap = document.createElement('div');
  wrap.className = `qb-dd-wrap ${cls}`;

  const selected = options.find(o => o.value === value) || options[0];

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'qb-dd-btn';
  btn.dataset.value = selected?.value ?? '';
  btn.innerHTML = `<span class="qb-dd-label">${_qesc(selected?.label ?? '')}</span>${CHEV_SVG}`;

  // Portal menu to document.body so backdrop-filter on the modal card
  // does not make position:fixed coordinates relative to the card.
  const menu = document.createElement('div');
  menu.className = 'qb-dd-menu __gb-qb-portal-menu';
  document.body.appendChild(menu);

  wrap._qbMenu = menu;
  menu._qbWrap = wrap;

  options.forEach(opt => {
    const item = document.createElement('div');
    item.className = 'qb-dd-opt' + (opt.value === (selected?.value) ? ' selected' : '');
    item.dataset.value = opt.value;
    item.textContent = opt.label;
    item.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      btn.querySelector('.qb-dd-label').textContent = opt.label;
      btn.dataset.value = opt.value;
      menu.querySelectorAll('.qb-dd-opt').forEach(o => o.classList.toggle('selected', o.dataset.value === opt.value));
      closeQbMenu(wrap);
      onChange?.(opt.value);
    });
    menu.appendChild(item);
  });

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = menu.classList.contains('open');
    document.querySelectorAll('.__gb-qb-portal-menu.open').forEach(m => {
      if (m !== menu) closeQbMenu(m._qbWrap);
    });
    if (isOpen) closeQbMenu(wrap);
    else openQbMenu(wrap);
  });

  wrap.appendChild(btn);
  wrap.getValue = () => btn.dataset.value;
  wrap._destroy = () => { menu.parentNode?.removeChild(menu); };
  return wrap;
}

function openQbMenu(wrap) {
  if (!wrap) return;
  const btn  = wrap.querySelector('.qb-dd-btn');
  const menu = wrap._qbMenu;
  if (!btn || !menu) return;
  const r = btn.getBoundingClientRect();
  const below = (window.innerHeight - r.bottom) > 208 || r.top < 208;
  menu.style.minWidth = r.width + 'px';
  menu.style.left     = r.left + 'px';
  if (below) {
    menu.style.top = (r.bottom + 4) + 'px'; menu.style.bottom = 'auto';
    menu.classList.remove('above');
  } else {
    menu.style.top = 'auto'; menu.style.bottom = (window.innerHeight - r.top + 4) + 'px';
    menu.classList.add('above');
  }
  btn.classList.add('open');
  menu.classList.add('open');
}

function closeQbMenu(wrap) {
  if (!wrap) return;
  wrap.querySelector('.qb-dd-btn')?.classList.remove('open');
  if (wrap._qbMenu) wrap._qbMenu.classList.remove('open');
}

// Close all portal menus on outside click
document.addEventListener('click', () => {
  document.querySelectorAll('.__gb-qb-portal-menu.open').forEach(m => closeQbMenu(m._qbWrap));
});

// ── Row rendering ─────────────────────────────────────────────────────────────

function qbDestroyRowDropdowns(rowEl) {
  rowEl.querySelectorAll('.qb-dd-wrap').forEach(w => w._destroy?.());
}

function qbRenderRows() {
  const container = document.getElementById('__gb-qb-rows');
  const emptyEl   = document.getElementById('__gb-qb-empty-state');
  const runBtn    = document.getElementById('__gb-qb-run');
  if (!container) return;

  const existingIds = new Set(
    [...container.querySelectorAll('.qb-row')].map(r => +r.dataset.cid)
  );
  const currentIds = new Set(qbConditions.map(c => c.id));

  // Remove deleted rows
  container.querySelectorAll('.qb-row').forEach(rowEl => {
    if (!currentIds.has(+rowEl.dataset.cid)) {
      const prev = rowEl.previousElementSibling;
      const next = rowEl.nextElementSibling;
      if (prev?.classList.contains('qb-and-sep')) prev.remove();
      else if (next?.classList.contains('qb-and-sep')) next.remove();
      qbDestroyRowDropdowns(rowEl);
      rowEl.remove();
    }
  });

  // Rebuild AND separators (simpler than tracking them individually)
  container.querySelectorAll('.qb-and-sep').forEach(s => s.remove());
  container.querySelectorAll('.qb-row').forEach((rowEl, i) => {
    if (i > 0) {
      const sep = document.createElement('div');
      sep.className = 'qb-and-sep';
      sep.innerHTML = '<span class="qb-and-chip">AND</span>';
      container.insertBefore(sep, rowEl);
    }
  });

  // Add new rows and renumber existing
  qbConditions.forEach((c, idx) => {
    const fld = QB_FIELDS.find(f => f.key === c.fieldKey) || QB_FIELDS[0];
    const ops = QB_OPS[fld.type] || QB_OPS.text;
    if (!ops.find(o => o.value === c.op)) c.op = ops[0].value;

    if (existingIds.has(c.id)) {
      const rowEl = container.querySelector(`.qb-row[data-cid="${c.id}"]`);
      if (rowEl) rowEl.querySelector('.qb-row-num').textContent = String(idx + 1);
      return;
    }

    // Build new row (animation fires naturally on new elements)
    const row = document.createElement('div');
    row.className = 'qb-row';
    row.dataset.cid = c.id;

    const num = document.createElement('div');
    num.className = 'qb-row-num';
    num.textContent = String(idx + 1);

    const inner = document.createElement('div');
    inner.className = 'qb-row-inner';

    const fieldDd = qbCustomSelect({
      options: QB_FIELDS.map(f => ({ value: f.key, label: f.label })),
      value: c.fieldKey, cls: 'qb-dd-field',
      onChange: val => {
        c.fieldKey = val;
        const nf   = QB_FIELDS.find(f => f.key === val);
        const nops = QB_OPS[nf?.type] || QB_OPS.text;
        c.op = nops[0].value;
        c.val = nf?.type === 'enum' ? (nf.options[0] ?? '') : '';
        c.val2 = ''; c.num = '1';
        const oldOpDd = inner.querySelector('.qb-dd-op');
        const newOpDd = qbCustomSelect({
          options: nops, value: c.op, cls: 'qb-dd-op',
          onChange: ov => {
            c.op = ov;
            const va = inner.querySelector('.qb-val-area');
            if (va) { va.innerHTML = ''; qbBuildValueArea(va, QB_FIELDS.find(f => f.key === c.fieldKey) || QB_FIELDS[0], c); }
            qbUpdatePreview();
          }
        });
        if (oldOpDd) { oldOpDd._destroy?.(); oldOpDd.replaceWith(newOpDd); }
        const oldVa = inner.querySelector('.qb-val-area');
        if (oldVa) { oldVa.innerHTML = ''; qbBuildValueArea(oldVa, nf || QB_FIELDS[0], c); }
        qbUpdatePreview();
      }
    });
    inner.appendChild(fieldDd);

    const opDd = qbCustomSelect({
      options: ops, value: c.op, cls: 'qb-dd-op',
      onChange: val => {
        c.op = val;
        const va = inner.querySelector('.qb-val-area');
        if (va) { va.innerHTML = ''; qbBuildValueArea(va, fld, c); }
        qbUpdatePreview();
      }
    });
    inner.appendChild(opDd);

    const valArea = document.createElement('span');
    valArea.className = 'qb-val-area';
    valArea.style.cssText = 'display:contents';
    qbBuildValueArea(valArea, fld, c);
    inner.appendChild(valArea);

    const del = document.createElement('button');
    del.type = 'button'; del.className = 'qb-del';
    del.innerHTML = `<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    del.addEventListener('click', () => {
      qbDestroyRowDropdowns(inner);
      qbConditions = qbConditions.filter(x => x.id !== c.id);
      qbRenderRows();
    });

    row.appendChild(num);
    row.appendChild(inner);
    row.appendChild(del);
    container.appendChild(row);
    _qbRenderedIds.add(c.id);
  });

  const hasRows = qbConditions.length > 0;
  if (emptyEl) emptyEl.style.display = hasRows ? 'none' : '';
  if (runBtn)  runBtn.disabled = !hasRows;

  qbUpdatePreview();
}

function qbBuildValueArea(area, fld, c) {
  const op = c.op;
  if (['exists','not_exists','after_today','before_today'].includes(op)) return;

  const inp = (placeholder, prop, type = 'text', extraClass = '') => {
    const el = document.createElement('input');
    el.type = type;
    el.className = (type === 'number' ? 'qb-num' : type === 'date' ? 'qb-date' : 'qb-inp') + (extraClass ? ' ' + extraClass : '');
    el.placeholder = placeholder;
    el.value = c[prop] ?? '';
    if (type === 'number') el.min = '0';
    el.addEventListener('input',  () => { c[prop] = el.value; qbUpdatePreview(); });
    el.addEventListener('change', () => { c[prop] = el.value; qbUpdatePreview(); });
    return el;
  };

  const lbl = (text) => {
    const el = document.createElement('span');
    el.className = 'qb-label'; el.textContent = text; return el;
  };

  switch (fld.type) {
    case 'enum': {
      // Set val first so qbUpdatePreview and qbConditionToSolr see it immediately
      if (!c.val) c.val = fld.options[0] ?? '';
      const dd = qbCustomSelect({
        options: fld.options.map(o => ({ value: o, label: o })),
        value: c.val, cls: 'qb-dd-enum',
        onChange: v => { c.val = v; qbUpdatePreview(); }
      });
      area.appendChild(dd);
      break;
    }
    case 'text':
      area.appendChild(inp('value…', 'val'));
      break;
    case 'int':
    case 'float':
      if (op === 'between') {
        area.appendChild(inp('min', 'val', 'number'));
        area.appendChild(lbl('to'));
        area.appendChild(inp('max', 'val2', 'number'));
      } else {
        area.appendChild(inp('0', 'val', 'number'));
      }
      break;
    case 'date':
      if (op === 'rel_past' || op === 'rel_future') {
        area.appendChild(inp('1', 'num', 'number'));
        const unitDd = qbCustomSelect({
          options: QB_UNITS.map(u => ({ value: u, label: u })),
          value: c.unit || 'years', cls: 'qb-dd-unit',
          onChange: v => { c.unit = v; qbUpdatePreview(); }
        });
        if (!c.unit) c.unit = 'years';
        area.appendChild(unitDd);
        area.appendChild(lbl(op === 'rel_past' ? 'ago' : 'from now'));
      } else if (op === 'before' || op === 'after') {
        area.appendChild(inp('', 'val', 'date'));
      }
      break;
    default:
      area.appendChild(inp('value…', 'val'));
  }
}

function _qesc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function qbUpdatePreview() {
  const code   = document.getElementById('__gb-qb-pre-code');
  const runBtn = document.getElementById('__gb-qb-run');
  if (!code) return;
  const q = qbBuildQuery();
  if (q) {
    code.textContent = q;
    code.classList.remove('empty');
    if (runBtn) runBtn.disabled = false;
  } else {
    code.textContent = '— add conditions above —';
    code.classList.add('empty');
    if (runBtn) runBtn.disabled = true;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

function qbInit() {
  if (!/[?&]Page=360\b/i.test(window.location.href)) return;

  chrome.storage.local.get('featureFlags', data => {
    const flags = { crmQueryBuilderEnabled: true, ...(data.featureFlags || {}) };
    if (!flags.crmQueryBuilderEnabled) return;

    qbInjectModalStyles();
    qbWatchIframe();
  });
}

qbInit();

} // end guard
