// email-preview.js — Email viewer modal for CRM Case Detail pages
// Mirrors the logo-extractor pattern: hover button on the row → click → full-screen modal.

(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────────────────────────
  let _hoverBtn     = null;
  let _hoverTarget  = null;  // {messageId, messageGuid, meta}
  let _hideTimer    = null;
  const _cache      = {};

  // ── EML Parser ───────────────────────────────────────────────────────────────

  function _decodeQP(s) {
    return s.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }

  function _decodeB64(s) {
    try {
      const clean = s.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
      const bin   = atob(clean);
      try { return decodeURIComponent(bin.split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2,'0')).join('')); }
      catch (_) { return bin; }
    } catch (_) { return ''; }
  }

  function _decodeHeader(h) {
    return (h || '').replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, _cs, enc, val) => {
      try {
        if (enc.toUpperCase() === 'B') return _decodeB64(val);
        if (enc.toUpperCase() === 'Q') return _decodeQP(val.replace(/_/g, ' '));
      } catch (_) {}
      return val;
    });
  }

  function _parseEml(raw) {
    const result = { subject:'', from:'', to:'', date:'', bodyHtml:'' };
    const norm   = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const sep    = norm.indexOf('\n\n');
    if (sep === -1) return result;

    const rawH   = norm.slice(0, sep).replace(/\n[ \t]+/g, ' ');
    const bodyTx = norm.slice(sep + 2);
    const h      = {};
    for (const line of rawH.split('\n')) {
      const m = line.match(/^([A-Za-z0-9-]+)\s*:\s*(.*)/);
      if (m) h[m[1].toLowerCase()] = m[2].trim();
    }
    result.subject  = _decodeHeader(h['subject']);
    result.from     = _decodeHeader(h['from']);
    result.to       = _decodeHeader(h['to']);
    result.date     = h['date']       || '';
    result.messageId  = (h['message-id'] || '').trim();
    result.references = (h['references'] || '').trim();
    result.replyTo    = _decodeHeader(h['reply-to'] || h['return-path'] || '');

    const out = { html: [], text: [], inlines: {} };
    
    function decodePart(s, enc) {
      const e = (enc || '').toLowerCase().trim();
      if (e === 'base64') return _decodeB64(s);
      if (e === 'quoted-printable') return _decodeQP(s);
      return s;
    }

    function walk(body, partCT, partCTE, headers = {}) {
      const ctLow = (partCT || '').toLowerCase();
      
      // Extract CID inline images directly into base64 data URIs
      const cid = headers['content-id'];
      if (cid && ctLow.startsWith('image/')) {
        const cleanCid = cid.replace(/^</, '').replace(/>$/, '');
        const b64 = body.replace(/\s/g, ''); 
        const mime = ctLow.split(';')[0];
        out.inlines[cleanCid] = `data:${mime};base64,${b64}`;
        return; 
      }

      if (ctLow.startsWith('multipart/')) {
        const bm = partCT.match(/boundary\s*=\s*"([^"]+)"|boundary\s*=\s*([^\s;]+)/i);
        if (!bm) return;
        const boundary = (bm[1] || bm[2]).replace(/;.*/, '').trim();
        const escaped  = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Prepend \n so the first boundary (which may start the body with no preceding \n) is found
        const parts = ('\n' + body).split(new RegExp('\n--' + escaped + '(?:--)?(?:\n|$)'));
        for (let i = 1; i < parts.length; i++) {
          const p    = parts[i];
          const pSep = p.indexOf('\n\n');
          if (pSep === -1) continue;
          const ph   = {};
          for (const hl of p.slice(0, pSep).replace(/\n[ \t]+/g, ' ').split('\n')) {
            const hm = hl.match(/^([A-Za-z0-9-]+)\s*:\s*(.*)/);
            if (hm) ph[hm[1].toLowerCase()] = hm[2].trim();
          }
          walk(p.slice(pSep + 2), ph['content-type'] || 'text/plain', ph['content-transfer-encoding'] || '7bit', ph);
        }
      } else if (ctLow.startsWith('text/html')) {
        const csm     = partCT.match(/charset\s*=\s*["']?([^"';\s]+)/i);
        const charset = (csm ? csm[1] : 'utf-8').toLowerCase().replace(/^cp-?/i, 'windows-');
        let decoded   = decodePart(body, partCTE);
        if (charset !== 'utf-8' && charset !== 'us-ascii') {
          try {
            const bytes = Uint8Array.from(decodePart(body, partCTE), c => c.charCodeAt(0));
            decoded = new TextDecoder(charset, { fatal: false }).decode(bytes);
          } catch (_) {}
        }
        out.html.push(decoded);
      } else if (ctLow.startsWith('text/plain')) {
        out.text.push(decodePart(body, partCTE));
      }
    }

    // Start parsing tree
    walk(bodyTx, h['content-type'] || 'text/plain', h['content-transfer-encoding'] || '7bit', h);

    if (out.html.length) {
      let mergedHtml = out.html.join('\n');
      // Inject extracted inline images
      mergedHtml = mergedHtml.replace(/(src|background)\s*=\s*["']?cid:([^"'\s>]+)["']?/gi, (match, attr, c) => {
        const cleanCid = c.replace(/^</, '').replace(/>$/, '');
        return out.inlines[cleanCid] ? `${attr}="${out.inlines[cleanCid]}"` : match;
      });
      result.bodyHtml = mergedHtml;
    } else if (out.text.length) {
      const safe = out.text.join('\n').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      result.bodyHtml = `<pre style="white-space:pre-wrap;font:13px/1.6 sans-serif;margin:0;">${safe}</pre>`;
    }
    return result;
  }

  // ── Smart Dark Mode Normaliser ───────────────────────────────────────────────

  function _normaliseEmailDom(container) {
    // Catch common strict white/black declarations in emails
    const WHITE_BG = /^(#ffffff|#fff|white|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)|rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*1\s*\))$/i;
    const DARK_TXT = /^(#000000|#000|#111111|#111|#222222|#222|#333333|#333|black|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*1\s*\))$/i;

    container.querySelectorAll('*').forEach(el => {
      // Strip explicit white backgrounds
      const bgAttr = el.getAttribute('bgcolor');
      if (bgAttr && WHITE_BG.test(bgAttr.trim())) el.setAttribute('bgcolor', 'transparent');

      if (el.style.backgroundColor && WHITE_BG.test(el.style.backgroundColor.trim())) {
        el.style.backgroundColor = 'transparent';
      }
      if (el.style.background && WHITE_BG.test(el.style.background.trim())) {
        el.style.background = 'transparent';
      }

      // Convert strict black/dark text to a legible light grey
      const colorAttr = el.getAttribute('color');
      if (colorAttr && DARK_TXT.test(colorAttr.trim())) el.setAttribute('color', '#cccccc');

      if (el.style.color && DARK_TXT.test(el.style.color.trim())) {
        el.style.color = '#cccccc';
      }
    });
  }

  // ── Modal ────────────────────────────────────────────────────────────────────

  const _CASE_CATS = {
    'Order Status Update':          ['Lost Package','Carrier Issue','Tracking Update','Out of Stock','Drop Ships','Late Ship','Misunderstanding'],
    'Place an Order':               [],
    'Product Inquiry':              ['Sale Made - Yes','Sale Made - No'],
    'Transfer':                     ['Custom Logo','Retail','Human Resources','Direct Transfer'],
    'Returns/Reprint':              ['Wrong Item Ordered (Customer Error)','Wrong Item Shipped (GBC Error)','Shipped qty error (GBC error)','Drop Ship Error (Man. Error)','Drop Ship Error (GBC Error)','Manufacture Error/Defect','Lost in Transit (Courier Error)','Printing Defects - GBC PRODUCTION (BOH Error)','Printing Defects - GBC CSR Error','Printing Defects - Customer Error','Incorrect Product Customized','Production Defects','Quality of Print','Damaged Package Courier Error'],
    'Charge Error':                 ['Fixed - System did not charge','Fixed - System failed to attach charge','Actual Charge Error - Resolved by Customer','Actual Charge Error - Resolved by CSR','Fraud','Card did not populate'],
    'Fraud Inquiry':                [],
    'International Orders':         [],
    'Profanity':                    [],
    'Order Change':                 ['Quantity','Personalization Edit','Shipping Address','Billing Address Change','Shipping Method Change','Product Change','Payment Method','System Error'],
    'Cancelation':                  ['Out of Stock','Customer Changed Mind','Delivery Delays','Expected Delivery Date Changed','Alternative available found better price','Alternative available found better quality','Subscribe and Score'],
    'Website Concerns':             ['User Experience','Cannot Load cart','Cannot Login','Cannot Check out','Subscribe and Score','Cannot Cancel Order','Site Navigation','Promo Codes','Price Variance','Shipping Address would not populate','PO Box'],
    'General Inquiry':              ['Shipping options available','General website guidance / use'],
    'CSAT':                         ['CSAT Note','Detractor'],
    'Other - Details must be provided': [],
  };

  function _buildModal() {
    document.getElementById('__gb-email-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = '__gb-email-modal';
    modal.style.cssText = `
      position:fixed!important;inset:0!important;z-index: 999990 !important;
      display:flex!important;align-items:center!important;justify-content:center!important;
      background:rgba(0,0,0,.6)!important;
      backdrop-filter:blur(8px)!important;-webkit-backdrop-filter:blur(8px)!important;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif!important;
    `;

    modal.innerHTML = `
      <style>
        @keyframes __gbEmFadeIn  { from{opacity:0}to{opacity:1} }
        @keyframes __gbEmSlideUp { from{opacity:0;transform:scale(.92) translateY(16px)}to{opacity:1;transform:none} }
        @keyframes __gbEmSpin    { to{transform:rotate(360deg)} }
        #__gb-email-modal { animation:__gbEmFadeIn .16s ease!important; }

        #__gb-em-card {
          background:rgba(17,17,17,.85)!important;
          backdrop-filter:blur(16px)!important;-webkit-backdrop-filter:blur(16px)!important;
          border:1px solid rgba(255,255,255,.08)!important;
          border-radius: 18px !important;
          box-shadow:0 24px 70px rgba(0,0,0,.9),inset 0 0 0 1px rgba(255,255,255,.03)!important;
          width:min(1280px,calc(100vw - 24px))!important;
          height:min(860px,calc(100vh - 40px))!important;
          display:flex!important;flex-direction:column!important;
          overflow:hidden!important;
          animation:__gbEmSlideUp .3s cubic-bezier(.34,1.56,.64,1)!important;
          box-sizing:border-box!important;
        }

        /* Header */
        #__gb-em-hdr {
          background:rgba(0,0,0,.4)!important;
          padding:13px 18px!important;
          display:flex!important;align-items:center!important;gap:12px!important;
          border-bottom:1px solid rgba(255,255,255,.06)!important;flex-shrink:0!important;
        }
        #__gb-em-hdr-icon {
          width:28px!important;height:28px!important;
          background:rgba(var(--gb-brand-label-rgb, 125,184,42), .15)!important;
          border-radius:7px!important;
          display:flex!important;align-items:center!important;justify-content:center!important;
          flex-shrink:0!important;color:var(--gb-brand-label,#7db82a)!important;
          border:1px solid rgba(var(--gb-brand-label-rgb, 125,184,42), .3)!important;
        }
        #__gb-em-title {
          font-size:13.5px!important;font-weight:700!important;
          color:var(--gb-text-primary,#fff)!important;
          white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;
          flex:1!important;min-width:0!important;
        }
        
        #__gb-em-close {
          margin-left:auto!important;
          background:rgba(255,255,255,.05)!important;color:rgba(255,255,255,.8)!important;
          border:1px solid rgba(255,255,255,.1)!important;border-radius:6px!important;
          padding:6px 12px!important;font-size:11px!important;font-weight:600!important;
          cursor:pointer!important;display:flex!important;align-items:center!important;
          gap:4px!important;flex-shrink:0!important;transition:all .2s!important;font-family:inherit!important;
        }
        #__gb-em-close:hover { background:rgba(255,255,255,.12)!important;color:#fff!important; }

        /* Meta strip & Action buttons */
        #__gb-em-meta {
          background:rgba(0,0,0,.25)!important;
          border-bottom:1px solid rgba(255,255,255,.06)!important;
          padding:9px 18px!important;
          display:flex!important;align-items:center!important;justify-content:space-between!important;gap:16px!important;
          flex-shrink:0!important;
        }
        
        #__gb-em-meta-grid {
          display:grid!important;grid-template-columns:38px 1fr!important;
          gap:3px 8px!important;flex:1!important;min-width:0!important;
        }
        .__gb-em-mk { font-size:9px!important;font-weight:800!important;text-transform:uppercase!important;letter-spacing:.6px!important;color:rgba(255,255,255,.4)!important;padding-top:2px!important;white-space:nowrap!important;line-height:1.5!important; }
        .__gb-em-mv { font-size:11.5px!important;color:var(--gb-text-secondary,#ccc)!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;line-height:1.5!important; }

        #__gb-em-meta-actions {
          display:flex!important;align-items:center!important;gap:8px!important;flex-shrink:0!important;
        }

        /* Dropdown in meta row */
        #__gb-em-tpl-dd-wrap { position:relative!important; width:300px!important; flex-shrink:0!important; }
        #__gb-em-btn-tpl {
          width:100%!important;background:rgba(0,0,0,.3)!important;
          border:1px solid rgba(255,255,255,.1)!important;border-radius:6px!important;
          padding:6px 28px 6px 10px!important;font-size:11.5px!important;font-weight:600!important;
          color:var(--gb-text-secondary,#cccccc)!important;cursor:pointer!important;text-align:left!important;
          display:flex!important;align-items:center!important;gap:6px!important;position:relative!important;
          min-height:30px!important;box-sizing:border-box!important;font-family:inherit!important;
          transition:border-color .2s,box-shadow .2s,background .15s!important;
          white-space:nowrap!important;overflow:hidden!important;
        }
        #__gb-em-btn-tpl:hover { background:rgba(255,255,255,.05)!important;border-color:rgba(255,255,255,.2)!important; }
        #__gb-em-btn-tpl.open {
          border-color:var(--gb-brand-label,#7db82a)!important;background:rgba(255,255,255,.05)!important;
          box-shadow:0 0 0 2px rgba(var(--gb-brand-label-rgb,125,184,42),.15)!important;
        }
        #__gb-em-tpl-dot { width:6px!important;height:6px!important;border-radius:50%!important;flex-shrink:0!important;background:rgba(255,255,255,.2)!important; }
        #__gb-em-tpl-dot.green { background:var(--gb-brand-label,#7db82a)!important;box-shadow:0 0 5px rgba(var(--gb-brand-label-rgb,125,184,42),.65),0 0 10px rgba(var(--gb-brand-label-rgb,125,184,42),.2)!important; }
        #__gb-em-tpl-label { flex:1!important;overflow:hidden!important;text-overflow:ellipsis!important; }
        #__gb-em-tpl-chev {
          position:absolute!important;right:8px!important;top:50%!important;transform:translateY(-50%)!important;
          color:rgba(255,255,255,.4)!important;pointer-events:none!important;
          transition:transform .22s cubic-bezier(.34,1.56,.64,1),color .2s!important;
          width:12px!important;height:12px!important;
        }
        #__gb-em-btn-tpl.open #__gb-em-tpl-chev { transform:translateY(-50%) rotate(180deg)!important;color:var(--gb-brand-label,#7db82a)!important; }
        
        #__gb-em-tpl-menu {
          position:absolute!important;top:calc(100% + 4px)!important;left:0!important;right:0!important;
          background:var(--gb-surface-elevated,#171717)!important;border:1px solid rgba(255,255,255,.1)!important;
          border-radius:9px!important;z-index: 999995 !important;max-height:480px!important;overflow-y:auto!important;
          scrollbar-width:thin!important;scrollbar-color:rgba(255,255,255,.1) transparent!important;
          opacity:0!important;transform:translateY(-5px) scaleY(.95)!important;transform-origin:top center!important;
          pointer-events:none!important;
          transition:opacity .16s ease,transform .18s cubic-bezier(.34,1.4,.64,1)!important;
          box-shadow:0 10px 30px rgba(0,0,0,.8),0 0 0 1px rgba(255,255,255,.03)!important;
        }
        #__gb-em-tpl-menu.open { opacity:1!important;transform:translateY(0) scaleY(1)!important;pointer-events:auto!important; }

        .gb-em-tpl-opt {
          display:flex!important;align-items:center!important;gap:9px!important;
          padding:10px 13px!important;
          cursor:pointer!important;font-size:12.5px!important;
          border-bottom:1px solid rgba(255,255,255,.05)!important;transition:background .1s!important;
        }
        .gb-em-tpl-opt:last-child { border-bottom:none!important; }
        .gb-em-tpl-opt:hover    { background:rgba(255,255,255,.08)!important; }
        .gb-em-tpl-opt.selected { background:rgba(var(--gb-brand-label-rgb,125,184,42),.15)!important; }
        .gb-em-tpl-dot-opt {
          width:6px!important;height:6px!important;border-radius:50%!important;flex-shrink:0!important;
          background:rgba(255,255,255,.2)!important;
        }
        .gb-em-tpl-dot-opt.green {
          background:var(--gb-brand-label,#7db82a)!important;
          box-shadow:0 0 5px rgba(var(--gb-brand-label-rgb,125,184,42),.65),0 0 10px rgba(var(--gb-brand-label-rgb,125,184,42),.2)!important;
        }
        .gb-em-tpl-dot-opt.gray { background:rgba(255,255,255,.2)!important; }
        .gb-em-tpl-opt-name {
          flex:1!important;font-weight:500!important;color:var(--gb-text-secondary,#cccccc)!important;
          white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;
        }
        .gb-em-tpl-matched-lbl {
          font-size:9.5px!important;font-weight:700!important;letter-spacing:.4px!important;text-transform:uppercase!important;
          color:var(--gb-brand-label,#7db82a)!important;
          background:rgba(var(--gb-brand-label-rgb,125,184,42),.15)!important;
          border:1px solid rgba(var(--gb-brand-label-rgb,125,184,42),.3)!important;
          border-radius:4px!important;padding:2px 6px!important;flex-shrink:0!important;
        }

        /* Action Buttons */
        .gb-em-icon-btn {
          width:30px!important; height:30px!important; border-radius:6px!important; padding:0!important;
          background:rgba(0,0,0,.3)!important; border:1px solid rgba(255,255,255,.1)!important;
          color:rgba(255,255,255,.5)!important; cursor:pointer!important; display:flex!important;
          align-items:center!important; justify-content:center!important; transition:all .15s!important; flex-shrink:0!important;
        }
        .gb-em-icon-btn:hover { background:rgba(255,255,255,.05)!important; border-color:rgba(255,255,255,.2)!important; color:#fff!important; }
        .gb-em-icon-btn.junk { color:var(--gb-error,#c86060)!important; border-color:rgba(var(--gb-error-rgb,200,96,96),.3)!important; }
        .gb-em-icon-btn.junk:hover { background:rgba(var(--gb-error-rgb,200,96,96),.15)!important; border-color:var(--gb-error,#c86060)!important; }
        
        .gb-em-action-btn {
          height:30px!important; border-radius:6px!important; padding:0 12px!important;
          background:rgba(0,0,0,.3)!important; border:1px solid rgba(255,255,255,.1)!important;
          color:rgba(255,255,255,.6)!important; cursor:pointer!important; display:flex!important;
          align-items:center!important; justify-content:center!important; gap:6px!important; transition:all .15s!important;
          font-size:11.5px!important; font-weight:600!important; font-family:inherit!important; flex-shrink:0!important;
        }
        .gb-em-action-btn:hover { background:rgba(255,255,255,.05)!important; border-color:rgba(255,255,255,.2)!important; color:#fff!important; }
        .gb-em-action-btn.primary { color:var(--gb-brand-text,#d8eeaa)!important; border-color:rgba(var(--gb-brand-label-rgb,125,184,42),.4)!important; }
        .gb-em-action-btn.primary:hover { background:var(--gb-brand-dark,#5f7d18)!important; border-color:var(--gb-brand-label,#7db82a)!important; }
        
        .gb-em-icon-btn:disabled, .gb-em-action-btn:disabled { opacity:.4!important; cursor:not-allowed!important; pointer-events:none!important; }

        /* Content row: email left, categories right */
        #__gb-em-content {
          display:flex!important;flex:1!important;overflow:hidden!important;min-height:0!important;
        }

        /* Left: email */
        #__gb-em-left {
          flex:1!important;min-width:0!important;display:flex!important;flex-direction:column!important;
          border-right:1px solid rgba(255,255,255,.06)!important;overflow:hidden!important;
        }
        #__gb-em-body { flex:1!important;overflow:hidden!important;position:relative!important;min-height:80px!important; }
        #__gb-em-loading {
          position:absolute!important;inset:0!important;display:flex!important;align-items:center!important;
          justify-content:center!important;gap:10px!important;color:rgba(255,255,255,.5)!important;
          font-size:13px!important;background:transparent!important;
        }
        #__gb-em-spin {
          width:20px!important;height:20px!important;
          border:2px solid rgba(255,255,255,.1)!important;
          border-top-color:var(--gb-brand-label,#7db82a)!important;
          border-radius:50%!important;animation:__gbEmSpin .7s linear infinite!important;
          flex-shrink:0!important;box-sizing:border-box!important;
        }
        #__gb-em-error {
          position:absolute!important;inset:0!important;display:none;
          align-items:center!important;justify-content:center!important;flex-direction:column!important;
          gap:10px!important;color:var(--gb-error,#c86060)!important;font-size:13px!important;
          padding:24px!important;text-align:center!important;background:rgba(0,0,0,.5)!important;
        }

        /* Right: category panel */
        #__gb-em-cats {
          width:400px!important;flex-shrink:0!important;display:flex!important;flex-direction:column!important;
          background:rgba(0,0,0,.25)!important;overflow:hidden!important;
        }
        #__gb-em-cats-hdr {
          padding:14px 16px 12px!important;flex-shrink:0!important;
          border-bottom:1px solid rgba(255,255,255,.06)!important;
        }
        #__gb-em-cats-hdr-title {
          font-size:9px!important;font-weight:800!important;text-transform:uppercase!important;
          letter-spacing:.8px!important;color:rgba(255,255,255,.5)!important; margin-bottom:10px!important;
        }

        .gb-em-dd-row { margin-bottom:6px!important; }
        .gb-em-dd-wrap { position:relative!important; }
        .gb-em-dd-input {
          width:100%!important;background:rgba(0,0,0,.3)!important;
          border:1px solid rgba(255,255,255,.1)!important;border-radius:8px!important;
          color:#fff!important;font-size:13px!important;font-weight:500!important;
          padding:10px 12px!important;font-family:inherit!important;outline:none!important;
          box-sizing:border-box!important;transition:border-color .15s,box-shadow .15s!important;
          height:40px!important;
        }
        .gb-em-dd-input:focus {
          border-color:var(--gb-brand-label,#7db82a)!important;
          box-shadow:0 0 0 2px rgba(var(--gb-brand-label-rgb,125,184,42),.15)!important;
        }
        .gb-em-dd-input::placeholder { color:rgba(255,255,255,.3)!important; }
        .gb-em-dd-menu {
          position:absolute!important;top:calc(100% + 3px)!important;left:0!important;right:0!important;
          background:var(--gb-surface-elevated,#171717)!important;
          border:1px solid rgba(255,255,255,.1)!important;border-radius:8px!important;
          z-index:999!important;max-height:180px!important;overflow-y:auto!important;
          scrollbar-width:thin!important;scrollbar-color:rgba(255,255,255,.1) transparent!important;
          display:none!important;
          box-shadow:0 8px 24px rgba(0,0,0,.6)!important;
        }
        .gb-em-dd-menu.open { display:block!important; }
        .gb-em-dd-opt {
          padding:7px 10px!important;font-size:12px!important;cursor:pointer!important;
          color:var(--gb-text-secondary,#ccc)!important;transition:background .1s!important;
          border-bottom:1px solid rgba(255,255,255,.05)!important;
        }
        .gb-em-dd-opt:last-child { border-bottom:none!important; }
        .gb-em-dd-opt:hover { background:rgba(255,255,255,.08)!important; }
        .gb-em-dd-opt.selected { background:rgba(var(--gb-brand-label-rgb,125,184,42),.15)!important;color:var(--gb-brand-label,#7db82a)!important; }

        .gb-em-submit-row { display:flex!important;gap:6px!important; }
        .gb-em-submit-btn {
          flex:1!important;background:var(--gb-brand-dark,#5f7d18)!important;color:var(--gb-brand-text,#d8eeaa)!important;
          border:1px solid rgba(var(--gb-brand-label-rgb,125,184,42),.4)!important;border-radius:6px!important;
          padding:6px 0!important;font-size:11px!important;font-weight:700!important;cursor:pointer!important;
          font-family:inherit!important;transition:background .15s!important;display:flex!important;
          align-items:center!important;justify-content:center!important;gap:5px!important;
        }
        .gb-em-submit-btn:hover { background:var(--gb-brand,#6e901d)!important;border-color:var(--gb-brand-label,#7db82a)!important;color:#fff!important; }
        .gb-em-submit-btn:disabled { opacity:.5!important;cursor:not-allowed!important;pointer-events:none!important; }

        /* Scrollable category list */
        #__gb-em-cats-list {
          flex:1!important;overflow-y:auto!important;padding:10px 14px 16px!important;
          scrollbar-width:thin!important;scrollbar-color:rgba(255,255,255,.1) transparent!important;
        }

        .gb-cat-section { margin-bottom:10px!important;border-radius:8px!important;transition:background .2s ease,box-shadow .2s ease!important;padding:4px 4px 6px!important; }
        .gb-cat-section.active {
          background:rgba(var(--gb-brand-label-rgb,125,184,42),.1)!important;
          box-shadow:inset 0 0 0 1px rgba(var(--gb-brand-label-rgb,125,184,42),.25)!important;
        }
        @keyframes __gbCatPop { 0%{transform:scale(1)} 40%{transform:scale(1.015)} 100%{transform:scale(1)} }
        .gb-cat-section.pop { animation:__gbCatPop .22s cubic-bezier(.34,1.4,.64,1)!important; }
        .gb-cat-name {
          font-size:11.5px!important;font-weight:800!important;text-transform:uppercase!important;
          letter-spacing:.5px!important;color:rgba(255,255,255,.5)!important;
          margin-bottom:7px!important;padding:5px 2px 0!important;
          display:flex!important;align-items:center!important;justify-content:space-between!important;
        }
        .gb-cat-name-text { flex:1!important;min-width:0!important; }
        .gb-cat-tab-badge {
          font-size:9px!important;font-weight:700!important;letter-spacing:.5px!important;
          background:rgba(0,0,0,.3)!important;
          border:1px solid rgba(255,255,255,.1)!important;
          border-radius:5px!important;padding:2px 5px!important;
          color:rgba(255,255,255,.5)!important;flex-shrink:0!important;
          transition:all .18s!important;
        }
        .gb-cat-section.active .gb-cat-tab-badge {
          background:rgba(var(--gb-brand-label-rgb,125,184,42),.2)!important;
          border-color:rgba(var(--gb-brand-label-rgb,125,184,42),.5)!important;
          color:var(--gb-brand-label,#7db82a)!important;
        }
        .gb-cat-section.active .gb-cat-name-text { color:var(--gb-brand-label,#7db82a)!important; }
        .gb-num-badge {
          font-size:9px!important;font-weight:700!important;
          background:rgba(0,0,0,.3)!important;
          border:1px solid rgba(255,255,255,.1)!important;
          border-radius:4px!important;padding:1px 4px!important;
          color:rgba(255,255,255,.5)!important;margin-right:4px!important;
          flex-shrink:0!important;line-height:1.4!important;
        }
        .gb-cat-tag { display:flex!important;align-items:center!important; }
        .gb-cat-tags {
          display:flex!important;flex-direction:column!important;gap:3px!important;
        }
        .gb-cat-tag {
          background:rgba(0,0,0,.2)!important;
          border:1px solid rgba(255,255,255,.08)!important;
          border-radius:7px!important;
          font-size:13.5px!important;font-weight:500!important;color:var(--gb-text-secondary,#ccc)!important;
          cursor:pointer!important;text-align:left!important;line-height:1.4!important;
          transition:all .15s!important;font-family:inherit!important;padding:9px 10px!important;min-height:40px!important;
        }
        .gb-cat-tag:hover {
          background:rgba(var(--gb-brand-label-rgb,125,184,42),.15)!important;
          border-color:rgba(var(--gb-brand-label-rgb,125,184,42),.4)!important;
          color:var(--gb-brand-label,#7db82a)!important;
        }
        .gb-cat-tag.loading {
          opacity:.5!important;cursor:not-allowed!important;pointer-events:none!important;
        }
        .gb-cat-tag.done {
          background:rgba(var(--gb-success-rgb,56,176,0),.15)!important;
          border-color:rgba(var(--gb-success-rgb,56,176,0),.4)!important;
          color:var(--gb-success,#38b000)!important;
        }
      </style>

      <div id="__gb-em-card">

        <div id="__gb-em-hdr">
          <div id="__gb-em-hdr-icon">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.3" viewBox="0 0 24 24">
              <rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>
          <span id="__gb-em-title">Email</span>
          <button id="__gb-em-close">
            <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Close
          </button>
        </div>

        <div id="__gb-em-meta">
          <div id="__gb-em-meta-grid">
            <span class="__gb-em-mk">From</span><span class="__gb-em-mv" id="__gb-em-from">—</span>
            <span class="__gb-em-mk">To</span>  <span class="__gb-em-mv" id="__gb-em-to">—</span>
            <span class="__gb-em-mk">Date</span><span class="__gb-em-mv" id="__gb-em-date">—</span>
          </div>
          <div id="__gb-em-meta-actions">
            <div id="__gb-em-tpl-dd-wrap">
              <button id="__gb-em-btn-tpl">
                <span id="__gb-em-tpl-dot"></span>
                <span id="__gb-em-tpl-label">Loading templates...</span>
                <svg id="__gb-em-tpl-chev" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div id="__gb-em-tpl-menu"></div>
            </div>
            <button class="gb-em-icon-btn junk" id="__gb-em-btn-junk" title="Mark as Junk">
              ${junkBtnSvg()}
            </button>
            <button class="gb-em-action-btn primary" id="__gb-em-btn-reply" title="Send Email">
              <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="14" height="14"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
              Send
            </button>
          </div>
        </div>

        <div id="__gb-em-content">
          <div id="__gb-em-left">
            <div id="__gb-em-body" style="position:relative!important;">
              <div id="__gb-em-loading"><div id="__gb-em-spin"></div>Loading email…</div>
              <div id="__gb-em-error"></div>
              
              <div id="__gb-em-shadow-host" style="display:none;flex:1;min-height:0;overflow-y:auto;width:100%;height:100%;"></div>

            </div>
          </div>
          <div id="__gb-em-cats">
            <div id="__gb-em-cats-hdr">
              <div id="__gb-em-cats-hdr-title">Categorise</div>
              <div class="gb-em-dd-row">
                <div class="gb-em-dd-wrap" id="__gb-em-cat-dd-wrap">
                  <input class="gb-em-dd-input" id="__gb-em-cat-input" type="text" placeholder="Category…" autocomplete="off">
                  <div class="gb-em-dd-menu" id="__gb-em-cat-dd-menu"></div>
                </div>
              </div>
              <div class="gb-em-dd-row">
                <div class="gb-em-dd-wrap" id="__gb-em-subcat-dd-wrap">
                  <input class="gb-em-dd-input" id="__gb-em-subcat-input" type="text" placeholder="Subcategory…" autocomplete="off">
                  <div class="gb-em-dd-menu" id="__gb-em-subcat-dd-menu"></div>
                </div>
              </div>
              <div class="gb-em-submit-row">
                <button class="gb-em-submit-btn" id="__gb-em-cat-submit">
                  <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>
                  Apply
                </button>
              </div>
            </div>
            <div id="__gb-em-cats-list" class="__gb-em-cats-list-inner"></div>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(modal);
    return modal;
  }
  
  function _closeModal() {
    const m = document.getElementById('__gb-email-modal');
    if (!m) return;
    if (m._removeKeyNav) m._removeKeyNav();
    m.style.opacity = '0';
    m.style.transition = 'opacity .18s ease';
    setTimeout(() => m.remove(), 200);
  }

  // ── Open Modal ───────────────────────────────────────────────────────────────

  function _openModal(target) {
    const { messageId, messageGuid, meta } = target;
    const isCasePage = target._devMode
      ? !!target._devIsCasePage
      : /[?&]caseID=/i.test(window.location.href);
    const modal = _buildModal();

    // Fill known metadata immediately
    modal.querySelector('#__gb-em-title').textContent = meta.subject || 'Email';
    modal.querySelector('#__gb-em-from').textContent  = meta.from    || '—';
    modal.querySelector('#__gb-em-to').textContent    = meta.to      || '—';
    modal.querySelector('#__gb-em-date').textContent  = meta.date    || '—';

    // Hide sidebar if not on a case page, disable junk button logic
    if (!isCasePage) {
      const catsEl = modal.querySelector('#__gb-em-cats');
      if (catsEl) catsEl.style.setProperty('display', 'none', 'important');
      const leftEl = modal.querySelector('#__gb-em-left');
      if (leftEl) leftEl.style.setProperty('border-right', 'none', 'important');
    }
    
    const junkBtn = modal.querySelector('#__gb-em-btn-junk');
    if (!isCasePage && junkBtn) {
      junkBtn.disabled = true;
      junkBtn.title = 'Mark as Junk (Only available on Case pages)';
    }

    // Close handlers
    modal.querySelector('#__gb-em-close').addEventListener('click', _closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) _closeModal(); });
    const onKey = e => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        if (!target._devMode && junkBtn && !junkBtn.disabled && isCasePage) {
          junkBtn.style.setProperty('transform', 'scale(.90)', 'important');
          setTimeout(() => { junkBtn.style.removeProperty('transform'); junkBtn.click(); }, 80);
        } else {
          _closeModal();
        }
      }
    };
    document.addEventListener('keydown', onKey);

    // ── Template dropdown ──────────────────────────────────────────────────────
    const tplBtn    = modal.querySelector('#__gb-em-btn-tpl');
    const tplMenu   = modal.querySelector('#__gb-em-tpl-menu');
    const tplLabel  = modal.querySelector('#__gb-em-tpl-label');
    let _tplMenuOpen   = false;
    let _selectedTpl   = null;   // the currently-selected template object
    let _caseTpls      = [];     // all enabled case-type templates
    let _matchedTplIds = [];     // ids of templates whose rules matched
    let _emailMetaSnap = {};     // snapshot for variable extraction

    // ── Evaluation helpers ─────────
    function _evalCaseRule(rule, email) {
      const hay = (email[rule.field] || '').toLowerCase();
      const ndl = (rule.value || '').toLowerCase();
      switch ((rule.op||'contains').replace(/\s+/g,'_').toLowerCase()) {
        case 'contains':      return hay.includes(ndl);
        case 'equals':        return hay === ndl;
        case 'starts_with':   return hay.startsWith(ndl);
        case 'ends_with':     return hay.endsWith(ndl);
        case 'not_contains':  return !hay.includes(ndl);
        case 'matches_regex': try { return new RegExp(rule.value,'i').test(email[rule.field]||''); } catch(_){return false;}
        default: return true;
      }
    }
    function _matchesCaseTpl(tpl, email) {
      return !(tpl.caseRules||[]).length || (tpl.caseRules||[]).every(r => _evalCaseRule(r, email));
    }
    function _extractCaseVars(tpl, email) {
      const out = {};
      for (const v of (tpl.caseVars||[])) {
        const hay = email[v.field] || '';
        const grp = v.group ?? 1;
        if (v.pattern) {
          try { const m = hay.match(new RegExp(v.pattern,'i')); out[v.name] = m ? (m[grp]!==undefined?m[grp]:m[0]) : ''; }
          catch(_) { out[v.name] = ''; }
        } else { out[v.name] = hay; }
      }
      return out;
    }
    function _renderCaseTpl(text, vars) {
      return text.replace(/\{\{(\w+)\}\}/g, (_,k) => vars[k]!==undefined ? vars[k] : '');
    }
    function _applyCaseTpl(tpl, email) {
      const vars    = _extractCaseVars(tpl, email);
      const subject = _renderCaseTpl(tpl.subject||'', vars) || ('RE: '+(email.subject||''));
      const body    = _renderCaseTpl(tpl.body||'', vars);
      const raw     = email.from || '';
      const to      = (raw.match(/<([^>]+)>/) || [,raw])[1].trim();
      window.open(`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    }

    // ── Load templates once when modal opens, auto-select immediately ──────────
    (async () => {
      const all  = await new Promise(res => chrome.storage.local.get('templates', d => res(d.templates||[])));
      _caseTpls  = all.filter(t => t.type === 'case' && t.enabled !== false);

      const emailBody   = modal._emailBodyText || '';
      _emailMetaSnap    = { from: meta.from||'', subject: meta.subject||'', body: emailBody };
      _matchedTplIds    = _caseTpls.filter(t => _matchesCaseTpl(t, _emailMetaSnap)).map(t => t.id);

      _selectedTpl = _caseTpls.find(t => _matchedTplIds.includes(t.id)) || _caseTpls[0] || null;

      if (_selectedTpl) {
        tplLabel.textContent = _selectedTpl.name || 'Untitled';
        const dotEl = modal.querySelector('#__gb-em-tpl-dot');
        if (dotEl) dotEl.classList.toggle('green', _matchedTplIds.includes(_selectedTpl.id));
      } else {
        tplLabel.textContent = 'Use Template';
      }

      if (modal._rebuildRecommended) modal._rebuildRecommended();
    })();

    // ── Build dropdown menu ────
    function _buildTplMenu() {
      tplMenu.innerHTML = '';

      if (!_caseTpls.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:14px 11px!important;font-size:12px!important;color:var(--gb-text-muted,#888)!important;text-align:center!important;line-height:1.6!important;';
        empty.textContent = 'No case templates yet. Configure in extension popup.';
        tplMenu.appendChild(empty);
        return;
      }

      const matched   = _caseTpls.filter(t =>  _matchedTplIds.includes(t.id));
      const unmatched = _caseTpls.filter(t => !_matchedTplIds.includes(t.id));
      const sorted    = [...matched, ...unmatched];

      sorted.forEach(tpl => {
        const isMatch = _matchedTplIds.includes(tpl.id);
        const opt = document.createElement('div');
        opt.className = 'gb-em-tpl-opt' + (_selectedTpl?.id === tpl.id ? ' selected' : '');
        opt.dataset.id = tpl.id;
        opt.innerHTML = `
          <span class="gb-em-tpl-dot-opt ${isMatch ? 'green' : 'gray'}"></span>
          <span class="gb-em-tpl-opt-name">${tpl.name || 'Untitled'}</span>
          ${isMatch ? '<span class="gb-em-tpl-matched-lbl">matched</span>' : ''}
        `;
        opt.addEventListener('click', e => {
          e.stopPropagation();
          _selectedTpl = tpl;
          tplLabel.textContent = tpl.name || 'Untitled';
          if (modal._rebuildRecommended) modal._rebuildRecommended();
          const dotEl = modal.querySelector('#__gb-em-tpl-dot');
          if (dotEl) dotEl.classList.toggle('green', isMatch);
          tplMenu.querySelectorAll('.gb-em-tpl-opt').forEach(o =>
            o.classList.toggle('selected', o.dataset.id === tpl.id)
          );
          _closeTplMenu();
        });
        tplMenu.appendChild(opt);
      });
    }

    function _openTplMenu() {
      _tplMenuOpen = true;
      _buildTplMenu();
      tplMenu.classList.add('open');
      tplBtn.classList.add('open');
    }
    function _closeTplMenu() {
      _tplMenuOpen = false;
      tplMenu.classList.remove('open');
      tplBtn.classList.remove('open');
    }

    tplBtn.addEventListener('click', e => { e.stopPropagation(); _tplMenuOpen ? _closeTplMenu() : _openTplMenu(); });
    modal.querySelector('#__gb-em-card').addEventListener('click', () => { if (_tplMenuOpen) _closeTplMenu(); });

    // Send button
    modal.querySelector('#__gb-em-btn-reply').addEventListener('click', () => {
      const rawFrom     = (modal.querySelector('#__gb-em-from')?.textContent || meta.from || '').trim();
      const baseSubject = (modal.querySelector('#__gb-em-title')?.textContent || meta.subject || '').replace(/^RE:\s*/i, '');

      if (_selectedTpl) {
        const emailBody = modal._emailBodyText || '';
        _applyCaseTpl(_selectedTpl, { from: rawFrom, subject: baseSubject, body: emailBody });
      } else {
        const to = (rawFrom.match(/<([^>]+)>/) || [,rawFrom])[1].trim();
        window.open(`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent('RE: '+baseSubject)}`, '_blank');
      }
    });

    // Mark as Junk button
    if (junkBtn) {
      junkBtn.addEventListener('click', async function () {
        const btn = this;
        if (target._devMode) {
          if (typeof showGbNotification === 'function')
            showGbNotification('Dev mode — case actions are disabled in the test console.', 'info', 3500);
          return;
        }
        const caseId = new URLSearchParams(window.location.search).get('caseID');
        if (!caseId) return;

        btn.disabled = true;
        btn.innerHTML = `<svg class="__gb-junk-spin" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" width="14" height="14"
          style="animation:__gbEmSpin .7s linear infinite"><circle cx="12" cy="12" r="10" opacity=".25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>`;

        try {
          const getUrl = `https://api.golfballs.com/golfballs/crm/Admin/MyCase/Get.ajax?${caseId}`;
          const getResp = await new Promise(resolve => {
            try {
              chrome.runtime.sendMessage({ action: 'fetchRaw', url: getUrl }, r => {
                if (chrome.runtime.lastError) resolve(null);
                else resolve(r);
              });
            } catch (_) { resolve(null); }
          });

          let caseData = {};
          try { caseData = JSON.parse(getResp?.text || '{}'); } catch (_) {}
          if (!caseData.caseID) throw new Error('Could not read case data');

          const employeeId = await _getEmployeeId();
          const payload = {
            Name:        caseData.Name        || '',
            Direction:   caseData.Direction   || 'In',
            Channel:     caseData.Channel     || 'Email',
            Category:    'Junk',
            Subcategory: 'Junk',
            Owner:       '1',
            caseID:      String(caseId),
            Department:  '2',
            Status:      3,
          };
          if (employeeId) payload.ClosedBy = String(employeeId);

          const updateUrl = `https://api.golfballs.com/golfballs/crm/Admin/MyCase/Update.ajax?${JSON.stringify(payload)}`;
          const upResp = await new Promise(resolve => {
            try {
              chrome.runtime.sendMessage({ action: 'fetchRaw', url: updateUrl }, r => {
                if (chrome.runtime.lastError) resolve(null);
                else resolve(r);
              });
            } catch (_) { resolve(null); }
          });

          let result = {};
          try { result = JSON.parse(upResp?.text || '{}'); } catch (_) {}

          const isSuccess = result.caseID === parseInt(caseId) || /closed/i.test(upResp?.text || '');
          if (!isSuccess) throw new Error('Update failed');

          btn.disabled = false;
          btn.innerHTML = `<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>`;
          btn.style.setProperty('background', 'rgba(var(--gb-success-rgb,56,176,0),.15)', 'important');
          btn.style.setProperty('border-color', 'rgba(var(--gb-success-rgb,56,176,0),.4)', 'important');
          btn.style.setProperty('color', 'var(--gb-success,#38b000)', 'important');
          if (typeof showGbNotification === 'function') {
            showGbNotification('Case marked as Junk and closed.', 'success', 3000);
          }
          setTimeout(() => { _closeModal(); location.reload(); }, 800);

        } catch (err) {
          btn.disabled = false;
          btn.innerHTML = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r=".5" fill="currentColor"/></svg>`;
          setTimeout(() => { btn.disabled = false; btn.innerHTML = junkBtnSvg(); }, 3000);
        }
      });
    }

    // Build category sections
    const catList = modal.querySelector('#__gb-em-cats-list');
    let catSections = [];
    const catEntries  = Object.entries(_CASE_CATS);
    let   activeCatIdx = -1;

    // ── Recommended section ──
    function _buildRecommendedSection() {
      modal.querySelector('#__gb-em-cats-recommended')?.remove();
      
      // Clean up previous recommended entries to avoid duplicates on re-renders
      const oldIdx = catSections.findIndex(c => c.cat === '__recommended__');
      if (oldIdx !== -1) {
        catSections.splice(oldIdx, 1);
        if (activeCatIdx === oldIdx) activeCatIdx = -1;
        else if (activeCatIdx > oldIdx) activeCatIdx--;
      }

      if (!_selectedTpl?.caseTags?.length) return;

      const sec = document.createElement('div');
      sec.id = '__gb-em-cats-recommended';
      sec.className = 'gb-cat-section';
      sec.style.cssText = 'background:rgba(var(--gb-brand-label-rgb,125,184,42),.05)!important;border:1px solid rgba(var(--gb-brand-label-rgb,125,184,42),.2)!important;margin-bottom:8px!important;';

      const nameEl = document.createElement('div');
      nameEl.className = 'gb-cat-name';
      const nameText = document.createElement('span');
      nameText.className = 'gb-cat-name-text';
      nameText.style.cssText = 'color:var(--gb-brand-label,#7db82a)!important;';
      nameText.textContent = '✦ Recommended';
      const tabBadge = document.createElement('span');
      tabBadge.className = 'gb-cat-tab-badge';
      tabBadge.style.cssText = 'background:rgba(var(--gb-brand-label-rgb,125,184,42),.15)!important;border-color:rgba(var(--gb-brand-label-rgb,125,184,42),.4)!important;color:var(--gb-brand-label,#7db82a)!important;';
      tabBadge.textContent = 'TAB';
      nameEl.appendChild(nameText);
      nameEl.appendChild(tabBadge);

      const tagsEl = document.createElement('div');
      tagsEl.className = 'gb-cat-tags';

      const recSubs = [];
      for (const tag of _selectedTpl.caseTags) {
        if (tag.category && tag.subcategory) {
          const btn = document.createElement('button');
          btn.className = 'gb-cat-tag';
          btn.style.cssText = 'border-color:rgba(var(--gb-brand-label-rgb,125,184,42),.2)!important;';
          const nb = document.createElement('span');
          nb.className = 'gb-num-badge';
          nb.textContent = recSubs.length + 1 <= 9 ? String(recSubs.length + 1) : recSubs.length + 1 === 10 ? '0' : '+';
          btn.appendChild(nb);
          btn.appendChild(document.createTextNode(tag.subcategory + ' (' + tag.category + ')'));
          btn.addEventListener('click', () => _submitCategoryUpdate(btn, tag.category, tag.subcategory, target, modal));
          tagsEl.appendChild(btn);
          recSubs.push(tag);
        }
      }

      if (!recSubs.length) return;

      sec.appendChild(nameEl);
      sec.appendChild(tagsEl);
      catList.insertBefore(sec, catList.firstChild);

      catSections.unshift({ sec, cat: '__recommended__', subs: recSubs.map(t => t.subcategory + ' (' + t.category + ')'), _recTags: recSubs });
      if (activeCatIdx >= 0) activeCatIdx++;
    }

    modal._rebuildRecommended = _buildRecommendedSection;

    for (let ci = 0; ci < catEntries.length; ci++) {
      const [cat, subs] = catEntries[ci];

      if (subs.length === 0) continue;

      const groups = [];
      for (let gi = 0; gi < subs.length; gi += 10) groups.push(subs.slice(gi, gi + 10));

      groups.forEach((group, gIdx) => {
        const sec = document.createElement('div');
        sec.className = 'gb-cat-section';

        const nameEl = document.createElement('div');
        nameEl.className = 'gb-cat-name';
        const nameText = document.createElement('span');
        nameText.className = 'gb-cat-name-text';
        nameText.textContent = groups.length > 1 ? cat + ' (' + (gIdx+1) + '/' + groups.length + ')' : cat;
        nameEl.appendChild(nameText);
        const tabBadge = document.createElement('span');
        tabBadge.className = 'gb-cat-tab-badge';
        tabBadge.textContent = 'TAB';
        nameEl.appendChild(tabBadge);

        const tagsEl = document.createElement('div');
        tagsEl.className = 'gb-cat-tags';

        group.forEach((sub, si) => {
          const tag = document.createElement('button');
          tag.className = 'gb-cat-tag';
          const nb = document.createElement('span');
          nb.className = 'gb-num-badge';
          nb.textContent = si === 9 ? '0' : String(si + 1);
          tag.appendChild(nb);
          tag.appendChild(document.createTextNode(sub));
          tag.addEventListener('click', () => _submitCategoryUpdate(tag, cat, sub, target, modal));
          tagsEl.appendChild(tag);
        });

        sec.appendChild(nameEl);
        sec.appendChild(tagsEl);
        catList.appendChild(sec);
        catSections.push({ sec, cat, subs: group });
      });
    }

    // ── Keyboard navigation ────────────────────────────────────────────────
    function _activateCat(idx) {
      if (catSections.length === 0) return;
      const prev = catSections[activeCatIdx];
      if (prev) prev.sec.classList.remove('active');
      activeCatIdx = ((idx % catSections.length) + catSections.length) % catSections.length;
      const cur = catSections[activeCatIdx];
      if (!cur) return;
      cur.sec.classList.add('active');
      cur.sec.classList.remove('pop');
      void cur.sec.offsetWidth;
      cur.sec.classList.add('pop');
      const listEl = cur.sec.closest('#__gb-em-cats-list');
      if (listEl) {
        const secRect  = cur.sec.getBoundingClientRect();
        const listRect = listEl.getBoundingClientRect();
        const relTop   = secRect.top - listRect.top + listEl.scrollTop;
        const targetTop = relTop - Math.floor(listEl.clientHeight * 0.20);
        listEl.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
      }
    }

    function _onKeyNav(e) {
      const focused = document.activeElement;
      if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA')) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        _activateCat(e.shiftKey ? activeCatIdx - 1 : activeCatIdx + 1);
        return;
      }

      if (e.key === 'Delete') {
        e.preventDefault();
        const junkBtn = modal.querySelector('#__gb-em-btn-junk');
        if (!junkBtn || junkBtn.disabled) return;
        junkBtn.style.setProperty('transform', 'scale(.90)', 'important');
        junkBtn.style.setProperty('transition', 'transform .08s ease', 'important');
        setTimeout(() => { junkBtn.style.removeProperty('transform'); junkBtn.click(); }, 80);
        return;
      }

      const numMatch = e.key.match(/^([0-9])$/);
      if (numMatch && activeCatIdx >= 0) {
        const n  = parseInt(numMatch[1]);
        const si = n === 0 ? 9 : n - 1;
        const cur = catSections[activeCatIdx];
        if (!cur || si >= cur.subs.length) return;
        const tagEls = cur.sec.querySelectorAll('.gb-cat-tag');
        if (tagEls[si]) {
          e.preventDefault();
          _submitCategoryUpdate(tagEls[si], cur.cat, cur.subs[si], target, modal);
        }
        return;
      }
    }

    document.addEventListener('keydown', _onKeyNav);
    modal._removeKeyNav = () => document.removeEventListener('keydown', _onKeyNav);

    // ── Category + subcategory text inputs ─────────────────
    const catInput  = modal.querySelector('#__gb-em-cat-input');
    const catMenu   = modal.querySelector('#__gb-em-cat-dd-menu');
    const subInput  = modal.querySelector('#__gb-em-subcat-input');
    const subMenu   = modal.querySelector('#__gb-em-subcat-dd-menu');
    const submitBtn = modal.querySelector('#__gb-em-cat-submit');

    const allCats = Object.keys(_CASE_CATS);

    function _buildOpts(menu, items, onSelect) {
      menu.innerHTML = '';
      items.forEach(item => {
        const opt = document.createElement('div');
        opt.className = 'gb-em-dd-opt';
        opt.textContent = item;
        opt.addEventListener('mousedown', (e) => {
          e.preventDefault();
          onSelect(item);
          menu.classList.remove('open');
        });
        menu.appendChild(opt);
      });
    }

    function _filterMenu(menu, input, allItems) {
      const q = input.value.trim().toLowerCase();
      const filtered = q ? allItems.filter(i => i.toLowerCase().includes(q)) : allItems;
      const opts = menu.querySelectorAll('.gb-em-dd-opt');
      let shown = 0;
      opts.forEach(opt => {
        const show = !q || opt.textContent.toLowerCase().includes(q);
        opt.style.display = show ? '' : 'none';
        if (show) shown++;
      });
      menu.classList.toggle('open', shown > 0 && document.activeElement === input);
    }

    function _updateSubOpts(cat) {
      const subs = _CASE_CATS[cat] || allCats; 
      _buildOpts(subMenu, subs.length ? subs : [cat], (sub) => {
        subInput.value = sub;
        subMenu.classList.remove('open');
      });
    }

    _buildOpts(catMenu, allCats, (cat) => {
      catInput.value = cat;
      catMenu.classList.remove('open');
      _updateSubOpts(cat);
      subInput.value = '';
      subInput.focus();
    });
    _updateSubOpts('');

    catInput.addEventListener('input', () => _filterMenu(catMenu, catInput, allCats));
    catInput.addEventListener('focus', () => {
      _buildOpts(catMenu, allCats, (cat) => { catInput.value = cat; catMenu.classList.remove('open'); _updateSubOpts(cat); subInput.value = ''; subInput.focus(); });
      _filterMenu(catMenu, catInput, allCats);
    });
    catInput.addEventListener('blur', () => setTimeout(() => catMenu.classList.remove('open'), 150));
    catInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { subInput.focus(); }
      if (e.key === 'Escape') { catMenu.classList.remove('open'); }
    });

    subInput.addEventListener('input', () => {
      const cat = catInput.value.trim();
      const subs = _CASE_CATS[cat] || allCats;
      _filterMenu(subMenu, subInput, subs);
    });
    subInput.addEventListener('focus', () => {
      const cat = catInput.value.trim();
      const subs = _CASE_CATS[cat] || allCats;
      _buildOpts(subMenu, subs.length ? subs : allCats, (sub) => { subInput.value = sub; subMenu.classList.remove('open'); });
      _filterMenu(subMenu, subInput, subs.length ? subs : allCats);
    });
    subInput.addEventListener('blur', () => setTimeout(() => subMenu.classList.remove('open'), 150));
    subInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const c = catInput.value.trim();
        const s = subInput.value.trim();
        if (c && s) _submitCategoryUpdate(submitBtn, c, s, target, modal);
      }
      if (e.key === 'Escape') { subMenu.classList.remove('open'); }
    });

    submitBtn.addEventListener('click', () => {
      const c = catInput.value.trim();
      const s = subInput.value.trim();
      if (!c) { catInput.style.setProperty('border-color', 'var(--gb-error,#c86060)', 'important'); catInput.focus(); return; }
      if (!s) { subInput.style.setProperty('border-color', 'var(--gb-error,#c86060)', 'important'); subInput.focus(); return; }
      _submitCategoryUpdate(submitBtn, c, s, target, modal);
    });

    // Dev mode: skip real fetch, inject stub body and render immediately
    const _devStubBody = 'Order #TEST-1234 confirmed.\n\nThank you for your Golfballs.com purchase.\nYour order ships within 2 business days.';
    const _devStubHtml = `<div style="font-family:sans-serif;font-size:13px;line-height:1.7;color:#333;padding:4px 0">
      <p><strong>From:</strong> orders@golfballs.com</p>
      <p><strong>Subject:</strong> [DEV] Order Confirmation — #TEST-1234</p>
      <hr style="border:none;border-top:1px solid #eee;margin:12px 0">
      <p>Dear Customer,</p>
      <p>Your order <strong>#TEST-1234</strong> has been confirmed and is being processed.</p>
      <ul>
        <li>Custom Golf Balls × 12 — <strong>$47.99</strong></li>
        <li>Logo Setup Fee — <strong>$12.00</strong></li>
      </ul>
      <p><strong>Total: $59.99</strong></p>
      <p>Expected ship date: <em>${new Date(Date.now() + 2*86400000).toLocaleDateString()}</em></p>
      <hr style="border:none;border-top:1px solid #eee;margin:12px 0">
      <p style="color:#999;font-size:11px;">Developer stub email — no real data.</p>
    </div>`;
    if (target._devMode) {
      modal._emailBodyText = _devStubBody;
      _setContent(modal, _devStubHtml);
    }
    const _doFetch = target._devMode
      ? (cb) => cb(_devStubBody)
      : (cb) => _fetchAndRender(messageId, messageGuid, modal, cb);
    _doFetch((bodyText) => {
      if (!_caseTpls.length) return;
      _emailMetaSnap = { from: meta.from||'', subject: meta.subject||'', body: bodyText };
      _matchedTplIds = _caseTpls.filter(t => _matchesCaseTpl(t, _emailMetaSnap)).map(t => t.id);
      
      const best = _caseTpls.find(t => _matchedTplIds.includes(t.id)) || _caseTpls[0] || null;
      if (best) {
        _selectedTpl = best;
        if (tplLabel) tplLabel.textContent = best.name || 'Untitled';
        if (modal._rebuildRecommended) modal._rebuildRecommended();
        const dotEl = modal.querySelector('#__gb-em-tpl-dot');
        if (dotEl) dotEl.classList.toggle('green', _matchedTplIds.includes(best.id));
      }
    });
  }

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const _sp = (el, v) => el?.style.setProperty('display', v, 'important');

  async function _submitCategoryUpdate(triggerEl, category, subcategory, target, modal) {
    if (target._devMode) {
      if (typeof showGbNotification === 'function')
        showGbNotification('Dev mode — case categories cannot be submitted in the test console.', 'info', 3500);
      return;
    }
    const caseId = new URLSearchParams(window.location.search).get('caseID');
    if (!caseId) { showGbNotification('No caseID found on this page', 'error', 3000); return; }

    triggerEl.classList.add('loading');

    const send = (msg) => new Promise(res => {
      try { chrome.runtime.sendMessage(msg, r => { if (chrome.runtime.lastError) res(null); else res(r); }); }
      catch (_) { res(null); }
    });

    try {
      const getResp = await send({ action: 'fetchRaw', url: `https://api.golfballs.com/golfballs/crm/Admin/MyCase/Get.ajax?${caseId}` });
      let caseData = {};
      try { caseData = JSON.parse(getResp?.text || '{}'); } catch (_) {}
      if (!caseData.caseID) throw new Error('Could not read case data.');

      const employeeId = await _getEmployeeId();
      const payload = {
        Name:        caseData.Name        || '',
        Direction:   caseData.Direction   || 'In',
        Channel:     caseData.Channel     || 'Email',
        Category:    category,
        Subcategory: subcategory || category,
        Owner:       String(caseData.OwnerID || '1'),
        caseID:      String(caseId),
        Department:  String(caseData.DepartmentID || '2'),
        Status:      3,
      };
      if (employeeId) payload.ClosedBy = String(employeeId);

      const upResp = await send({ action: 'fetchRaw', url: `https://api.golfballs.com/golfballs/crm/Admin/MyCase/Update.ajax?${JSON.stringify(payload)}` });
      let result = {};
      try { result = JSON.parse(upResp?.text || '{}'); } catch (_) {}

      const ok = result.caseID === parseInt(caseId) || /success|ok/i.test(upResp?.text || '');
      if (!ok && upResp?.text && upResp.text.length < 200) throw new Error(upResp.text);

      triggerEl.classList.remove('loading');
      triggerEl.classList.add('done');
      showGbNotification(`Categorised: ${category} → ${subcategory}`, 'success', 3000);
      setTimeout(() => _closeModal(), 600);
    } catch (err) {
      triggerEl.classList.remove('loading');
      showGbNotification('Update failed: ' + (err.message || 'Unknown error'), 'error', 4000);
    }
  }

  function _setLoading(modal) {
    _sp(modal.querySelector('#__gb-em-loading'), 'flex');
    _sp(modal.querySelector('#__gb-em-error'),   'none');
    _sp(modal.querySelector('#__gb-em-shadow-host'), 'none');
  }

  function _setError(modal, msg) {
    _sp(modal.querySelector('#__gb-em-loading'), 'none');
    _sp(modal.querySelector('#__gb-em-shadow-host'), 'none');
    const err = modal.querySelector('#__gb-em-error');
    err.textContent = msg;
    _sp(err, 'flex');
  }

  function _setContent(modal, html) {
    _sp(modal.querySelector('#__gb-em-loading'), 'none');
    _sp(modal.querySelector('#__gb-em-error'),   'none');

    modal._emailBodyText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    const host = modal.querySelector('#__gb-em-shadow-host');
    if (host) {
      host.style.display = 'block';
      let shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
      
      // Inject the email with a Base URL tag to fix relative links/images
      // AND a forced style override to fix the font-size/dark-mode scaling
      const baseHost = "https://api.golfballs.com"; // Adjust to your actual mail server base
      
      shadow.innerHTML = `
        <base href="${baseHost}">
        <style>
          :host { 
            display: block; padding: 20px; background: #fff; color: #000; 
            font-family: Calibri, Segoe UI, Arial, sans-serif; 
          }
          /* Force Outlook-style scaling */
          * { max-width: 100%; box-sizing: border-box; }
          body { font-size: 11pt !important; }
        </style>
        <div id="email-content">${html}</div>
      `;

      // 1. Force fix text colors that are hardcoded to black
      // 2. We skip stripping white backgrounds here so the email looks "normal" (like Outlook)
      _normaliseEmailDom(shadow.querySelector('#email-content'));
    }
  }

  function junkBtnSvg() {
    return `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="14" height="14">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>`;
  }

  async function _getEmployeeId() {
    const el = document.getElementById('tbCurrentAdmin');
    if (el?.value?.trim()) return el.value.trim();

    if (window.Case?.ClosedBy) return String(window.Case.ClosedBy);

    if (window.__gbEmployeeId) return String(window.__gbEmployeeId);
    try {
      const data = await new Promise(res => chrome.storage.local.get(['gbEmployeeId','featureFlags'], res));
      const id = data?.gbEmployeeId || data?.featureFlags?.gbEmployeeId;
      if (id) return String(id);
    } catch (_) {}
    return null;
  }

  function _fetchAndRender(messageId, messageGuid, modal, onBodyReady) {
    if (!modal.isConnected) return;

    if (_cache[messageId]) {
      _setContent(modal, _cache[messageId]);
      if (onBodyReady) onBodyReady(modal._emailBodyText || '');
      return;
    }

    _setLoading(modal);

    const store = html => {
      _cache[messageId] = html;
      _setContent(modal, html);
      if (onBodyReady) onBodyReady(modal._emailBodyText || '');
    };
    const fail  = msg  => { if (modal.isConnected) _setError(modal, msg); };

    const send = (msg, cb) => {
      try {
        chrome.runtime.sendMessage(msg, resp => {
          if (chrome.runtime.lastError) { cb(null); return; }
          cb(resp);
        });
      } catch (_) { cb(null); }
    };

    const url = `https://api.golfballs.com/golfballs/adminnew/Default.aspx`
              + `?Page=268&MessageGUID=${encodeURIComponent(messageGuid)}&MessageID=${encodeURIComponent(messageId)}`;

    send({ action: 'fetchRaw', url }, resp => {
      if (!modal.isConnected) return;
      const raw = resp?.text || '';
      if (!raw) { fail('Could not load the email. The session may have expired — try reloading the page.'); return; }

      if (/^\s*<!DOCTYPE|^\s*<html/i.test(raw)) {
        // Drop <script> and external CSS links but keep <style> blocks
        store(raw.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<link[^>]*>/gi,''));
        return;
      }

      const parsed = _parseEml(raw);
      if (parsed.bodyHtml) {
        if (parsed.from    && modal.isConnected) modal.querySelector('#__gb-em-from').textContent  = parsed.from;
        if (parsed.subject && modal.isConnected) modal.querySelector('#__gb-em-title').textContent = parsed.subject;
        store(parsed.bodyHtml);
      } else {
        const safe = raw.slice(0, 12000).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        store(`<pre style="white-space:pre-wrap;font:13px/1.5 monospace;margin:0;">${safe}</pre>`);
      }
    });
  }

  // ── Row wiring ───────────────────────────────────────────────────────────────

  function _attachRow(row, link) {
    if (row.__gbEpAttached) return;
    row.__gbEpAttached = true;

    const href  = link.href || '';
    const idM   = href.match(/[?&]MessageID=([^&]+)/i);
    const guidM = href.match(/[?&]MessageGUID=([^&]+)/i);
    if (!idM) return;

    const messageId   = idM[1];
    const messageGuid = guidM ? guidM[1] : '';
    const cells       = row.querySelectorAll('td');
    const meta        = {
      from:    cells[1]?.textContent?.trim() || '',
      to:      cells[2]?.textContent?.trim() || '',
      subject: cells[3]?.textContent?.trim() || '',
      date:    cells[4]?.textContent?.trim() || '',
    };
    const target = { messageId, messageGuid, meta };

    if (!document.getElementById('__gb-ep-row-styles')) {
      const s = document.createElement('style');
      s.id = '__gb-ep-row-styles';
      const rgb = getComputedStyle(document.documentElement)
        .getPropertyValue('--gb-brand-label-rgb').trim() || '125,184,42';
      s.textContent = `
        tr[data-gbep]:hover td { background-color: rgba(${rgb},.15) !important; }
        tr[data-gbep] td { cursor: pointer !important; transition: background-color .15s ease !important; }
        tr[data-gbep]:hover td:first-child { border-left: 3px solid rgba(${rgb},.9) !important; }
      `;
      document.head.appendChild(s);
    }
    row.setAttribute('data-gbep', '1');

    row.addEventListener('click', (e) => {
      if (e.target.closest('a[href*="Page=268"]')) return;
      _openModal(target);
    });
  }

  function __gbEmailPreviewScan() {
    if (window.__gbFeatureFlags?.emailPreviewEnabled === false) return;
    document.querySelectorAll('a[href*="Page=268"][href*="MessageID="]')
      .forEach(link => { const row = link.closest('tr'); if (row) _attachRow(row, link); });
  }

  window.__gbEmailPreviewScan  = __gbEmailPreviewScan;
  window.__gbOpenEmailPreview  = _openModal;

  // ── Reply-with-Template: MIME builder ─────────────────────────────────────

  function __gbBuildReplyMime({ replyTo, subject, templateHtml, originalHtml, originalDate, originalFrom, messageId, references }) {
    const reSubject = /^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`;
    const newRefs = references
      ? `${references.trim()} ${messageId}`.trim()
      : messageId;

    const boundary = `gb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

    const quotedBlock = `<div style="border-left:2px solid #ccc;padding-left:12px;margin-top:16px;color:#555;">
  <p style="margin:0 0 8px;font-size:12px;color:#888;">
    On ${originalDate}, ${_esc(originalFrom)} wrote:
  </p>
  ${originalHtml || ''}
</div>`;

    const htmlBody  = templateHtml + '\n' + quotedBlock;
    const textBody  = '-- Reply composed via Golfballs.com Extension --';

    const mime = [
      `MIME-Version: 1.0`,
      `X-Unsent: 1`,                // tells Outlook to open in compose/send mode
      `Subject: ${reSubject}`,
      `To: ${replyTo}`,
      `In-Reply-To: ${messageId}`,
      `References: ${newRefs}`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      textBody,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=utf-8`,
      `Content-Transfer-Encoding: quoted-printable`,
      ``,
      htmlBody,
      ``,
      `--${boundary}--`,
    ].join('\r\n');

    return btoa(unescape(encodeURIComponent(mime)))
      .replace(/\+/g, '-').replace(/\//g, '_');
  }

  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  async function __gbExecuteReplyWithTemplate(messageId, messageGuid, templateHtml, contactEmail, templateSubject) {
    const notify = (msg, type = "error") => {
      if (typeof showGbNotification === "function") showGbNotification(msg, type, 5000);
      else console.warn("[GB Reply]", msg);
    };

    if (!messageId || !messageGuid) {
      notify("No prior email found in the history table to reply to.", "warning");
      return { fallbackToMailto: true };
    }

    const url = "https://api.golfballs.com/golfballs/adminnew/Default.aspx"
              + "?Page=268&MessageGUID=" + encodeURIComponent(messageGuid)
              + "&MessageID="            + encodeURIComponent(messageId);
    let rawEml;
    try {
      rawEml = await new Promise((res, rej) =>
        chrome.runtime.sendMessage({ action: "fetchRaw", url }, r =>
          r?.text ? res(r.text) : rej(new Error("Empty response from email server"))
        )
      );
    } catch(e) {
      notify("Could not fetch the prior email: " + e.message);
      return { fallbackToMailto: true };
    }

    const parsed = _parseEml(rawEml);
    if (!parsed.messageId) parsed.messageId = "<" + messageGuid + "@golfballs.com>";

    const replyToAddr = parsed.replyTo || parsed.from || contactEmail || "";
    if (!replyToAddr) { notify("Could not determine reply address.", "warning"); return { fallbackToMailto: true }; }

    const mimeBase64 = __gbBuildReplyMime({
      replyTo: replyToAddr, subject: parsed.subject || "", templateHtml,
      originalHtml: parsed.bodyHtml || "", originalDate: parsed.date || "",
      originalFrom: parsed.from || "", messageId: parsed.messageId, references: parsed.references || "",
    });

    const rawMime = decodeURIComponent(escape(atob(mimeBase64.replace(/-/g, "+").replace(/_/g, "/"))));
    const dataUrl = "data:message/rfc822;base64," + btoa(unescape(encodeURIComponent(rawMime)));
    chrome.runtime.sendMessage({ action: "downloadEml", dataUrl, filename: "reply-" + Date.now() + ".eml" });
    notify("Reply file downloaded — open it to send in Outlook.", "success");
    return { downloaded: true };
  }
  window.__gbBuildReplyMime          = __gbBuildReplyMime;
  window.__gbExecuteReplyWithTemplate = __gbExecuteReplyWithTemplate;

  function __gbExecutePASend({ replyMode, templateHtml, templateSubject, contactEmail, paUrl }) {
    if (!paUrl) return Promise.resolve({ fallbackToMailto: true });
    return new Promise(res => {
      chrome.storage.local.get('emailSignature', ({ emailSignature }) => {
        let body = templateHtml || '';
        if (emailSignature) {
          body += '<br><div style="border-top:1px solid #ccc;padding-top:8px;margin-top:16px;">' + emailSignature + '</div>';
        }
        const payload = { emails: [{ to: contactEmail, subject: templateSubject, htmlBody: body, replyMode }] };
        chrome.runtime.sendMessage({ action: 'paAutomate', paUrl, payload }, (paResult) => {
          const ok = paResult?.results?.[0]?.status === 'sent';
          const errMsg = paResult?.results?.[0]?.error || paResult?.error || 'Flow did not confirm delivery';
          if (ok) {
            if (typeof showGbNotification === 'function') showGbNotification('Email sent via Power Automate.', 'success', 4000);
            res({ sent: true });
          } else {
            if (typeof showGbNotification === 'function') showGbNotification(`Email failed: ${errMsg}`, 'error', 6000);
            res({ sent: false, error: errMsg });
          }
        });
      });
    });
  }
  window.__gbExecutePASend = __gbExecutePASend;

})();