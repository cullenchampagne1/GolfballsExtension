// crm-create-contact-modal.js — Quick-create a new CRM contact.
// API: https://api.golfballs.com/golfballs/crm/Admin/Contact/NewContact.ajax?{JSON}
// Key binding: Ctrl+[configurable, default Q] — set in Settings → Keyboard Shortcuts

if (!window.__gbCrmCreateContactModalLoaded) {
window.__gbCrmCreateContactModalLoaded = true;

const _CCM_API = 'https://api.golfballs.com/golfballs/crm/Admin/Contact/NewContact.ajax';

// ── Static option sets ────────────────────────────────────────────────────────
const _CCM_TERRITORIES = [
  ['0','Not Set'],['1','P1 / SR (Lorie)'],['2','P1 / SA (AlexS)'],['3','P1 / BDR (Ashlund)'],
  ['4','P2 / SR (Melanie)'],['5','P2 / SA (RyanG)'],['6','P2 / BDR (Rickey)'],
  ['7','P3 / SR (Scott)'],['8','P3 / SA (Tyler)'],['9','P3 / BDR (Kade)'],
  ['10','P4 / SR (Andy)'],['11','P4 / SA (Sam)'],['12','P4 / BDR (Joshua)'],
  ['13','P5 / SR (Seth)'],['14','P5 / SA (Matthew)'],['15','P5 / BDR (Cullen)'],
  ['16','P6 / SR (Brendan)'],['17','P6 / SA (Brodie)'],['18','P6 / BDR (Kevin)'],
  ['19','P7 / SR (Joby)'],['20','P7 / SA (Cameron)'],['21','P7 / BDR (BryceS)'],
  ['22','P8 / SR (Collin)'],['23','P8 / SA (Spencer)'],['24','P8 / BDR (Clay)'],
  ['25','P9 / SR (Mitch)'],['26','P9 / SA (BryceZ)'],['27','P9 / BDR (Gage)'],
  ['28','P0 / 6Sense (NathanR)'],['29','P0 / Testing (NathanR)'],['30','P0 / Sales Dev (NathanR)'],
  ['31','P0 / Admin (Bryan)'],['32','P0 / IT Testing (TannerL)'],
  ['33','P10 / SR (Loganb)'],['34','P10 / SA (Loganb)'],['35','P10 / BDR (Loganb)'],
];
const _CCM_INDUSTRIES = [
  ['','Select'],['Aerospace & Defense','Aerospace & Defense'],['Agriculture','Agriculture'],
  ['Associations & Non Profits','Associations & Non Profits'],['Automotive','Automotive'],
  ['Biotech & Pharmaceuticals','Biotech & Pharmaceuticals'],['Business Services','Business Services'],
  ['Construction & Engineering','Construction & Engineering'],
  ['Consumer Goods & Services','Consumer Goods & Services'],
  ['Education','Education'],['Energy & Utilities','Energy & Utilities'],['Financial','Financial'],
  ['Government','Government'],['Hardware & Semiconductors','Hardware & Semiconductors'],
  ['Healthcare & Medical','Healthcare & Medical'],
  ['Hospitality, Travel, and Recreation','Hospitality, Travel, and Recreation'],
  ['Industrial Manufacturing','Industrial Manufacturing'],
  ['Information Technology','Information Technology'],['Internet','Internet'],
  ['Media & Entertainment','Media & Entertainment'],
  ['Real Estate, Rentals, and Leasing','Real Estate, Rentals, and Leasing'],
  ['Software','Software'],['Telecommunications','Telecommunications'],
  ['Transportation & Logistics','Transportation & Logistics'],
  ['Wholesale & Distribution','Wholesale & Distribution'],
];
const _CCM_EMP_RANGES = [
  ['','Select'],['0 - 9','0 - 9'],['10 - 19','10 - 19'],['20 - 49','20 - 49'],
  ['50 - 99','50 - 99'],['100 - 249','100 - 249'],['250 - 499','250 - 499'],
  ['500 - 999','500 - 999'],['1,000 - 4,999','1,000 - 4,999'],
  ['5,000 - 9,999','5,000 - 9,999'],['10,000+','10,000+'],
];
const _CCM_REV_RANGES = [
  ['','Select'],['$1 - $1M','$1 - $1M'],['$1M - $5M','$1M - $5M'],
  ['$5M - $10M','$5M - $10M'],['$10M - $25M','$10M - $25M'],['$25M - $50M','$25M - $50M'],
  ['$50M - $100M','$50M - $100M'],['$100M - $250M','$100M - $250M'],
  ['$250M - $500M','$250M - $500M'],['$500M - $1B','$500M - $1B'],
  ['$1B - $2.5B','$1B - $2.5B'],['$2.5B - $5B','$2.5B - $5B'],['$5B+','$5B+'],
];
const _CCM_CAMPAIGNS = [
  ['0','Select'],['1774','6Sense'],['1775','Bing / Yahoo'],['1776','Chat'],
  ['1777','Customer Referral'],['1778','Facebook'],['1779','Friend / Referral'],
  ['1780','Google Search'],['1833','Instagram'],['1834','LinkedIn'],
  ['1781','Online Order'],['1782','Phone Call'],['1783','Retargeting'],
  ['1784','Sales Person Outreach'],['1785','TV'],['1786','Webform'],
];
const _CCM_CUSTOMER_TYPES = [
  ['0','Select'],['1','Consumer'],['2','Business - Buyer'],
  ['3','Business - Influencer'],['4','Business - Processor'],
];
const _CCM_COUNTRIES = [
  ['US','United States'],['CA','Canada'],['OTH','Other'],
];

// ── Styles ────────────────────────────────────────────────────────────────────
(function injectCCMStyles() {
  if (document.getElementById('__gb-ccm-css')) return;
  const st = document.createElement('style');
  st.id = '__gb-ccm-css';
  st.textContent = `
    #__gb-ccm-overlay {
      position: fixed !important; inset: 0 !important; z-index: 999990 !important;
      background: rgba(0,0,0,.72) !important; backdrop-filter: blur(8px) !important; -webkit-backdrop-filter: blur(8px) !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      animation: __gbCcmFade .18s ease !important;
    }
    @keyframes __gbCcmFade { from{opacity:0} to{opacity:1} }

    #__gb-ccm-card {
      background: var(--gb-surface,#1a1a1a) !important;
      border: 1px solid rgba(255,255,255,.09) !important; border-radius: 18px !important;
      width: min(860px,calc(100vw - 32px)) !important; max-height: calc(100vh - 48px) !important;
      display: flex !important; flex-direction: column !important; overflow: hidden !important;
      box-shadow: 0 32px 80px rgba(0,0,0,.9) !important;
      animation: __gbCcmUp .28s cubic-bezier(.34,1.3,.64,1) !important;
    }
    @keyframes __gbCcmUp { from{opacity:0;transform:translateY(16px) scale(.97)} to{opacity:1;transform:none} }

    #__gb-ccm-hdr {
      padding: 16px 20px 14px !important; flex-shrink: 0 !important;
      background: rgba(0,0,0,.4) !important; border-bottom: 1px solid rgba(255,255,255,.07) !important;
      display: flex !important; align-items: center !important; gap: 14px !important;
    }
    #__gb-ccm-hdr-icon {
      width: 36px !important; height: 36px !important; border-radius: 10px !important; flex-shrink: 0 !important;
      background: rgba(var(--gb-brand-label-rgb,125,184,42),.12) !important;
      border: 1px solid rgba(var(--gb-brand-label-rgb,125,184,42),.25) !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      color: var(--gb-brand-label,#7db82a) !important;
    }
    #__gb-ccm-hdr-icon svg { width: 18px !important; height: 18px !important; }
    #__gb-ccm-hdr-title { font: 700 16px/1 inherit !important; color: #fff !important; letter-spacing: .3px !important; }
    #__gb-ccm-hdr-sub { font-size: 11px !important; font-weight: 500 !important; color: rgba(255,255,255,.45) !important; margin-top: 4px !important; }
    #__gb-ccm-close {
      margin-left: auto !important; background: rgba(255,255,255,.05) !important;
      border: 1px solid rgba(255,255,255,.1) !important; border-radius: 7px !important;
      color: rgba(255,255,255,.8) !important; cursor: pointer !important; font-family: inherit !important; padding: 6px 12px !important;
      font: 600 11px/1 inherit !important; display: flex !important; align-items: center !important;
      gap: 6px !important; transition: all .15s !important; box-sizing: border-box !important;
    }
    #__gb-ccm-close:hover { background: rgba(255,255,255,.12) !important; color: #fff !important; }

    #__gb-ccm-body {
      flex: 1 !important; overflow-y: auto !important; padding: 18px 22px 14px !important;
      scrollbar-width: thin !important; scrollbar-color: rgba(255,255,255,.15) transparent !important;
      display: flex !important; flex-direction: column !important; gap: 4px !important;
    }
    #__gb-ccm-body::-webkit-scrollbar { width: 6px !important; }
    #__gb-ccm-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15) !important; border-radius: 6px !important; }

    .ccm-section-hdr {
      font: 700 10px/1 inherit !important; text-transform: uppercase !important;
      letter-spacing: .7px !important; color: rgba(255,255,255,.35) !important;
      padding: 10px 0 7px !important; border-bottom: 1px solid rgba(255,255,255,.05) !important;
    }
    .ccm-section-hdr:first-child { padding-top: 0 !important; }

    .ccm-grid   { display: grid !important; gap: 10px !important; margin-top: 8px !important; }
    .ccm-col-3  { grid-template-columns: 1fr 1fr 1fr !important; }
    .ccm-col-2  { grid-template-columns: 1fr 1fr !important; }
    .ccm-col-1  { grid-template-columns: 1fr !important; }

    .ccm-field  { display: flex !important; flex-direction: column !important; gap: 5px !important; min-width: 0 !important; }
    .ccm-label  {
      font: 600 10.5px/1 inherit !important; text-transform: uppercase !important;
      letter-spacing: .5px !important; color: rgba(255,255,255,.5) !important; white-space: nowrap !important;
    }
    .ccm-req { color: var(--gb-brand-label,#7db82a) !important; margin-left: 2px !important; }

    .ccm-input {
      height: 36px !important; padding: 0 12px !important; box-sizing: border-box !important; margin: 0 !important;
      background: rgba(0,0,0,.3) !important; border: 1px solid rgba(255,255,255,.1) !important;
      border-radius: 8px !important; color: #fff !important; font: 500 13px inherit !important;
      outline: none !important; transition: border-color .15s, box-shadow .15s !important;
      width: 100% !important; color-scheme: dark !important;
    }
    .ccm-input::placeholder { color: rgba(255,255,255,.25) !important; }
    .ccm-input:focus {
      border-color: var(--gb-brand-label,#7db82a) !important;
      box-shadow: 0 0 0 2px rgba(var(--gb-brand-label-rgb,125,184,42),.15) !important;
    }
    .ccm-input.invalid { border-color: rgba(200,80,80,.7) !important; }
    .ccm-input.invalid:focus { box-shadow: 0 0 0 2px rgba(200,80,80,.2) !important; }

    /* ── Custom dropdowns — mirrors .csm-dd-* pattern ── */
    .ccm-dd-wrap { position: relative !important; width: 100% !important; margin: 0 !important; }
    .ccm-dd-btn {
      width: 100% !important; background: rgba(0,0,0,.3) !important;
      border: 1px solid rgba(255,255,255,.1) !important; border-radius: 8px !important;
      padding: 0 30px 0 12px !important; font: 500 13px inherit !important;
      color: #fff !important; cursor: pointer !important; font-family: inherit !important; text-align: left !important;
      display: flex !important; align-items: center !important; position: relative !important;
      height: 36px !important; box-sizing: border-box !important;
      transition: all .15s !important; margin: 0 !important;
    }
    .ccm-dd-btn:hover { background: rgba(255,255,255,.05) !important; border-color: rgba(255,255,255,.2) !important; }
    .ccm-dd-btn.open {
      border-color: var(--gb-brand-label,#7db82a) !important;
      background: rgba(255,255,255,.05) !important;
      box-shadow: 0 0 0 2px rgba(var(--gb-brand-label-rgb,125,184,42),.15) !important;
    }
    .ccm-dd-label { flex: 1 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
    .ccm-dd-chev {
      position: absolute !important; right: 10px !important; top: 0 !important; bottom: 0 !important; margin: auto !important;
      color: rgba(255,255,255,.4) !important; pointer-events: none !important;
      transition: transform .2s, color .2s !important;
      display: flex !important; align-items: center !important;
    }
    .ccm-dd-btn.open .ccm-dd-chev { transform: rotate(180deg) !important; color: var(--gb-brand-label,#7db82a) !important; }
    .ccm-dd-menu {
      position: absolute !important; top: calc(100% + 4px) !important; left: 0 !important; right: 0 !important;
      background: var(--gb-surface-elevated,#171717) !important;
      border: 1px solid rgba(255,255,255,.1) !important; border-radius: 9px !important;
      z-index: 999995 !important; max-height: 240px !important; overflow-y: auto !important;
      opacity: 0 !important; transform: translateY(-5px) !important; pointer-events: none !important;
      transition: opacity .16s ease, transform .18s cubic-bezier(.34,1.4,.64,1) !important;
      box-shadow: 0 10px 30px rgba(0,0,0,.9), 0 0 0 1px rgba(255,255,255,.03) !important;
      padding: 4px !important; box-sizing: border-box !important;
      scrollbar-width: thin !important; scrollbar-color: rgba(255,255,255,.15) transparent !important;
    }
    .ccm-dd-menu::-webkit-scrollbar { width: 5px !important; }
    .ccm-dd-menu::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15) !important; border-radius: 4px !important; }
    .ccm-dd-menu.open { opacity: 1 !important; transform: translateY(0) !important; pointer-events: auto !important; }
    .ccm-dd-opt {
      padding: 8px 11px !important; margin-bottom: 2px !important; border-radius: 6px !important;
      cursor: pointer !important; font-family: inherit !important; font: 500 12.5px inherit !important;
      color: rgba(255,255,255,.8) !important; transition: background .1s, color .1s !important;
      white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important;
    }
    .ccm-dd-opt:last-child { margin-bottom: 0 !important; }
    .ccm-dd-opt:hover { background: rgba(255,255,255,.08) !important; color: #fff !important; }
    .ccm-dd-opt.selected {
      background: rgba(var(--gb-brand-label-rgb,125,184,42),.15) !important;
      color: var(--gb-brand-label,#7db82a) !important; font-weight: 600 !important;
    }
    .ccm-dropup .ccm-dd-menu { top: auto !important; bottom: calc(100% + 4px) !important; transform: translateY(5px) !important; }
    .ccm-dropup .ccm-dd-menu.open { transform: translateY(0) !important; }

    /* Flag chips */
    .ccm-flags-row { display: flex !important; flex-wrap: wrap !important; gap: 7px !important; margin-top: 8px !important; padding-bottom: 2px !important; }
    .ccm-flag-chip {
      display: flex !important; align-items: center !important; gap: 7px !important;
      background: rgba(0,0,0,.25) !important; border: 1px solid rgba(255,255,255,.1) !important;
      border-radius: 7px !important; padding: 6px 11px !important; cursor: pointer !important; font-family: inherit !important;
      transition: all .15s !important; user-select: none !important; -webkit-user-select: none !important;
    }
    .ccm-flag-chip:hover { border-color: rgba(255,255,255,.22) !important; background: rgba(255,255,255,.04) !important; }
    .ccm-flag-chip.on {
      background: rgba(var(--gb-brand-label-rgb,125,184,42),.12) !important;
      border-color: rgba(var(--gb-brand-label-rgb,125,184,42),.35) !important;
    }
    .ccm-flag-box {
      width: 15px !important; height: 15px !important; border-radius: 4px !important; flex-shrink: 0 !important;
      border: 1px solid rgba(255,255,255,.3) !important; background: rgba(0,0,0,.2) !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      transition: all .15s !important;
    }
    .ccm-flag-chip.on .ccm-flag-box { background: var(--gb-brand-label,#7db82a) !important; border-color: var(--gb-brand-label,#7db82a) !important; }
    .ccm-flag-box svg { width: 9px !important; height: 9px !important; opacity: 0 !important; color: #111 !important; stroke-width: 3 !important; transition: opacity .12s !important; }
    .ccm-flag-chip.on .ccm-flag-box svg { opacity: 1 !important; }
    .ccm-flag-label { font: 600 12px/1 inherit !important; color: rgba(255,255,255,.7) !important; transition: color .15s !important; }
    .ccm-flag-chip.on .ccm-flag-label { color: var(--gb-brand-label,#7db82a) !important; }

    #__gb-ccm-footer {
      padding: 12px 20px !important; flex-shrink: 0 !important;
      border-top: 1px solid rgba(255,255,255,.06) !important; background: rgba(0,0,0,.2) !important;
      display: flex !important; align-items: center !important; gap: 10px !important;
    }
    #__gb-ccm-status { font-size: 12px !important; font-weight: 500 !important; color: rgba(255,255,255,.45) !important; flex: 1 !important; }
    #__gb-ccm-status.err { color: rgba(200,80,80,.9) !important; }
    #__gb-ccm-status.ok  { color: var(--gb-brand-label,#7db82a) !important; }
    #__gb-ccm-cancel {
      height: 36px !important; padding: 0 16px !important; border-radius: 8px !important; margin: 0 !important;
      background: rgba(255,255,255,.05) !important; border: 1px solid rgba(255,255,255,.1) !important;
      color: rgba(255,255,255,.7) !important; font: 600 13px inherit !important; cursor: pointer !important; font-family: inherit !important;
      transition: all .15s !important; display: flex !important; align-items: center !important;
    }
    #__gb-ccm-cancel:hover { background: rgba(255,255,255,.1) !important; color: #fff !important; }
    #__gb-ccm-submit {
      height: 36px !important; padding: 0 18px !important; border-radius: 8px !important; margin: 0 !important;
      background: var(--gb-brand,#6e901d) !important; border: 1px solid var(--gb-brand-border,#4a6b14) !important;
      color: #fff !important; font: 700 13px inherit !important; cursor: pointer !important; font-family: inherit !important;
      display: flex !important; align-items: center !important; gap: 7px !important; transition: all .15s !important;
    }
    #__gb-ccm-submit:hover:not(:disabled) { filter: brightness(1.1) !important; }
    #__gb-ccm-submit:disabled { opacity: .5 !important; cursor: not-allowed !important; }
    #__gb-ccm-submit svg { width: 14px !important; height: 14px !important; }
    .ccm-spin {
      width: 14px !important; height: 14px !important; flex-shrink: 0 !important;
      border: 2px solid rgba(255,255,255,.3) !important; border-top-color: #fff !important;
      border-radius: 50% !important; animation: __gbCcmSpin .7s linear infinite !important;
    }
    @keyframes __gbCcmSpin { to { transform: rotate(360deg); } }

    /* Account autocomplete */
    .ccm-ac-wrap { position: relative !important; width: 100% !important; }
    .ccm-ac-results {
      position: absolute !important; top: calc(100% + 4px) !important; left: 0 !important; right: 0 !important;
      background: var(--gb-surface-elevated,#171717) !important;
      border: 1px solid rgba(255,255,255,.1) !important; border-radius: 9px !important;
      z-index: 999998 !important; max-height: 200px !important; overflow-y: auto !important;
      box-shadow: 0 10px 30px rgba(0,0,0,.9) !important;
      padding: 4px !important; box-sizing: border-box !important;
      scrollbar-width: thin !important; scrollbar-color: rgba(255,255,255,.15) transparent !important;
      display: none !important;
    }
    .ccm-ac-results.open { display: block !important; }
    .ccm-ac-opt {
      padding: 8px 11px !important; border-radius: 6px !important; cursor: pointer !important; font-family: inherit !important;
      font: 500 12.5px inherit !important; color: rgba(255,255,255,.85) !important;
      transition: background .1s !important; white-space: nowrap !important;
      overflow: hidden !important; text-overflow: ellipsis !important; margin-bottom: 2px !important;
    }
    .ccm-ac-opt:last-child { margin-bottom: 0 !important; }
    .ccm-ac-opt:hover { background: rgba(255,255,255,.08) !important; color: #fff !important; }
    .ccm-ac-opt.selected { background: rgba(var(--gb-brand-label-rgb,125,184,42),.15) !important; color: var(--gb-brand-label,#7db82a) !important; }
    .ccm-ac-empty { padding: 10px 11px !important; font: 500 12px inherit !important; color: rgba(255,255,255,.35) !important; font-style: italic !important; }
  `;
  document.head.appendChild(st);
})();

// ── DOM Helpers ───────────────────────────────────────────────────────────────
const _ccmChev = `<span class="ccm-dd-chev"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></span>`;
const _ccmCheck = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1.5,6.5 5,10 10.5,2"/></svg>`;

/**
 * Build a self-contained custom dropdown matching the .csm-dd-* / .tl-dropdown-* style.
 * Returns { wrap (HTMLElement), getValue(), setValue(val) }.
 */
function _ccmMakeDd(uid, opts, defaultVal = '') {
  const initOpt = opts.find(o => o[0] === defaultVal) || opts[0];
  let currentVal = initOpt[0];

  const wrap = document.createElement('div');
  wrap.className = 'ccm-dd-wrap';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ccm-dd-btn';
  btn.innerHTML = `<span class="ccm-dd-label">${initOpt[1]}</span>${_ccmChev}`;

  const lbl = btn.querySelector('.ccm-dd-label');

  const menu = document.createElement('div');
  menu.className = 'ccm-dd-menu';

  opts.forEach(([val, label]) => {
    const opt = document.createElement('div');
    opt.className = 'ccm-dd-opt' + (val === currentVal ? ' selected' : '');
    opt.dataset.value = val;
    opt.textContent = label;
    opt.addEventListener('click', e => {
      e.stopPropagation();
      currentVal = val;
      lbl.textContent = label;
      menu.querySelectorAll('.ccm-dd-opt').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      menu.classList.remove('open');
      btn.classList.remove('open');
    });
    menu.appendChild(opt);
  });

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const wasOpen = menu.classList.contains('open');
    // close all other ccm dropdowns in the overlay
    document.querySelectorAll('#__gb-ccm-overlay .ccm-dd-menu.open').forEach(m => m.classList.remove('open'));
    document.querySelectorAll('#__gb-ccm-overlay .ccm-dd-btn.open').forEach(b => b.classList.remove('open'));
    if (!wasOpen) { menu.classList.add('open'); btn.classList.add('open'); }
  });

  wrap.appendChild(btn);
  wrap.appendChild(menu);

  return {
    wrap,
    getValue: () => currentVal,
    setValue: val => {
      const opt = menu.querySelector(`.ccm-dd-opt[data-value="${CSS.escape(val)}"]`);
      if (!opt) return;
      currentVal = val;
      lbl.textContent = opt.textContent;
      menu.querySelectorAll('.ccm-dd-opt').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    },
  };
}

