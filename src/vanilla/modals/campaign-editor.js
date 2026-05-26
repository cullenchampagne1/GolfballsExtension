// campaign-editor.js — uses the exact gb-* design system from logo-extractor.js proof modal

if (!window.__gbCampaignEditorLoaded) {
window.__gbCampaignEditorLoaded = true;

function _ceUid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function _ceEsc(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Condition field definitions ──────────────────────────────────────────────
// Each entry: { id, label, operators: [{id, label}], valueType: 'text'|'number'|'none'|'brand'|'taskCategory' }
const _CE_COND_FIELDS = [
  // ── Order signals ────────────────────────────────────────────────
  { id:'orderCount',        label:'Order count',                     ops:[{id:'gt',l:'>='},{id:'lt',l:'<='},{id:'eq',l:'='}],  vt:'number' },
  { id:'daysSinceOrder',    label:'Days since last order',           ops:[{id:'gt',l:'>'},{id:'lt',l:'<'}],                     vt:'number' },
  { id:'totalSpend',        label:'Lifetime spend ($)',               ops:[{id:'gt',l:'>='},{id:'lt',l:'<='},{id:'eq',l:'='}],  vt:'number' },
  { id:'orderedBrand',      label:'Has ordered brand',                ops:[{id:'is',l:'is'},{id:'not',l:'is not'}],              vt:'brand'  },
  { id:'orderKeyword',      label:'Order item contains',              ops:[{id:'has',l:'contains'},{id:'not',l:'does not contain'}], vt:'text' },
  { id:'hasOrdered',        label:'Has any orders',                   ops:[{id:'is',l:'is true'},{id:'not',l:'is false'}],       vt:'none'   },
  // ── Email — any direction ─────────────────────────────────────────
  { id:'emailSubject',      label:'Any email — subject contains',     ops:[{id:'has',l:'contains'},{id:'not',l:'does not contain'}], vt:'text' },
  { id:'emailSubjectCount', label:'Any email — subject count',        ops:[{id:'gt',l:'>='},{id:'lt',l:'<='},{id:'eq',l:'exactly'}], vt:'numbertext', hint:'Enter a count threshold and a subject keyword. Leave keyword blank to count all emails.' },
  // ── Email — sent by us (From = golfballs.com) ────────────────────
  { id:'sentSubject',       label:'Sent email — subject contains',    ops:[{id:'has',l:'contains'},{id:'not',l:'does not contain'}], vt:'text' },
  { id:'sentSubjectCount',  label:'Sent email — subject count',       ops:[{id:'gt',l:'>='},{id:'lt',l:'<='},{id:'eq',l:'exactly'}], vt:'numbertext' },
  { id:'receivedSubjectCount', label:'Received email — subject count', ops:[{id:'gt',l:'>='},{id:'lt',l:'<='},{id:'eq',l:'exactly'}], vt:'numbertext', hint:'Count inbound emails matching a subject. e.g. skip if customer replied 2+ times.' },
  { id:'sentDaysAgo',       label:'Last sent email (days ago)',        ops:[{id:'lt',l:'within'},{id:'gt',l:'more than'}],        vt:'number' },
  // ── Email — received from contact ────────────────────────────────
  { id:'receivedSubject',   label:'Received email — subject contains',ops:[{id:'has',l:'contains'},{id:'not',l:'does not contain'}], vt:'text' },
  { id:'receivedDaysAgo',   label:'Last received email (days ago)',    ops:[{id:'lt',l:'within'},{id:'gt',l:'more than'}],        vt:'number' },
  { id:'hasReplied',        label:'Contact has replied (any email)',    ops:[{id:'is',l:'is true'},{id:'not',l:'is false'}],       vt:'none'   },
  { id:'repliedToSubject',  label:'Replied to our email — subject contains', ops:[{id:'has',l:'yes — replied'},{id:'not',l:'no — not replied'}], vt:'text', hint:'Checks received emails for a subject match. Use the static part of your subject (e.g. "Srixon Promo").' },
  // ── Task / activity signals ───────────────────────────────────────
  { id:'openTaskCat',       label:'Has open task — category',          ops:[{id:'has',l:'has'},{id:'not',l:'does not have'}],     vt:'taskCategory' },
  { id:'openTaskCount',     label:'Open task count',                   ops:[{id:'gt',l:'>='},{id:'lt',l:'<='},{id:'eq',l:'='}],  vt:'number' },
  { id:'taskActivityDays',  label:'Any task activity (days ago)',       ops:[{id:'lt',l:'within'},{id:'gt',l:'more than'}],       vt:'number' },
  { id:'taskSubject',       label:'Task subject contains',             ops:[{id:'has',l:'has'},{id:'not',l:'does not have'}],     vt:'text'   },
  // ── Contact signals ───────────────────────────────────────────────
  { id:'hasEmail',          label:'Has email address',                 ops:[{id:'is',l:'is true'},{id:'not',l:'is false'}],       vt:'none'   },
  { id:'companyName',       label:'Company name contains',             ops:[{id:'has',l:'contains'},{id:'not',l:'does not contain'}], vt:'text' },
  { id:'repName',           label:'Sales rep contains',                ops:[{id:'has',l:'contains'},{id:'not',l:'does not contain'}], vt:'text' },
  // ── Call activity ─────────────────────────────────────────────────
  { id:'calledDaysAgo',     label:'Was called (days ago)',             ops:[{id:'lt',l:'within'},{id:'gt',l:'more than'}],        vt:'number' },
  { id:'callCount',         label:'Call count',                       ops:[{id:'gt',l:'>='},{id:'lt',l:'<='},{id:'eq',l:'='}],   vt:'number' },
  { id:'hasBeenCalled',     label:'Has ever been called',             ops:[{id:'is',l:'is true'},{id:'not',l:'is false'}],       vt:'none'   },
];

const _CE_COND_FIELD_MAP = Object.fromEntries(_CE_COND_FIELDS.map(f => [f.id, f]));

const _CE_BRANDS = [
  'Titleist','Callaway','TaylorMade','Bridgestone','Srixon','Ping','Cobra',
  'Cleveland','Volvik','Wilson','Mizuno','Odyssey','Top Flite','Vice','OnCore',
  'Kirkland','Maxfli','Nitro','Pinnacle','Precept','Tour Edge','Acushnet','Noodle'
];

async function _ceLoadData() {
  return chrome.storage.local.get(['campaigns','templates','noteTemplates']);
}
async function _ceSaveCampaigns(list) {
  await chrome.storage.local.set({ campaigns: list });
}

// ── Styles ────────────────────────────────────────────────────────────────────
(function injectCEStyles() {
  if (document.getElementById('__gb-ce-css')) return;
  const st = document.createElement('style');
  st.id = '__gb-ce-css';
  st.textContent = `
    #__gb-ce-overlay {
      position: fixed !important; inset: 0 !important; z-index: 999997 !important;
      background: rgba(0,0,0,.72) !important; backdrop-filter: blur(8px) !important; -webkit-backdrop-filter: blur(8px) !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      animation: __gbCeFade .18s ease !important; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif !important;
    }
    @keyframes __gbCeFade { from{opacity:0}to{opacity:1} }

    #__gb-ce-card {
      background: var(--gb-surface,#1a1a1a) !important;
      border: 1px solid rgba(255,255,255,.09) !important; border-radius: 18px !important;
      width: min(1060px,calc(100vw - 32px)) !important; height: min(820px,calc(100vh - 48px)) !important;
      display: flex !important; flex-direction: column !important; overflow: hidden !important;
      box-shadow: 0 32px 80px rgba(0,0,0,.9) !important;
      animation: __gbCeUp .28s cubic-bezier(.34,1.3,.64,1) !important;
    }
    @keyframes __gbCeUp { from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:none} }

    #__gb-ce-hdr {
      padding: 14px 20px !important; flex-shrink: 0 !important;
      background: rgba(0,0,0,.4) !important; border-bottom: 1px solid rgba(255,255,255,.07) !important;
      display: flex !important; align-items: center !important; gap: 12px !important;
    }
    .gb-ce-hdr-icon {
      width: 36px !important; height: 36px !important; border-radius: 10px !important; flex-shrink: 0 !important;
      background: rgba(var(--gb-brand-label-rgb,125,184,42),.12) !important;
      border: 1px solid rgba(var(--gb-brand-label-rgb,125,184,42),.25) !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      color: var(--gb-brand-label,#7db82a) !important;
    }
    .gb-ce-hdr-icon svg { width: 16px !important; height: 16px !important; }
    #__gb-ce-hdr-title { font-size: 14px !important; font-weight: 700 !important; color: #fff !important; letter-spacing: .3px !important; }
    #__gb-ce-hdr-sub { font-size: 11px !important; font-weight: 500 !important; color: rgba(255,255,255,.45) !important; margin-top: 2px !important; }
    #btn_ce_close {
      margin-left: auto !important; background: rgba(255,255,255,.05) !important;
      border: 1px solid rgba(255,255,255,.1) !important; border-radius: 7px !important;
      color: rgba(255,255,255,.8) !important; cursor: pointer !important;
      padding: 6px 12px !important; font-size: 11px !important; font-weight: 600 !important;
      display: flex !important; align-items: center !important; gap: 6px !important;
      transition: all .2s !important; font-family: inherit !important; box-sizing: border-box !important;
    }
    #btn_ce_close:hover { background: rgba(255,255,255,.12) !important; color: #fff !important; }
    #btn_ce_close svg { width: 10px !important; height: 10px !important; }

    #__gb-ce-body { display: flex !important; flex: 1 !important; overflow: hidden !important; }

    #__gb-ce-sidebar {
      width: 210px !important; flex-shrink: 0 !important;
      border-right: 1px solid rgba(255,255,255,.06) !important;
      background: rgba(0,0,0,.15) !important;
      display: flex !important; flex-direction: column !important; overflow: hidden !important;
    }
    #__gb-ce-sidebar-hdr {
      padding: 11px 14px 9px !important; border-bottom: 1px solid rgba(255,255,255,.06) !important;
      display: flex !important; align-items: center !important; justify-content: space-between !important; flex-shrink: 0 !important;
    }
    #__gb-ce-sidebar-hdr span { font-size: 10.5px !important; font-weight: 700 !important; text-transform: uppercase !important; letter-spacing: .6px !important; color: rgba(255,255,255,.3) !important; }
    #btn_ce_new {
      height: 26px !important; padding: 0 10px !important; border-radius: 6px !important;
      background: rgba(0,0,0,.3) !important; border: 1px solid rgba(255,255,255,.1) !important;
      color: rgba(255,255,255,.8) !important; font-size: 11px !important; font-weight: 600 !important;
      cursor: pointer !important; transition: all .15s !important; font-family: inherit !important;
    }
    #btn_ce_new:hover { background: rgba(255,255,255,.05) !important; border-color: rgba(255,255,255,.2) !important; color: #fff !important; }

    #__gb-ce-list { flex: 1 !important; overflow-y: auto !important; padding: 6px !important; scrollbar-width: thin !important; scrollbar-color: rgba(255,255,255,.1) transparent !important; }
    .ce-list-item {
      padding: 9px 11px !important; border-radius: 8px !important; cursor: pointer !important;
      margin-bottom: 2px !important; transition: background .12s !important;
      color: rgba(255,255,255,.65) !important; font-size: 12.5px !important; font-weight: 500 !important;
      border: 1px solid transparent !important;
    }
    .ce-list-item:hover { background: rgba(255,255,255,.06) !important; color: #fff !important; }
    .ce-list-item.active { background: rgba(var(--gb-brand-label-rgb,125,184,42),.12) !important; border-color: rgba(var(--gb-brand-label-rgb,125,184,42),.25) !important; color: var(--gb-brand-label,#7db82a) !important; }
    .ce-list-meta { font-size: 10.5px !important; color: rgba(255,255,255,.25) !important; margin-top: 3px !important; }

    #__gb-ce-editor {
      flex: 1 !important; overflow-y: auto !important; padding: 20px 22px !important;
      scrollbar-width: thin !important; scrollbar-color: rgba(255,255,255,.15) transparent !important;
    }
    #__gb-ce-editor::-webkit-scrollbar { width: 6px !important; }
    #__gb-ce-editor::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15) !important; border-radius: 6px !important; }
    #__gb-ce-editor::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.25) !important; }
    #__gb-ce-empty { display:flex !important; align-items:center !important; justify-content:center !important; height:100% !important; color:rgba(255,255,255,.2) !important; font-size:14px !important; font-weight:500 !important; }

    /* gb-* form classes — identical to proof modal */
    .gb-form-group { display:flex !important; flex-direction:column !important; gap:6px !important; width:100% !important; box-sizing:border-box !important; margin:0 !important; }
    .gb-label { font-size:10px !important; font-weight:800 !important; color:rgba(255,255,255,.5) !important; text-transform:uppercase !important; letter-spacing:.8px !important; }
    .gb-hint { font-size:10.5px !important; font-weight:500 !important; color:rgba(255,255,255,.28) !important; text-transform:none !important; letter-spacing:0 !important; }
    .gb-grid-2 { display:grid !important; grid-template-columns:1fr 1fr !important; gap:14px !important; width:100% !important; box-sizing:border-box !important; }
    .gb-divider { grid-column:1/-1 !important; height:1px !important; background:rgba(255,255,255,.06) !important; margin:4px 0 !important; border-radius:2px !important; }

    .gb-input-wrap { position:relative !important; width:100% !important; margin:0 !important; }
    .gb-input-p {
      -webkit-appearance:none !important; appearance:none !important;
      background:rgba(0,0,0,.3) !important; border:1px solid rgba(255,255,255,.1) !important; color:#fff !important;
      padding:10px 32px 10px 14px !important; border-radius:8px !important; width:100% !important; box-sizing:border-box !important;
      font-family:inherit !important; font-size:13px !important; font-weight:500 !important; line-height:1.5 !important; min-height:40px !important;
      transition:border-color .15s, box-shadow .15s !important; margin:0 !important; outline:none !important; color-scheme:dark !important;
    }
    .gb-input-p:focus { border-color:var(--gb-brand-label,#7db82a) !important; box-shadow:0 0 0 2px rgba(var(--gb-brand-label-rgb,125,184,42),.15) !important; }
    .gb-input-p::placeholder { color:rgba(255,255,255,.3) !important; }
    .gb-input-p[type=number]::-webkit-inner-spin-button,.gb-input-p[type=number]::-webkit-outer-spin-button { -webkit-appearance:none !important; }
    .gb-input-p[type=number] { -moz-appearance:textfield !important; padding-right:14px !important; text-align:center !important; }

    .gb-dropdown-wrap { position:relative !important; width:100% !important; }
    .gb-dropdown-btn {
      width:100% !important; background:rgba(0,0,0,.3) !important; border:1px solid rgba(255,255,255,.1) !important; border-radius:8px !important;
      padding:10px 32px 10px 14px !important; font-size:13px !important; font-weight:500 !important; color:#fff !important; cursor:pointer !important;
      text-align:left !important; display:flex !important; align-items:center !important; position:relative !important;
      min-height:40px !important; box-sizing:border-box !important; font-family:inherit !important; transition:all .15s !important; margin:0 !important;
    }
    .gb-dropdown-btn:hover { background:rgba(255,255,255,.05) !important; border-color:rgba(255,255,255,.2) !important; }
    .gb-dropdown-btn.open { border-color:var(--gb-brand-label,#7db82a) !important; background:rgba(255,255,255,.05) !important; box-shadow:0 0 0 2px rgba(var(--gb-brand-label-rgb,125,184,42),.15) !important; }
    .gb-btn-label { flex:1 !important; overflow:hidden !important; text-overflow:ellipsis !important; white-space:nowrap !important; }
    .gb-dropdown-chevron { position:absolute !important; right:12px !important; top:50% !important; transform:translateY(-50%) !important; color:rgba(255,255,255,.4) !important; pointer-events:none !important; transition:transform .2s, color .2s !important; }
    .gb-dropdown-btn.open .gb-dropdown-chevron { transform:translateY(-50%) rotate(180deg) !important; color:var(--gb-brand-label,#7db82a) !important; }
    .gb-dropdown-menu {
      position:absolute !important; top:calc(100% + 4px) !important; left:0 !important; right:0 !important;
      background:var(--gb-surface-elevated,#171717) !important; border:1px solid rgba(255,255,255,.1) !important; border-radius:9px !important; z-index:999999 !important;
      max-height:260px !important; overflow-y:auto !important; scrollbar-width:thin !important; scrollbar-color:rgba(255,255,255,.1) transparent !important;
      opacity:0 !important; transform:translateY(-5px) !important; pointer-events:none !important;
      transition:opacity .16s ease, transform .18s cubic-bezier(.34,1.4,.64,1) !important;
      box-shadow:0 10px 30px rgba(0,0,0,.9), 0 0 0 1px rgba(255,255,255,.03) !important; padding:4px !important; box-sizing:border-box !important;
    }
    .gb-dropdown-menu.open { opacity:1 !important; transform:translateY(0) !important; pointer-events:auto !important; }
    .gb-dropdown-option { padding:9px 12px !important; margin-bottom:2px !important; border-radius:6px !important; cursor:pointer !important; font-size:12.5px !important; color:rgba(255,255,255,.75) !important; transition:background .1s, color .1s !important; display:flex !important; justify-content:space-between !important; align-items:center !important; }
    .gb-dropdown-option:last-child { margin-bottom:0 !important; }
    .gb-dropdown-option:hover { background:rgba(255,255,255,.08) !important; color:#fff !important; }
    .gb-dropdown-option.selected { background:rgba(var(--gb-brand-label-rgb,125,184,42),.15) !important; color:var(--gb-brand-label,#7db82a) !important; font-weight:600 !important; }

    /* gb-tag for boolean toggles (replyMode, brand filter) */
    .gb-tags-wrap { display:flex !important; flex-wrap:wrap !important; gap:8px !important; align-items:center !important; }
    .gb-tag {
      background:rgba(0,0,0,.3) !important; border:1px solid rgba(255,255,255,.1) !important;
      color:rgba(255,255,255,.7) !important; padding:7px 12px !important; border-radius:20px !important;
      font-size:12px !important; font-weight:600 !important; cursor:pointer !important;
      transition:all .15s !important; user-select:none !important; font-family:inherit !important;
      display:flex !important; align-items:center !important; gap:5px !important;
    }
    .gb-tag:hover { background:rgba(255,255,255,.05) !important; border-color:rgba(255,255,255,.2) !important; color:#fff !important; }
    .gb-tag.active { background:rgba(var(--gb-brand-label-rgb,125,184,42),.15) !important; border-color:var(--gb-brand-label,#7db82a) !important; color:var(--gb-brand-label,#7db82a) !important; box-shadow:0 0 0 1px rgba(var(--gb-brand-label-rgb,125,184,42),.25) !important; }

    /* Step cards */
    #ce-steps { display:flex !important; flex-direction:column !important; gap:10px !important; margin-bottom:10px !important; }
    @keyframes __gbCeStepIn { from{opacity:0;transform:translateY(-6px) scale(.98)}to{opacity:1;transform:none} }
    .ce-step { border:1px solid rgba(255,255,255,.08) !important; border-radius:10px !important; background:rgba(255,255,255,.02) !important; }
    .ce-step.new-step { animation:__gbCeStepIn .22s cubic-bezier(.34,1.4,.64,1) forwards !important; }
    .ce-step-hdr {
      padding:10px 14px !important; border-bottom:1px solid rgba(255,255,255,.06) !important;
      display:flex !important; align-items:center !important; gap:10px !important;
      background:rgba(0,0,0,.2) !important; border-radius:10px 10px 0 0 !important;
    }
    .ce-step-num { font-size:10px !important; font-weight:800 !important; color:rgba(255,255,255,.22) !important; text-transform:uppercase !important; letter-spacing:.5px !important; flex-shrink:0 !important; min-width:18px !important; }
    .ce-step-body { padding:16px !important; display:flex !important; flex-direction:column !important; gap:14px !important; }
    .ce-step-info {
      font-size:12px !important; color:rgba(255,255,255,.35) !important; font-style:italic !important;
      padding:10px 12px !important; background:rgba(255,255,255,.03) !important; border-radius:7px !important;
      border:1px solid rgba(255,255,255,.06) !important;
    }
    .gb-dyn-delete {
      background:rgba(0,0,0,.3) !important; border:1px solid rgba(255,255,255,.1) !important;
      border-radius:6px !important; width:24px !important; height:24px !important; flex-shrink:0 !important;
      display:flex !important; align-items:center !important; justify-content:center !important;
      cursor:pointer !important; color:rgba(255,255,255,.4) !important; transition:all .15s !important; padding:0 !important; font-family:inherit !important; margin-left:auto !important;
    }
    .gb-dyn-delete svg { width:12px !important; height:12px !important; pointer-events:none !important; }
    .gb-dyn-delete:hover { background:rgba(200,96,96,.15) !important; border-color:rgba(200,96,96,.3) !important; color:var(--gb-error,#c86060) !important; }

    /* A/B split rows */
    .ce-splits { display:flex !important; flex-direction:column !important; gap:6px !important; }
    .ce-split-row { display:flex !important; align-items:center !important; gap:8px !important; }
    .ce-pct-unit { font-size:12px !important; color:rgba(255,255,255,.25) !important; flex-shrink:0 !important; }
    .ce-pct-warn { font-size:10.5px !important; color:var(--gb-warn,#f59e0b) !important; }
    .ce-add-split {
      height:30px !important; padding:0 12px !important; border-radius:7px !important; align-self:flex-start !important;
      border:1px dashed rgba(255,255,255,.15) !important; background:none !important;
      color:rgba(255,255,255,.35) !important; font-size:12px !important; font-weight:500 !important; cursor:pointer !important;
      transition:all .12s !important; font-family:inherit !important;
    }
    .ce-add-split:hover { border-color:rgba(255,255,255,.3) !important; color:rgba(255,255,255,.7) !important; }

    /* ── Step conditions system ─────────────────────────────────────── */
    .ce-conditions { display:flex !important; flex-direction:column !important; gap:6px !important; }
    .ce-cond-row { display:flex !important; align-items:center !important; gap:6px !important; }
    .ce-cond-row .gb-dropdown-wrap { min-width:0 !important; }
    .ce-cond-field  { flex:2 !important; min-width:0 !important; }
    .ce-cond-op     { flex:1.2 !important; min-width:0 !important; }
    .ce-cond-val    { flex:1.5 !important; min-width:0 !important; }
    .ce-cond-val .gb-input-p { min-height:36px !important; padding:8px 10px !important; font-size:12px !important; }
    .ce-cond-del {
      height:36px !important; width:36px !important; flex-shrink:0 !important; border-radius:7px !important;
      border:1px solid rgba(255,255,255,.08) !important; background:none !important;
      color:rgba(255,255,255,.22) !important; font-size:13px !important; cursor:pointer !important;
      display:flex !important; align-items:center !important; justify-content:center !important; transition:all .12s !important; font-family:inherit !important;
    }
    .ce-cond-del:hover { color:var(--gb-error,#c86060) !important; border-color:rgba(200,96,96,.3) !important; background:rgba(200,96,96,.06) !important; }
    .ce-add-cond {
      height:28px !important; padding:0 10px !important; border-radius:6px !important; align-self:flex-start !important;
      border:1px dashed rgba(255,255,255,.15) !important; background:none !important;
      color:rgba(255,255,255,.35) !important; font-size:11.5px !important; font-weight:500 !important; cursor:pointer !important;
      transition:all .12s !important; font-family:inherit !important;
    }
    .ce-add-cond:hover { border-color:rgba(255,255,255,.3) !important; color:rgba(255,255,255,.7) !important; }
    .ce-cond-logic { display:flex !important; align-items:center !important; gap:6px !important; margin-bottom:4px !important; }
    .ce-cond-logic span { font-size:11px !important; color:rgba(255,255,255,.3) !important; }
    .ce-cond-empty { font-size:11.5px !important; color:rgba(255,255,255,.25) !important; font-style:italic !important; }

    /* Email history filter */
    .ce-subject-row { display:flex !important; align-items:center !important; gap:8px !important; margin-bottom:6px !important; }
    .ce-subject-row .gb-input-p { flex:1 !important; min-height:36px !important; padding:8px 12px !important; font-size:12px !important; }
    .ce-subject-del {
      height:36px !important; width:36px !important; flex-shrink:0 !important; border-radius:7px !important;
      border:1px solid rgba(255,255,255,.08) !important; background:none !important;
      color:rgba(255,255,255,.22) !important; font-size:13px !important; cursor:pointer !important;
      display:flex !important; align-items:center !important; justify-content:center !important; transition:all .12s !important; font-family:inherit !important;
    }
    .ce-subject-del:hover { color:var(--gb-error,#c86060) !important; border-color:rgba(200,96,96,.3) !important; background:rgba(200,96,96,.06) !important; }
    .ce-add-subject {
      height:30px !important; padding:0 12px !important; border-radius:7px !important; align-self:flex-start !important;
      border:1px dashed rgba(255,255,255,.15) !important; background:none !important;
      color:rgba(255,255,255,.35) !important; font-size:12px !important; font-weight:500 !important; cursor:pointer !important;
      transition:all .12s !important; font-family:inherit !important;
    }
    .ce-add-subject:hover { border-color:rgba(255,255,255,.3) !important; color:rgba(255,255,255,.7) !important; }
    .ce-sfm-row { display:flex !important; align-items:center !important; gap:8px !important; margin-bottom:8px !important; }
    .ce-sfm-btn { height:30px !important; padding:0 10px !important; border-radius:6px !important; font-size:11.5px !important; font-weight:600 !important; font-family:inherit !important;
      cursor:pointer !important; transition:all .15s !important; border:1px solid rgba(255,255,255,.12) !important; background:rgba(255,255,255,.05) !important; color:rgba(255,255,255,.45) !important; outline:none !important; }
    .ce-sfm-btn.active { background:rgba(200,96,96,.18) !important; border-color:rgba(200,96,96,.4) !important; color:var(--gb-error,#c86060) !important; }
    .ce-sfm-btn.active.skip-missing { background:rgba(110,144,29,.18) !important; border-color:rgba(110,144,29,.4) !important; color:var(--gb-brand-label,#7db82a) !important; }
    .ce-sf-list { display:flex !important; flex-direction:column !important; gap:5px !important; margin-bottom:6px !important; }

    /* Email step gate — subject tag + multi-check */
    .ce-subject-tag-row { display:flex !important; align-items:center !important; gap:8px !important; margin-bottom:4px !important; }
    .ce-gate-sections { display:flex !important; flex-direction:column !important; gap:8px !important; margin-top:6px !important; }
    .ce-gate-section {
      display:flex !important; flex-direction:column !important; gap:2px !important;
      padding:8px 10px !important; background:rgba(255,255,255,.025) !important;
      border-radius:7px !important; border:1px solid rgba(255,255,255,.07) !important;
    }
    .ce-gate-section-label { font-size:10px !important; font-weight:800 !important; color:rgba(255,255,255,.35) !important; text-transform:uppercase !important; letter-spacing:.7px !important; margin-bottom:4px !important; }
    .ce-gate-check {
      display:flex !important; align-items:center !important; gap:9px !important;
      padding:5px 4px !important; border-radius:6px !important; cursor:pointer !important;
      font-size:12px !important; color:rgba(255,255,255,.55) !important;
      transition:color .12s,background .12s !important; user-select:none !important; position:relative !important;
    }
    .ce-gate-check:hover { color:rgba(255,255,255,.85) !important; background:rgba(255,255,255,.04) !important; }
    .ce-gate-check.is-checked { color:var(--gb-brand-label,#7db82a) !important; }
    .ce-gate-check input[type=checkbox] { position:absolute !important; opacity:0 !important; width:0 !important; height:0 !important; pointer-events:none !important; }
    .ce-gate-check-box {
      width:16px !important; height:16px !important; flex-shrink:0 !important;
      border-radius:4px !important; border:1.5px solid rgba(255,255,255,.18) !important;
      background:rgba(0,0,0,.35) !important;
      display:flex !important; align-items:center !important; justify-content:center !important;
      transition:all .15s !important;
    }
    .ce-gate-check:hover .ce-gate-check-box { border-color:rgba(255,255,255,.38) !important; }
    .ce-gate-check.is-checked .ce-gate-check-box {
      background:var(--gb-brand-label,#7db82a) !important; border-color:var(--gb-brand-label,#7db82a) !important;
      box-shadow:0 0 0 2px rgba(125,184,42,.22) !important;
    }
    .ce-check-mark { color:#fff !important; opacity:0 !important; transform:scale(.5) !important; transition:opacity .12s,transform .12s cubic-bezier(.34,1.4,.64,1) !important; }
    .ce-gate-check.is-checked .ce-check-mark { opacity:1 !important; transform:scale(1) !important; }
    .ce-gate-empty { font-size:11.5px !important; color:rgba(255,255,255,.22) !important; font-style:italic !important; }

    /* ── Branch step ────────────────────────────────────────────────────────── */
    .ce-branch-card { border:1px solid rgba(245,158,11,.28) !important; border-radius:10px !important; background:rgba(245,158,11,.04) !important; }
    .ce-branch-hdr {
      padding:10px 14px !important; border-bottom:1px solid rgba(245,158,11,.15) !important;
      display:flex !important; align-items:center !important; gap:10px !important;
      background:rgba(245,158,11,.07) !important; border-radius:10px 10px 0 0 !important;
    }
    .ce-branch-hdr .ce-step-num { color:rgba(245,158,11,.6) !important; }
    .ce-branch-icon { color:rgba(245,158,11,.85) !important; flex-shrink:0 !important; }
    .ce-branch-label-pill {
      background:rgba(245,158,11,.15) !important; border:1px solid rgba(245,158,11,.3) !important;
      color:rgba(245,158,11,.9) !important; padding:2px 9px !important; border-radius:20px !important;
      font-size:11px !important; font-weight:700 !important;
    }
    .ce-branch-body { padding:14px !important; display:flex !important; flex-direction:column !important; gap:12px !important; }
    .ce-branch-children {
      display:flex !important; flex-direction:column !important; gap:8px !important;
      padding-left:14px !important; border-left:2px solid rgba(245,158,11,.2) !important; margin-top:4px !important;
    }
    .ce-branch-child {
      border:1px solid rgba(255,255,255,.07) !important; border-radius:8px !important;
      background:rgba(0,0,0,.15) !important;
    }
    .ce-branch-child-hdr {
      padding:8px 12px !important; border-bottom:1px solid rgba(255,255,255,.05) !important;
      display:flex !important; align-items:center !important; gap:8px !important;
      background:rgba(0,0,0,.1) !important; border-radius:8px 8px 0 0 !important;
    }
    .ce-branch-child-body { padding:12px !important; display:flex !important; flex-direction:column !important; gap:12px !important; }
    /* ── Sandbox button next to campaign name ────────────────────────────────── */
    .ce-sandbox-btn {
      width:38px !important; height:38px !important; min-height:38px !important; flex-shrink:0 !important;
      background:rgba(0,0,0,.3) !important;
      border:1px solid rgba(255,255,255,.1) !important; border-radius:8px !important;
      color:rgba(255,255,255,.5) !important; cursor:pointer !important;
      display:flex !important; align-items:center !important; justify-content:center !important;
      transition:all .15s !important; font-family:inherit !important; box-sizing:border-box !important;
    }
    .ce-sandbox-btn:hover {
      background:rgba(var(--gb-brand-label-rgb,125,184,42),.12) !important;
      border-color:rgba(var(--gb-brand-label-rgb,125,184,42),.3) !important;
      color:var(--gb-brand-label,#7db82a) !important;
    }
    .ce-sandbox-btn svg { pointer-events:none !important; width:14px !important; height:14px !important; }

    /* ── Sandbox modal (centered overlay) ────────────────────────────────────── */
    #__gb-sb-modal-overlay {
      position:fixed !important; inset:0 !important; z-index:999998 !important;
      background:rgba(0,0,0,.72) !important; backdrop-filter:blur(8px) !important; -webkit-backdrop-filter:blur(8px) !important;
      display:flex !important; align-items:center !important; justify-content:center !important;
      animation:__gbCeFade .18s ease !important;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif !important;
    }
    #__gb-sb-modal {
      background:var(--gb-surface,#1a1a1a) !important;
      border:1px solid rgba(255,255,255,.09) !important; border-radius:14px !important;
      width:min(420px,calc(100vw - 40px)) !important;
      box-shadow:0 32px 80px rgba(0,0,0,.9) !important;
      animation:__gbCeUp .28s cubic-bezier(.34,1.3,.64,1) !important;
      overflow:hidden !important;
    }
    #__gb-sb-modal-hdr {
      padding:14px 18px !important; display:flex !important; align-items:center !important; gap:12px !important;
      border-bottom:1px solid rgba(255,255,255,.07) !important;
      background:rgba(0,0,0,.4) !important;
    }
    .sb-modal-hdr-icon {
      width:32px !important; height:32px !important; border-radius:8px !important; flex-shrink:0 !important;
      background:rgba(var(--gb-brand-label-rgb,125,184,42),.12) !important;
      border:1px solid rgba(var(--gb-brand-label-rgb,125,184,42),.25) !important;
      display:flex !important; align-items:center !important; justify-content:center !important;
      color:var(--gb-brand-label,#7db82a) !important;
    }
    .sb-modal-hdr-title {
      flex:1 !important; font-size:13px !important; font-weight:700 !important; color:#fff !important;
      letter-spacing:.3px !important;
    }
    #btn_sb_modal_close {
      width:26px !important; height:26px !important; border-radius:6px !important;
      background:rgba(255,255,255,.05) !important; border:1px solid rgba(255,255,255,.1) !important;
      color:rgba(255,255,255,.6) !important; cursor:pointer !important;
      display:flex !important; align-items:center !important; justify-content:center !important;
      transition:all .15s !important; font-family:inherit !important;
    }
    #btn_sb_modal_close:hover { background:rgba(255,255,255,.12) !important; color:#fff !important; }
    #__gb-sb-modal-body { padding:18px !important; display:flex !important; flex-direction:column !important; gap:12px !important; }
    .sb-modal-tabs {
      display:flex !important; gap:3px !important; background:rgba(0,0,0,.35) !important;
      border-radius:7px !important; padding:3px !important;
    }
    .sb-modal-tab {
      flex:1 !important; height:30px !important; border:none !important; border-radius:5px !important;
      background:none !important; color:rgba(255,255,255,.35) !important;
      font-size:11.5px !important; font-weight:600 !important; cursor:pointer !important;
      font-family:inherit !important; transition:all .12s !important;
    }
    .sb-modal-tab.active { background:rgba(255,255,255,.08) !important; color:rgba(255,255,255,.9) !important; }
    .sb-modal-tab:hover:not(.active) { color:rgba(255,255,255,.6) !important; }
    .sb-modal-panel { display:flex !important; flex-direction:column !important; gap:8px !important; }
    #sb-modal-url-input {
      width:100% !important; box-sizing:border-box !important;
      background:rgba(0,0,0,.3) !important; border:1px solid rgba(255,255,255,.1) !important;
      border-radius:8px !important; padding:10px 14px !important; min-height:40px !important;
      font-size:13px !important; font-weight:500 !important; color:#fff !important; font-family:inherit !important;
      outline:none !important; transition:border-color .15s, box-shadow .15s !important;
    }
    #sb-modal-url-input:focus { border-color:var(--gb-brand-label,#7db82a) !important; box-shadow:0 0 0 2px rgba(var(--gb-brand-label-rgb,125,184,42),.15) !important; }
    #sb-modal-url-input::placeholder { color:rgba(255,255,255,.3) !important; }
    #sb-modal-file-drop {
      display:flex !important; align-items:center !important; justify-content:center !important;
      gap:10px !important; padding:24px 18px !important;
      border:1.5px dashed rgba(255,255,255,.12) !important; border-radius:8px !important;
      cursor:pointer !important; transition:all .15s !important;
      color:rgba(255,255,255,.35) !important; font-size:12px !important; font-weight:500 !important;
    }
    #sb-modal-file-drop:hover, #sb-modal-file-drop.dragover {
      border-color:rgba(var(--gb-brand-label-rgb,125,184,42),.4) !important;
      background:rgba(var(--gb-brand-label-rgb,125,184,42),.04) !important;
      color:var(--gb-brand-label,#7db82a) !important;
    }
    #sb-modal-file-drop.has-file { border-color:rgba(var(--gb-brand-label-rgb,125,184,42),.35) !important; color:var(--gb-brand-label,#7db82a) !important; }
    #sb-modal-file-drop svg { flex-shrink:0 !important; }
    #__gb-sb-modal-footer {
      padding:14px 18px !important; display:flex !important; align-items:center !important;
      justify-content:flex-end !important; gap:10px !important;
      border-top:1px solid rgba(255,255,255,.06) !important;
      background:rgba(0,0,0,.3) !important;
    }
    #btn_sb_modal_cancel {
      height:36px !important; padding:0 16px !important; border-radius:7px !important;
      background:rgba(255,255,255,.05) !important; border:1px solid rgba(255,255,255,.1) !important;
      color:rgba(255,255,255,.7) !important; font-size:12px !important; font-weight:600 !important;
      cursor:pointer !important; font-family:inherit !important; transition:all .15s !important;
    }
    #btn_sb_modal_cancel:hover { background:rgba(255,255,255,.1) !important; color:#fff !important; }
    #btn_sb_modal_run {
      height:36px !important; padding:0 18px !important; border-radius:7px !important;
      background:var(--gb-brand-dark,#5f7d18) !important;
      border:1px solid rgba(var(--gb-brand-label-rgb,125,184,42),.4) !important;
      color:var(--gb-brand-text,#d8eeaa) !important; font-size:12px !important; font-weight:700 !important;
      cursor:pointer !important; font-family:inherit !important; transition:all .15s !important;
      display:flex !important; align-items:center !important; gap:6px !important;
    }
    #btn_sb_modal_run:hover { background:var(--gb-brand,#6e901d) !important; border-color:var(--gb-brand-label,#7db82a) !important; color:#fff !important; }
    #btn_sb_modal_run:disabled { opacity:.4 !important; cursor:not-allowed !important; }
    #sb-modal-status { font-size:10.5px !important; color:rgba(255,255,255,.35) !important; text-align:center !important; min-height:14px !important; }

    /* ── Inline sandbox animation (step highlighting in editor) ───────────────── */
    @keyframes __gbSbPulse { 0%,100%{box-shadow:0 0 0 0 rgba(var(--gb-brand-label-rgb,125,184,42),.4)} 50%{box-shadow:0 0 0 6px rgba(var(--gb-brand-label-rgb,125,184,42),0)} }
    @keyframes __gbSbSlide { from{opacity:0;transform:translateX(-6px)} to{opacity:1;transform:none} }
    .ce-step.sb-active {
      border-color:rgba(var(--gb-brand-label-rgb,125,184,42),.5) !important;
      box-shadow:0 0 0 2px rgba(var(--gb-brand-label-rgb,125,184,42),.12) !important;
      animation:__gbSbPulse 1.5s ease-in-out infinite !important;
      transition:all .3s ease !important;
    }
    .ce-step.sb-pending { opacity:.35 !important; transition:opacity .3s ease !important; }
    .ce-step.sb-done { transition:all .3s ease !important; }
    .ce-step.sb-done[data-sb="fired"] { border-color:rgba(var(--gb-brand-label-rgb,125,184,42),.45) !important; background:rgba(var(--gb-brand-label-rgb,125,184,42),.03) !important; }
    .ce-step.sb-done[data-sb="skipped"] { border-color:rgba(var(--gb-error-rgb,200,96,96),.3) !important; opacity:.55 !important; }
    .ce-step.sb-done[data-sb="locked"] { opacity:.3 !important; }
    .ce-step.sb-done[data-sb="noemail"] { border-color:rgba(var(--gb-warn-rgb,245,158,11),.35) !important; }
    .sb-step-status-overlay {
      position:absolute !important; top:8px !important; right:8px !important;
      padding:3px 9px !important; border-radius:20px !important;
      font-size:9.5px !important; font-weight:800 !important; text-transform:uppercase !important;
      letter-spacing:.5px !important; animation:__gbSbSlide .22s ease !important;
    }
    .sb-step-status-overlay.fired { background:rgba(var(--gb-brand-label-rgb,125,184,42),.15) !important; color:var(--gb-brand-label,#7db82a) !important; }
    .sb-step-status-overlay.skipped { background:rgba(var(--gb-error-rgb,200,96,96),.12) !important; color:var(--gb-error,#c86060) !important; }
    .sb-step-status-overlay.locked { background:rgba(255,255,255,.08) !important; color:rgba(255,255,255,.35) !important; }
    .sb-step-status-overlay.noemail { background:rgba(var(--gb-warn-rgb,245,158,11),.12) !important; color:var(--gb-warn,#f59e0b) !important; }
    .sb-condition-anim {
      padding:5px 9px !important; margin:3px 0 !important; border-radius:6px !important;
      background:rgba(255,255,255,.025) !important; font-size:10.5px !important;
      display:flex !important; align-items:center !important; gap:6px !important;
      animation:__gbSbSlide .18s ease !important;
    }
    .sb-condition-anim.pass { color:var(--gb-brand-label,#7db82a) !important; }
    .sb-condition-anim.fail { color:var(--gb-error,#c86060) !important; }
    .sb-condition-anim .dot { width:5px !important; height:5px !important; border-radius:50% !important; flex-shrink:0 !important; }
    .sb-condition-anim.pass .dot { background:var(--gb-brand-label,#7db82a) !important; opacity:.7 !important; }
    .sb-condition-anim.fail .dot { background:var(--gb-error,#c86060) !important; opacity:.7 !important; }

    /* ── Legacy sandbox panel styles (keeping for backwards compat) ────────────── */
    #btn_ce_test {
      background:var(--gb-surface-elevated,#171717) !important;
      border:1px solid var(--gb-border-standard,#333) !important; border-radius:7px !important;
      color:var(--gb-text-secondary,#ccc) !important; cursor:pointer !important;
      padding:5px 12px !important; font-size:11.5px !important; font-weight:600 !important;
      font-family:inherit !important; align-items:center !important; gap:6px !important;
      transition:all .15s !important; white-space:nowrap !important; display:none !important;
    }
    #btn_ce_test:hover { border-color:rgba(125,184,42,.4) !important; color:rgba(125,184,42,.85) !important; }
    #btn_ce_test.active {
      background:rgba(125,184,42,.1) !important; border-color:rgba(125,184,42,.45) !important;
      color:rgba(125,184,42,.9) !important;
    }

    /* ── Sandbox floating card - HIDDEN (replaced by modal + inline animation) ── */
    #__gb-sb-card {
      display:none !important;
    }
    #__gb-sb-hdr {
      padding:11px 14px !important; display:flex !important; align-items:center !important;
      justify-content:space-between !important; flex-shrink:0 !important;
      border-bottom:1px solid var(--gb-border-subtle,#1c1c1c) !important;
      background:var(--gb-surface-deep,#0d0d0d) !important;
      border-radius:13px 13px 0 0 !important;
    }
    #__gb-sb-hdr-title { font-size:12px !important; font-weight:700 !important; color:var(--gb-text-primary,#fff) !important; }
    #__gb-sb-hdr-sub { font-size:10.5px !important; color:var(--gb-text-faint,#666) !important; margin-top:1px !important; }
    #btn_sb_close {
      background:none !important; border:1px solid var(--gb-border-standard,#333) !important;
      border-radius:5px !important; color:var(--gb-text-muted,#888) !important;
      cursor:pointer !important; padding:3px 8px !important; font-size:11px !important;
      font-weight:600 !important; font-family:inherit !important; flex-shrink:0 !important;
      transition:all .12s !important;
    }
    #btn_sb_close:hover { color:var(--gb-text-primary,#fff) !important; border-color:var(--gb-border-strong,#444) !important; }

    /* Input area */
    #__gb-sb-inputs {
      padding:12px 14px !important; display:flex !important; flex-direction:column !important;
      gap:8px !important; flex-shrink:0 !important;
      border-bottom:1px solid var(--gb-border-subtle,#1c1c1c) !important;
    }
    .sb-tabs { display:flex !important; gap:3px !important; background:var(--gb-surface-void,#0a0a0a) !important; border-radius:7px !important; padding:3px !important; }
    .sb-tab-btn {
      flex:1 !important; height:27px !important; border:none !important; border-radius:5px !important;
      background:none !important; color:var(--gb-text-ghost,#555) !important;
      font-size:11px !important; font-weight:600 !important; cursor:pointer !important;
      font-family:inherit !important; transition:all .13s !important;
    }
    .sb-tab-btn.active { background:var(--gb-surface-raised,#1a1a1a) !important; color:var(--gb-text-secondary,#ccc) !important; }
    .sb-tab-panel { display:flex !important; flex-direction:column !important; gap:5px !important; }
    #sb-url-in {
      background:var(--gb-surface-void,#0a0a0a) !important;
      border:1px solid var(--gb-border-standard,#333) !important;
      border-radius:7px !important; color:var(--gb-text-primary,#fff) !important;
      font-size:11.5px !important; padding:8px 11px !important;
      font-family:inherit !important; outline:none !important; width:100% !important; box-sizing:border-box !important;
    }
    #sb-url-in:focus { border-color:rgba(125,184,42,.45) !important; }
    #sb-url-in::placeholder { color:var(--gb-text-faint,#666) !important; font-size:11px !important; }
    #sb-file-drop {
      display:flex !important; align-items:center !important; gap:10px !important;
      padding:12px !important; border:1.5px dashed var(--gb-border-standard,#333) !important;
      border-radius:8px !important; cursor:pointer !important; transition:all .13s !important;
    }
    #sb-file-drop:hover, #sb-file-drop.over { border-color:rgba(125,184,42,.4) !important; background:rgba(125,184,42,.04) !important; }
    #sb-file-name { font-size:11px !important; color:var(--gb-text-ghost,#555) !important; flex:1 !important; }
    #sb-file-name.loaded { color:var(--gb-text-secondary,#ccc) !important; }
    #btn_sb_run {
      height:34px !important; border:1px solid rgba(125,184,42,.35) !important;
      border-radius:7px !important; background:rgba(125,184,42,.1) !important;
      color:rgba(125,184,42,.9) !important; font-size:12px !important; font-weight:700 !important;
      cursor:pointer !important; font-family:inherit !important;
      display:flex !important; align-items:center !important; justify-content:center !important; gap:6px !important;
      transition:all .13s !important;
    }
    #btn_sb_run:hover { background:rgba(125,184,42,.18) !important; }
    #btn_sb_run:disabled { opacity:.4 !important; cursor:not-allowed !important; }
    #sb-run-status { font-size:10.5px !important; color:var(--gb-text-muted,#888) !important; min-height:14px !important; }

    /* Results area */
    #__gb-sb-results {
      flex:1 !important; overflow-y:auto !important;
      padding:10px 12px !important; display:flex !important; flex-direction:column !important; gap:6px !important;
    }
    .sb-step-card {
      border-radius:8px !important; overflow:hidden !important;
      border:1px solid var(--gb-border-subtle,#1c1c1c) !important;
    }
    .sb-step-card[data-status="fired"]   { border-color:rgba(125,184,42,.4) !important; }
    .sb-step-card[data-status="skipped"] { border-color:rgba(220,80,80,.25) !important; }
    .sb-step-card[data-status="locked"]  { opacity:.5 !important; }
    .sb-step-card[data-status="noemail"] { border-color:rgba(245,158,11,.3) !important; }
    .sb-step-hdr {
      padding:8px 11px !important; display:flex !important; align-items:center !important; gap:8px !important;
      background:var(--gb-surface-mid,#141414) !important; cursor:pointer !important;
    }
    .sb-status-dot { width:7px !important; height:7px !important; border-radius:50% !important; flex-shrink:0 !important; }
    [data-status="fired"]   .sb-status-dot { background:rgba(125,184,42,.8) !important; }
    [data-status="skipped"] .sb-status-dot { background:rgba(220,80,80,.7) !important; }
    [data-status="locked"]  .sb-status-dot { background:var(--gb-border-strong,#444) !important; }
    [data-status="noemail"] .sb-status-dot { background:rgba(245,158,11,.7) !important; }
    .sb-step-lbl { flex:1 !important; font-size:11.5px !important; font-weight:600 !important; color:var(--gb-text-primary,#fff) !important; }
    .sb-step-badge {
      font-size:9.5px !important; font-weight:800 !important; padding:2px 7px !important;
      border-radius:20px !important; text-transform:uppercase !important; letter-spacing:.5px !important;
    }
    [data-status="fired"]   .sb-step-badge { background:rgba(125,184,42,.15) !important; color:rgba(125,184,42,.9) !important; }
    [data-status="skipped"] .sb-step-badge { background:rgba(220,80,80,.1)  !important; color:rgba(220,80,80,.8)  !important; }
    [data-status="locked"]  .sb-step-badge { background:var(--gb-surface-float,#222) !important; color:var(--gb-text-ghost,#555) !important; }
    [data-status="noemail"] .sb-step-badge { background:rgba(245,158,11,.1) !important; color:rgba(245,158,11,.8) !important; }
    .sb-step-body { padding:8px 11px !important; display:flex !important; flex-direction:column !important; gap:4px !important; }
    .sb-cond-row { display:flex !important; align-items:center !important; gap:6px !important; }
    .sb-cond-dot { width:5px !important; height:5px !important; border-radius:50% !important; flex-shrink:0 !important; }
    .sb-cond-row.pass .sb-cond-dot { background:rgba(125,184,42,.7) !important; }
    .sb-cond-row.fail .sb-cond-dot { background:rgba(220,80,80,.7) !important; }
    .sb-cond-row span { font-size:10.5px !important; color:var(--gb-text-ghost,#555) !important; }
    .sb-cond-row.pass span { color:rgba(125,184,42,.7) !important; }
    .sb-cond-row.fail span { color:rgba(220,80,80,.65) !important; }
    .sb-email-row {
      display:flex !important; align-items:center !important; gap:7px !important;
      padding:5px 8px !important; border-radius:6px !important;
      background:var(--gb-surface-deep,#0d0d0d) !important;
      border:1px solid var(--gb-border-subtle,#1c1c1c) !important; margin-top:2px !important;
    }
    .sb-email-row.will-send { background:rgba(125,184,42,.07) !important; border-color:rgba(125,184,42,.3) !important; }
    .sb-email-row.will-skip { opacity:.42 !important; }
    .sb-email-lbl { flex:1 !important; font-size:11px !important; font-weight:600 !important; color:var(--gb-text-muted,#888) !important; }
    .sb-email-row.will-send .sb-email-lbl { color:rgba(125,184,42,.85) !important; }
    .sb-email-why { font-size:10px !important; color:var(--gb-text-faint,#666) !important; }
    .sb-preview-btn {
      flex-shrink:0 !important; height:22px !important; padding:0 8px !important;
      background:rgba(125,184,42,.1) !important; border:1px solid rgba(125,184,42,.3) !important;
      border-radius:5px !important; color:rgba(125,184,42,.85) !important;
      font-size:10px !important; font-weight:700 !important; cursor:pointer !important;
      font-family:inherit !important; transition:background .1s !important;
    }
    .sb-preview-btn:hover { background:rgba(125,184,42,.2) !important; }
    .sb-task-row { font-size:10.5px !important; display:flex !important; align-items:center !important; gap:5px !important; padding:1px 0 !important; }
    .sb-task-row.run  { color:rgba(125,184,42,.65) !important; }
    .sb-task-row.skip { color:var(--gb-text-faint,#666) !important; }
    .sb-summary {
      padding:8px 11px !important; border-radius:7px !important; font-size:11.5px !important;
      display:flex !important; align-items:center !important; gap:7px !important;
    }
    .sb-summary.has-send { background:rgba(125,184,42,.08) !important; border:1px solid rgba(125,184,42,.2) !important; color:rgba(125,184,42,.85) !important; }
    .sb-summary.no-send  { background:var(--gb-surface-mid,#141414) !important; border:1px solid var(--gb-border-subtle,#1c1c1c) !important; color:var(--gb-text-muted,#888) !important; }

    /* Email preview panel inside the sandbox card */
    #sb-preview-wrap {
      flex-shrink:0 !important; border-top:1px solid var(--gb-border-subtle,#1c1c1c) !important;
      background:var(--gb-surface-deep,#0d0d0d) !important; max-height:240px !important;
      display:flex !important; flex-direction:column !important; overflow:hidden !important;
    }
    #sb-preview-header {
      padding:7px 12px !important; border-bottom:1px solid var(--gb-border-subtle,#1c1c1c) !important;
      display:flex !important; align-items:center !important; justify-content:space-between !important; flex-shrink:0 !important;
    }
    #sb-preview-header span { font-size:11px !important; font-weight:700 !important; color:var(--gb-text-secondary,#ccc) !important; }
    #sb-preview-header button { background:none !important; border:none !important; color:var(--gb-text-muted,#888) !important; cursor:pointer !important; font-size:14px !important; line-height:1 !important; }
    #sb-preview-fields { padding:6px 12px !important; border-bottom:1px solid var(--gb-border-subtle,#1c1c1c) !important; flex-shrink:0 !important; }
    .sb-pf { display:flex !important; gap:8px !important; font-size:11px !important; padding:1px 0 !important; }
    .sb-pf-k { color:var(--gb-text-muted,#888) !important; min-width:46px !important; flex-shrink:0 !important; }
    .sb-pf-v { color:var(--gb-text-secondary,#ccc) !important; word-break:break-all !important; }
    #sb-preview-body { padding:10px 12px !important; overflow-y:auto !important; font-size:12px !important; color:var(--gb-text-secondary,#ccc) !important; line-height:1.6 !important; flex:1 !important; }

    /* sandbox panel CSS removed — now a floating popup */

    /* ── Inline test mode ──────────────────────────────────────────────────── */
    #ce-test-bar {
      display:flex !important; align-items:center !important; gap:8px !important;
      padding:10px 16px !important;
      border-bottom:1px solid var(--gb-border-subtle,#1c1c1c) !important;
      background:rgba(125,184,42,.04) !important; flex-shrink:0 !important;
    }
    #ce-test-bar input {
      flex:1 !important; background:var(--gb-surface-void,#0a0a0a) !important;
      border:1px solid var(--gb-border-standard,#333) !important;
      border-radius:7px !important; color:var(--gb-text-primary,#fff) !important;
      font-size:11.5px !important; padding:7px 11px !important;
      font-family:inherit !important; outline:none !important;
    }
    #ce-test-bar input:focus { border-color:rgba(125,184,42,.45) !important; }
    #ce-test-bar input::placeholder { color:var(--gb-text-faint,#666) !important; font-size:11px !important; }
    .ce-test-btn {
      height:32px !important; padding:0 13px !important; border-radius:7px !important;
      border:1px solid var(--gb-border-standard,#333) !important;
      background:var(--gb-surface-elevated,#171717) !important;
      color:var(--gb-text-secondary,#ccc) !important; font-size:11.5px !important;
      font-weight:600 !important; cursor:pointer !important; font-family:inherit !important;
      white-space:nowrap !important; transition:all .12s !important;
    }
    .ce-test-btn:hover { border-color:rgba(255,255,255,.25) !important; color:#fff !important; }
    .ce-test-btn.primary {
      background:rgba(125,184,42,.12) !important; border-color:rgba(125,184,42,.35) !important;
      color:rgba(125,184,42,.9) !important;
    }
    .ce-test-btn.primary:hover { background:rgba(125,184,42,.22) !important; }
    .ce-test-btn:disabled { opacity:.4 !important; cursor:not-allowed !important; }
    #ce-test-file { display:none !important; }
    #ce-test-status {
      font-size:10.5px !important; color:var(--gb-text-muted,#888) !important;
      white-space:nowrap !important; flex-shrink:0 !important;
    }

    /* Step card test result overlays */
    .ce-step[data-sb] { position:relative !important; }
    .ce-step[data-sb="fired"]   { border-color:rgba(125,184,42,.45) !important; box-shadow:0 0 0 1px rgba(125,184,42,.12) inset !important; }
    .ce-step[data-sb="skipped"] { border-color:rgba(220,80,80,.3) !important; }
    .ce-step[data-sb="locked"]  { opacity:.5 !important; }
    .ce-step[data-sb="noemail"] { border-color:rgba(245,158,11,.35) !important; }

    .ce-sb-badge {
      display:inline-flex !important; align-items:center !important; gap:5px !important;
      padding:2px 8px !important; border-radius:20px !important;
      font-size:10px !important; font-weight:800 !important;
      text-transform:uppercase !important; letter-spacing:.5px !important; flex-shrink:0 !important;
    }
    .ce-sb-badge.fired   { background:rgba(125,184,42,.15) !important; color:rgba(125,184,42,.9) !important; }
    .ce-sb-badge.skipped { background:rgba(220,80,80,.1)  !important; color:rgba(220,80,80,.8)  !important; }
    .ce-sb-badge.locked  { background:var(--gb-surface-float,#222) !important; color:var(--gb-text-ghost,#555) !important; }
    .ce-sb-badge.noemail { background:rgba(245,158,11,.1) !important; color:rgba(245,158,11,.8) !important; }

    .ce-sb-cond { display:flex !important; align-items:center !important; gap:6px !important; font-size:10.5px !important; padding:2px 0 !important; }
    .ce-sb-cond-dot { width:5px !important; height:5px !important; border-radius:50% !important; flex-shrink:0 !important; }
    .ce-sb-cond.pass .ce-sb-cond-dot { background:rgba(125,184,42,.7) !important; }
    .ce-sb-cond.fail .ce-sb-cond-dot { background:rgba(220,80,80,.7) !important; }
    .ce-sb-cond.pass span { color:rgba(125,184,42,.7) !important; }
    .ce-sb-cond.fail span { color:rgba(220,80,80,.65) !important; }
    .ce-sb-cond span { color:var(--gb-text-ghost,#555) !important; }

    .ce-sb-email-result {
      display:flex !important; align-items:center !important; gap:8px !important;
      padding:5px 8px !important; border-radius:6px !important; margin-top:3px !important;
      border:1px solid var(--gb-border-subtle,#1c1c1c) !important;
      background:var(--gb-surface-deep,#0d0d0d) !important;
    }
    .ce-sb-email-result.would-send {
      background:rgba(125,184,42,.07) !important;
      border-color:rgba(125,184,42,.3) !important;
    }
    .ce-sb-email-result.would-skip { opacity:.45 !important; }
    .ce-sb-email-lbl { flex:1 !important; font-size:11px !important; font-weight:600 !important; color:var(--gb-text-muted,#888) !important; }
    .ce-sb-email-result.would-send .ce-sb-email-lbl { color:rgba(125,184,42,.85) !important; }
    .ce-sb-email-reason { font-size:10px !important; color:var(--gb-text-faint,#666) !important; }

    .ce-sb-preview-btn {
      flex-shrink:0 !important; height:22px !important; padding:0 8px !important;
      background:rgba(125,184,42,.1) !important; border:1px solid rgba(125,184,42,.3) !important;
      border-radius:5px !important; color:rgba(125,184,42,.85) !important;
      font-size:10px !important; font-weight:700 !important; cursor:pointer !important;
      font-family:inherit !important; transition:background .1s !important;
    }
    .ce-sb-preview-btn:hover { background:rgba(125,184,42,.2) !important; }

    .ce-sb-task { font-size:10.5px !important; display:flex !important; align-items:center !important; gap:5px !important; padding:2px 0 !important; }
    .ce-sb-task.run  { color:rgba(125,184,42,.65) !important; }
    .ce-sb-task.skip { color:var(--gb-text-faint,#666) !important; }

    /* Email preview panel at bottom of editor */
    #ce-sb-preview-panel {
      flex-shrink:0 !important; border-top:1px solid var(--gb-border-subtle,#1c1c1c) !important;
      background:var(--gb-surface-deep,#0d0d0d) !important; max-height:280px !important;
      display:flex !important; flex-direction:column !important; overflow:hidden !important;
      animation:__gbCeUp .18s ease !important;
    }
    #ce-sb-preview-hdr {
      padding:8px 16px !important; border-bottom:1px solid var(--gb-border-subtle,#1c1c1c) !important;
      display:flex !important; align-items:center !important; justify-content:space-between !important;
      flex-shrink:0 !important;
    }
    #ce-sb-preview-hdr span { font-size:12px !important; font-weight:700 !important; color:var(--gb-text-secondary,#ccc) !important; }
    #ce-sb-preview-hdr button { background:none !important; border:none !important; color:var(--gb-text-muted,#888) !important; cursor:pointer !important; font-size:13px !important; }
    #ce-sb-preview-meta { padding:6px 16px !important; border-bottom:1px solid var(--gb-border-subtle,#1c1c1c) !important; display:flex !important; flex-direction:column !important; gap:2px !important; flex-shrink:0 !important; }
    .ce-sb-pf { display:flex !important; gap:10px !important; font-size:11px !important; }
    .ce-sb-pf-lbl { color:var(--gb-text-muted,#888) !important; min-width:48px !important; }
    .ce-sb-pf-val { color:var(--gb-text-secondary,#ccc) !important; word-break:break-all !important; }
    #ce-sb-preview-body { padding:12px 16px !important; overflow-y:auto !important; font-size:12.5px !important; color:var(--gb-text-secondary,#ccc) !important; line-height:1.6 !important; flex:1 !important; }

    /* Run mode toggle */
    .ce-run-mode-row { display:flex !important; align-items:center !important; justify-content:space-between !important; gap:14px !important; }
    .ce-toggle { display:flex !important; align-items:center !important; gap:9px !important; cursor:pointer !important; flex-shrink:0 !important; user-select:none !important; }
    .ce-toggle input[type=checkbox] { position:absolute !important; opacity:0 !important; width:0 !important; height:0 !important; pointer-events:none !important; }
    .ce-toggle-track {
      width:42px !important; height:24px !important; border-radius:12px !important; flex-shrink:0 !important;
      background:rgba(255,255,255,.1) !important; border:1px solid rgba(255,255,255,.12) !important;
      position:relative !important; transition:background .22s,border-color .22s !important;
    }
    .ce-toggle input:checked + .ce-toggle-track {
      background:var(--gb-brand-label,#7db82a) !important; border-color:var(--gb-brand-label,#7db82a) !important;
    }
    .ce-toggle-thumb {
      position:absolute !important; top:2px !important; left:2px !important;
      width:18px !important; height:18px !important; border-radius:50% !important;
      background:#fff !important; box-shadow:0 1px 4px rgba(0,0,0,.4) !important;
      transition:transform .22s cubic-bezier(.34,1.4,.64,1) !important;
    }
    .ce-toggle input:checked + .ce-toggle-track .ce-toggle-thumb { transform:translateX(18px) !important; }
    .ce-toggle-lbl { font-size:12px !important; font-weight:600 !important; color:rgba(255,255,255,.45) !important; white-space:nowrap !important; transition:color .18s !important; min-width:100px !important; }
    .ce-toggle input:checked ~ .ce-toggle-lbl { color:var(--gb-brand-label,#7db82a) !important; }

    .ce-add-branch-step {
      height:32px !important; padding:0 12px !important; border-radius:7px !important; align-self:flex-start !important;
      border:1px dashed rgba(245,158,11,.3) !important; background:none !important;
      color:rgba(245,158,11,.6) !important; font-size:12px !important; font-weight:500 !important; cursor:pointer !important;
      transition:all .12s !important; font-family:inherit !important;
    }
    .ce-add-branch-step:hover { border-color:rgba(245,158,11,.6) !important; color:rgba(245,158,11,.9) !important; }

    /* Branch section grouping */
    .ce-branch-section { display:flex !important; flex-direction:column !important; gap:6px !important; }
    .ce-branch-section-hdr {
      display:flex !important; align-items:center !important; gap:7px !important;
      font-size:11px !important; font-weight:700 !important; color:rgba(255,255,255,.4) !important;
      text-transform:uppercase !important; letter-spacing:.6px !important; padding:0 2px !important;
    }
    .ce-branch-section-hdr svg { color:rgba(255,255,255,.3) !important; flex-shrink:0 !important; }
    .ce-branch-section-pill {
      font-size:10px !important; font-weight:600 !important; letter-spacing:0 !important; text-transform:none !important;
      background:rgba(255,255,255,.06) !important; border:1px solid rgba(255,255,255,.1) !important;
      color:rgba(255,255,255,.35) !important; padding:2px 8px !important; border-radius:20px !important;
    }
    .ce-branch-email-list { display:flex !important; flex-direction:column !important; gap:6px !important; }
    .ce-branch-email-card {
      border:1px solid rgba(255,255,255,.08) !important; border-radius:8px !important;
      background:rgba(0,0,0,.18) !important; overflow:hidden !important;
    }
    .ce-branch-email-hdr {
      display:flex !important; align-items:center !important; gap:8px !important;
      padding:8px 12px !important; background:rgba(255,255,255,.04) !important;
      border-bottom:1px solid rgba(255,255,255,.06) !important;
    }
    .ce-branch-email-num {
      font-size:11px !important; font-weight:800 !important; color:rgba(255,255,255,.5) !important;
      flex-shrink:0 !important; text-transform:uppercase !important; letter-spacing:.5px !important;
    }
    .ce-branch-email-rule {
      flex:1 !important; font-size:11px !important; color:rgba(255,255,255,.28) !important;
      font-style:italic !important; min-width:0 !important; overflow:hidden !important;
      text-overflow:ellipsis !important; white-space:nowrap !important;
    }
    .ce-branch-email-body { padding:12px !important; display:flex !important; flex-direction:column !important; gap:12px !important; }
    .ce-branch-task-list { display:flex !important; flex-direction:column !important; gap:4px !important; }
    .ce-branch-task-card {
      border:1px solid rgba(255,255,255,.06) !important; border-radius:7px !important;
      background:rgba(0,0,0,.12) !important; overflow:hidden !important;
    }
    .ce-branch-task-hdr {
      display:flex !important; align-items:center !important; gap:8px !important;
      padding:7px 10px !important;
    }
    .ce-branch-task-gate {
      display:block !important; font-size:10.5px !important; color:rgba(245,158,11,.6) !important;
      font-weight:600 !important;
    }
    .ce-branch-task-gate strong { color:rgba(245,158,11,.9) !important; }

    /* Step group — mutual exclusion badge */
    .ce-step-group-row { display:flex !important; align-items:center !important; gap:8px !important; }
    .ce-step-group-badge {
      display:inline-flex !important; align-items:center !important; gap:5px !important;
      padding:3px 9px !important; border-radius:20px !important; font-size:11px !important; font-weight:700 !important;
      background:rgba(245,158,11,.12) !important; border:1px solid rgba(245,158,11,.3) !important;
      color:rgba(245,158,11,.9) !important; white-space:nowrap !important;
    }
    .ce-step-group-badge svg { width:10px !important; height:10px !important; flex-shrink:0 !important; }
    .ce-group-hint { font-size:10.5px !important; color:rgba(255,255,255,.28) !important; }

    /* Brand clear button */
    .ce-brand-clear {
      font-size:10.5px !important; color:rgba(255,255,255,.28) !important; cursor:pointer !important;
      border:none !important; background:none !important; font-family:inherit !important; padding:0 !important; transition:color .12s !important;
    }
    .ce-brand-clear:hover { color:rgba(255,255,255,.6) !important; }

    /* Add step */
    #ce-add-step {
      height:40px !important; border-radius:8px !important; width:100% !important;
      border:1px dashed rgba(255,255,255,.12) !important; background:none !important;
      color:rgba(255,255,255,.35) !important; font-size:12.5px !important; font-weight:500 !important; cursor:pointer !important;
      display:flex !important; align-items:center !important; justify-content:center !important; gap:7px !important;
      transition:all .12s !important; font-family:inherit !important;
    }
    #ce-add-step:hover { border-color:rgba(255,255,255,.28) !important; color:rgba(255,255,255,.7) !important; background:rgba(255,255,255,.02) !important; }

    /* Footer */
    #__gb-ce-footer {
      padding:14px 20px !important; background:rgba(0,0,0,.3) !important;
      border-top:1px solid rgba(255,255,255,.06) !important;
      display:flex !important; justify-content:flex-end !important; gap:12px !important;
      box-sizing:border-box !important; flex-shrink:0 !important;
    }
    .gb-btn-primary-send {
      background:var(--gb-brand-dark,#5f7d18) !important; color:var(--gb-brand-text,#d8eeaa) !important;
      border:1px solid rgba(var(--gb-brand-label-rgb,125,184,42),.4) !important;
      padding:0 20px !important; height:38px !important; border-radius:8px !important; font-size:13px !important; font-weight:700 !important;
      cursor:pointer !important; transition:all .2s !important;
      display:flex !important; align-items:center !important; gap:8px !important; font-family:inherit !important; min-height:40px !important;
    }
    .gb-btn-primary-send:hover { background:var(--gb-brand,#6e901d) !important; border-color:var(--gb-brand-label,#7db82a) !important; color:#fff !important; }
    .gb-btn-secondary {
      background:rgba(255,255,255,.05) !important; color:rgba(255,255,255,.7) !important;
      border:1px solid rgba(255,255,255,.1) !important;
      padding:0 18px !important; height:38px !important; border-radius:8px !important; font-size:13px !important; font-weight:600 !important;
      cursor:pointer !important; transition:all .15s !important; font-family:inherit !important;
    }
    .gb-btn-secondary:hover { background:rgba(255,255,255,.1) !important; color:#fff !important; }
    .gb-btn-danger {
      background:rgba(200,96,96,.08) !important; color:var(--gb-error,#c86060) !important;
      border:1px solid rgba(200,96,96,.2) !important;
      padding:0 18px !important; height:38px !important; border-radius:8px !important; font-size:13px !important; font-weight:600 !important;
      cursor:pointer !important; transition:all .15s !important; font-family:inherit !important; margin-right:auto !important;
    }
    .gb-btn-danger:hover { background:rgba(200,96,96,.16) !important; border-color:rgba(200,96,96,.35) !important; }
  `;
  document.head.appendChild(st);
})();

// ── Dropdown wiring — exact copy of bindSingleDropdown from logo-extractor ────
function _ceBind(overlayEl, baseId, onPick) {
  const wrap  = overlayEl.querySelector('#wrap_' + baseId);
  const btn   = overlayEl.querySelector('#btn_' + baseId);
  const menu  = overlayEl.querySelector('#menu_' + baseId);
  const label = overlayEl.querySelector('#label_' + baseId);
  const hid   = overlayEl.querySelector('#' + baseId);
  if (!wrap || !btn || !menu || !label || !hid) return;

  const opts = menu.querySelectorAll('.gb-dropdown-option');
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = menu.classList.contains('open');
    overlayEl.querySelectorAll('.gb-dropdown-menu.open').forEach(m => m.classList.remove('open'));
    overlayEl.querySelectorAll('.gb-dropdown-btn.open').forEach(b => b.classList.remove('open'));
    if (!isOpen) { menu.classList.add('open'); btn.classList.add('open'); }
  });
  opts.forEach(opt => {
    opt.addEventListener('click', e => {
      e.stopPropagation();
      const val = opt.dataset.value;
      label.textContent = opt.querySelector('span')?.textContent || opt.textContent.trim();
      hid.value = val;
      opts.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      menu.classList.remove('open'); btn.classList.remove('open');
      if (onPick) onPick(val);
    });
  });
  document.addEventListener('click', e => {
    if (!wrap.contains(e.target)) { menu.classList.remove('open'); btn.classList.remove('open'); }
  });
}

