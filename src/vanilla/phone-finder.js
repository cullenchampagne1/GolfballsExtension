// phone-finder.js — Automatically locates a phone number for contacts with no number on file.
// Scans their order pages one by one in the background until a phone is found,
// then saves it via Contact/Update.ajax and reloads the contact page.
// Feature flag: featureFlags.phoneFinderEnabled

if (!window.__gbPhoneFinderLoaded) {
window.__gbPhoneFinderLoaded = true;

(function initPhoneFinder() {
  if (!/[?&]Page=240\b/i.test(window.location.href) &&
      !/[?&]page=240\b/i.test(window.location.href)) return;

  const BASE = 'https://api.golfballs.com';

  // ── Phone extraction ──────────────────────────────────────────────────────
  function extractPhoneFromOrderDoc(doc) {
    const PHONE_RE = /(?:\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/;
    const info = doc.getElementById('customerInfo');
    if (!info) return '';
    const cells = info.querySelectorAll('td.darkText');
    for (const td of cells) {
      const m = td.textContent.trim().match(PHONE_RE);
      if (m) return m[0].trim();
    }
    const m2 = (doc.body?.textContent || '').match(PHONE_RE);
    return m2 ? m2[0].trim() : '';
  }

  function normalisePhone(raw) {
    const d = raw.replace(/\D/g, '');
    if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    if (d.length === 11 && d[0] === '1') return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
    return raw;
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('__gb-pf-style')) return;
    const style = document.createElement('style');
    style.id = '__gb-pf-style';
    style.textContent = `
      @keyframes __gbPfSpin { to { transform: rotate(360deg); } }

      /* Shared pill base — starts collapsed, expands on x-axis */
      #__gb-pf-btn,
      #__gb-pf-badge {
        display: inline-flex !important;
        align-items: center !important;
        gap: 6px !important;
        border-radius: 6px !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        white-space: nowrap !important;
        vertical-align: middle !important;
        border: 1px solid rgba(var(--gb-brand-label-rgb,125,184,42), .25) !important;
        background: rgba(var(--gb-brand-label-rgb,125,184,42), .1) !important;
        color: var(--gb-brand-label, #7db82a) !important;
        /* collapsed state */
        overflow: hidden !important;
        max-width: 0 !important;
        padding: 3px 0 !important;
        margin-left: 0 !important;
        opacity: 0 !important;
        /* smooth on all axes */
        transition:
          max-width   0.38s cubic-bezier(0.4, 0, 0.2, 1),
          padding     0.38s cubic-bezier(0.4, 0, 0.2, 1),
          margin-left 0.38s cubic-bezier(0.4, 0, 0.2, 1),
          opacity     0.28s ease,
          background  0.2s  ease,
          border-color 0.2s ease,
          color       0.2s  ease !important;
      }

      /* Expanded state */
      #__gb-pf-btn.pf-visible,
      #__gb-pf-badge.pf-visible {
        max-width: 360px !important;
        padding: 3px 10px !important;
        margin-left: 10px !important;
        opacity: 1 !important;
      }

      /* Button-specific: span acts as button, no UA weirdness */
      #__gb-pf-btn {
        cursor: pointer !important;
        font-family: inherit !important;
        line-height: 1 !important;
        font-weight: 600 !important;
        user-select: none !important;
      }
      #__gb-pf-btn:hover {
        background: rgba(var(--gb-brand-label-rgb,125,184,42), .18) !important;
        border-color: rgba(var(--gb-brand-label-rgb,125,184,42), .5) !important;
      }

      /* Badge: no pointer */
      #__gb-pf-badge {
        pointer-events: none !important;
        cursor: default !important;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Badge ─────────────────────────────────────────────────────────────────
  function injectBadge() {
    if (document.getElementById('__gb-pf-badge')) return document.getElementById('__gb-pf-badge');
    const phoneLabel = document.getElementById('lblContactPhoneNumber');
    if (!phoneLabel) return null;

    const badge = document.createElement('span');
    badge.id = '__gb-pf-badge';
    badge.innerHTML = `
      <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"
           style="animation:__gbPfSpin 1s linear infinite;flex-shrink:0;">
        <circle cx="12" cy="12" r="10" stroke-opacity=".25"/>
        <path d="M12 2 a10 10 0 0 1 10 10"/>
      </svg>
      <span id="__gb-pf-status">Searching orders for phone…</span>`;

    phoneLabel.appendChild(badge);
    requestAnimationFrame(() => requestAnimationFrame(() => badge.classList.add('pf-visible')));
    return badge;
  }

  // ── Find button ───────────────────────────────────────────────────────────
  function injectFindButton(onClick) {
    if (document.getElementById('__gb-pf-btn')) return;
    const phoneLabel = document.getElementById('lblContactPhoneNumber');
    if (!phoneLabel) return;

    // Use <span role="button"> — avoids ALL browser UA button styling/thickening
    const btn = document.createElement('span');
    btn.id = '__gb-pf-btn';
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    btn.title = 'Search order history for a phone number';
    btn.innerHTML = `
      <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="flex-shrink:0;">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      Find phone`;

    const fire = () => { btn.remove(); onClick(); };
    btn.addEventListener('click', fire);
    btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fire(); });

    phoneLabel.appendChild(btn);
    requestAnimationFrame(() => requestAnimationFrame(() => btn.classList.add('pf-visible')));
  }

  // ── Badge state ───────────────────────────────────────────────────────────
  function setBadge(state, text) {
    const badge  = document.getElementById('__gb-pf-badge'); if (!badge) return;
    const status = document.getElementById('__gb-pf-status');
    const svg    = badge.querySelector('svg');
    if (status) status.textContent = text;
    if (svg) svg.style.animation = state === 'searching' ? '__gbPfSpin 1s linear infinite' : 'none';

    const colours = {
      searching: ['rgba(125,184,42,.12)', 'rgba(125,184,42,.28)', '#7db82a'],
      found:     ['rgba(125,184,42,.18)', 'rgba(125,184,42,.45)', '#a0d855'],
      none:      ['rgba(255,255,255,.06)','rgba(255,255,255,.15)','rgba(255,255,255,.5)'],
      error:     ['rgba(200,96,96,.1)',   'rgba(200,96,96,.3)',   '#c86060'],
    }[state] || ['rgba(255,255,255,.06)','rgba(255,255,255,.15)','rgba(255,255,255,.5)'];
    badge.style.background  = colours[0];
    badge.style.borderColor = colours[1];
    badge.style.color       = colours[2];
  }

  // ── Main ──────────────────────────────────────────────────────────────────
  async function runPhoneFinder() {
    const { featureFlags } = await chrome.storage.local.get('featureFlags');
    if (!featureFlags?.phoneFinderEnabled) return;

    const phoneEl = document.getElementById('lblContactPhoneNumber');
    if (!phoneEl) return;
    if (phoneEl.textContent.trim().replace(/\D/g,'').length >= 7) return;

    const contactIdEl = document.getElementById('tbContactId') || document.getElementById('tbContactID');
    const contactId   = contactIdEl?.value?.trim();
    if (!contactId) return;

    const orderLinks = [...document.querySelectorAll('table.dtORD tbody tr')]
      .map(tr => tr.querySelector('td a')).filter(Boolean)
      .map(a => a.href)
      .filter(h => h.includes('ViewOrder') || h.includes('folder=Orders'));

    if (!orderLinks.length) return;

    injectStyles();
    injectFindButton(() => doSearch(contactId, orderLinks));
  }

  async function doSearch(contactId, orderLinks) {
    document.getElementById('__gb-pf-btn')?.remove();
    const badge = injectBadge();
    if (!badge) return;

    let foundPhone = '';
    for (let i = 0; i < orderLinks.length; i++) {
      setBadge('searching', `Checking order ${i + 1} of ${orderLinks.length}…`);
      try {
        const resp = await new Promise(res =>
          chrome.runtime.sendMessage({ action: 'fetchRaw', url: orderLinks[i] }, res)
        );
        if (!resp?.ok) continue;
        const doc  = new DOMParser().parseFromString(resp.text, 'text/html');
        const base = doc.createElement('base');
        base.href  = BASE + '/golfballs/adminnew/';
        doc.head.appendChild(base);
        const raw = extractPhoneFromOrderDoc(doc);
        if (raw) { foundPhone = normalisePhone(raw); break; }
      } catch (e) {
        console.warn('[GB Phone Finder] order fetch error:', e.message);
      }
    }

    if (!foundPhone) { setBadge('none', 'No phone found in orders'); return; }

    setBadge('searching', `Found ${foundPhone} — saving…`);

    try {
      const contact = await fetch(`${BASE}/golfballs/crm/Admin/Contact/Get.ajax?${contactId}`, { credentials: 'include' }).then(r => r.json());

      const payload = {
        customerId:  String(contact.customerId),
        firstName:   contact.firstName   || '',
        middleInit:  contact.middleInit  || '',
        lastName:    contact.lastName    || '',
        companyName: contact.companyName || '',
        jobTitle:    contact.jobTitle    || '',
        email:       contact.email       || '',
        phoneNumber: foundPhone,
        zipCode:     contact.zipCode     || '',
        UserType:    String(contact.userType ?? 0),
        userCountry: contact.userCountry || null,
        CustomData:  contact.CustomData  || '{}',
      };

      const result = await fetch(
        `${BASE}/golfballs/crm/Admin/Contact/Update.ajax?${encodeURIComponent(JSON.stringify(payload))}`,
        { credentials: 'include' }
      ).then(r => r.json());

      if (result?.phoneNumber) {
        setBadge('found', `Saved ${foundPhone} — reloading…`);
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setBadge('error', 'Save failed — check console');
      }
    } catch (e) {
      console.error('[GB Phone Finder] save error:', e);
      setBadge('error', `Error: ${e.message}`);
    }
  }

  setTimeout(runPhoneFinder, 1800);
})();

} // end guard