function _ccmField(labelHtml, elOrDd) {
  const wrap = document.createElement('div');
  wrap.className = 'ccm-field';
  const lbl = document.createElement('div');
  lbl.className = 'ccm-label';
  lbl.innerHTML = labelHtml;
  wrap.appendChild(lbl);
  // Support: custom dropdown (.wrap), account autocomplete (._acWrap), plain input
  wrap.appendChild(elOrDd.wrap || elOrDd._acWrap || elOrDd);
  return wrap;
}

function _ccmInput(placeholder) {
  const el = document.createElement('input');
  el.type = 'text';
  el.className = 'ccm-input';
  el.placeholder = placeholder || '';
  return el;
}

function _ccmRow(colClass) {
  const d = document.createElement('div');
  d.className = `ccm-grid ${colClass}`;
  return d;
}

function _ccmHdr(text) {
  const d = document.createElement('div');
  d.className = 'ccm-section-hdr';
  d.textContent = text;
  return d;
}

// ── Main open function ────────────────────────────────────────────────────────
function __gbShowCrmCreateContactModal() {
  if (document.getElementById('__gb-ccm-overlay')) return;

  const flagState = { BoolConsumer: false, BoolCustom: false, BoolRep: false, BoolOneToOne: false, BoolRetail: false, BoolDelay: false };

  const overlay = document.createElement('div');
  overlay.id = '__gb-ccm-overlay';
  const card = document.createElement('div');
  card.id = '__gb-ccm-card';

  // ── Header ─────────────────────────────────────────────────────────────────
  const hdr = document.createElement('div');
  hdr.id = '__gb-ccm-hdr';
  hdr.innerHTML = `
    <div id="__gb-ccm-hdr-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
      </svg>
    </div>
    <div>
      <div id="__gb-ccm-hdr-title">New Contact</div>
      <div id="__gb-ccm-hdr-sub">Create CRM Contact &nbsp;·&nbsp; <span id="__gb-ccm-kb-hint">Ctrl+Q</span></div>
    </div>
    <button id="__gb-ccm-close">
      Close
    </button>`;

  // ── Body ───────────────────────────────────────────────────────────────────
  const body = document.createElement('div');
  body.id = '__gb-ccm-body';

  // — Contact Info (3-col × 2 rows) —
  const inpFirst   = _ccmInput('First name');
  const inpLast    = _ccmInput('Last name');
  const inpEmail   = _ccmInput('Email address');
  const inpPhone   = _ccmInput('Phone number');
  const inpTitle   = _ccmInput('Job title');
  const inpCompany = _ccmInput('Company name');

  body.appendChild(_ccmHdr('Contact Info'));

  const r1 = _ccmRow('ccm-col-3');
  r1.appendChild(_ccmField('First Name <span class="ccm-req">*</span>', inpFirst));
  r1.appendChild(_ccmField('Last Name <span class="ccm-req">*</span>',  inpLast));
  r1.appendChild(_ccmField('Email <span class="ccm-req">*</span>',      inpEmail));
  body.appendChild(r1);

  const r2 = _ccmRow('ccm-col-3');
  r2.appendChild(_ccmField('Phone',   inpPhone));
  r2.appendChild(_ccmField('Job Title', inpTitle));
  r2.appendChild(_ccmField('Company', inpCompany));
  body.appendChild(r2);

  // — Account & Location (3-col × 2 rows) —
  const inpLinkedIn = _ccmInput('https://linkedin.com/in/…');
  const inpAccount  = _ccmInput('Search account name…');
  let _accountId = '';

  // ── Account autocomplete ────────────────────────────────────────────────────
  const acWrap = document.createElement('div');
  acWrap.className = 'ccm-ac-wrap';
  const acResults = document.createElement('div');
  acResults.className = 'ccm-ac-results';
  acWrap.appendChild(inpAccount);
  acWrap.appendChild(acResults);
  // Override _ccmField to use acWrap instead of inpAccount directly
  inpAccount._acWrap = acWrap;   // signal to _ccmField

  let _acTimer = null;
  const _AC_URL = 'https://api.golfballs.com/golfballs/crm/Admin/AutoComplete/Account.ajax';

  function _ccmSelectAccount(id, text) {
    _accountId = String(id);
    inpAccount.value = text;
    acResults.classList.remove('open');
    acResults.innerHTML = '';
  }

  function _ccmRenderAcResults(items) {
    acResults.innerHTML = '';
    if (!items || items.length === 0) {
      acResults.innerHTML = '<div class="ccm-ac-empty">No accounts found</div>';
    } else {
      items.forEach(item => {
        const opt = document.createElement('div');
        opt.className = 'ccm-ac-opt';
        opt.textContent = item.Text + (item.SecondaryText ? '  —  ' + item.SecondaryText : '');
        opt.dataset.id = item.ID;
        opt.addEventListener('mousedown', e => {
          e.preventDefault(); // prevent blur from firing before click
          _ccmSelectAccount(item.ID, item.Text);
        });
        acResults.appendChild(opt);
      });
    }
    acResults.classList.add('open');
  }

  inpAccount.addEventListener('input', () => {
    const q = inpAccount.value.trim();
    _accountId = '';  // reset until a result is picked
    clearTimeout(_acTimer);
    if (q.length < 2) { acResults.classList.remove('open'); return; }
    _acTimer = setTimeout(async () => {
      try {
        const res = await fetch(`${_AC_URL}?q=${encodeURIComponent(q)}`, { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        _ccmRenderAcResults(data);
      } catch (_) { /* ignore */ }
    }, 280);
  });

  inpAccount.addEventListener('blur', () => {
    setTimeout(() => {
      acResults.classList.remove('open');
      if (!_accountId) inpAccount.value = '';  // clear unconfirmed partial text
    }, 180);
  });

  inpAccount.addEventListener('keydown', e => {
    if (!acResults.classList.contains('open')) return;
    const opts = acResults.querySelectorAll('.ccm-ac-opt');
    const cur = acResults.querySelector('.ccm-ac-opt.selected');
    let idx = cur ? [...opts].indexOf(cur) : -1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (idx < opts.length - 1) { cur?.classList.remove('selected'); opts[idx+1].classList.add('selected'); opts[idx+1].scrollIntoView({block:'nearest'}); }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (idx > 0) { cur?.classList.remove('selected'); opts[idx-1].classList.add('selected'); opts[idx-1].scrollIntoView({block:'nearest'}); }
    } else if (e.key === 'Enter' && cur) {
      e.preventDefault();
      _ccmSelectAccount(cur.dataset.id || '', cur.textContent.split('  —  ')[0]);
    } else if (e.key === 'Escape') {
      acResults.classList.remove('open');
    }
  });

  const inpAddress = _ccmInput('Street address');
  const inpCity    = _ccmInput('City');
  const inpPostal  = _ccmInput('Postal');
  const ddCountry  = _ccmMakeDd('country', _CCM_COUNTRIES, 'US');

  body.appendChild(_ccmHdr('Account & Location'));

  const r3 = _ccmRow('ccm-col-3');
  r3.appendChild(_ccmField('LinkedIn URL',   inpLinkedIn));
  r3.appendChild(_ccmField('Account Lookup', inpAccount));
  r3.appendChild(_ccmField('Address',        inpAddress));
  body.appendChild(r3);

  const r4 = _ccmRow('ccm-col-3');
  r4.appendChild(_ccmField('City',    inpCity));
  r4.appendChild(_ccmField('Postal',  inpPostal));
  r4.appendChild(_ccmField('Country', ddCountry));
  body.appendChild(r4);

  // — Segmentation (3-col × 2 rows) —
  const ddIndustry  = _ccmMakeDd('industry',  _CCM_INDUSTRIES,     '');
  const ddEmpRange  = _ccmMakeDd('emp-range',  _CCM_EMP_RANGES,     '');
  const ddRevRange  = _ccmMakeDd('rev-range',  _CCM_REV_RANGES,     '');
  const ddCustType  = _ccmMakeDd('cust-type',  _CCM_CUSTOMER_TYPES, '0');
  const ddTerritory = _ccmMakeDd('territory',  _CCM_TERRITORIES,    '15');
  const ddCampaign  = _ccmMakeDd('campaign',   _CCM_CAMPAIGNS,      '0');

  body.appendChild(_ccmHdr('Segmentation & Assignment'));

  const r5 = _ccmRow('ccm-col-3');
  r5.appendChild(_ccmField('Industry',        ddIndustry));
  r5.appendChild(_ccmField('Employee Range',  ddEmpRange));
  r5.appendChild(_ccmField('Est. Revenue',    ddRevRange));
  body.appendChild(r5);

  const r6 = _ccmRow('ccm-col-3');
  r6.appendChild(_ccmField('Customer Type', ddCustType));
  r6.appendChild(_ccmField('Territory',     ddTerritory));
  r6.appendChild(_ccmField('Campaign',      ddCampaign));
  body.appendChild(r6);

  // — Source & Flags —
  const inpSource = _ccmInput('Source details');
  body.appendChild(_ccmHdr('Source & Flags'));

  const r7 = _ccmRow('ccm-col-1');
  r7.appendChild(_ccmField('Source Details', inpSource));
  body.appendChild(r7);

  // Flag chips
  const flagDefs = [
    ['BoolConsumer','Consumer'],['BoolCustom','Custom'],['BoolRep','Rep'],
    ['BoolOneToOne','One-to-One'],['BoolRetail','Retail'],['BoolDelay','Delay'],
  ];
  const flagsRow = document.createElement('div');
  flagsRow.className = 'ccm-flags-row';
  flagDefs.forEach(([key, label]) => {
    const chip = document.createElement('div');
    chip.className = 'ccm-flag-chip';
    chip.innerHTML = `<div class="ccm-flag-box">${_ccmCheck}</div><span class="ccm-flag-label">${label}</span>`;
    chip.addEventListener('click', () => {
      flagState[key] = !flagState[key];
      chip.classList.toggle('on', flagState[key]);
    });
    flagsRow.appendChild(chip);
  });
  body.appendChild(flagsRow);

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footer = document.createElement('div');
  footer.id = '__gb-ccm-footer';
  footer.innerHTML = `
    <div id="__gb-ccm-status">Fill in required fields marked *</div>
    <button id="__gb-ccm-cancel">Cancel</button>
    <button id="__gb-ccm-submit">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
      </svg>
      Create Contact
    </button>`;

  card.appendChild(hdr);
  card.appendChild(body);
  card.appendChild(footer);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // Close all dropdown menus when scrolling the body (prevents orphaned open menus)
  body.addEventListener('scroll', () => {
    document.querySelectorAll('#__gb-ccm-overlay .ccm-dd-menu.open').forEach(m => m.classList.remove('open'));
    document.querySelectorAll('#__gb-ccm-overlay .ccm-dd-btn.open').forEach(b => b.classList.remove('open'));
  }, { passive: true });

  setTimeout(() => inpFirst.focus(), 60);

  // KB hint (hidden when the shortcut is disabled via empty string).
  chrome.storage.local.get('keyboardShortcuts', ({ keyboardShortcuts }) => {
    const raw = keyboardShortcuts?.crmNewContact;
    const letter = (raw === undefined ? 'q' : raw).toUpperCase();
    const hint = document.getElementById('__gb-ccm-kb-hint');
    if (hint) hint.textContent = letter ? `Ctrl+${letter}` : '';
  });

  // ── Close ──────────────────────────────────────────────────────────────────
  const close = () => {
    overlay.style.animation = '__gbCcmFade .14s ease reverse';
    setTimeout(() => overlay.remove(), 140);
  };
  document.getElementById('__gb-ccm-close').addEventListener('click', close);
  document.getElementById('__gb-ccm-cancel').addEventListener('click', close);
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
  const _esc = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', _esc); } };
  document.addEventListener('keydown', _esc);

  // ── Submit ─────────────────────────────────────────────────────────────────
  function setStatus(msg, cls) {
    const el = document.getElementById('__gb-ccm-status');
    if (el) { el.textContent = msg; el.className = cls || ''; }
  }

  document.getElementById('__gb-ccm-submit').addEventListener('click', async () => {
    const firstName = inpFirst.value.trim();
    const lastName  = inpLast.value.trim();
    const email     = inpEmail.value.trim();

    [inpFirst, inpLast, inpEmail].forEach(i => i.classList.remove('invalid'));
    let valid = true;
    if (!firstName) { inpFirst.classList.add('invalid'); valid = false; }
    if (!lastName)  { inpLast.classList.add('invalid');  valid = false; }
    if (!email)     { inpEmail.classList.add('invalid'); valid = false; }
    if (!valid) { setStatus('Required fields are missing.', 'err'); return; }

    const btn = document.getElementById('__gb-ccm-submit');
    btn.disabled = true;
    btn.innerHTML = `<div class="ccm-spin"></div> Creating…`;
    setStatus('Submitting…');

    const payload = {
      AccountLookup:    inpAccount.value.trim(),
      AccountLookup_ID: _accountId || '',
      AccountWebAddress: '',
      MainAddress:      inpAddress.value.trim(),
      MainCity:         inpCity.value.trim(),
      MainPostal:       inpPostal.value.trim(),
      MainCountry:      ddCountry.getValue(),
      TerritoryID:      ddTerritory.getValue(),
      LinkedInURL:      inpLinkedIn.value.trim(),
      Industry:         ddIndustry.getValue(),
      SubIndustry:      '',
      EmployeeRange:    ddEmpRange.getValue(),
      EstimatedRevenue: ddRevRange.getValue(),
      EmailLookup:      email,
      EmailLookup_ID:   'Email not found.',
      FirstName:        firstName,
      LastName:         lastName,
      jobTitle:         inpTitle.value.trim(),
      CompanyName:      inpCompany.value.trim(),
      PhoneNumber:      inpPhone.value.trim(),
      ParCamp_ID:       ddCampaign.getValue(),
      SourceDetails:    inpSource.value.trim(),
      CustomerType:     ddCustType.getValue(),
      BoolConsumer:     String(flagState.BoolConsumer),
      BoolCustom:       String(flagState.BoolCustom),
      BoolRep:          String(flagState.BoolRep),
      BoolOneToOne:     String(flagState.BoolOneToOne),
      BoolRetail:       String(flagState.BoolRetail),
      BoolDelay:        String(flagState.BoolDelay),
    };

    try {
      const res = await fetch(`${_CCM_API}?${JSON.stringify(payload)}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch (_) {}
      const isSuccess = parsed != null
        ? (typeof parsed === 'object' ? !parsed.error : !isNaN(Number(parsed)))
        : (text && !text.toLowerCase().includes('error') && !text.toLowerCase().includes('fail'));

      if (isSuccess) {
        setStatus('✓ Contact created successfully', 'ok');
        btn.disabled = true;
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><polyline points="20 6 9 17 4 12"/></svg> Created`;
        if (typeof showGbNotification === 'function') showGbNotification(`Contact created: ${firstName} ${lastName}`, 'success', 3000);

        // Navigate to the new contact's page
        const newId = parsed != null
          ? (typeof parsed === 'object' ? (parsed.contactID || parsed.id || parsed) : parsed)
          : text.trim();
        if (newId && !isNaN(Number(newId))) {
          setTimeout(() => {
            window.location.href = `https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=239&ContactID=${newId}`;
          }, 900);
        } else {
          setTimeout(close, 1800);
        }
      } else {
        throw new Error(text || 'Unexpected response');
      }
    } catch (err) {
      setStatus(`Error: ${err.message}`, 'err');
      btn.disabled = false;
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
        </svg> Create Contact`;
    }
  });
}

window.__gbShowCrmCreateContactModal = __gbShowCrmCreateContactModal;

} // end guard