function _ceDDHtml(baseId, opts, selVal, placeholder) {
  const selLabel = opts.find(o => o.id === selVal)?.name || placeholder;
  const optHtml  = `<div class="gb-dropdown-option${selVal===''?' selected':''}" data-value=""><span>${_ceEsc(placeholder)}</span></div>` +
    opts.map(o => `<div class="gb-dropdown-option${o.id===selVal?' selected':''}" data-value="${_ceEsc(o.id)}"><span>${_ceEsc(o.name)}</span></div>`).join('');
  return `
    <div class="gb-dropdown-wrap" id="wrap_${baseId}">
      <button type="button" class="gb-dropdown-btn" id="btn_${baseId}">
        <span class="gb-btn-label" id="label_${baseId}">${_ceEsc(selLabel)}</span>
        <svg class="gb-dropdown-chevron" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="gb-dropdown-menu" id="menu_${baseId}">${optHtml}</div>
      <input type="hidden" id="${baseId}" value="${_ceEsc(selVal)}">
    </div>`;
}

// ── Open ──────────────────────────────────────────────────────────────────────
window.__gbShowCampaignEditor = async function(onUpdateCallback, onCloseCallback) {
  if (document.getElementById('__gb-ce-overlay')) return;

  const { campaigns: saved, templates, noteTemplates } = await _ceLoadData();
  let _campaigns = JSON.parse(JSON.stringify(saved || []));
  const _eTpls   = (templates    || []).filter(t => t.type === 'account' && t.enabled !== false);
  const _tTpls   = (noteTemplates || []).filter(t => t.subType === 'task' && t.enabled !== false);
  let _activeId  = _campaigns[0]?.id ?? null;

  const overlay = document.createElement('div');
  overlay.id = '__gb-ce-overlay';
  overlay.innerHTML = `
    <div id="__gb-ce-card">
      <div id="__gb-ce-hdr">
        <div class="gb-ce-hdr-icon">
          <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
        </div>
        <div>
          <div id="__gb-ce-hdr-title">Campaign Builder</div>
          <div id="__gb-ce-hdr-sub">Multi-step sequences · A/B email splits · Brand filters · Task creation · Jitter delays</div>
        </div>

        <button type="button" id="btn_ce_close">
          <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Close
        </button>
      </div>
      <div id="__gb-ce-body">
        <div id="__gb-ce-sidebar">
          <div id="__gb-ce-sidebar-hdr">
            <span>Campaigns</span>
            <button type="button" id="btn_ce_new">+ New</button>
          </div>
          <div id="__gb-ce-list"></div>
        </div>
        <div id="__gb-ce-editor">
          <div id="__gb-ce-empty">Select a campaign or create a new one</div>
        </div>

      </div>
      <div id="__gb-ce-footer" style="display:none;">
        <button type="button" id="btn_ce_del" class="gb-btn-danger">Delete</button>
        <button type="button" id="btn_ce_cancel" class="gb-btn-secondary">Close</button>
        <button type="button" id="btn_ce_save" class="gb-btn-primary-send">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          Save Campaign
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  // ── Render helpers ──────────────────────────────────────────────────────────

  let _newStepIdx = -1;

  function renderSidebar() {
    const el = document.getElementById('__gb-ce-list'); if (!el) return;
    if (!_campaigns.length) {
      el.innerHTML = '<div style="padding:16px 12px;font-size:11.5px;color:rgba(255,255,255,.2);text-align:center;">No campaigns yet</div>';
      return;
    }
    el.innerHTML = _campaigns.map(c => {
      const n = c.steps?.length || 0;
      return `<div class="ce-list-item${c.id===_activeId?' active':''}" data-ce-id="${_ceEsc(c.id)}">
        <div>${_ceEsc(c.name||'Untitled')}</div>
        <div class="ce-list-meta">${n} step${n!==1?'s':''} · ${c.delayBase??60}s ±${c.delayTolerance??20}s</div>
      </div>`;
    }).join('');
    el.querySelectorAll('.ce-list-item').forEach(li => {
      li.addEventListener('click', () => { _activeId = li.dataset.ceId; renderAll(); });
    });
  }


    // ── Conditions renderer ──────────────────────────────────────────────────
    function renderEmailGate(step, si, allSteps) {
      // Collect subject tags from prior email steps
      const priorSteps = (allSteps || [])
        .slice(0, si)
        .filter(s => s.type === 'email' && s.subject && s.subject.trim());
      const priorTags = priorSteps.map(s => s.subject.trim());

      const skipReplied  = step.skipIfRepliedTo  || [];
      const skipSent     = step.skipIfSent        || [];
      const skipNotSent  = step.skipIfNotSent     || [];

      function checkSection(title, actionKey, activeArr) {
        if (!priorTags.length) return '';
        const rows = priorTags.map(tag => {
          const on = activeArr.includes(tag);
          return `<label class="ce-gate-check${on?' is-checked':''}">
            <input type="checkbox" data-step="${si}" data-action="${actionKey}" data-subject="${_ceEsc(tag)}"${on?' checked':''}>
            <div class="ce-gate-check-box">
              <svg class="ce-check-mark" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <span>${_ceEsc(tag)}</span>
          </label>`;
        }).join('');
        return `<div class="ce-gate-section"><div class="ce-gate-section-label">${title}</div>${rows}</div>`;
      }

      const noprior = !priorTags.length
        ? `<span class="ce-gate-empty">No prior email steps have subject tags yet — add a tag to earlier steps and it will appear here.</span>`
        : '';

      return `<div class="gb-form-group">
        <label class="gb-label">Subject tag <span class="gb-hint">— static keyword for this step's subject line</span></label>
        <div class="gb-input-wrap">
          <input type="text" class="gb-input-p" value="${_ceEsc(step.subject||'')}"
            placeholder="e.g. Srixon Promo  (non-personalized portion)"
            data-step="${si}" data-field="stepSubject"
            style="padding-right:14px !important;">
        </div>
        <span class="gb-hint">Used by later steps to gate on replies and send history. Match the static part of your subject line.</span>
        <div class="ce-gate-sections">
          ${noprior}
          ${checkSection('Skip this step if contact HAS replied to:', 'toggle-skip-replied', skipReplied)}
          ${checkSection('Skip this step if this email was already sent:', 'toggle-skip-sent', skipSent)}
          ${checkSection('Skip this step if this email has NOT been sent yet:', 'toggle-skip-not-sent', skipNotSent)}
        </div>
      </div>`;
    }

    function renderConditions(step, si, ci = -1) {
      const conds = step.conditions || [];
      const logic = step.conditionLogic || 'all';
      const pfx = ci >= 0 ? `b${si}_${ci}` : `${si}`;  // unique prefix for IDs

      const fieldOptHtml = _CE_COND_FIELDS.map(f =>
        `<div class="gb-dropdown-option${f.id==='' ? ' selected' : ''}" data-value="${f.id}"><span>${f.label}</span></div>`
      ).join('');

      const condRows = conds.map((cond, ci) => {
        const field = _CE_COND_FIELD_MAP[cond.field] || _CE_COND_FIELDS[0];
        const opOptHtml = field.ops.map(op =>
          `<div class="gb-dropdown-option${op.id===cond.op?' selected':''}" data-value="${op.id}"><span>${op.l}</span></div>`
        ).join('');
        const fieldLbl = field.label;
        const opLbl    = field.ops.find(o=>o.id===cond.op)?.l || field.ops[0]?.l || '';
        const fieldOpts = _CE_COND_FIELDS.map(f2 =>
          `<div class="gb-dropdown-option${f2.id===cond.field?' selected':''}" data-value="${f2.id}"><span>${f2.label}</span></div>`
        ).join('');

        let valHtml = '';
        if (field.vt === 'number') {
          valHtml = `<div class="ce-cond-val gb-input-wrap"><input type="number" class="gb-input-p" min="0" value="${cond.val??''}" placeholder="0" data-step="${si}" data-condci="${ci}" data-pfx="${pfx}" data-field="condVal" style="min-height:36px !important;padding:8px 10px !important;font-size:12px !important;"></div>`;
        } else if (field.vt === 'text' || field.vt === 'taskCategory') {
          valHtml = `<div class="ce-cond-val gb-input-wrap"><input type="text" class="gb-input-p" value="${_ceEsc(cond.val||'')}" placeholder="${field.vt==='taskCategory'?'e.g. Order History Special':'value'}" data-step="${si}" data-condci="${ci}" data-pfx="${pfx}" data-field="condVal" style="min-height:36px !important;padding:8px 10px !important;font-size:12px !important;"></div>`;
        } else if (field.vt === 'numbertext') {
          // Two inputs: number (left) + subject text (right)
          const parts = (cond.val||'').split('|||');
          valHtml = `<div class="ce-cond-val" style="display:flex;gap:5px;flex:2.5;">
            <input type="number" class="gb-input-p" min="1" value="${_ceEsc(parts[0]||'1')}" placeholder="count" data-step="${si}" data-condci="${ci}" data-pfx="${pfx}" data-field="condValN" style="width:55px;flex-shrink:0;min-height:36px !important;padding:8px 6px !important;text-align:center;font-size:12px !important;">
            <input type="text" class="gb-input-p" value="${_ceEsc(parts[1]||'')}" placeholder="subject text" data-step="${si}" data-condci="${ci}" data-pfx="${pfx}" data-field="condValT" style="flex:1;min-height:36px !important;padding:8px 10px !important;font-size:12px !important;">
          </div>`;
        } else if (field.vt === 'brand') {
          const brandOpts = _CE_BRANDS.map(b =>
            `<div class="gb-dropdown-option${b===cond.val?' selected':''}" data-value="${_ceEsc(b)}"><span>${_ceEsc(b)}</span></div>`
          ).join('');
          valHtml = `<div class="ce-cond-val gb-dropdown-wrap" id="wrap_ce_cv_${pfx}_${ci}">
            <button type="button" class="gb-dropdown-btn" id="btn_ce_cv_${pfx}_${ci}" style="min-height:36px !important;">
              <span class="gb-btn-label" id="label_ce_cv_${pfx}_${ci}">${_ceEsc(cond.val||'Pick brand...')}</span>
              <svg class="gb-dropdown-chevron" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="gb-dropdown-menu" id="menu_ce_cv_${pfx}_${ci}">${brandOpts}</div>
            <input type="hidden" id="ce_cv_${pfx}_${ci}" value="${_ceEsc(cond.val||'')}">
          </div>`;
        } else {
          valHtml = '<div class="ce-cond-val" style="flex:1.5;"></div>';
        }

        return `<div class="ce-cond-row" data-ci="${ci}">
          <div class="ce-cond-field gb-dropdown-wrap" id="wrap_ce_cf_${pfx}_${ci}">
            <button type="button" class="gb-dropdown-btn" id="btn_ce_cf_${pfx}_${ci}" style="min-height:36px !important;">
              <span class="gb-btn-label" id="label_ce_cf_${pfx}_${ci}">${_ceEsc(fieldLbl)}</span>
              <svg class="gb-dropdown-chevron" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="gb-dropdown-menu" id="menu_ce_cf_${pfx}_${ci}">${fieldOpts}</div>
            <input type="hidden" id="ce_cf_${pfx}_${ci}" value="${_ceEsc(cond.field||'')}">
          </div>
          <div class="ce-cond-op gb-dropdown-wrap" id="wrap_ce_co_${pfx}_${ci}">
            <button type="button" class="gb-dropdown-btn" id="btn_ce_co_${pfx}_${ci}" style="min-height:36px !important;">
              <span class="gb-btn-label" id="label_ce_co_${pfx}_${ci}">${_ceEsc(opLbl)}</span>
              <svg class="gb-dropdown-chevron" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="gb-dropdown-menu" id="menu_ce_co_${pfx}_${ci}">${opOptHtml}</div>
            <input type="hidden" id="ce_co_${pfx}_${ci}" value="${_ceEsc(cond.op||field.ops[0]?.id||'')}">
          </div>
          ${valHtml}
          <button type="button" class="ce-cond-del" data-step="${si}" data-condci="${ci}" data-pfx="${pfx}" data-action="del-cond">
            <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>${field.hint ? `<div class="gb-hint" style="margin-bottom:4px;">${field.hint}</div>` : ''}`;
      }).join('');

      return `<div class="gb-form-group">
        <label class="gb-label">Run conditions <span class="gb-hint">— step is skipped if not met</span></label>
        ${conds.length > 1 ? `<div class="ce-cond-logic">
          <span>Match</span>
          <button type="button" class="gb-tag${logic==='all'?' active':''}" data-step="${si}" data-pfx="${pfx}" data-action="set-logic-all" style="padding:4px 10px;height:auto;">ALL rules</button>
          <button type="button" class="gb-tag${logic==='any'?' active':''}" data-step="${si}" data-pfx="${pfx}" data-action="set-logic-any" style="padding:4px 10px;height:auto;">ANY rule</button>
        </div>` : ''}
        <div class="ce-conditions">
          ${condRows || '<div class="ce-cond-empty">No conditions — step always runs</div>'}
        </div>
        <button type="button" class="ce-add-cond" data-step="${si}" data-pfx="${pfx}" data-action="add-cond">+ Add condition</button>
      </div>`;
    }

  // ── Render child steps inside a branch ─────────────────────────────────────
  function renderBranchChildren(branch, si) {
    const children = branch.steps || [];
    const emailChildren  = children.map((c,i) => ({c,i})).filter(({c}) => c.type === 'email');
    const taskChildren   = children.map((c,i) => ({c,i})).filter(({c}) => c.type !== 'email');

    const typeOpts = [
      {id:'email',name:'Send Email'},{id:'complete_task',name:'Complete Task'},
      {id:'create_task',name:'Create Task'},{id:'delay',name:'Wait / Delay'},
    ];

    function emailCard({c: child, i: ci}) {
      const splits = child.splits?.length ? child.splits : [{templateId:'',pct:100}];
      const total  = splits.reduce((s,sp) => s+(sp.pct||0), 0);
      const warn   = total !== 100 ? `<div class="ce-pct-warn">⚠ Splits add to ${total}%</div>` : '';
      const splitRows = splits.map((sp,xi) => `
        <div class="ce-split-row">
          <input type="number" class="gb-input-p" min="1" max="100" value="${sp.pct??100}"
            data-step="${si}" data-ci="${ci}" data-split="${xi}" data-field="bpct"
            style="width:54px!important;flex-shrink:0!important;padding:8px 4px!important;text-align:center!important;min-height:36px!important;">
          <span class="ce-pct-unit">%</span>
          <div style="flex:1;">${_ceDDHtml(`ce_bsplit_${si}_${ci}_${xi}`, _eTpls, sp.templateId||'', 'Select template...')}</div>
          <button type="button" class="gb-dyn-delete" data-step="${si}" data-ci="${ci}" data-split="${xi}" data-action="del-bsplit">
            <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>`).join('');
      const conds = child.conditions || [];
      const condSummary = conds.map(c => {
        const n = (c.val||'').split('|||')[0];
        const labels = { eq:`= ${n} sent`, gt:`≥ ${n} sent`, lt:`≤ ${n} sent` };
        if(c.field==='sentSubjectCount') return labels[c.op]||c.op;
        if(c.field==='repliedToSubject') return c.op==='not'?'not replied':'replied';
        return c.field;
      }).join(' · ');
      return `<div class="ce-branch-email-card">
        <div class="ce-branch-email-hdr">
          <div class="ce-branch-email-num">Email ${emailChildren.indexOf(emailChildren.find(x=>x.i===ci))+1}</div>
          <div class="ce-branch-email-rule">${condSummary || 'no conditions'}</div>
          <button type="button" class="gb-dyn-delete" data-step="${si}" data-ci="${ci}" data-action="del-bstep">
            <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="ce-branch-email-body">
          <div class="gb-form-group">
            <label class="gb-label">Template splits</label>
            <div class="ce-splits">${splitRows}${warn}</div>
            <button type="button" class="ce-add-split" data-step="${si}" data-ci="${ci}" data-action="add-bsplit">+ Add split</button>
          </div>
          <div class="gb-form-group">
            <label class="gb-label">Reply mode</label>
            <div class="gb-tags-wrap">
              <button type="button" class="gb-tag${child.replyMode!=='reply'?' active':''}" data-step="${si}" data-ci="${ci}" data-action="set-bstandalone">Standalone</button>
              <button type="button" class="gb-tag${child.replyMode==='reply'?' active':''}" data-step="${si}" data-ci="${ci}" data-action="set-breply">Reply to thread</button>
            </div>
          </div>
          <div class="gb-form-group">
            <label class="gb-label">Subject tag</label>
            <div class="gb-input-wrap"><input type="text" class="gb-input-p" value="${_ceEsc(child.subject||'')}" placeholder="e.g. Srixon Promo E1" data-step="${si}" data-ci="${ci}" data-field="bsubject" style="padding-right:14px!important;"></div>
          </div>
          ${renderConditions(child, si, ci)}
        </div>
      </div>`;
    }

    function taskCard({c: child, i: ci}) {
      const emailSubjects = (branch.steps||[])
        .filter(s => s.type==='email' && s.subject)
        .map(s => s.subject.trim());
      const gateTag = child.skipIfNotSent?.[0] || '';
      const gateLabel = gateTag
        ? `<span class="ce-branch-task-gate">fires after: <strong>${_ceEsc(gateTag)}</strong></span>`
        : `<span class="ce-branch-task-gate" style="color:rgba(255,255,255,.2);">fires after: any email</span>`;

      let body = gateLabel;
      if (child.type === 'complete_task') {
        body += `<div class="ce-step-info" style="font-size:12px;color:rgba(255,255,255,.4);margin-top:6px;">Marks the source task complete.</div>`;
      } else if (child.type === 'create_task') {
        // Gate selector — pick which email subject unlocks this task
        const gateOpts = [
          {id:'', name:'Any email (no gate)'},
          ...emailSubjects.map(s => ({id:s, name:s})),
        ];
        body += `
          <div class="gb-form-group" style="margin:8px 0 0;">
            <label class="gb-label">Fires after which email</label>
            ${_ceDDHtml(`ce_bgate_${si}_${ci}`, gateOpts, gateTag, 'Any email...')}
          </div>
          <div class="gb-form-group" style="margin:6px 0 0;">
            <label class="gb-label">Task template</label>
            ${_ceDDHtml(`ce_bntpl_${si}_${ci}`, _tTpls, child.noteTemplateId||'', 'Select task template...')}
          </div>`;
      } else if (child.type === 'delay') {
        body += `<div class="gb-grid-2" style="margin:8px 0 0;">
          <div class="gb-form-group"><label class="gb-label">Base sec</label>
            <div class="gb-input-wrap"><input type="number" class="gb-input-p" min="5" max="600" step="5" value="${child.delayBase??60}" data-step="${si}" data-ci="${ci}" data-field="bdelayBase" style="padding-right:14px!important;text-align:center!important;"></div>
          </div>
          <div class="gb-form-group"><label class="gb-label">Jitter ± sec</label>
            <div class="gb-input-wrap"><input type="number" class="gb-input-p" min="0" max="300" step="5" value="${child.delayTolerance??20}" data-step="${si}" data-ci="${ci}" data-field="bdelayTol" style="padding-right:14px!important;text-align:center!important;"></div>
          </div>
        </div>`;
      }
      return `<div class="ce-branch-task-card">
        <div class="ce-branch-task-hdr">
          <div style="width:160px;">${_ceDDHtml(`ce_btype_${si}_${ci}`, typeOpts, child.type||'complete_task', '— type —')}</div>
          <button type="button" class="gb-dyn-delete" data-step="${si}" data-ci="${ci}" data-action="del-bstep">
            <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style="padding:8px 12px 10px;">${body}</div>
      </div>`;
    }

    const emailSection = emailChildren.length ? `
      <div class="ce-branch-section">
        <div class="ce-branch-section-hdr">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          Email Sequence
          <span class="ce-branch-section-pill">1 of ${emailChildren.length} sends per run — auto-selected by outreach history</span>
        </div>
        <div class="ce-branch-email-list">
          ${emailChildren.map(emailCard).join('')}
        </div>
        <button type="button" class="ce-add-branch-step" data-step="${si}" data-action="add-bemail">
          + Add email to sequence
        </button>
      </div>` : `<button type="button" class="ce-add-branch-step" data-step="${si}" data-action="add-bemail">+ Add first email</button>`;

    const taskSection = `
      <div class="ce-branch-section" style="margin-top:6px;">
        <div class="ce-branch-section-hdr">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          After Email Sends
          <span class="ce-branch-section-pill">runs only if an email sent this run</span>
        </div>
        ${taskChildren.length ? `<div class="ce-branch-task-list">${taskChildren.map(taskCard).join('')}</div>` : ''}
        <button type="button" class="ce-add-branch-step" data-step="${si}" data-action="add-btask" style="margin-top:6px;">
          + Add task step
        </button>
      </div>`;

    return emailSection + taskSection;
  }

  function renderStepBody(step, si, allSteps, res) {

    // ── BRANCH ───────────────────────────────────────────────────────────────
    if (step.type === 'branch') {
      const branchGroup = step.branchGroup || '';
      const allBranchesInGroup = (allSteps||[]).filter(s => s.type==='branch' && s.branchGroup===branchGroup && branchGroup);
      const groupDesc = allBranchesInGroup.length > 1
        ? `One of ${allBranchesInGroup.length} branches in group "<strong>${_ceEsc(branchGroup)}</strong>" — the first whose conditions pass fires; all others skip.`
        : branchGroup ? `Sole branch in group "<strong>${_ceEsc(branchGroup)}</strong>".` : 'No group — always evaluates.';

      // Inline test result conditions
      const condOverlay = res?.conds?.length ? `<div style="display:flex;flex-direction:column;gap:3px;padding:8px 0 4px;">
        ${res.conds.map(c => `<div class="ce-sb-cond ${c.pass?'pass':'fail'}"><div class="ce-sb-cond-dot"></div><span>${_ceEsc(c.label)}</span></div>`).join('')}
        ${res.reason && !res.conds.length ? `<div style="font-size:10.5px;color:var(--gb-text-ghost,#555);font-style:italic;">${_ceEsc(res.reason)}</div>` : ''}
      </div>` : (res?.reason ? `<div style="font-size:10.5px;color:var(--gb-text-ghost,#555);padding:4px 0;font-style:italic;">${_ceEsc(res.reason)}</div>` : '');

      return `
        <div class="gb-form-group">
          <label class="gb-label">Branch label</label>
          <div class="gb-input-wrap"><input type="text" class="gb-input-p" value="${_ceEsc(step.label||'')}" data-step="${si}" data-field="branchLabel" placeholder="e.g. Srixon + Callaway" style="padding-right:14px!important;"></div>
        </div>
        <div class="gb-form-group">
          <label class="gb-label">Branch group</label>
          <div class="gb-input-wrap"><input type="text" class="gb-input-p" value="${_ceEsc(branchGroup)}" data-step="${si}" data-field="branchGroup" placeholder="e.g. brand" style="padding-right:14px!important;"></div>
          <span class="gb-hint" style="margin-top:4px;">${groupDesc}</span>
        </div>
        <div class="gb-form-group">
          <label class="gb-label">Branch fires when — <span class="gb-hint">all conditions must pass</span></label>
          ${renderConditions(step, si, -1)}
          ${condOverlay}
        </div>
        <div class="gb-form-group" style="gap:0;">
          ${renderBranchChildren(step, si, res?.children)}
        </div>`;
    }
    if (step.type === 'complete_task') {
      return `<div class="ce-step-info">Marks each contact\'s source task as complete when run from the Task modal. No effect when run from the CRM Contact modal.</div>
      ${renderConditions(step, si)}`;
    }

    if (step.type === 'create_task') {
      return `
        <div class="gb-form-group">
          <label class="gb-label">Task template to create</label>
          ${_ceDDHtml(`ce_ntpl_${si}`, _tTpls, step.noteTemplateId||'', 'Select task template...')}
          <span class="gb-hint">Uses the template's subject, description, category, priority, and days-out.</span>
        </div>
        ${renderConditions(step, si)}`;
    }

    if (step.type === 'delay') {
      return `
        <div class="gb-grid-2">
          <div class="gb-form-group">
            <label class="gb-label">Base seconds</label>
            <div class="gb-input-wrap"><input type="number" class="gb-input-p" min="5" max="600" step="5" value="${step.delayBase??60}" data-step="${si}" data-field="delayBase" style="padding-right:14px !important;text-align:center !important;"></div>
          </div>
          <div class="gb-form-group">
            <label class="gb-label">Jitter ± seconds</label>
            <div class="gb-input-wrap"><input type="number" class="gb-input-p" min="0" max="300" step="5" value="${step.delayTolerance??20}" data-step="${si}" data-field="delayTol" style="padding-right:14px !important;text-align:center !important;"></div>
          </div>
          <div class="gb-form-group" style="grid-column:1/-1;">
            <span class="gb-hint">Actual wait = base + random(0…jitter). PA send mode only. Replaces the campaign-level inter-contact delay when present.</span>
          </div>
        </div>
        ${renderConditions(step, si)}`;
    }

    // email
    const splits = step.splits?.length ? step.splits : [{templateId:'',pct:100}];
    const total  = splits.reduce((s,sp)=>s+(sp.pct||0),0);
    const warn   = total!==100 ? `<div class="ce-pct-warn">⚠ Splits add up to ${total}%, not 100%</div>` : '';
    const splitRows = splits.map((sp,xi) => `
      <div class="ce-split-row">
        <input type="number" class="gb-input-p" min="1" max="100" value="${sp.pct??100}" data-step="${si}" data-split="${xi}" data-field="pct" style="width:58px !important;flex-shrink:0 !important;padding:10px 6px !important;text-align:center !important;min-height:40px !important;">
        <span class="ce-pct-unit">%</span>
        <div style="flex:1;">${_ceDDHtml(`ce_split_${si}_${xi}`, _eTpls, sp.templateId||'', 'Select email template...')}</div>
        <button type="button" class="gb-dyn-delete" data-step="${si}" data-split="${xi}" data-action="del-split" title="Remove split">
          <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`).join('');
    // Step group logic (computed outside the template literal)
    const allGroups = [...new Set((allSteps||[])
      .filter(s => s.type==='email' && s.stepGroup && s.stepGroup.trim())
      .map(s => s.stepGroup.trim()))];
    const currentGroup = step.stepGroup || '';
    const groupBadge = currentGroup
      ? `<div class="ce-step-group-badge"><svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>Group: ${_ceEsc(currentGroup)}</div>`
      : '';
    const groupHint = `All steps sharing the same group name are mutually exclusive — the first one that passes its conditions fires, all others in the group are skipped for that run.`
      + (allGroups.length ? ` Active groups: ${allGroups.map(g=>`"${_ceEsc(g)}"`).join(', ')}` : '');

    return `
      <div class="gb-form-group">
        <label class="gb-label">Template splits <span class="gb-hint">(must sum to 100%)</span></label>
        <div class="ce-splits">${splitRows}${warn}</div>
        <button type="button" class="ce-add-split" data-step="${si}" data-action="add-split">+ Add split</button>
      </div>
      <div class="gb-form-group">
        <label class="gb-label">Send mode</label>
        <div class="gb-tags-wrap">
          <button type="button" class="gb-tag${step.replyMode!=='reply'?' active':''}" data-step="${si}" data-action="set-standalone">Standalone email</button>
          <button type="button" class="gb-tag${step.replyMode==='reply'?' active':''}" data-step="${si}" data-action="set-reply">Reply to thread (PA)</button>
        </div>
      </div>
      <div class="gb-form-group">
        <label class="gb-label">Brand filter <span class="gb-hint">— step only runs if contact ordered ALL checked brands</span></label>
        <div class="gb-tags-wrap">
          ${_CE_BRANDS.map(b => {
            const on = (step.brandFilter||[]).includes(b);
            return `<button type="button" class="gb-tag${on?' active':''}" data-step="${si}" data-action="toggle-brand" data-brand="${_ceEsc(b)}">${_ceEsc(b)}</button>`;
          }).join('')}
        </div>
        ${(step.brandFilter||[]).length ? `<span class="gb-hint" style="margin-top:2px;">Active: <strong>${(step.brandFilter||[]).map(_ceEsc).join(', ')}</strong></span>` : '<span class="gb-hint" style="margin-top:2px;">No filter — runs for all contacts</span>'}
      </div>
      <div class="gb-form-group">
        <label class="gb-label">Step group <span class="gb-hint">— mutual exclusion block</span></label>
        <div class="ce-step-group-row">
          <div class="gb-input-wrap" style="flex:1;">
            <input type="text" class="gb-input-p" value="${_ceEsc(currentGroup)}"
              placeholder="e.g. e1  (leave blank for no grouping)"
              data-step="${si}" data-field="stepGroup"
              style="padding-right:14px !important;">
          </div>
          ${groupBadge}
        </div>
        <span class="ce-group-hint">${groupHint}</span>
      </div>
      ${renderEmailGate(step, si, allSteps)}
      ${renderConditions(step, si)}`;
  }

  function renderEditor() {
    const edEl = document.getElementById('__gb-ce-editor');
    const ftEl = document.getElementById('__gb-ce-footer');
    if (!edEl||!ftEl) return;
    const c = _campaigns.find(x=>x.id===_activeId);
    if (!c) {
      edEl.innerHTML = '<div id="__gb-ce-empty">Select a campaign or create a new one</div>';
      ftEl.style.display = 'none'; return;
    }
    ftEl.style.display = 'flex';

    edEl.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div class="gb-grid-2">
          <div class="gb-form-group" style="grid-column:1/-1;">
            <label class="gb-label">Campaign name</label>
            <div style="display:flex;gap:8px;align-items:center;">
              <div class="gb-input-wrap" style="flex:1;"><input type="text" class="gb-input-p" id="ce_name" value="${_ceEsc(c.name||'')}" placeholder="e.g. Spring Follow-Up" style="padding-right:14px !important;"></div>
              <button type="button" id="btn_ce_sandbox" class="ce-sandbox-btn" title="Test campaign in sandbox">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
              </button>
            </div>
          </div>
          <div class="gb-form-group">
            <label class="gb-label">Default delay (sec)</label>
            <div class="gb-input-wrap"><input type="number" class="gb-input-p" id="ce_delay_base" min="5" max="600" step="5" value="${c.delayBase??60}" style="padding-right:14px !important;text-align:center !important;"></div>
            <span class="gb-hint">Used when no explicit Delay step is present. PA mode only.</span>
          </div>
          <div class="gb-form-group">
            <label class="gb-label">Jitter ± (sec)</label>
            <div class="gb-input-wrap"><input type="number" class="gb-input-p" id="ce_delay_tol" min="0" max="300" step="5" value="${c.delayTolerance??20}" style="padding-right:14px !important;text-align:center !important;"></div>
            <span class="gb-hint">Randomness to avoid automation patterns.</span>
          </div>
        </div>
        <div class="gb-divider" style="grid-column:unset;"></div>
        <div class="ce-run-mode-row">
          <div>
            <div class="gb-label" style="margin:0;">Step execution mode</div>
            <div class="gb-hint" id="ce-stop-hint" style="margin-top:2px;transition:opacity .15s;">${c.stopAfterFirstSend !== false
              ? 'Stops as soon as any branch sends — one email per contact per run.'
              : 'All branches evaluate — multiple can send in one run.'
            }</div>
          </div>
          <label class="ce-toggle">
            <input type="checkbox" id="ce-stop-toggle" ${c.stopAfterFirstSend !== false ? 'checked' : ''}>
            <div class="ce-toggle-track"><div class="ce-toggle-thumb"></div></div>
            <span class="ce-toggle-lbl" id="ce-stop-lbl">${c.stopAfterFirstSend !== false ? 'Stop after 1 send' : 'Run all branches'}</span>
          </label>
        </div>
        <div id="ce-steps">
          ${(c.steps||[]).map((step,si) => {
            return `
            <div class="ce-step${si===_newStepIdx?' new-step':''}${step.type==='branch'?' ce-branch-card':''}">
              <div class="ce-step-hdr${step.type==='branch'?' ce-branch-hdr':''}">
                <span class="ce-step-num">Step ${si+1}</span>
                <div style="width:200px;">${_ceDDHtml(`ce_type_${si}`, [
                  {id:'email',         name:'Send Email'},
                  {id:'complete_task', name:'Complete Task'},
                  {id:'create_task',   name:'Create Task'},
                  {id:'delay',         name:'Wait / Delay'},
                  {id:'branch',        name:'Branch (if/then)'},
                ], step.type||'email', '— select type —')}</div>
                <button type="button" class="gb-dyn-delete" data-step="${si}" data-action="del-step" title="Remove step">
                  <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div class="ce-step-body">${renderStepBody(step, si, c.steps, null)}</div>
            </div>`;
          }).join('')}
        </div>
        <button type="button" id="ce-add-step" data-action="add-step">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          Add Step
        </button>
      </div>`;
  }
  function renderAll() { renderSidebar(); renderEditor(); }
  renderAll();


  // ── Sandbox ────────────────────────────────────────────────────────────────

  function _sbDecode(doc, s) {
    const t=doc.createElement('textarea'); t.innerHTML=s||'';
    return t.value.replace(/[ \t\r\n]+/g,' ').trim().toLowerCase();
  }
  function _sbNumCmp(a,op,b) { const n=parseFloat(b)??0; return op==='gt'?a>=n:op==='lt'?a<=n:a===n; }

  function _sbEvalCond(cond, doc, sentThisRun) {
    const {field,op,val}=cond;
    const decode=s=>_sbDecode(doc,s); const v=decode(val); const pts=(val||'').split('|||');
    const vN=pts[0]!==''?(parseFloat(pts[0])??0):0; const vT=decode(pts[1]||'');
    const emailRows=[...doc.querySelectorAll('tr[data-gbep]')].filter(tr=>tr.querySelectorAll('td').length>=5);
    const isSent=tr=>(tr.querySelectorAll('td')[1]?.textContent||'').toLowerCase().includes('golfballs.com');
    const subj=tr=>decode(tr.querySelectorAll('td')[3]?.textContent||'');
    const itemRows=[...doc.querySelectorAll('table.dtOI tbody tr')];
    const norm=s=>s.toLowerCase().replace(/[\s\-]+/g,'');
    if(field==='orderedBrand'){const f=itemRows.some(tr=>norm(tr.querySelector('td')?.textContent||'').startsWith(norm(v)));return op==='is'?f:!f;}
    if(field==='sentSubjectCount'){const count=emailRows.filter(isSent).filter(tr=>subj(tr).includes(vT)).length;return _sbNumCmp(count,op,String(vN));}
    if(field==='repliedToSubject'){const f=emailRows.filter(tr=>!isSent(tr)).some(tr=>subj(tr).includes(vT));return op==='has'?f:!f;}
    if(field==='hasReplied'){const h=emailRows.some(tr=>!isSent(tr));return op==='is'?h:!h;}
    return true;
  }

  function _sbEvalAll(step, doc, sentThisRun) {
    const conds=step.conditions||[]; if(!conds.length) return {pass:true,rows:[]};
    const rows=conds.map(c=>({pass:_sbEvalCond(c,doc,sentThisRun),label:_sbCondLabel(c)}));
    const logic=step.conditionLogic||'all';
    return {pass:logic==='any'?rows.some(r=>r.pass):rows.every(r=>r.pass),rows};
  }

  function _sbCondLabel(c) {
    const pts=(c.val||'').split('|||'); const n=pts[0],tag=pts[1]||c.val||'';
    if(c.field==='orderedBrand') return `Ordered ${c.val}`;
    if(c.field==='sentSubjectCount') return `"${tag}" sent ${c.op==='eq'?'exactly':c.op==='gt'?'≥':'≤'} ${n}×`;
    if(c.field==='repliedToSubject') return c.op==='not'?`No reply to "${c.val}"`: `Replied to "${c.val}"`;
    if(c.field==='hasReplied') return c.op==='is'?'Has replied':'No reply';
    return `${c.field} ${c.op} ${c.val}`;
  }

  function _sbGate(doc, step, sentThisRun) {
    const emailRows=[...doc.querySelectorAll('tr[data-gbep]')].filter(tr=>tr.querySelectorAll('td').length>=5);
    const isSent=tr=>(tr.querySelectorAll('td')[1]?.textContent||'').toLowerCase().includes('golfballs.com');
    const decode=s=>_sbDecode(doc,s); const subj=tr=>decode(tr.querySelectorAll('td')[3]?.textContent||'');
    const sent=emailRows.filter(isSent).map(subj); const recv=emailRows.filter(tr=>!isSent(tr)).map(subj);
    const reasons=[];
    for(const tag of (step.skipIfRepliedTo||[])){if(recv.some(s=>s.includes(tag.toLowerCase())))reasons.push(`replied to "${tag}"`);}
    for(const tag of (step.skipIfSent||[])){const t=tag.toLowerCase();if(sent.some(s=>s.includes(t))||sentThisRun.has(t))reasons.push(`already sent "${tag}"`);}
    for(const tag of (step.skipIfNotSent||[])){const t=tag.toLowerCase();if(!sent.some(s=>s.includes(t))&&!sentThisRun.has(t))reasons.push(`"${tag}" not sent yet`);}
    return {pass:!reasons.length,reasons};
  }

  function _sbBrand(doc, brands) {
    if(!brands?.length) return true;
    const rows=[...doc.querySelectorAll('table.dtOI tbody tr')];
    const norm=s=>s.toLowerCase().replace(/[\s\-]+/g,'');
    return brands.every(b=>rows.some(tr=>norm(tr.querySelector('td')?.textContent||'').startsWith(norm(b))));
  }

  function _sbResolve(tpl, doc) {
    const fn=doc.querySelector('#lblContactFirstName')?.textContent?.trim()||'';
    const ln=doc.querySelector('#lblContactLastName')?.textContent?.trim()||'';
    const em=doc.querySelector('#lblContactEmail')?.textContent?.trim()||doc.querySelector('a[href^="mailto:"]')?.textContent?.trim()||'';
    const ctx={first_name:fn,last_name:ln,firstName:fn,lastName:ln};
    const r=s=>(s||'').replace(/\{\{(\w+)\}\}/g,(_,k)=>ctx[k]??`{{${k}}}`);
    return {to:em,subject:r(tpl.subject||''),body:r(tpl.body||'')};
  }

  async function _sbRun(campaign, tplMap, ntplMap, doc) {
    const sentThisRun=new Set(), firedGroups=new Set(), results=[];
    for(const step of (campaign.steps||[])) {
      if(step.type==='branch') {
        if(step.branchGroup && firedGroups.has(step.branchGroup)){results.push({status:'locked',label:step.label||'Branch',reason:`Group "${step.branchGroup}" already fired`,children:[]});continue;}
        const ev=_sbEvalAll(step,doc,sentThisRun);
        if(!ev.pass){results.push({status:'skipped',label:step.label||'Branch',rows:ev.rows,children:[]});continue;}
        if(step.branchGroup) firedGroups.add(step.branchGroup);
        let emailSent=false; const children=[];
        for(const child of (step.steps||[])) {
          if(child.type==='email'){
            if(emailSent){children.push({type:'email',status:'skipped',label:child.subject||'Email',why:'Email already sent this run'});continue;}
            if(!_sbBrand(doc,child.brandFilter)){children.push({type:'email',status:'skipped',label:child.subject||'Email',why:'Brand filter not met'});continue;}
            const ev2=_sbEvalAll(child,doc,sentThisRun);
            if(!ev2.pass){children.push({type:'email',status:'skipped',label:child.subject||'Email',why:'Conditions not met',rows:ev2.rows});continue;}
            const g=_sbGate(doc,child,sentThisRun);
            if(!g.pass){children.push({type:'email',status:'skipped',label:child.subject||'Email',why:`Gate: ${g.reasons.join(', ')}`});continue;}
            const tid=(child.splits||[]).reduce((b,s)=>(s.pct||0)>(b.pct||0)?s:b,{pct:0,templateId:''}).templateId;
            const tpl=tplMap[tid]; const resolved=tpl?_sbResolve(tpl,doc):null;
            if(child.subject) sentThisRun.add(child.subject.toLowerCase());
            emailSent=true;
            children.push({type:'email',status:'fired',label:child.subject||'Email',rows:ev2.rows,resolved});
          } else if(child.type==='complete_task'){
            const gate=child.skipIfNotSent?.some(t=>!sentThisRun.has(t.toLowerCase()));
            children.push({type:'complete_task',status:emailSent&&!gate?'run':'skip',label:'Complete Task'});
          } else if(child.type==='create_task'){
            const gate=child.skipIfNotSent?.some(t=>!sentThisRun.has(t.toLowerCase()));
            const ntpl=ntplMap[child.noteTemplateId];
            children.push({type:'create_task',status:emailSent&&!gate?'run':'skip',label:ntpl?`Create: ${ntpl.subject||ntpl.name}`:'Create Task'});
          }
        }
        if(emailSent) sentThisRun.add('__sent__');
        results.push({status:emailSent?'fired':'noemail',label:step.label||'Branch',rows:ev.rows,children});
      }
      if(campaign.stopAfterFirstSend!==false && sentThisRun.has('__sent__')) break;
    }
    return results;
  }

  function _sbRenderCard(results) {
    const el=document.getElementById('__gb-sb-results');
    const prev=document.getElementById('sb-preview-wrap');
    if(!el) return;
    el.innerHTML='';
    if(prev) prev.style.display='none';

    const fired=results.flatMap(r=>r.children?.filter(c=>c.status==='fired')||[]);
    const sum=document.createElement('div');
    sum.className=fired.length?'sb-summary has-send':'sb-summary no-send';
    sum.innerHTML=fired.length
      ?`<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg> Sends <strong>${fired.length}</strong>: ${fired.map(f=>_ceEsc(f.label)).join(', ')}`
      :`<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> No emails send this run`;
    el.appendChild(sum);

    const labels={fired:'Fires',skipped:'Skip',locked:'Locked',noemail:'No email'};
    results.forEach((r,idx)=>{
      const card=document.createElement('div');
      card.className='sb-step-card'; card.dataset.status=r.status;
      let body='';
      if(r.rows?.length) body+=r.rows.map(row=>`<div class="sb-cond-row ${row.pass?'pass':'fail'}"><div class="sb-cond-dot"></div><span>${_ceEsc(row.label)}</span></div>`).join('');
      else if(r.reason) body+=`<div style="font-size:10.5px;color:var(--gb-text-faint,#666);font-style:italic;">${_ceEsc(r.reason)}</div>`;
      if(r.children?.length){
        body+='<div style="margin-top:5px;display:flex;flex-direction:column;gap:3px;">';
        for(const c of r.children){
          if(c.type==='email'){
            const cls=c.status==='fired'?'will-send':'will-skip';
            const why=c.status!=='fired'?`<span class="sb-email-why">${_ceEsc(c.why||'')}</span>`:'';
            const prev2=c.status==='fired'&&c.resolved?`<button class="sb-preview-btn" data-resolved='${JSON.stringify(c.resolved||{}).replace(/'/g,"&#39;")}'>Preview</button>`:'';
            body+=`<div class="sb-email-row ${cls}"><span class="sb-email-lbl">${_ceEsc(c.label)}</span>${why}${prev2}</div>`;
          } else {
            body+=`<div class="sb-task-row ${c.status}">${c.status==='run'?'✓':'—'} ${_ceEsc(c.label)}</div>`;
          }
        }
        body+='</div>';
      }
      card.innerHTML=`<div class="sb-step-hdr"><div class="sb-status-dot"></div><div class="sb-step-lbl">${_ceEsc(r.label)}</div><div class="sb-step-badge">${labels[r.status]||r.status}</div></div>${body?`<div class="sb-step-body">${body}</div>`:''}`;
      card.style.opacity='0'; card.style.transform='translateY(4px)';
      el.appendChild(card);
      setTimeout(()=>{card.style.transition='opacity .2s,transform .2s';card.style.opacity='1';card.style.transform='none';},idx*70);
    });

    el.addEventListener('click', e=>{
      const btn=e.target.closest('.sb-preview-btn'); if(!btn||!prev) return;
      try {
        const res=JSON.parse(btn.dataset.resolved.replace(/&#39;/g,"'"));
        document.getElementById('sb-preview-fields').innerHTML=
          `<div class="sb-pf"><span class="sb-pf-k">To:</span><span class="sb-pf-v">${_ceEsc(res.to||'—')}</span></div>`+
          `<div class="sb-pf"><span class="sb-pf-k">Subject:</span><span class="sb-pf-v">${_ceEsc(res.subject||'—')}</span></div>`;
        document.getElementById('sb-preview-body').innerHTML=res.body||'<em style="opacity:.4">No body</em>';
        prev.style.display='flex';
      } catch{}
    });
  }

  // ── NEW Sandbox Modal + Inline Animation System ────────────────────────────
  let _sbModalOverlay = null;
  let _sbFileData = null; // Stores uploaded file
  let _sbAnimationRunning = false;

  function _sbShowModal() {
    if (_sbModalOverlay) return;
    const c = _campaigns.find(x => x.id === _activeId);
    if (!c) return;

    _sbModalOverlay = document.createElement('div');
    _sbModalOverlay.id = '__gb-sb-modal-overlay';
    _sbModalOverlay.innerHTML = `
      <div id="__gb-sb-modal">
        <div id="__gb-sb-modal-hdr">
          <div class="sb-modal-hdr-icon">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
          </div>
          <span class="sb-modal-hdr-title">Test Campaign</span>
          <button type="button" id="btn_sb_modal_close">
            <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div id="__gb-sb-modal-body">
          <div class="sb-modal-tabs">
            <button type="button" class="sb-modal-tab active" data-tab="url">Paste URL</button>
            <button type="button" class="sb-modal-tab" data-tab="file">Upload HTML</button>
          </div>
          <div id="sb-modal-panel-url" class="sb-modal-panel">
            <input type="text" id="sb-modal-url-input" placeholder="https://admin.icustomize.com/contact/...">
            <span style="font-size:10.5px;color:rgba(255,255,255,.35);">Fetches with your current session credentials.</span>
          </div>
          <div id="sb-modal-panel-file" class="sb-modal-panel" style="display:none;">
            <label id="sb-modal-file-drop">
              <input type="file" id="sb-modal-file-input" accept=".html,.htm" style="display:none;">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span id="sb-modal-file-label">Drop or click to upload contact page HTML</span>
            </label>
          </div>
          <div id="sb-modal-status"></div>
        </div>
        <div id="__gb-sb-modal-footer">
          <button type="button" id="btn_sb_modal_cancel">Cancel</button>
          <button type="button" id="btn_sb_modal_run">
            <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Run Test
          </button>
        </div>
      </div>`;
    document.body.appendChild(_sbModalOverlay);

    // Tab switching
    _sbModalOverlay.querySelectorAll('.sb-modal-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        _sbModalOverlay.querySelectorAll('.sb-modal-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('sb-modal-panel-url').style.display = tab.dataset.tab === 'url' ? 'flex' : 'none';
        document.getElementById('sb-modal-panel-file').style.display = tab.dataset.tab === 'file' ? 'flex' : 'none';
      });
    });

    // File upload handling
    const fileDrop = document.getElementById('sb-modal-file-drop');
    const fileInput = document.getElementById('sb-modal-file-input');
    const fileLabel = document.getElementById('sb-modal-file-label');

    fileDrop.addEventListener('click', () => fileInput.click());
    fileDrop.addEventListener('dragover', e => { e.preventDefault(); fileDrop.classList.add('dragover'); });
    fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('dragover'));
    fileDrop.addEventListener('drop', e => {
      e.preventDefault();
      fileDrop.classList.remove('dragover');
      const f = e.dataTransfer.files[0];
      if (f) {
        _sbFileData = f;
        fileLabel.textContent = f.name;
        fileDrop.classList.add('has-file');
      }
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) {
        _sbFileData = fileInput.files[0];
        fileLabel.textContent = fileInput.files[0].name;
        fileDrop.classList.add('has-file');
      }
    });

    // Close handlers
    const closeModal = () => {
      if (_sbModalOverlay) {
        _sbModalOverlay.remove();
        _sbModalOverlay = null;
        _sbFileData = null;
      }
    };

    document.getElementById('btn_sb_modal_close').addEventListener('click', closeModal);
    document.getElementById('btn_sb_modal_cancel').addEventListener('click', closeModal);
    _sbModalOverlay.addEventListener('click', e => { if (e.target === _sbModalOverlay) closeModal(); });

    // Escape key handler
    const escHandler = e => {
      if (e.key === 'Escape' && _sbModalOverlay) {
        closeModal();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Run test handler
    document.getElementById('btn_sb_modal_run').addEventListener('click', async () => {
      const activeTab = _sbModalOverlay.querySelector('.sb-modal-tab.active')?.dataset.tab || 'url';
      const runBtn = document.getElementById('btn_sb_modal_run');
      const status = document.getElementById('sb-modal-status');

      runBtn.disabled = true;
      runBtn.innerHTML = '<span>Loading...</span>';

      let doc2;
      try {
        if (activeTab === 'url') {
          const url = document.getElementById('sb-modal-url-input').value.trim();
          if (!url.startsWith('http')) throw new Error('Enter a valid URL');
          status.textContent = 'Fetching contact page...';
          const resp = await fetch(url, { credentials: 'include' });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          doc2 = new DOMParser().parseFromString(await resp.text(), 'text/html');
        } else {
          if (!_sbFileData) throw new Error('No file selected');
          status.textContent = `Reading ${_sbFileData.name}...`;
          const html = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = e => res(e.target.result);
            r.onerror = () => rej(new Error('File read failed'));
            r.readAsText(_sbFileData);
          });
          doc2 = new DOMParser().parseFromString(html, 'text/html');
        }

        const fn = doc2.querySelector('#lblContactFirstName')?.textContent?.trim() || 'Unknown';
        status.textContent = `Contact: ${fn} - Starting animation...`;

        // Close modal and run inline animation
        const tplMap = Object.fromEntries(_eTpls.map(t => [t.id, t]));
        const ntplMap = Object.fromEntries(_tTpls.map(t => [t.id, t]));
        const results = await _sbRun(c, tplMap, ntplMap, doc2);

        closeModal();
        _sbRunInlineAnimation(results, c);

      } catch (e) {
        status.textContent = `Error: ${e.message}`;
        status.style.color = 'rgba(220,80,80,.85)';
        runBtn.disabled = false;
        runBtn.innerHTML = '<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run Test';
      }
    });
  }

  // ── Inline Step Animation ────────────────────────────────────────────────────
  async function _sbRunInlineAnimation(results, campaign) {
    if (_sbAnimationRunning) return;
    _sbAnimationRunning = true;

    const stepCards = document.querySelectorAll('#ce-steps .ce-step');
    const stepCount = Math.min(stepCards.length, results.length);

    // Reset all steps to pending state
    stepCards.forEach(card => {
      card.classList.remove('sb-active', 'sb-done', 'sb-pending');
      card.removeAttribute('data-sb');
      card.querySelectorAll('.sb-step-status-overlay, .sb-condition-anim').forEach(el => el.remove());
    });

    // Set all steps to pending
    stepCards.forEach(card => card.classList.add('sb-pending'));

    // Scroll editor to top to watch animation
    const editor = document.getElementById('__gb-ce-editor');
    if (editor) editor.scrollTo({ top: 0, behavior: 'smooth' });

    // Animation delay between steps (slowed down for visibility)
    const STEP_DELAY = 1200;
    const CONDITION_DELAY = 300;

    for (let i = 0; i < stepCount; i++) {
      const card = stepCards[i];
      const result = results[i];

      // Make this step active
      card.classList.remove('sb-pending');
      card.classList.add('sb-active');

      // Scroll step into view
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Wait for attention
      await _sbDelay(400);

      // Show condition evaluations one by one
      if (result.rows?.length) {
        const bodyEl = card.querySelector('.ce-step-body');
        if (bodyEl) {
          for (const row of result.rows) {
            const condEl = document.createElement('div');
            condEl.className = `sb-condition-anim ${row.pass ? 'pass' : 'fail'}`;
            condEl.innerHTML = `<div class="dot"></div><span>${_ceEsc(row.label)} - ${row.pass ? 'PASS' : 'FAIL'}</span>`;
            bodyEl.insertBefore(condEl, bodyEl.firstChild);
            await _sbDelay(CONDITION_DELAY);
          }
        }
      }

      // Wait before showing result
      await _sbDelay(500);

      // Show status badge
      const statusBadge = document.createElement('div');
      statusBadge.className = `sb-step-status-overlay ${result.status}`;
      const labels = { fired: 'FIRES', skipped: 'SKIPPED', locked: 'LOCKED', noemail: 'NO EMAIL' };
      statusBadge.textContent = labels[result.status] || result.status.toUpperCase();
      card.style.position = 'relative';
      card.appendChild(statusBadge);

      // Transition to done state
      card.classList.remove('sb-active');
      card.classList.add('sb-done');
      card.dataset.sb = result.status;

      // Wait before moving to next step
      await _sbDelay(STEP_DELAY);

      // If campaign stops after first send and this step fired, stop animation
      if (campaign.stopAfterFirstSend !== false && result.status === 'fired') {
        // Mark remaining steps as locked
        for (let j = i + 1; j < stepCards.length; j++) {
          stepCards[j].classList.remove('sb-pending');
          stepCards[j].classList.add('sb-done');
          stepCards[j].dataset.sb = 'locked';
          stepCards[j].style.position = 'relative';
          const lockBadge = document.createElement('div');
          lockBadge.className = 'sb-step-status-overlay locked';
          lockBadge.textContent = 'SKIPPED';
          stepCards[j].appendChild(lockBadge);
        }
        break;
      }
    }

    _sbAnimationRunning = false;

    // Show summary at the bottom
    const fired = results.filter(r => r.status === 'fired');
    const summaryEl = document.createElement('div');
    summaryEl.style.cssText = 'padding:16px;margin-top:12px;border-radius:10px !important;text-align:center;font-size:13px;font-weight:600;animation:__gbSbSlide .3s ease;';
    if (fired.length) {
      summaryEl.style.background = 'rgba(125,184,42,.1)';
      summaryEl.style.border = '1px solid rgba(125,184,42,.3)';
      summaryEl.style.color = 'rgba(125,184,42,.9)';
      summaryEl.innerHTML = `<span style="font-size:16px;">✓</span> ${fired.length} email${fired.length > 1 ? 's' : ''} would send`;
    } else {
      summaryEl.style.background = 'rgba(255,255,255,.05)';
      summaryEl.style.border = '1px solid rgba(255,255,255,.1)';
      summaryEl.style.color = 'rgba(255,255,255,.5)';
      summaryEl.innerHTML = '<span style="font-size:16px;">○</span> No emails would send for this contact';
    }
    document.getElementById('ce-steps')?.appendChild(summaryEl);

    // Auto-clear animation state after a moment
    setTimeout(() => {
      summaryEl.remove();
      stepCards.forEach(card => {
        card.classList.remove('sb-done');
        card.querySelectorAll('.sb-step-status-overlay, .sb-condition-anim').forEach(el => el.remove());
      });
    }, 8000);
  }

  function _sbDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ── Wire up sandbox button ───────────────────────────────────────────────────
  overlay.addEventListener('click', e => {
    const sandboxBtn = e.target.closest('#btn_ce_sandbox');
    if (sandboxBtn) {
      e.stopPropagation();
      _sbShowModal();
    }
  });

  // ── Wire up stop toggle with animated description ─────────────────────────────
  overlay.addEventListener('change', e => {
    if (e.target.id === 'ce-stop-toggle') {
      const checked = e.target.checked;
      const c = _campaigns.find(x => x.id === _activeId);
      if (c) c.stopAfterFirstSend = checked;

      const hint = document.getElementById('ce-stop-hint');
      const lbl = document.getElementById('ce-stop-lbl');
      if (hint) {
        hint.style.opacity = '0';
        setTimeout(() => {
          hint.textContent = checked
            ? 'Stops as soon as any branch sends — one email per contact per run.'
            : 'All branches evaluate — multiple can send in one run.';
          hint.style.opacity = '1';
        }, 150);
      }
      if (lbl) {
        lbl.textContent = checked ? 'Stop after 1 send' : 'Run all branches';
      }
    }
  });

  // ── Close campaign editor ──────────────────────────────────────────────────────
  function doClose() {
    overlay.remove();
    if (onCloseCallback) onCloseCallback();
  }

  document.getElementById('btn_ce_close')?.addEventListener('click', doClose);
  document.getElementById('btn_ce_cancel')?.addEventListener('click', doClose);
  document.getElementById('btn_ce_del')?.addEventListener('click', async () => {
    if(!_activeId||!confirm('Delete this campaign? This cannot be undone.')) return;
    _campaigns=_campaigns.filter(c=>c.id!==_activeId); _activeId=_campaigns[0]?.id??null;
    await _ceSaveCampaigns(_campaigns);
    if(onUpdateCallback) onUpdateCallback(_campaigns);
    renderAll();
  });
  overlay.addEventListener('click', e=>{ if(e.target===overlay) doClose(); });
  document.addEventListener('keydown', function onKey(e) {
    if(e.key==='Escape' && !_sbModalOverlay){doClose();document.removeEventListener('keydown',onKey);}
  });
};

} // end guard
