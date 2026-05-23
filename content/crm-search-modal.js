// crm-search-modal.js — Full-screen CRM contact/account search modal.
// Solr via SolrIndexCrm.asmx. Search bar + QB button + checkbox selection + campaign runner.

if (!window.__gbCrmSearchModalLoaded) {
window.__gbCrmSearchModalLoaded = true;

const _CSM_API  = 'https://api.golfballs.com/Golfballs/WebServices/Private/SolrIndexCrm.asmx/Query';
const _CSM_BASE = 'https://api.golfballs.com/golfballs/adminnew/';
const _CSM_ROWS = 200;
const _CSM_QF   = 'id^50 accountID_s^50 contactName_t^50 accountName_t^50 email_tp^20 emails_tps^20 phones_ss^20';

// ── State ─────────────────────────────────────────────────────────────────────
let _csmAll        = [];
let _csmTemplates  = [];
let _csmCampaigns  = [];
let _csmSelected   = new Set();
let _csmLastIdx    = -1;
let _csmCampaign   = '';
let _csmSortField  = 'lastOrderDate_dt';
let _csmSortDir    = 'desc';
let _csmSearchQ    = '';
let _csmFilterType = '';
let _csmQbStr      = '';
let _csmQbActive   = false;

// ── Styles ────────────────────────────────────────────────────────────────────
(function injectCSMStyles() {
  if (document.getElementById('__gb-csm-css')) return;
  const st = document.createElement('style');
  st.id = '__gb-csm-css';
  st.textContent = `
    #__gb-csm-overlay {
      position: fixed !important; inset: 0 !important; z-index: 999990 !important;
      background: rgba(0,0,0,.72) !important; backdrop-filter: blur(8px) !important; -webkit-backdrop-filter: blur(8px) !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      animation: __gbCsmFade .18s ease !important; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    }
    @keyframes __gbCsmFade { from{opacity:0} to{opacity:1} }

    #__gb-csm-card {
      background: var(--gb-surface,#1a1a1a) !important;
      border: 1px solid rgba(255,255,255,.09) !important; border-radius: 18px !important;
      width: min(1400px,calc(100vw - 32px)) !important; height: min(850px,calc(100vh - 48px)) !important;
      display: flex !important; flex-direction: column !important; overflow: hidden !important;
      box-shadow: 0 32px 80px rgba(0,0,0,.9) !important;
      animation: __gbCsmUp .28s cubic-bezier(.34,1.3,.64,1) !important;
    }
    @keyframes __gbCsmUp { from{opacity:0;transform:translateY(16px) scale(.97)} to{opacity:1;transform:none} }

    /* ── Header ── */
    #__gb-csm-hdr {
      padding: 16px 20px 14px !important; flex-shrink: 0 !important;
      background: rgba(0,0,0,.4) !important; border-bottom: 1px solid rgba(255,255,255,.07) !important;
      display: flex !important; align-items: center !important; gap: 14px !important;
    }
    #__gb-csm-hdr-icon {
      width: 36px !important; height: 36px !important; border-radius: 10px !important; flex-shrink: 0 !important;
      background: rgba(var(--gb-brand-label-rgb,125,184,42),.12) !important;
      border: 1px solid rgba(var(--gb-brand-label-rgb,125,184,42),.25) !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      color: var(--gb-brand-label,#7db82a) !important;
    }
    #__gb-csm-hdr-icon svg { width: 18px !important; height: 18px !important; }
    #__gb-csm-hdr-title { font: 700 16px/1 inherit !important; color: #fff !important; letter-spacing: .3px !important; }
    #__gb-csm-hdr-sub { font-size: 11px !important; font-weight: 500 !important; color: rgba(255,255,255,.45) !important; margin-top: 4px !important; }
    #__gb-csm-close {
      margin-left: auto !important; background: rgba(255,255,255,.05) !important;
      border: 1px solid rgba(255,255,255,.1) !important; border-radius: 7px !important;
      color: rgba(255,255,255,.8) !important; cursor: pointer !important; padding: 6px 12px !important;
      font: 600 11px/1 inherit !important; display: flex !important; align-items: center !important;
      gap: 6px !important; transition: all .15s !important; box-sizing: border-box !important;
    }
    #__gb-csm-close:hover { background: rgba(255,255,255,.12) !important; color: #fff !important; }
    #__gb-csm-close svg { width: 10px !important; height: 10px !important; }

    /* ── Toolbar ── */
    #__gb-csm-toolbar {
      padding: 14px 20px !important; flex-shrink: 0 !important;
      border-bottom: 1px solid rgba(255,255,255,.06) !important;
      display: flex !important; align-items: center !important; gap: 12px !important;
    }
    #__gb-csm-search-wrap { flex: 1 !important; min-width: 200px !important; position: relative !important; display: flex !important; align-items: center !important; }
    #__gb-csm-search-wrap svg { position: absolute !important; left: 12px !important; top: 0 !important; bottom: 0 !important; margin: auto !important; width: 15px !important; height: 15px !important; color: rgba(255,255,255,.4) !important; pointer-events: none !important; }
    #__gb-csm-search {
      width: 100% !important; height: 38px !important; padding: 0 14px 0 36px !important;
      box-sizing: border-box !important; margin: 0 !important;
      background: rgba(0,0,0,.3) !important; border: 1px solid rgba(255,255,255,.1) !important;
      border-radius: 8px !important; color: #fff !important; font: 500 13px inherit !important;
      outline: none !important; transition: border-color .15s, box-shadow .15s !important; color-scheme: dark !important;
    }
    #__gb-csm-search:focus { border-color: var(--gb-brand-label,#7db82a) !important; box-shadow: 0 0 0 2px rgba(var(--gb-brand-label-rgb,125,184,42),.15) !important; }
    #__gb-csm-search::placeholder { color: rgba(255,255,255,.3) !important; }

    /* Custom Dropdowns — identical to task-list-modal */
    .csm-dd-wrap { position: relative !important; flex-shrink: 0 !important; margin: 0 !important; }
    .csm-dd-btn {
      width: 100% !important; background: rgba(0,0,0,.3) !important;
      border: 1px solid rgba(255,255,255,.1) !important; border-radius: 8px !important;
      padding: 0 32px 0 14px !important; font-size: 13px !important; font-weight: 500 !important;
      color: #fff !important; cursor: pointer !important; text-align: left !important;
      display: flex !important; align-items: center !important; position: relative !important;
      height: 38px !important; box-sizing: border-box !important; font-family: inherit !important;
      transition: all .15s !important; margin: 0 !important;
    }
    .csm-dd-btn:hover { background: rgba(255,255,255,.05) !important; border-color: rgba(255,255,255,.2) !important; }
    .csm-dd-btn.open { border-color: var(--gb-brand-label,#7db82a) !important; background: rgba(255,255,255,.05) !important; box-shadow: 0 0 0 2px rgba(var(--gb-brand-label-rgb,125,184,42),.15) !important; }
    .csm-btn-label { flex: 1 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
    .csm-dd-chev { position: absolute !important; right: 12px !important; top: 0 !important; bottom: 0 !important; margin: auto !important; color: rgba(255,255,255,.4) !important; pointer-events: none !important; transition: transform .2s, color .2s !important; }
    .csm-dd-btn.open .csm-dd-chev { transform: rotate(180deg) !important; color: var(--gb-brand-label,#7db82a) !important; }
    .csm-dd-menu {
      position: absolute !important; top: calc(100% + 4px) !important; left: 0 !important; right: 0 !important;
      background: var(--gb-surface-elevated,#171717) !important; border: 1px solid rgba(255,255,255,.1) !important;
      border-radius: 9px !important; z-index: 999990 !important;
      max-height: 320px !important; overflow-y: auto !important;
      opacity: 0 !important; transform: translateY(-5px) !important; pointer-events: none !important;
      transition: opacity .16s ease, transform .18s cubic-bezier(.34,1.4,.64,1) !important;
      box-shadow: 0 10px 30px rgba(0,0,0,.9), 0 0 0 1px rgba(255,255,255,.03) !important;
      padding: 4px !important; box-sizing: border-box !important;
    }
    .csm-dd-menu.open { opacity: 1 !important; transform: translateY(0) !important; pointer-events: auto !important; }
    .csm-dd-opt { padding: 9px 12px !important; margin-bottom: 2px !important; border-radius: 6px !important; cursor: pointer !important; font-size: 12.5px !important; font-weight: 500 !important; color: var(--gb-text-secondary,#ccc) !important; transition: background .1s, color .1s !important; display: flex !important; justify-content: space-between !important; align-items: center !important; }
    .csm-dd-opt:last-child { margin-bottom: 0 !important; }
    .csm-dd-opt:hover { background: rgba(255,255,255,.08) !important; color: #fff !important; }
    .csm-dd-opt.selected { background: rgba(var(--gb-brand-label-rgb,125,184,42),.15) !important; color: var(--gb-brand-label,#7db82a) !important; font-weight: 600 !important; }
    .dropup .csm-dd-menu { top: auto !important; bottom: calc(100% + 4px) !important; transform: translateY(5px) !important; }
    .dropup .csm-dd-menu.open { transform: translateY(0) !important; }

    /* QB Button */
    #__gb-csm-qb-btn {
      height: 38px !important; padding: 0 14px !important; flex-shrink: 0 !important; margin: 0 !important;
      background: rgba(0,0,0,.3) !important; border: 1px solid rgba(255,255,255,.1) !important;
      border-radius: 8px !important; color: rgba(255,255,255,.7) !important;
      cursor: pointer !important; font: 600 12.5px inherit !important;
      display: flex !important; align-items: center !important; gap: 8px !important; transition: all .15s !important;
    }
    #__gb-csm-qb-btn:hover { background: rgba(255,255,255,.05) !important; border-color: rgba(255,255,255,.2) !important; color: #fff !important; }
    #__gb-csm-qb-btn.active { background: rgba(var(--gb-brand-label-rgb,125,184,42),.12) !important; border-color: rgba(var(--gb-brand-label-rgb,125,184,42),.35) !important; color: var(--gb-brand-label,#7db82a) !important; }
    #__gb-csm-qb-btn svg { width: 14px !important; height: 14px !important; }

    #__gb-csm-count { font-size: 12px !important; font-weight: 500 !important; color: rgba(255,255,255,.45) !important; white-space: nowrap !important; margin-left: auto !important; }

    /* QB active bar */
    #__gb-csm-qb-bar { flex-shrink: 0 !important; padding: 7px 20px !important; background: rgba(var(--gb-brand-label-rgb,125,184,42),.05) !important; border-bottom: 1px solid rgba(var(--gb-brand-label-rgb,125,184,42),.15) !important; display: none !important; align-items: center !important; gap: 10px !important; font-size: 11px !important; }
    #__gb-csm-qb-bar.visible { display: flex !important; }
    #__gb-csm-qb-preview { flex: 1 !important; font-style: italic !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; color: rgba(255,255,255,.5) !important; }
    #__gb-csm-qb-clear { background: transparent !important; border: none !important; color: rgba(255,255,255,.4) !important; font: 600 11px inherit !important; cursor: pointer !important; padding: 0 !important; flex-shrink: 0 !important; transition: color .15s !important; }
    #__gb-csm-qb-clear:hover { color: #fff !important; }

    /* Table body area */
    #__gb-csm-body {
      flex: 1 !important; overflow-y: auto !important;
      scrollbar-width: thin !important; scrollbar-color: rgba(255,255,255,.15) transparent !important;
      padding: 0 24px !important;
    }
    #__gb-csm-body::-webkit-scrollbar { width: 6px !important; }
    #__gb-csm-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15) !important; border-radius: 6px !important; }
    #__gb-csm-body::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.25) !important; }

    #__gb-csm-table { width: 100% !important; border-collapse: collapse !important; font-size: 13px !important; }
    #__gb-csm-table thead th {
      padding: 12px 12px !important; font: 700 11px/1 inherit !important;
      text-transform: uppercase !important; letter-spacing: .5px !important; color: rgba(255,255,255,.5) !important;
      background: rgba(0,0,0,.45) !important; backdrop-filter: blur(12px) !important; -webkit-backdrop-filter: blur(12px) !important;
      border-bottom: 1px solid rgba(255,255,255,.07) !important;
      white-space: nowrap !important; position: sticky !important; top: 0 !important; z-index: 1 !important;
      cursor: pointer !important; user-select: none !important; text-align: left !important;
    }
    #__gb-csm-table thead th:hover { color: #fff !important; background: rgba(0,0,0,.55) !important; }
    #__gb-csm-table thead th.sort-asc::after  { content: ' ↑' !important; opacity: .8 !important; color: var(--gb-brand-label,#7db82a) !important; }
    #__gb-csm-table thead th.sort-desc::after { content: ' ↓' !important; opacity: .8 !important; color: var(--gb-brand-label,#7db82a) !important; }

    #__gb-csm-table tbody tr { border-bottom: 1px solid rgba(255,255,255,.04) !important; transition: background .12s !important; }
    #__gb-csm-table tbody tr:hover { background: rgba(255,255,255,.04) !important; }
    #__gb-csm-table tbody tr.selected { background: rgba(var(--gb-brand-label-rgb,125,184,42),.12) !important; }
    #__gb-csm-table td { padding: 12px 12px !important; color: rgba(255,255,255,.8) !important; vertical-align: middle !important; }

    .csm-name-link { color: rgba(255,255,255,.85) !important; text-decoration: none !important; font-weight: 600 !important; transition: color .12s !important; }
    .csm-name-link:hover { color: var(--gb-brand-label,#7db82a) !important; }

    .csm-chk { width: 16px !important; height: 16px !important; border: 1px solid rgba(255,255,255,.3) !important; border-radius: 4px !important; display: flex !important; align-items: center !important; justify-content: center !important; cursor: pointer !important; transition: all .15s !important; background: rgba(0,0,0,.2) !important; margin: 0 auto !important; box-sizing: border-box !important; user-select: none !important; -webkit-user-select: none !important; flex-shrink: 0 !important; }
    .csm-chk:hover { border-color: rgba(255,255,255,.6) !important; }
    .csm-chk.checked { background: var(--gb-brand-label,#7db82a) !important; border-color: var(--gb-brand-label,#7db82a) !important; }
    .csm-chk svg { opacity: 0 !important; width: 10px !important; height: 10px !important; color: var(--gb-surface-base,#111) !important; stroke-width: 3 !important; transition: opacity .15s !important; }
    .csm-chk.checked svg { opacity: 1 !important; }

    .csm-badge { display: inline-flex !important; align-items: center !important; justify-content: center !important; padding: 2px 6px !important; border-radius: 4px !important; font: 600 7.5px/1 "Menlo","Consolas",monospace,inherit !important; white-space: nowrap !important; letter-spacing: .2px !important; text-transform: uppercase !important; }
    .csm-badge-c { background: rgba(var(--gb-brand-label-rgb,125,184,42),.12) !important; color: var(--gb-brand-label,#7db82a) !important; border: 1px solid rgba(var(--gb-brand-label-rgb,125,184,42),.25) !important; }
    .csm-badge-a { background: rgba(106,176,243,.12) !important; color: var(--gb-info, #6ab0f3) !important; border: 1px solid rgba(106,176,243,.25) !important; }

    .csm-state-row td { text-align: center !important; padding: 64px 20px !important; color: rgba(255,255,255,.4) !important; font-size: 14px !important; font-weight: 500 !important; }

    /* Footer */
    #__gb-csm-footer {
      padding: 12px 20px !important; flex-shrink: 0 !important;
      border-top: 1px solid rgba(255,255,255,.06) !important; background: rgba(0,0,0,.2) !important;
      display: flex !important; align-items: center !important; justify-content: space-between !important;
    }
    #__gb-csm-sel-info { font-size: 13px !important; color: rgba(255,255,255,.6) !important; font-weight: 500 !important; margin-right: 4px !important; }
    #__gb-csm-run {
      height: 38px !important; padding: 0 16px !important; border-radius: 8px !important; margin: 0 !important;
      background: var(--gb-brand,#6e901d) !important; border: 1px solid var(--gb-brand-border,#4a6b14) !important;
      color: var(--gb-brand-text,#d8eeaa) !important; font-weight: 600 !important; font-size: 13px !important;
      cursor: pointer !important; transition: all .15s !important; display: flex !important; align-items: center !important; font-family: inherit !important;
    }
    #__gb-csm-run:hover:not(:disabled) { filter: brightness(1.1) !important; }
    #__gb-csm-run:disabled { opacity: .5 !important; cursor: not-allowed !important; filter: grayscale(1) !important; }

    @keyframes __gbCsmSpin { to{transform:rotate(360deg)} }
    .csm-spin { width: 18px !important; height: 18px !important; border: 3px solid rgba(var(--gb-brand-label-rgb,125,184,42),.2) !important; border-top-color: var(--gb-brand-label,#7db82a) !important; border-radius: 50% !important; animation: __gbCsmSpin .7s linear infinite !important; display: inline-block !important; flex-shrink: 0 !important; }
  `;
  document.head.appendChild(st);
})();

// ── Helpers ───────────────────────────────────────────────────────────────────

function csmContactUrl(id) {
  const [type, num] = (id || '').split('_');
  if (type === 'contact') return `${_CSM_BASE}Default.aspx?Page=239&ContactID=${num}`;
  if (type === 'account') return `${_CSM_BASE}Default.aspx?Page=267&AccountID=${num}`;
  return '';
}
function csmFmtDate(iso) { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? '—' : `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`; }
function csmFmtMoney(n) { if (n == null || n === '') return '—'; return '$' + Number(n).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}); }
function csmEsc(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function csmExtractVars(doc) {
  const val = id => { const el = doc.getElementById(id); return (el?.value||el?.getAttribute('value')||el?.textContent||'').trim(); };
  const v = {};
  v.firstName = val('lblContactFirstName')||val('tbContactFirstName'); v.lastName = val('lblContactLastName')||val('tbContactLastName');
  v.middleInit = val('lblContactMiddleInit')||val('tbContactMiddleInit'); v.fullName = [v.firstName,v.middleInit,v.lastName].filter(Boolean).join(' ');
  v.companyName = val('lblContactCompanyName')||val('tbContactCompanyName'); v.contactEmail = val('lblContactEmail')||val('tbContactEmailAddress');
  v.contactId = val('tbContactId')||val('tbContactID'); v.accountName = val('Name'); v.accountId = val('AccountID');
  const rs = doc.getElementById('ddlSalesRepId'); v.salesRep = rs?(rs.options[rs.selectedIndex]?.text?.trim()||''):'';
  const n = new Date(); v.today = `${n.getMonth()+1}/${n.getDate()}/${n.getFullYear()}`; v.todayLong = n.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  return v;
}

// Known brands matched against dtOI item names on the contact page
const _CSM_BRANDS = [
  'Titleist','Callaway','TaylorMade','Bridgestone','Srixon','Ping','Cobra',
  'Cleveland','Volvik','Wilson','Mizuno','Odyssey','Top Flite','Vice','OnCore',
  'Kirkland','Maxfli','Nitro','Pinnacle','Precept','Tour Edge','Acushnet','Noodle'
];

function csmExtractPurchasedBrands(doc) {
  const brands = new Set();
  doc.querySelectorAll('table.dtOI tbody tr td:first-child').forEach(td => {
    const itemName = td.textContent.trim();
    for (const brand of _CSM_BRANDS) {
      if (itemName.toLowerCase().startsWith(brand.toLowerCase())) {
        brands.add(brand); break;
      }
    }
  });
  return brands;
}

function csmExtractEmailSubjects(doc) {
  const decoder = doc.createElement('textarea');
  const subjects = [];
  doc.querySelectorAll('tr[data-gbep]').forEach(tr => {
    const tds = tr.querySelectorAll('td');
    if (tds.length < 4) return;
    decoder.innerHTML = tds[3].textContent;
    const plain = decoder.value.replace(/\s+/g, ' ').trim().toLowerCase();
    if (plain) subjects.push(plain);
  });
  return subjects;
}

function csmMatchesSubjectFilter(doc, step) {
  const mode    = step.subjectFilterMode || 'off';
  const decoder = doc.createElement('textarea');
  const filters = (step.subjectFilters || []).map(s => {
    decoder.innerHTML = s;
    return decoder.value.replace(/\s+/g, ' ').trim().toLowerCase();
  }).filter(Boolean);
  if (mode === 'off' || !filters.length) return true;
  const subjects = csmExtractEmailSubjects(doc);
  const found    = filters.some(f => subjects.some(s => s.includes(f)));
  if (mode === 'skip_if_found'   && found)  return false;
  if (mode === 'skip_if_missing' && !found) return false;
  return true;
}

function csmEvaluateConditions(step, doc, vars) {
  const conds = step.conditions || [];
  if (!conds.length) return true;
  const logic = step.conditionLogic || 'all';

  const emailRows = [...doc.querySelectorAll('tr[data-gbep]')].filter(tr=>tr.querySelectorAll('td').length>=5);
  const orderRows = [...doc.querySelectorAll('table.dtORD tbody tr')];
  const itemRows  = [...doc.querySelectorAll('table.dtOI tbody tr')];
  const taskRows  = [...doc.querySelectorAll('tr[id^="taskrow_"]')];

  const isSent     = tr => (tr.querySelectorAll('td')[1]?.textContent||'').toLowerCase().includes('golfballs.com');
  const isReceived = tr => !isSent(tr);
  const emailDate  = tr => { const s=tr.querySelectorAll('td')[4]?.textContent.trim()||''; const d=new Date(s); return isNaN(d)?null:d; };
  const daysDiff   = d => d?Math.floor((Date.now()-d.getTime())/86400000):Infinity;
  const parseAmt   = s => parseFloat((s||'').replace(/[$,]/g,''))||0;
  const numCmp     = (a,op,b) => { const n=parseFloat(b)||0; return op==='gt'?a>=n:op==='lt'?a<=n:a===n; };
  const decode     = s => { const t=doc.createElement('textarea'); t.innerHTML=s||''; return t.value.replace(/[ \t\r\n]+/g,' ').trim().toLowerCase(); };
  const subj       = tr => decode(tr.querySelectorAll('td')[3]?.textContent||'');

  function evalOne(cond) {
    const {field,op,val}=cond; const v=decode(val); const pts=(val||'').split('|||'); const vN=pts[0]!==''?(parseFloat(pts[0])??0):1; const vT=decode(pts[1]||'');
    if(field==='orderCount')        return numCmp(orderRows.length,op,val);
    if(field==='hasOrdered')        { const h=orderRows.length>0; return op==='is'?h:!h; }
    if(field==='daysSinceOrder')    { const dates=orderRows.map(tr=>new Date(tr.querySelectorAll('td')[2]?.textContent.trim()||'')).filter(d=>!isNaN(d)); if(!dates.length)return op==='gt'; return numCmp(Math.min(...dates.map(d=>daysDiff(d))),op,val); }
    if(field==='totalSpend')        return numCmp(orderRows.reduce((s,tr)=>s+parseAmt(tr.querySelectorAll('td')[3]?.textContent),0),op,val);
    if(field==='orderedBrand')      { const norm=s=>s.toLowerCase().replace(/[\s\-]+/g,''); const f=itemRows.some(tr=>norm(tr.querySelector('td')?.textContent||'').startsWith(norm(v))); return op==='is'?f:!f; }
    if(field==='orderKeyword')      { const f=itemRows.some(tr=>(tr.querySelector('td')?.textContent||'').toLowerCase().includes(v)); return op==='has'?f:!f; }
    if(field==='emailSubject')      { const f=emailRows.some(tr=>subj(tr).includes(v)); return op==='has'?f:!f; }
    if(field==='emailSubjectCount') { const count=emailRows.filter(tr=>subj(tr).includes(vT)).length; return numCmp(count,op,String(vN)); }
    if(field==='sentSubject')       { const f=emailRows.filter(isSent).some(tr=>subj(tr).includes(v)); return op==='has'?f:!f; }
    if(field==='sentSubjectCount')  { const count=emailRows.filter(isSent).filter(tr=>subj(tr).includes(vT)).length; return numCmp(count,op,String(vN)); }
    if(field==='sentDaysAgo')       { const dates=emailRows.filter(isSent).map(emailDate).filter(Boolean); if(!dates.length)return op==='gt'; return numCmp(Math.min(...dates.map(daysDiff)),op,val); }
    if(field==='receivedSubject')   { const f=emailRows.filter(isReceived).some(tr=>subj(tr).includes(v)); return op==='has'?f:!f; }
    if(field==='receivedSubjectCount') { const count=emailRows.filter(isReceived).filter(tr=>subj(tr).includes(vT)).length; return numCmp(count,op,String(vN)); }
    if(field==='receivedDaysAgo')   { const dates=emailRows.filter(isReceived).map(emailDate).filter(Boolean); if(!dates.length)return op==='gt'; return numCmp(Math.min(...dates.map(daysDiff)),op,val); }
    if(field==='hasReplied')        { const h=emailRows.some(isReceived); return op==='is'?h:!h; }
    if(field==='repliedToSubject')  { const f=emailRows.filter(isReceived).some(tr=>subj(tr).includes(v)); return op==='has'?f:!f; }
    if(field==='openTaskCat')       { return taskRows.some(tr=>{const cat=(tr.querySelector('td[id^="category_"]')?.textContent.trim()||'').toLowerCase(); const st=(tr.querySelector('td[id^="status_"]')?.textContent.trim()||'').toLowerCase(); return !st.includes('complete')&&(op==='has'?cat.includes(v):!cat.includes(v));}); }
    if(field==='openTaskCount')     { const open=taskRows.filter(tr=>!(tr.querySelector('td[id^="status_"]')?.textContent.trim()||'').toLowerCase().includes('complete')).length; return numCmp(open,op,val); }
    if(field==='taskActivityDays')  { const dates=taskRows.map(tr=>{const s=tr.querySelector('td[id^="livedate_"]')?.textContent.trim()||''; return new Date(s);}).filter(d=>!isNaN(d)); if(!dates.length)return op==='gt'; return numCmp(Math.min(...dates.map(d=>daysDiff(d))),op,val); }
    if(field==='taskSubject')       { const f=taskRows.some(tr=>(tr.querySelector('td[id^="subject_"]')?.textContent.trim()||'').toLowerCase().includes(v)); return op==='has'?f:!f; }
    if(field==='hasEmail')          { const h=!!(vars.contactEmail&&vars.contactEmail.includes('@')); return op==='is'?h:!h; }
    if(field==='companyName')       { const cn=(vars.companyName||'').toLowerCase(); return op==='has'?cn.includes(v):!cn.includes(v); }
    if(field==='repName')           { const rn=(vars.salesRep||'').toLowerCase(); return op==='has'?rn.includes(v):!rn.includes(v); }
    if(field==='calledDaysAgo'||field==='callCount'||field==='hasBeenCalled') {
      const actRows=[...doc.querySelectorAll('#ActivityTable tbody tr')];
      const callRows=actRows.filter(tr=>{
        const cat=(tr.querySelectorAll('td')[2]?.textContent||'').toLowerCase();
        const subj=(tr.querySelectorAll('td')[4]?.textContent||'').toLowerCase();
        return cat.includes('call')||cat.includes('phone')||subj.includes('call');
      });
      if(field==='hasBeenCalled') { return op==='is'?callRows.length>0:callRows.length===0; }
      if(field==='callCount')     { return numCmp(callRows.length,op,val); }
      if(field==='calledDaysAgo') {
        const dates=callRows.map(tr=>emailDate(tr)).filter(Boolean);
        if(!dates.length) return op==='gt';
        return numCmp(Math.min(...dates.map(daysDiff)),op,val);
      }
    }
    return true;
  }
  const results = conds.map(evalOne);
  return logic==='any' ? results.some(Boolean) : results.every(Boolean);
}
function csmCheckBrandFilter(doc, brands) {
  if (!brands || !brands.length) return true;
  const itemRows = [...doc.querySelectorAll('table.dtOI tbody tr')];
  const norm = s => s.toLowerCase().replace(/[\s\-]+/g, '');
  return brands.every(brand =>
    itemRows.some(tr => norm(tr.querySelector('td')?.textContent || '').startsWith(norm(brand)))
  );
}
function csmCheckEmailGate(doc, step, sentThisRun = new Set()) {
  const emailRows = [...doc.querySelectorAll('tr[data-gbep]')].filter(tr => tr.querySelectorAll('td').length >= 5);
  const isSent     = tr => (tr.querySelectorAll('td')[1]?.textContent||'').toLowerCase().includes('golfballs.com');
  const isReceived = tr => !isSent(tr);
  const decode     = s => { const t=doc.createElement('textarea'); t.innerHTML=s||''; return t.value.replace(/[ \t\r\n]+/g,' ').trim().toLowerCase(); };
  const subj       = tr => decode(tr.querySelectorAll('td')[3]?.textContent||'');
  const sentSubjs  = emailRows.filter(isSent).map(subj);
  const recvSubjs  = emailRows.filter(isReceived).map(subj);
  for (const tag of (step.skipIfRepliedTo || [])) { if (recvSubjs.some(s => s.includes(tag.toLowerCase()))) return false; }
  for (const tag of (step.skipIfSent || [])) {
    const t = tag.toLowerCase();
    if (sentSubjs.some(s=>s.includes(t)) || sentThisRun.has(t)) return false;
  }
  for (const tag of (step.skipIfNotSent || [])) {
    const t = tag.toLowerCase();
    if (!sentSubjs.some(s=>s.includes(t)) && !sentThisRun.has(t)) return false;
  }
  return true;
}
function csmToPlain(html) {
  let t = (html || '').replace(/<br\s*\/?>\s*<\/p>/gi, '</p>')
    .replace(/<br\s*\/?>/gi, '\r\n').replace(/<\/p>/gi, '\r\n\r\n')
    .replace(/<\/li>/gi, '\r\n').replace(/<\/[ou]l>/gi, '\r\n')
    .replace(/<[^>]+>/g, '');
  const d = document.createElement('textarea');
  d.innerHTML = t;
  return d.value.replace(/(\r\n|\n){3,}/g, '\r\n\r\n').trim();
}

// ── View helpers ──────────────────────────────────────────────────────────────

function csmGetVisible() {
  const q = _csmSearchQ.toLowerCase();
  return _csmAll.filter(r => {
    if (_csmFilterType && (r.recordType_s||'').toLowerCase() !== _csmFilterType.toLowerCase()) return false;
    if (!q) return true;
    return [(r.contactName_t||r.accountName_t||''), (r.emails_tps?.[0]||r.email_tp?.[0]||''), (r.salesRep_s||'')].some(v => v.toLowerCase().includes(q));
  }).sort((a,b) => {
    const dir = _csmSortDir==='asc'?1:-1, av=a[_csmSortField], bv=b[_csmSortField];
    if (av==null&&bv==null) return 0; if (av==null) return 1; if (bv==null) return -1;
    return typeof av==='string' ? dir*av.localeCompare(bv) : dir*(av-bv);
  });
}

function csmRenderRows(tbody) {
  _csmLastIdx = -1;
  const visible = csmGetVisible();
  if (!visible.length) {
    tbody.innerHTML = `<tr class="csm-state-row"><td colspan="9">No results. ${_csmQbActive?'Try a different query.':'Enter a search term and press Enter, or use Query Builder.'}</td></tr>`;
    csmUpdateSelInfo(); return 0;
  }
  tbody.innerHTML = '';
  visible.forEach((r, idx) => {
    const isC = (r.recordType_s||'').toLowerCase()==='contact';
    const url = csmContactUrl(r.id), name = r.contactName_t||r.accountName_t||'—';
    const email = r.emails_tps?.[0]||r.email_tp?.[0]||'—', isSel = _csmSelected.has(r.id);
    const tr = document.createElement('tr');
    tr.dataset.id=r.id; tr.dataset.idx=idx; if(isSel) tr.classList.add('selected');
    tr.innerHTML = `
      <td style="width:50px;padding-right:0 !important;">
        <div class="csm-chk row-chk ${isSel?'checked':''}" data-id="${csmEsc(r.id)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
      </td>
      <td><a class="csm-name-link" href="${url}" target="_blank" rel="noopener">${csmEsc(name)}</a></td>
      <td><span class="csm-badge ${isC?'csm-badge-c':'csm-badge-a'}">${isC?'Contact':'Account'}</span></td>
      <td style="font-size:12px;">${csmEsc(email)}</td>
      <td style="font-size:12px;color:rgba(255,255,255,.55);">${csmEsc(r.salesRep_s||'—')}</td>
      <td style="font-size:12px;font-variant-numeric:tabular-nums;">${r.orderCount_i??'—'}</td>
      <td style="font-size:12px;font-variant-numeric:tabular-nums;">${csmFmtMoney(r.yearToDateRevenue_f)}</td>
      <td style="font-size:12px;font-variant-numeric:tabular-nums;">${csmFmtMoney(r.priorYearRevenue_f)}</td>
      <td style="font-size:12px;font-variant-numeric:tabular-nums;">${csmFmtDate(r.lastOrderDate_dt)}</td>
      `;
    tbody.appendChild(tr);
  });
  csmUpdateSelInfo(); return visible.length;
}

function csmUpdateSelInfo() {
  const n = _csmSelected.size;
  const el = document.getElementById('__gb-csm-sel-info');
  if (el) el.textContent = `Campaign Actions (${n} selected)`;
  const ca = document.getElementById('csm-chk-all');
  if (ca) { const vis=csmGetVisible(); ca.classList.toggle('checked', vis.length>0 && vis.every(r=>_csmSelected.has(r.id))); }
  const run = document.getElementById('__gb-csm-run');
  if (run) run.disabled = !_csmCampaign || n===0;
}

function csmUpdateCount(n, total) {
  const el = document.getElementById('__gb-csm-count');
  if (el) el.textContent = n===total ? `${total} results` : `${n} of ${total} results`;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function csmFetch(qStr) {
  const body = `${qStr}&sort=${_csmSortField} ${_csmSortDir}&rows=${_CSM_ROWS}&qf=${encodeURIComponent(_CSM_QF)}&q.op=AND&sow=false&defType=edismax`;
  const resp = await fetch(_CSM_API, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({str:body}) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return JSON.parse((await resp.json()).d);
}

// ── Open modal ────────────────────────────────────────────────────────────────

window.__gbShowCrmSearchModal = async function () {
  if (document.getElementById('__gb-csm-overlay')) return;

  _csmAll=[]; _csmSelected=new Set(); _csmLastIdx=-1; _csmCampaign='';
  _csmSearchQ=''; _csmFilterType=''; _csmQbActive=false; _csmQbStr='';
  _csmSortField='lastOrderDate_dt'; _csmSortDir='desc';

  const overlay = document.createElement('div');
  overlay.id = '__gb-csm-overlay';
  overlay.innerHTML = `
    <div id="__gb-csm-card">
      <div id="__gb-csm-hdr">
        <div id="__gb-csm-hdr-icon">
          <svg fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </div>
        <div>
          <div id="__gb-csm-hdr-title">CRM Search</div>
          <div id="__gb-csm-hdr-sub">Search contacts &amp; accounts · select · run campaigns</div>
        </div>
        <button type="button" id="__gb-csm-close">
          <svg fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Close
        </button>
      </div>

      <div id="__gb-csm-toolbar">
        <div id="__gb-csm-search-wrap">
          <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input id="__gb-csm-search" type="text" placeholder="Search name, email, sales rep… (press Enter)">
        </div>
        <div class="csm-dd-wrap" id="wrap_csm-type" style="width:150px;">
          <button type="button" class="csm-dd-btn" id="btn_csm-type">
            <span class="csm-btn-label" id="label_csm-type">All types</span>
            <svg class="csm-dd-chev" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="csm-dd-menu" id="menu_csm-type">
            <div class="csm-dd-opt selected" data-value=""><span>All types</span></div>
            <div class="csm-dd-opt" data-value="Contact"><span>Contacts only</span></div>
            <div class="csm-dd-opt" data-value="Account"><span>Accounts only</span></div>
          </div>
        </div>
        <button type="button" id="__gb-csm-qb-btn">
          <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          Query Builder
        </button>
        <span id="__gb-csm-count"></span>
      </div>

      <div id="__gb-csm-qb-bar">
        <svg width="13" height="13" fill="none" stroke="var(--gb-brand-label,#7db82a)" stroke-width="2" viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        <span style="color:var(--gb-brand-label,#7db82a);font-weight:600;flex-shrink:0;">QB filter active:</span>
        <span id="__gb-csm-qb-preview"></span>
        <button type="button" id="__gb-csm-qb-clear">✕ clear</button>
      </div>

      <div id="__gb-csm-body">
        <table id="__gb-csm-table">
          <thead>
            <tr>
              <th style="width:50px;padding-right:0 !important;cursor:default !important;">
                <div class="csm-chk" id="csm-chk-all" title="Select all visible">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
              </th>
              <th data-col="contactName_t">Name</th>
              <th data-col="recordType_s">Type</th>
              <th data-col="emails_tps">Email</th>
              <th data-col="salesRep_s">Sales Rep</th>
              <th data-col="orderCount_i">Orders</th>
              <th data-col="yearToDateRevenue_f">YTD Rev</th>
              <th data-col="priorYearRevenue_f">PY Rev</th>
              <th data-col="lastOrderDate_dt" class="sort-desc">Last Order</th>
            </tr>
          </thead>
          <tbody id="__gb-csm-tbody">
            <tr class="csm-state-row"><td colspan="9">
              Enter a search term and press <strong>Enter</strong>, or click <strong>Query Builder</strong> for advanced filtering.
            </td></tr>
          </tbody>
        </table>
      </div>

      <div id="__gb-csm-footer">
        <div style="display:flex;align-items:center;gap:12px;">
          <div id="__gb-csm-sel-info">Campaign Actions (0 selected)</div>
        </div>
        <div style="display:flex;gap:10px;align-items:center;">
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <div class="csm-dd-wrap dropup" id="wrap_csm-campaign" style="width:220px;">
            <button type="button" class="csm-dd-btn" id="btn_csm-campaign">
              <span class="csm-btn-label" id="label_csm-campaign">Loading campaigns…</span>
              <svg class="csm-dd-chev" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="csm-dd-menu" id="menu_csm-campaign">
              <div class="csm-dd-opt selected" data-value=""><span>— select campaign —</span></div>
            </div>
          </div>
          </div>
          <button type="button" id="btn-csm-new-campaign" title="Create or edit campaigns" style="height:38px !important;width:38px !important;border-radius:8px !important;border:1px solid rgba(255,255,255,.12) !important;background:rgba(255,255,255,.06) !important;color:rgba(255,255,255,.7) !important;font-size:16px !important;font-weight:600 !important;cursor:pointer !important;display:inline-flex !important;align-items:center !important;justify-content:center !important;flex-shrink:0 !important;transition:all .15s !important;">+</button>
          <button type="button" id="__gb-csm-run" disabled>Run Campaign</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const tbody = document.getElementById('__gb-csm-tbody');

  // ── Dropdown binder ───────────────────────────────────────────────────────
  const bindDD = (baseId, cb) => {
    const wrap=document.getElementById('wrap_'+baseId), btn=document.getElementById('btn_'+baseId);
    const menu=document.getElementById('menu_'+baseId), label=document.getElementById('label_'+baseId);
    if (!wrap||!btn||!menu||!label) return;
    const opts = menu.querySelectorAll('.csm-dd-opt');
    if (!btn.dataset.bound) {
      btn.dataset.bound='1';
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = menu.classList.contains('open');
        document.querySelectorAll('.csm-dd-menu.open').forEach(m=>m.classList.remove('open'));
        document.querySelectorAll('.csm-dd-btn.open').forEach(b=>b.classList.remove('open'));
        if (!isOpen) { menu.classList.add('open'); btn.classList.add('open'); }
      });
      document.addEventListener('click', e => { if (!wrap.contains(e.target)) { menu.classList.remove('open'); btn.classList.remove('open'); } });
    }
    opts.forEach(opt => opt.addEventListener('click', e => {
      e.stopPropagation();
      const val = opt.getAttribute('data-value');
      label.textContent = opt.querySelector('span')?.textContent || opt.textContent;
      opts.forEach(o=>o.classList.remove('selected')); opt.classList.add('selected');
      menu.classList.remove('open'); btn.classList.remove('open');
      if (cb) cb(val);
    }));
  };

  // ── Close ─────────────────────────────────────────────────────────────────
  const close = () => {
    overlay.style.opacity='0'; overlay.style.transition='opacity .15s';
    _csmSelected.clear(); _csmLastIdx=-1;
    setTimeout(()=>overlay.remove(),160);
    document.removeEventListener('keydown', onKey);
  };
  document.getElementById('__gb-csm-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target===overlay) close(); });
  const onKey = e => { if (e.key==='Escape') close(); };
  document.addEventListener('keydown', onKey);

  // ── Local search input (client-side filter on already-loaded results) ─────
  document.getElementById('__gb-csm-search')?.addEventListener('input', e => {
    _csmSearchQ = e.target.value;
    const n = csmRenderRows(tbody);
    csmUpdateCount(n, _csmAll.length);
  });

  // Press Enter in search box → fetch from Solr using text as query
  document.getElementById('__gb-csm-search')?.addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    const term = e.target.value.trim();
    if (!term && !_csmQbActive) return;
    _csmQbActive=false; _csmQbStr='';
    document.getElementById('__gb-csm-qb-btn')?.classList.remove('active');
    const bar = document.getElementById('__gb-csm-qb-bar');
    if (bar) bar.classList.remove('visible');
    await loadResults(term ? (term.includes(' ') ? `"${term}"` : term) : '*:*');
  });

  // ── Type filter ───────────────────────────────────────────────────────────
  bindDD('csm-type', val => {
    _csmFilterType = val;
    const n = csmRenderRows(tbody);
    csmUpdateCount(n, _csmAll.length);
  });

  // ── Sort ──────────────────────────────────────────────────────────────────
  document.querySelector('#__gb-csm-table thead').addEventListener('click', e => {
    const th = e.target.closest('th[data-col]'); if (!th) return;
    const col = th.dataset.col;
    if (_csmSortField===col) { _csmSortDir = _csmSortDir==='asc'?'desc':'asc'; }
    else { _csmSortField=col; _csmSortDir='asc'; }
    document.querySelectorAll('#__gb-csm-table thead th[data-col]').forEach(h=>h.classList.remove('sort-asc','sort-desc'));
    th.classList.add(_csmSortDir==='asc'?'sort-asc':'sort-desc');
    const n = csmRenderRows(tbody); csmUpdateCount(n, _csmAll.length);
  });

  // ── Header checkbox ───────────────────────────────────────────────────────
  document.getElementById('csm-chk-all')?.addEventListener('click', () => {
    const vis=csmGetVisible(), allSel=vis.length>0&&vis.every(r=>_csmSelected.has(r.id));
    if (allSel) vis.forEach(r=>_csmSelected.delete(r.id));
    else        vis.forEach(r=>_csmSelected.add(r.id));
    csmRenderRows(tbody); csmUpdateCount(csmGetVisible().length, _csmAll.length);
  });

  // ── Row checkboxes ────────────────────────────────────────────────────────
  tbody.addEventListener('click', e => {
    const chk = e.target.closest('.row-chk'); if (!chk) return;
    if (e.shiftKey) window.getSelection()?.removeAllRanges();
    const id=chk.dataset.id, vis=csmGetVisible(), curIdx=vis.findIndex(r=>r.id===id), isSel=!_csmSelected.has(id);
    if (e.shiftKey && _csmLastIdx>=0 && curIdx>=0) {
      const lo=Math.min(_csmLastIdx,curIdx), hi=Math.max(_csmLastIdx,curIdx);
      const rows=tbody.querySelectorAll('tr[data-id]');
      for (let i=lo;i<=hi;i++) {
        const tId=vis[i].id, tr=rows[i]; if(!tr) continue;
        const c=tr.querySelector('.row-chk');
        if(isSel){_csmSelected.add(tId);c?.classList.add('checked');tr.classList.add('selected');}
        else{_csmSelected.delete(tId);c?.classList.remove('checked');tr.classList.remove('selected');}
      }
    } else {
      const tr=chk.closest('tr');
      if(isSel){_csmSelected.add(id);chk.classList.add('checked');tr.classList.add('selected');}
      else{_csmSelected.delete(id);chk.classList.remove('checked');tr.classList.remove('selected');}
    }
    _csmLastIdx=curIdx; csmUpdateSelInfo();
  });

  // ── QB button ─────────────────────────────────────────────────────────────
  document.getElementById('__gb-csm-qb-btn')?.addEventListener('click', () => {
    if (typeof qbOpenModal !== 'function') {
      const sub=document.getElementById('__gb-csm-hdr-sub');
      if (sub) sub.textContent='Query Builder only available on CRM Search page (Page=360)'; return;
    }
    // Hide CSM — preserves selections, results, and scroll position
    const csmOvr=document.getElementById('__gb-csm-overlay');
    if (csmOvr) {
      csmOvr.style.transition='opacity .18s ease'; csmOvr.style.opacity='0';
      setTimeout(() => { csmOvr.style.display='none'; }, 180);
    }

    const restoreCsm = () => {
      const csmOvr2=document.getElementById('__gb-csm-overlay'); if (!csmOvr2) return;
      csmOvr2.style.display='';
      requestAnimationFrame(() => requestAnimationFrame(() => { csmOvr2.style.opacity='1'; }));
    };

    // Remove any stale overlay left by the page's own QB iframe button — its guard
    // (getElementById check) would otherwise return early and never open a fresh modal
    document.getElementById('__gb-qb-overlay')?.remove();

    // Pass restoreCsm as onClose — QB's own X/backdrop/Escape close handlers restore CSM
    qbOpenModal(restoreCsm);
    // Only intercept Run — QB owns all other close paths via onClose above
    requestAnimationFrame(() => {
      const qbOvr=document.getElementById('__gb-qb-overlay'); if (!qbOvr) return;
      const orig=qbOvr.querySelector('#__gb-qb-run'); if (!orig) return;
      const fresh=orig.cloneNode(true); orig.parentNode.replaceChild(fresh,orig);
      fresh.addEventListener('click', async () => {
        if (typeof qbBuildQuery!=='function') return;
        const q=qbBuildQuery(); if (!q) return;
        _csmQbActive=true; _csmQbStr=q;
        // Trigger QB's own close — cleans up its state and calls onClose (restoreCsm)
        qbOvr.querySelector('#__gb-qb-close')?.click();
        setTimeout(async () => {
          document.getElementById('__gb-csm-qb-btn')?.classList.add('active');
          const bar=document.getElementById('__gb-csm-qb-bar'), prev=document.getElementById('__gb-csm-qb-preview');
          if (bar) bar.classList.add('visible');
          if (prev) prev.textContent=q.length>100?q.slice(0,100)+'…':q;
          await loadResults(q);
        }, 250);
      });
    });
  });

  document.getElementById('__gb-csm-qb-clear')?.addEventListener('click', () => {
    _csmQbActive=false; _csmQbStr='';
    document.getElementById('__gb-csm-qb-btn')?.classList.remove('active');
    const bar=document.getElementById('__gb-csm-qb-bar'); if(bar) bar.classList.remove('visible');
    _csmAll=[]; tbody.innerHTML=`<tr class="csm-state-row"><td colspan="9">Filter cleared — search or build a new query.</td></tr>`;
    csmUpdateCount(0,0); csmUpdateSelInfo();
  });

  // ── Load results from Solr ────────────────────────────────────────────────
  async function loadResults(qStr='*:*') {
    const sub=document.getElementById('__gb-csm-hdr-sub');
    tbody.innerHTML=`<tr class="csm-state-row"><td colspan="9"><div style="display:flex;align-items:center;justify-content:center;gap:12px;"><div class="csm-spin"></div>Searching…</div></td></tr>`;
    if (sub) sub.textContent='Searching…';
    try {
      const data=await csmFetch(qStr);
      _csmAll=data.response?.docs||[];
      _csmSelected=new Set([..._csmSelected].filter(id=>_csmAll.some(r=>r.id===id)));
      const n=csmRenderRows(tbody), total=data.response?.numFound??_csmAll.length;
      csmUpdateCount(n,_csmAll.length);
      if (sub) sub.textContent=`${_csmAll.length} result${_csmAll.length!==1?'s':''}${total>_CSM_ROWS?` (of ${total.toLocaleString()} — refine your query)`:''}`;
    } catch(err) {
      tbody.innerHTML=`<tr class="csm-state-row"><td colspan="9" style="color:var(--gb-error,#c86060);">Search failed: ${csmEsc(err.message)}</td></tr>`;
      if (sub) sub.textContent='Error';
    }
  }

  // ── Campaign templates ────────────────────────────────────────────────────
  chrome.storage.local.get(['templates','noteTemplates','campaigns'],({templates,noteTemplates,campaigns})=>{
    _csmTemplates = (templates   || []).filter(t => t.type === 'account' && t.enabled !== false);
    _csmCampaigns = campaigns || [];
    const menu = document.getElementById('menu_csm-campaign'); if (!menu) return;
    if (_csmCampaigns.length) {
      menu.innerHTML = '<div class="csm-dd-opt selected" data-value=""><span>— select campaign —</span></div>' +
        _csmCampaigns.map(c => `<div class="csm-dd-opt" data-value="${csmEsc(c.id)}"><span>${csmEsc(c.name)}</span></div>`).join('');
    } else {
      menu.innerHTML = '<div class="csm-dd-opt selected" data-value=""><span>No campaigns — click + to create</span></div>';
    }
    document.getElementById('label_csm-campaign').textContent = '— select campaign —';
    bindDD('csm-campaign', val => { _csmCampaign = val; csmUpdateSelInfo(); });

    // + button opens campaign editor
    const newBtn = document.getElementById('btn-csm-new-campaign');
    if (newBtn && !newBtn.__ceWired) {
      newBtn.__ceWired = true;
      newBtn.addEventListener('click', () => {
        if (typeof window.__gbShowCampaignEditor !== 'function') return;
        // Hide CSM (don't remove — preserves checklist state and selected rows)
        const csmOvr = document.getElementById('__gb-csm-overlay');
        if (csmOvr) {
          csmOvr.style.transition = 'opacity .18s ease';
          csmOvr.style.opacity = '0';
          setTimeout(() => { csmOvr.style.display = 'none'; }, 180);
        }

        const refreshCeDropdown = updatedCampaigns => {
          _csmCampaigns = updatedCampaigns || [];
          const m2 = document.getElementById('menu_csm-campaign'); if (!m2) return;
          m2.innerHTML = (_csmCampaigns.length
            ? '<div class="csm-dd-opt selected" data-value=""><span>— select campaign —</span></div>' +
              _csmCampaigns.map(c2 => `<div class="csm-dd-opt" data-value="${csmEsc(c2.id)}"><span>${csmEsc(c2.name)}</span></div>`).join('')
            : '<div class="csm-dd-opt selected" data-value=""><span>No campaigns — click + to create</span></div>');
          _csmCampaign = '';
          bindDD('csm-campaign', val => { _csmCampaign = val; csmUpdateSelInfo(); });
        };

        window.__gbShowCampaignEditor(
          // onUpdate (Save clicked) — refresh dropdown only, CE stays open
          updatedCampaigns => {
            refreshCeDropdown(updatedCampaigns);
          },
          // onClose (Close/Cancel/Escape) — refresh dropdown + restore CSM
          updatedCampaigns => {
            refreshCeDropdown(updatedCampaigns);
            const csmOvr2 = document.getElementById('__gb-csm-overlay');
            if (csmOvr2) {
              csmOvr2.style.display = '';
              requestAnimationFrame(() => requestAnimationFrame(() => { csmOvr2.style.opacity = '1'; }));
            }
          }
        );
      });
    }
  });

  // ── Campaign runner ───────────────────────────────────────────────────────
   document.getElementById('__gb-csm-run')?.addEventListener('click', async () => {
    if (!_csmCampaign) return alert('Select a campaign from the dropdown first.');
    if (_csmSelected.size === 0) return alert('Select at least one contact first.');

    const campaign = _csmCampaigns.find(c => c.id === _csmCampaign);
    if (!campaign || !campaign.steps?.length) return alert('Campaign has no steps. Click + to edit it.');

    const {featureFlags,emailSignature,noteTemplates,gbEmployeeId} = await chrome.storage.local.get(['featureFlags','emailSignature','noteTemplates','gbEmployeeId']);
    const isPA  = featureFlags?.replyWithTemplateEnabled && featureFlags?.powerAutomateUrl;
    const empId = gbEmployeeId || '0';

    // Jitter delay: campaign setting overrides featureFlags global
    const delayBase = Math.max(5, campaign.delayBase ?? 60);
    const delayTol  = Math.max(0, campaign.delayTolerance ?? 20);
    const calcDelay = () => delayBase + Math.floor(Math.random() * (delayTol + 1));

    // Template lookup (email + note templates combined)
    const tplMap = {};
    _csmTemplates.forEach(t => { tplMap[t.id] = t; });
    (noteTemplates || []).forEach(t => { tplMap[t.id] = t; });

    function pickSplit(splits) {
      if (!splits?.length) return null;
      const total = splits.reduce((s, sp) => s + (sp.pct || 0), 0);
      let r = Math.random() * total, cum = 0;
      for (const sp of splits) { cum += (sp.pct || 0); if (r < cum) return sp.templateId; }
      return splits[splits.length - 1].templateId;
    }

    const runBtn = document.getElementById('__gb-csm-run');
    const runBtnOriginalText = runBtn.textContent;
    runBtn.disabled = true;
    const toRun = Array.from(_csmSelected);
    let paEmailsSentThisRun = 0;

    for (let i = 0; i < toRun.length; i++) {
      // Inter-contact delay: PA only, only after at least one email actually sent
      const hasExplicitDelay = campaign.steps.some(s => s.type === 'delay');
      if (paEmailsSentThisRun > 0 && isPA && !hasExplicitDelay) {
        const delaySec = calcDelay();
        for (let s = delaySec; s > 0; s--) {
          runBtn.textContent = `Waiting ${s}s… (${i}/${toRun.length})`;
          if (s % 20 === 0) chrome.runtime.sendMessage({ action: 'ping' });
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      runBtn.textContent = `Running ${i + 1}/${toRun.length}…`;

      const rid = toRun[i], row = _csmAll.find(r => r.id === rid);
      if (!row) continue;
      const tr = document.querySelector(`#__gb-csm-tbody tr[data-id="${rid}"]`);

      try {
        const contactUrl = csmContactUrl(rid);
        if (!contactUrl) throw new Error('No URL');
        const resp = await new Promise(res => chrome.runtime.sendMessage({ action:'fetchRaw', url:contactUrl }, res));
        if (!resp?.ok) throw new Error('Fetch failed');
        const doc = new DOMParser().parseFromString(resp.text, 'text/html');
        const base = doc.createElement('base'); base.href = _CSM_BASE; doc.head.appendChild(base);
        const vars = csmExtractVars(doc);
        // Augment with order/brand data for template variable injection
        const _oTrs = [...doc.querySelectorAll('table.dtORD tbody tr')];
        vars.orderCount    = String(_oTrs.length);
        vars.totalSpend    = '$' + _oTrs.reduce((s,tr)=>{
          return s+(parseFloat((tr.querySelectorAll('td')[3]?.textContent||'').replace(/[$,]/g,''))||0);
        },0).toFixed(2);
        vars.lastOrderDate = _oTrs[0]?.querySelectorAll('td')[2]?.textContent.trim() || '';
        vars.recentBrands  = [...new Set([...doc.querySelectorAll('table.dtOI tbody tr')].map(tr => {
          const n=tr.querySelector('td')?.textContent.trim()||'';
          return _CSM_BRANDS.find(b=>n.toLowerCase().startsWith(b.toLowerCase()))||'';
        }).filter(Boolean))].slice(0,4).join(', ');
        let baseToEmail = vars.contactEmail || row.emails_tps?.[0] || row.email_tp?.[0] || '';
        const fmt = d => `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
        const renderTask = s => (s||'').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);

        const sentThisRun       = new Set();
        const firedBranchGroups  = new Set();

        async function executeStep(step) {
          if (step.type === 'branch') {
            if (step.branchGroup && firedBranchGroups.has(step.branchGroup)) return;
            if (!csmEvaluateConditions(step, doc, vars)) return;
            if (step.branchGroup) firedBranchGroups.add(step.branchGroup);

            let emailSentInBranch = false;
            for (const child of (step.steps || [])) {
              if (child.type === 'email') {
                if (emailSentInBranch) continue;
                if (child.brandFilter?.length && !csmCheckBrandFilter(doc, child.brandFilter)) continue;
                if (!csmEvaluateConditions(child, doc, vars)) continue;
                if (!csmCheckEmailGate(doc, child, sentThisRun)) continue;
                if (!csmMatchesSubjectFilter(doc, child)) continue;
                const tplId = pickSplit(child.splits);
                const tpl = tplMap[tplId];
                if (!tpl) throw new Error(`Template not found (${tplId})`);
                let toEmail = baseToEmail, resolved = {};
                if (typeof resolveAllVarsAsync === 'function') {
                  const rx = await resolveAllVarsAsync(tpl.vars, tpl.toField, doc);
                  resolved = rx.resolved || {};
                  if (rx.toEmail) toEmail = rx.toEmail;
                }
                const ctx = { ...vars, ...resolved };
                const render = s => (s||'').replace(/\{\{(\w+)\}\}/g, (_,k) => ctx[k] ?? `{{${k}}}`);
                if (!toEmail?.includes('@')) throw new Error('No email address');
                const subject = render(tpl.subject), body = render(tpl.body);
                if (isPA) {
                  let htmlBody = body;
                  if (emailSignature) htmlBody += '<br><div>' + emailSignature + '</div>';
                  const paResult = await new Promise(res => chrome.runtime.sendMessage({
                    action:'paAutomate', paUrl:featureFlags.powerAutomateUrl,
                    payload:{ emails:[{ to:toEmail, subject, htmlBody, replyMode:child.replyMode||tpl.replyMode||'standalone' }] }
                  }, res));
                  if (paResult?.results?.[0]?.status !== 'sent') throw new Error(`PA: ${paResult?.results?.[0]?.error || 'Send failed'}`);
                } else {
                  window.open(`mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(csmToPlain(body))}`, '_blank');
                }
                if (child.subject) sentThisRun.add(child.subject.toLowerCase());
                emailSentInBranch = true;
                paEmailsSentThisRun++;

              } else if (child.type === 'complete_task') {
                // CSM: no task ownership — skip silently

              } else if (child.type === 'create_task') {
                if (!emailSentInBranch) continue;
                if (child.skipIfNotSent?.length) {
                  const missing = child.skipIfNotSent.some(t => !sentThisRun.has(t.toLowerCase()));
                  if (missing) continue;
                }
                if (!csmEvaluateConditions(child, doc, vars)) continue;
                const tpl = tplMap[child.noteTemplateId];
                if (tpl && vars.contactId) {
                  const today = new Date();
                  const due = tpl.daysOut != null ? (() => { const d=new Date(); d.setDate(d.getDate()+tpl.daysOut); return fmt(d); })() : fmt(today);
                  const payload = { TaskID:'', Subject:renderTask(tpl.subject||tpl.name), Description:renderTask(tpl.body||''),
                    LiveDate:fmt(today), DueDate:due, taskCategoryID:String(tpl.categoryId||'0'), taskStatusID:'1',
                    Priority:String(tpl.priority||'2'), contactID:String(vars.contactId), leadID:'0', employeeID:String(empId), caseID:0 };
                  await fetch(`https://api.golfballs.com/golfballs/crm/Admin/Task/Create.ajax?${encodeURIComponent(JSON.stringify(payload))}`, {credentials:'include'});
                }
              } else if (child.type === 'delay') {
                if (!emailSentInBranch) continue;
                if (isPA) {
                  const base = Math.max(5, child.delayBase ?? delayBase);
                  const tol  = Math.max(0, child.delayTolerance ?? delayTol);
                  const sec  = base + Math.floor(Math.random() * (tol + 1));
                  for (let s = sec; s > 0; s--) {
                    runBtn.textContent = `Waiting ${s}s…`;
                    if (s % 20 === 0) chrome.runtime.sendMessage({ action: 'ping' });
                    await new Promise(r => setTimeout(r, 1000));
                  }
                }
              }
            }
            // Signal to outer loop if email sent and campaign wants to stop
            if (emailSentInBranch) sentThisRun.add('__branch_sent__');
            return;
          }
          if (step.type === 'email') {
            if (step.brandFilter?.length && !csmCheckBrandFilter(doc, step.brandFilter)) return;
            if (!csmEvaluateConditions(step, doc, vars)) return;
            if (!csmCheckEmailGate(doc, step, sentThisRun)) return;
            if (!csmMatchesSubjectFilter(doc, step)) return;
            const tplId = pickSplit(step.splits);
            const tpl = tplMap[tplId];
            if (!tpl) throw new Error(`Template not found (${tplId})`);
            let toEmail = baseToEmail, resolved = {};
            if (typeof resolveAllVarsAsync === 'function') {
              const rx = await resolveAllVarsAsync(tpl.vars, tpl.toField, doc);
              resolved = rx.resolved || {};
              if (rx.toEmail) toEmail = rx.toEmail;
            }
            const ctx = { ...vars, ...resolved };
            const render = s => (s||'').replace(/\{\{(\w+)\}\}/g, (_, k) => ctx[k] ?? `{{${k}}}`);
            if (!toEmail || !toEmail.includes('@')) throw new Error('No email address');
            const subject = render(tpl.subject), body = render(tpl.body);
            if (isPA) {
              let htmlBody = body;
              if (emailSignature) htmlBody += '<br><div>' + emailSignature + '</div>';
              const paResult = await new Promise(res => chrome.runtime.sendMessage({
                action:'paAutomate', paUrl:featureFlags.powerAutomateUrl,
                payload:{ emails:[{ to:toEmail, subject, htmlBody, replyMode:step.replyMode||tpl.replyMode||'standalone' }] }
              }, res));
              if (paResult?.results?.[0]?.status !== 'sent') throw new Error(`PA: ${paResult?.results?.[0]?.error || 'Send failed'}`);
            } else {
              window.open(`mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(csmToPlain(body))}`, '_blank');
            }
            if (step.subject) sentThisRun.add(step.subject.toLowerCase());
            paEmailsSentThisRun++;
            return;
          }
          if (step.type === 'complete_task') { /* CSM: no task ownership */ return; }
          if (step.type === 'delay') {
            if (isPA) {
              const base = Math.max(5, step.delayBase ?? delayBase);
              const tol  = Math.max(0, step.delayTolerance ?? delayTol);
              const sec  = base + Math.floor(Math.random() * (tol + 1));
              for (let s = sec; s > 0; s--) {
                runBtn.textContent = `Waiting ${s}s… (step delay, ${i+1}/${toRun.length})`;
                if (s % 20 === 0) chrome.runtime.sendMessage({ action: 'ping' });
                await new Promise(r => setTimeout(r, 1000));
              }
              runBtn.textContent = `Running ${i + 1}/${toRun.length}…`;
            }
            return;
          }
          if (step.type === 'create_task') {
            if (!csmEvaluateConditions(step, doc, vars)) return;
            if (step.brandFilter?.length && !csmCheckBrandFilter(doc, step.brandFilter)) return;
            const tpl = tplMap[step.noteTemplateId];
            if (tpl && vars.contactId) {
              const today = new Date();
              const due = tpl.daysOut != null ? (() => { const d=new Date(); d.setDate(d.getDate()+tpl.daysOut); return fmt(d); })() : fmt(today);
              const payload = { TaskID:'', Subject:renderTask(tpl.subject||tpl.name), Description:renderTask(tpl.body||''),
                LiveDate:fmt(today), DueDate:due, taskCategoryID:String(tpl.categoryId||'0'), taskStatusID:'1',
                Priority:String(tpl.priority||'2'), contactID:String(vars.contactId), leadID:'0', employeeID:String(empId), caseID:0 };
              await fetch(`https://api.golfballs.com/golfballs/crm/Admin/Task/Create.ajax?${encodeURIComponent(JSON.stringify(payload))}`, {credentials:'include'});
            }
            return;
          }
        }

        for (const step of campaign.steps) {
          await executeStep(step);
          if (campaign.stopAfterFirstSend !== false && sentThisRun.has('__branch_sent__')) break;
        }

        if (tr) { tr.style.opacity = '0.4'; tr.removeAttribute('title'); }
      } catch(err) {
        console.warn('[GB CRM Search] campaign error', rid, err.message);
        if (tr) { tr.style.background='rgba(200,96,96,0.15)'; tr.style.outline='1px solid rgba(200,96,96,0.35)'; tr.title=err.message; }
      }
    }
    runBtn.disabled = false; runBtn.textContent = runBtnOriginalText; csmUpdateSelInfo();
  });
};

// ── Keyboard shortcut ─────────────────────────────────────────────────────────
(function registerCsmShortcut() {
  chrome.storage.local.get('keyboardShortcuts',({keyboardShortcuts})=>{
    const raw=keyboardShortcuts?.crmSearch;
    const key=(raw===undefined?'k':raw).toLowerCase();
    if (!key) return;
    document.addEventListener('keydown',e=>{
      if (!e.ctrlKey||e.shiftKey||e.altKey) return;
      if (e.key.toLowerCase()!==key) return;
      const tag=document.activeElement?.tagName;
      if (tag==='INPUT'||tag==='TEXTAREA'||document.activeElement?.isContentEditable) return;
      e.preventDefault();
      if (!document.getElementById('__gb-csm-overlay')) window.__gbShowCrmSearchModal?.();
    });
  });
})();

} // end guard
