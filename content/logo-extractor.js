// logo-extractor.js — logo image extraction, hover button, proof-link modal
if (window.__gbLoaded_logoExtractor) {} else { window.__gbLoaded_logoExtractor = true;

// Depends on: smart-detection.js

// ═══════════════════════════════════════════════════════
  // LOGO IMAGE EXTRACTOR
  // ═══════════════════════════════════════════════════════

  /** @type {string} Primary CDN host for uploaded logo assets. */
  const __GB_CDN_HOST = 's.customizationapps.com';
  /** @type {string} Alternate host for uploaded logo assets. */
  const __GB_ALT_HOST = 'www.icustomize.com';

  /**
   * Recursively URL-decodes a string until it stabilises or the iteration
   * limit is reached, preventing infinite loops on malformed inputs.
   */
  function __gbDecodeDeep(str, max = 8) {
    let prev = str, cur = str;
    for (let i = 0; i < max; i++) {
      try { cur = decodeURIComponent(prev); } catch { break; }
      if (cur === prev) break;
      prev = cur;
    }
    return prev;
  }

  /**
   * Derives a safe filename from a URL path, stripping query strings and
   * fragments.
   */
  function __gbFilenameFromPath(p) {
    try {
      const clean = p.split(/[?#]/)[0];
      const seg = clean.split('/').pop() || 'user-upload';
      return /\.(png|jpe?g|webp|gif|svg)$/i.test(seg) ? seg : seg + '.png';
    } catch { return 'user-upload.png'; }
  }

  /**
   * Builds an array of absolute candidate URLs for a given host and path-or-URL.
   */
  function __gbUrlsFor(host, pathOrUrl) {
    if (!host || !pathOrUrl) return [];
    if (/^https?:\/\//i.test(pathOrUrl)) {
      return [
        pathOrUrl.replace(/^http:\/\//i, 'https://'),
        pathOrUrl.replace(/^https:\/\//i, 'http://')
      ];
    }
    const path = pathOrUrl.replace(/^\/+/, '');
    return [
      `https://${host}/${path}`,
      `http://${host}/${path}` 
    ];
  }

  function __gbLooksLikeIconToken(s) {
    return !!s && !/[\/\\]/.test(s) && !/\.[a-z0-9]+$/i.test(s);
  }

  function __gbWithoutSizeSuffix(p) {
    return p.replace(/-(\d+)(\.(?:png|jpe?g|webp|gif|svg))(?:$|[?#])/i, '$2');
  }

  function __gbWithCaseVariants(relPath) {
    const out = new Set([relPath]);
    const m = relPath.match(/^([^/]+)\/(.*)$/);
    if (m) {
      const head = m[1], tail = m[2];
      if (head.toLowerCase() === 'logo')  { out.add(`logo/${tail}`);  out.add(`Logo/${tail}`);  }
      if (head.toLowerCase() === 'logos') { out.add(`logos/${tail}`); out.add(`Logos/${tail}`); }
    }
    return [...out];
  }

  function __gbFindOverlayTokenOrPath(rawUrl) {
    if (!rawUrl) return null;
    const deep = __gbDecodeDeep(rawUrl);

    const mTop = deep.match(/[?&]userOverlay=([^&#]+)/i);
    if (mTop && mTop[1]) return __gbDecodeDeep(mTop[1]);

    try {
      const u = new URL(deep, location.origin);
      for (const [, v] of u.searchParams.entries()) {
        const dv = __gbDecodeDeep(v);
        const m = dv.match(/userOverlay=([^&#]+)/i);
        if (m && m[1]) return __gbDecodeDeep(m[1]);
      }
    } catch {}

    const overlayRegex = /((?:https?:\/\/)?(?:[^/]*\/)?(?:UserUploads(?:\/Crops)?|logo|logos)\/[A-Za-z0-9/_\-.%]+?\.(?:png|jpe?g|webp|gif|svg))/i;
    const direct = deep.match(overlayRegex);
    if (direct && direct[1]) return direct[1];

    return null;
  }

  function __gbBuildAbsoluteCandidates(tokenOrPath) {
    if (/^https?:\/\//i.test(tokenOrPath)) {
      const base = [
        tokenOrPath.replace(/^http:\/\//i,  'https://'),
        tokenOrPath.replace(/^https:\/\//i, 'http://')
      ];
      const noSize = __gbWithoutSizeSuffix(tokenOrPath);
      return noSize !== tokenOrPath ? [
        ...base,
        noSize.replace(/^http:\/\//i,  'https://'),
        noSize.replace(/^https:\/\//i, 'http://')
      ] : base;
    }

    if (__gbLooksLikeIconToken(tokenOrPath)) {
      const bases = ['icons','icon','logo','Logo','logos','Logos','images/icons','Images/Icons','flags','Flags','images/flags','Images/Flags','images','Images'];
      const exts  = ['svg','png','webp','jpg','jpeg','gif'];
      const abs   = [];
      for (const b of bases) {
        for (const e of exts) {
          abs.push(...__gbUrlsFor(__GB_CDN_HOST, `${b}/${tokenOrPath}.${e}`));
          abs.push(...__gbUrlsFor(__GB_ALT_HOST,  `${b}/${tokenOrPath}.${e}`));
        }
        abs.push(...__gbUrlsFor(__GB_CDN_HOST, `${b}/${tokenOrPath}`));
        abs.push(...__gbUrlsFor(__GB_ALT_HOST,  `${b}/${tokenOrPath}`));
      }
      return abs;
    }

    const variants = __gbWithCaseVariants(tokenOrPath);
    const noSize   = __gbWithoutSizeSuffix(tokenOrPath);
    if (noSize !== tokenOrPath) variants.push(...__gbWithCaseVariants(noSize));

    const abs = [];
    for (const v of variants) {
      abs.push(...__gbUrlsFor(__GB_CDN_HOST, v));
      abs.push(...__gbUrlsFor(__GB_ALT_HOST,  v));
    }
    return abs;
  }

  function __gbIsRenderAspxImg(img) {
    const src = decodeURIComponent(img.getAttribute('src') || '');
    const isTargetEndpoint = /Render\.aspx|\/r\b/i.test(src);
    const hasOverlayToken  = /useroverlay/i.test(src);
    if (isTargetEndpoint && hasOverlayToken) return true;
    if (/CustomerUpload|CustomerLogo|CustomLogo/i.test(src)) return true;
    return false;
  }

  function __gbFindDirectLink(img) {
    const isImageHref = (href) => /\.(jpg|jpeg|png|gif|svg|webp|bmp)(\?|$)/i.test(href) || /^https?:\/\//i.test(href);
    const SKIP_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'SPAN']);

    let node = img.nextSibling;
    while (node) {
      if (node.nodeType === 3) { node = node.nextSibling; continue; }
      if (node.nodeType === 1) {
        if (node.tagName.toUpperCase() === 'BR') {
          let next = node.nextSibling;
          while (next) {
            if (next.nodeType === 3) { next = next.nextSibling; continue; }
            if (next.nodeType === 1) {
              const tag = next.tagName.toUpperCase();
              if (tag === 'A') {
                const href = next.getAttribute('href') || '';
                const txt  = (next.textContent || '').trim().toLowerCase();
                if ((txt === 'original file' || txt.includes('original')) && /^https?:\/\//i.test(href)) return href;
                if (isImageHref(href)) return href;
              }
              if (SKIP_TAGS.has(tag)) { next = next.nextSibling; continue; }
              break;
            }
            next = next.nextSibling;
          }
        }
        break;
      }
      node = node.nextSibling;
    }
    return null;
  }

  function __gbFindItemLinkForImage(img) {
    const isItemId = (str) => /^\d{7,9}$/.test(str);
    
    let current = img;
    while (current && current !== document.body) {
      const anchors = current.parentNode.querySelectorAll('a[name]');
      for (const a of anchors) {
        const name = a.getAttribute('name');
        if (isItemId(name) && current.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_PRECEDING) {
          return `https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=253&itemID=${name}`;
        }
      }
      current = current.parentNode;
    }

    current = img;
    while (current && current !== document.body) {
      if (isItemId(current.id)) {
        return `https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=253&itemID=${current.id}`;
      }
      current = current.parentNode;
    }
    return null;
  }

  // ── Hover overlay button ──────────────────────────────

  let __gbHoverBtn      = null;
  let __gbHoverTarget   = null;
  let __gbHoverHideTimer = null;

  function __gbEnsureHoverBtn() {
    if (__gbHoverBtn) return __gbHoverBtn;

    const btn = document.createElement('div');
    btn.id = '__gb-img-hover-btn';
    btn.innerHTML = `
      <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
      </svg>
      <span>View Logo</span>
    `;
    btn.style.cssText = `
      position: fixed !important; display: flex !important; align-items: center !important; justify-content: center !important; gap: 6px !important;
      background: rgba(17,17,17,.85) !important; backdrop-filter: blur(12px) !important; -webkit-backdrop-filter: blur(12px) !important;
      color: var(--gb-brand-label, #7db82a) !important; border: 1px solid rgba(var(--gb-brand-label-rgb, 125,184,42), .4) !important;
      border-radius: 18px !important; padding: 8px 16px !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
      font-size: 11.5px !important; font-weight: 700 !important; line-height: 1 !important; letter-spacing: 0.25px !important;
      cursor: pointer !important; z-index: 999990 !important; pointer-events: auto !important;
      box-shadow: 0 4px 16px rgba(0,0,0,0.55), 0 0 14px rgba(var(--gb-brand-label-rgb, 125,184,42),0.18) !important;
      opacity: 0 !important; transition: opacity .15s ease, transform .18s cubic-bezier(.34,1.4,.64,1), box-shadow .18s ease, background .15s ease, color .15s ease !important;
      transform: scale(.88) translateY(3px) !important; white-space: nowrap !important; user-select: none !important;
    `;

    btn.addEventListener('mouseenter', () => {
      clearTimeout(__gbHoverHideTimer);
      btn.style.setProperty('background', 'var(--gb-brand-dark, #5f7d18)', 'important');
      btn.style.setProperty('color', '#fff', 'important');
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.setProperty('background', 'rgba(17,17,17,.85)', 'important');
      btn.style.setProperty('color', 'var(--gb-brand-label, #7db82a)', 'important');
      __gbHoverHideTimer = setTimeout(__gbHideHoverBtn, 100);
    });
    
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = __gbHoverTarget;
      __gbHideHoverBtn();
      
      if (target) {
        const src        = target.getAttribute('src');
        const directLink = target.__gbDirectLink || null;
        const itemLink   = __gbFindItemLinkForImage(target);

        if (e.shiftKey) {
          if (directLink) {
            const a = document.createElement('a');
            a.href = directLink; a.download = __gbFilenameFromPath(directLink);
            a.target = '_blank'; a.rel = 'noopener';
            document.body.appendChild(a); a.click(); a.remove();
          } else {
            __gbHeadlessDownload(src);
          }
        } else {
          __gbExtractAndShow(src, directLink, itemLink); 
        }
      }
    });

    document.body.appendChild(btn);
    __gbHoverBtn = btn;
    return btn;
  }

  function __gbPositionHoverBtn(img) {
    const btn  = __gbEnsureHoverBtn();
    const rect = img.getBoundingClientRect();
    const bw = btn.offsetWidth  || 104;
    const bh = btn.offsetHeight || 32;
    btn.style.left = Math.round(rect.left + (rect.width  - bw) / 2) + 'px';
    btn.style.top  = Math.round(rect.top  + (rect.height - bh) / 2) + 'px';
  }

  function __gbShowHoverBtn(img) {
    clearTimeout(__gbHoverHideTimer);
    __gbHoverTarget = img;
    __gbPositionHoverBtn(img);
    const btn = __gbEnsureHoverBtn();
    btn.style.setProperty('opacity',   '0',                          'important');
    btn.style.setProperty('transform', 'scale(.88) translateY(3px)','important');
    requestAnimationFrame(() => {
      btn.style.setProperty('opacity',   '1',                    'important');
      btn.style.setProperty('transform', 'scale(1) translateY(0)','important');
    });
  }

  function __gbHideHoverBtn() {
    if (!__gbHoverBtn) return;
    __gbHoverBtn.style.setProperty('opacity',   '0',                          'important');
    __gbHoverBtn.style.setProperty('transform', 'scale(.88) translateY(3px)','important');
    __gbHoverTarget = null;
  }

  function __gbAttachHover(img) {
    if (img.__gbHoverAttached) return;
    img.__gbHoverAttached = true;
    if (!img.__gbDirectLink) img.__gbDirectLink = __gbFindDirectLink(img);
    img.addEventListener('mouseenter', () => __gbShowHoverBtn(img));
    img.addEventListener('mouseleave', () => {
      __gbHoverHideTimer = setTimeout(__gbHideHoverBtn, 100);
    });
  }

  function __gbScanForRenderImages() {
    if (window.__gbFeatureFlags?.imagePreviewEnabled === false) return;
    document.querySelectorAll('img').forEach(img => {
      if (__gbIsRenderAspxImg(img) || __gbFindDirectLink(img)) {
        __gbAttachHover(img);
      }
    });
  }

  function __gbHeadlessDownload(rawSrc) {
    const tokenOrPath = __gbFindOverlayTokenOrPath(rawSrc);
    if (!tokenOrPath) {
      alert('Could not find a logo to download in this image.');
      return;
    }

    const candidates = __gbBuildAbsoluteCandidates(tokenOrPath);
    let idx = 0;

    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:rgba(17,17,17,.9);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.1);color:#fff;padding:8px 16px;border-radius:6px;z-index:999995;font:600 12px sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3); transition: opacity 0.3s;';
    toast.textContent = '⏳ Fetching logo...';
    document.body.appendChild(toast);

    function tryNext() {
      if (idx >= candidates.length) {
        toast.style.background = 'rgba(var(--gb-error-rgb, 200,96,96), .9)';
        toast.textContent = '❌ Download failed. Logo missing or blocked.';
        setTimeout(() => toast.remove(), 3000);
        return;
      }

      const url = candidates[idx++];
      __gbLoadImageViaBackground(url, (dataUrl) => {
        const a = document.createElement('a');
        a.href     = dataUrl;
        a.download = __gbFilenameFromPath(url);
        a.target   = '_blank';
        a.rel      = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        
        toast.textContent = '✅ Download complete!';
        toast.style.background = 'rgba(var(--gb-success-rgb, 56,176,0), .9)';
        setTimeout(() => {
          toast.style.opacity = '0';
          setTimeout(() => toast.remove(), 300);
        }, 2000);
      }, tryNext);
    }

    tryNext();
  }

  function __gbIsPreviewableImage(dataUrl) {
    const m = dataUrl.match(/^data:([^;]+);/);
    if (!m) return false;
    return /^image\/(png|jpe?g|gif|webp|svg\+xml|bmp|x-icon|avif)$/i.test(m[1]);
  }

  function __gbRevealContent(modal, spinner, preview, actions, proofBtn, sub, dataUrl, url, itemLink, subLabel) {
    // FIX: Use setProperty with important so CSS rules don't override the JS state
    spinner.style.setProperty('display', 'none', 'important');
    actions.style.display = 'flex';

    if (__gbIsPreviewableImage(dataUrl)) {
      preview.src            = dataUrl;
      preview.style.display  = 'block';
      proofBtn.style.display = 'flex';
      sub.textContent        = subLabel;
      __gbInitZoomPan(modal);
    } else {
      const noPreview     = modal.querySelector('#__gb-no-preview');
      const noPreviewType = modal.querySelector('#__gb-no-preview-type');
      const m             = dataUrl.match(/^data:([^;]+);/);
      const mimeLabel     = m ? m[1] : 'unknown type';
      if (noPreview)     noPreview.style.setProperty('display', 'flex', 'important');
      if (noPreviewType) noPreviewType.textContent = mimeLabel;
      sub.textContent        = 'Cannot preview';
      proofBtn.style.display = 'flex';
    }
    __gbWireModalButtons(modal, url, dataUrl, proofBtn, itemLink);
  }

  function __gbLoadImageViaBackground(url, onSuccess, onFail) {
    chrome.runtime.sendMessage(
      { action: 'proxyFetchImage', url },
      (resp) => {
        if (chrome.runtime.lastError) {
          onFail?.(chrome.runtime.lastError.message); 
          return; 
        }
        if (!resp || !resp.ok) {
          onFail?.(resp?.error); 
          return;
        }
        onSuccess?.(resp.dataUrl);
      }
    );
  }

  function __gbBuildModal() {
    document.getElementById('__gb-img-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = '__gb-img-modal';
    modal.style.cssText = `
      position: fixed !important; inset: 0 !important; z-index: 999990 !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      background: rgba(0,0,0,.6) !important;
      backdrop-filter: blur(8px) !important; -webkit-backdrop-filter: blur(8px) !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
      animation: __gbFadeIn .16s ease !important;
    `;

    modal.innerHTML = `
      <style>
        @keyframes __gbFadeIn    { from{opacity:0}to{opacity:1} }
        @keyframes __gbSlideUp   { from{opacity:0;transform:scale(.95) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes __gbSpin      { to{transform:rotate(360deg)} }

        #__gb-modal-card {
          background: rgba(17,17,17,.85) !important;
          backdrop-filter: blur(16px) !important; -webkit-backdrop-filter: blur(16px) !important;
          border: 1px solid rgba(255,255,255,.08) !important; border-radius: 18px !important;
          box-shadow: 0 24px 70px rgba(0,0,0,.9), inset 0 0 0 1px rgba(255,255,255,.03) !important;
          width: min(500px, calc(100vw - 24px)) !important;
          display: flex !important; flex-direction: column !important;
          box-sizing: border-box !important; overflow: hidden !important; 
          animation: __gbSlideUp .2s cubic-bezier(.34,1.4,.64,1) !important;
        }

        #__gb-modal-hdr {
          background: rgba(0,0,0,.4) !important; padding: 14px 20px !important; box-sizing: border-box !important;
          display: flex !important; align-items: center !important; gap: 12px !important;
          border-bottom: 1px solid rgba(255,255,255,.06) !important; flex-shrink: 0 !important;
          color: var(--gb-text-primary, #fff) !important; width: 100% !important;
        }
        .gb-modal-hdr-icon {
          width: 32px !important; height: 32px !important;
          background: rgba(var(--gb-brand-label-rgb, 125,184,42), .15) !important; 
          border-radius: 8px !important; display: flex !important; align-items: center !important; justify-content: center !important; flex-shrink: 0 !important;
          color: var(--gb-brand-label, #7db82a) !important;
          border: 1px solid rgba(var(--gb-brand-label-rgb, 125,184,42), .3) !important;
        }
        #__gb-modal-title { font-size: 14px !important; font-weight: 700 !important; letter-spacing: 0.3px !important; }
        #__gb-modal-sub   { font-size: 11px !important; color: rgba(255,255,255,.5) !important; margin-top: 2px !important; font-weight: 500 !important; }
        
        #__gb-modal-close {
          margin-left: auto !important; background: rgba(255,255,255,.05) !important; color: rgba(255,255,255,.8) !important;
          border: 1px solid rgba(255,255,255,.1) !important; border-radius: 7px !important;
          padding: 6px 12px !important; font-size: 11px !important; font-weight: 600 !important; cursor: pointer !important;
          display: flex !important; align-items: center !important; gap: 6px !important; flex-shrink: 0 !important;
          transition: all .15s !important; font-family: inherit !important; box-sizing: border-box !important;
        }
        #__gb-modal-close:hover { background: rgba(255,255,255,.12) !important; color: #fff !important; }

        #__gb-modal-body {
          flex: 1 !important; padding: 22px !important; box-sizing: border-box !important;
          display: flex !important; flex-direction: column !important; align-items: center !important; gap: 18px !important;
          width: 100% !important;
        }

        #__gb-preview-wrap {
          background: rgba(0,0,0,.3) !important;
          border: 1px solid rgba(255,255,255,.08) !important; border-radius: 12px !important;
          height: 340px !important; width: 100% !important; box-sizing: border-box !important;
          display: flex !important; align-items: center !important; justify-content: center !important;
          position: relative !important; overflow: hidden !important; cursor: grab !important;
        }
        #__gb-preview-wrap.dragging { cursor: grabbing !important; }
        #__gb-spinner {
          position: absolute !important; z-index: 2 !important;
          display: flex !important; flex-direction: column !important; align-items: center !important; gap: 10px !important;
          color: rgba(255,255,255,.5) !important; font-size: 13px !important; font-weight: 500 !important;
          pointer-events: none !important;
        }
        .gb-spin-ring {
          width: 28px !important; height: 28px !important;
          border: 3px solid rgba(var(--gb-brand-label-rgb, 125,184,42), .2) !important; 
          border-top-color: var(--gb-brand-label, #7db82a) !important;
          border-radius: 50% !important; animation: __gbSpin .8s linear infinite !important;
        }
        #__gb-zoom-viewport {
          position: absolute !important; inset: 0 !important;
          display: flex !important; align-items: center !important; justify-content: center !important;
          transform-origin: center center !important; will-change: transform !important;
        }
        #__gb-preview-img {
          max-width: 90% !important; max-height: 300px !important; width: auto !important; height: auto !important;
          display: none; user-select: none !important; pointer-events: none !important; -webkit-user-drag: none !important;
        }
        #__gb-zoom-ctrls {
          position: absolute !important; bottom: 12px !important; right: 12px !important;
          display: none; gap: 6px !important; z-index: 3 !important;
        }
        .gb-zoom-btn {
          width: 28px !important; height: 28px !important;
          background: rgba(17,17,17,.6) !important; border: 1px solid rgba(255,255,255,.1) !important;
          border-radius: 6px !important; color: rgba(255,255,255,.7) !important;
          display: flex !important; align-items: center !important; justify-content: center !important;
          cursor: pointer !important; font-size: 16px !important; font-weight: 700 !important;
          backdrop-filter: blur(4px) !important; font-family: inherit !important; line-height: 1 !important;
          transition: all .15s !important;
        }
        .gb-zoom-btn:hover { background: rgba(17,17,17,.9) !important; color: #fff !important; border-color: rgba(255,255,255,.3) !important; }
        #__gb-zoom-level {
          position: absolute !important; bottom: 12px !important; left: 12px !important;
          display: none; background: rgba(17,17,17,.6) !important; border: 1px solid rgba(255,255,255,.1) !important; border-radius: 6px !important;
          color: rgba(255,255,255,.7) !important; font-size: 10px !important; font-weight: 700 !important;
          padding: 3px 8px !important; letter-spacing: .5px !important; pointer-events: none !important; backdrop-filter: blur(4px) !important;
        }
        
        #__gb-modal-err {
          display: none; background: rgba(var(--gb-error-rgb, 200,96,96), 0.1) !important; border: 1px solid rgba(var(--gb-error-rgb, 200,96,96), 0.3) !important;
          border-radius: 12px !important; padding: 14px 16px !important; font-size: 13px !important; font-weight: 500 !important;
          color: var(--gb-error, #c86060) !important; width: 100% !important; box-sizing: border-box !important; line-height: 1.5 !important;
        }

        #__gb-no-preview {
          display: none !important; flex-direction: column !important; align-items: center !important; justify-content: center !important;
          gap: 12px !important; padding: 48px 24px !important; text-align: center !important; width: 100% !important; box-sizing: border-box !important;
        }
        .gb-no-preview-icon { color: rgba(255,255,255,.3) !important; }
        .gb-no-preview-title { font-size: 14px !important; font-weight: 700 !important; color: #fff !important; }
        .gb-no-preview-msg { font-size: 12px !important; color: rgba(255,255,255,.5) !important; line-height: 1.6 !important; max-width: 280px !important; }
        .gb-no-preview-type { font-size: 11px !important; color: rgba(255,255,255,.6) !important; font-family: ui-monospace, monospace !important; background: rgba(0,0,0,.3) !important; border: 1px solid rgba(255,255,255,.1) !important; border-radius: 6px !important; padding: 4px 10px !important; }

        #__gb-modal-actions {
          display: none; gap: 10px !important; width: 100% !important; box-sizing: border-box !important;
        }
        .gb-modal-btn {
          flex: 1 !important; background: rgba(0,0,0,.3) !important; color: rgba(255,255,255,.7) !important;
          border: 1px solid rgba(255,255,255,.1) !important; border-radius: 8px !important;
          padding: 10px 0 !important; font-size: 13px !important; font-weight: 600 !important;
          cursor: pointer !important; display: flex !important; align-items: center !important; justify-content: center !important; gap: 6px !important;
          transition: all .15s !important; font-family: inherit !important; box-sizing: border-box !important;
        }
        .gb-modal-btn:hover { background: rgba(255,255,255,.05) !important; border-color: rgba(255,255,255,.2) !important; color: #fff !important; }
        
        .gb-modal-btn.primary, #__gb-btn-proof {
          background: var(--gb-brand-dark, #5f7d18) !important; color: var(--gb-brand-text, #d8eeaa) !important; 
          border: 1px solid rgba(var(--gb-brand-label-rgb, 125,184,42), .4) !important; 
        }
        .gb-modal-btn.primary:hover, #__gb-btn-proof:hover {
          background: var(--gb-brand, #6e901d) !important; color: #fff !important; border-color: var(--gb-brand-label, #7db82a) !important;
        }

        .gb-modal-btn.success {
          background: rgba(var(--gb-success-rgb, 56,176,0), 0.15) !important; color: var(--gb-success, #38b000) !important;
          border-color: rgba(var(--gb-success-rgb, 56,176,0), 0.3) !important;
        }

        .gb-modal-btn svg { width: 14px !important; height: 14px !important; flex-shrink: 0 !important; }

        #__gb-modal-proof {
          width: 100% !important; display: flex !important; align-items: center !important; justify-content: center !important; 
          margin-top: 4px !important;
        }

        #__gb-btn-proof {
          display: none; width: 100% !important; box-sizing: border-box !important; border-radius: 8px !important; 
          padding: 10px 0 !important; font-size: 13px !important; font-weight: 700 !important; cursor: pointer !important; 
          align-items: center !important; justify-content: center !important; gap: 7px !important; transition: all .15s !important; font-family: inherit !important; 
        }
        #__gb-btn-proof svg { width: 15px !important; height: 15px !important; flex-shrink: 0 !important; }
      </style>

      <div id="__gb-modal-card">

        <div id="__gb-modal-hdr">
          <div class="gb-modal-hdr-icon">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>
          <div style="flex:1; min-width:0; display:flex; flex-direction:column;">
            <div id="__gb-modal-title">Logo Extractor</div>
            <div id="__gb-modal-sub">Resolving image…</div>
          </div>
          <button id="__gb-modal-close">
            <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Close
          </button>
        </div>

        <div id="__gb-modal-body">
          <div id="__gb-preview-wrap">
            <div id="__gb-spinner">
              <div class="gb-spin-ring"></div>
              Resolving image…
            </div>
            <div id="__gb-zoom-viewport">
              <img id="__gb-preview-img" alt="Extracted logo" />
            </div>
            <div id="__gb-no-preview">
              <svg class="gb-no-preview-icon" width="52" height="52" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="4.5" y1="4.5" x2="19.5" y2="19.5"/>
              </svg>
              <div class="gb-no-preview-title">Preview Unavailable</div>
              <div class="gb-no-preview-msg">This file type cannot be displayed as an image.<br>You can still copy the URL or download the file.</div>
              <div class="gb-no-preview-type" id="__gb-no-preview-type"></div>
            </div>
            <div id="__gb-zoom-ctrls">
              <button class="gb-zoom-btn" id="__gb-zoom-out" title="Zoom out">−</button>
              <button class="gb-zoom-btn" id="__gb-zoom-reset" title="Reset" style="font-size:9px !important;letter-spacing:-.3px !important;">1:1</button>
              <button class="gb-zoom-btn" id="__gb-zoom-in" title="Zoom in">+</button>
            </div>
            <div id="__gb-zoom-level">100%</div>
          </div>
          
          <div id="__gb-modal-err"></div>

          <div id="__gb-modal-actions">
            <button class="gb-modal-btn" id="__gb-btn-copy">
              <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
              Copy URL
            </button>
            <button class="gb-modal-btn primary" id="__gb-btn-dl">
              <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
              </svg>
              Download
            </button>
          </div>

          <div id="__gb-modal-proof">
            <button id="__gb-btn-proof">
              <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              Submit Proof
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    return modal;
  }

  function __gbExtractAndShow(rawSrc, directUrl, itemLink) {
    const modal   = __gbBuildModal();
    const spinner = modal.querySelector('#__gb-spinner');
    const preview = modal.querySelector('#__gb-preview-img');
    const errBox  = modal.querySelector('#__gb-modal-err');
    const actions = modal.querySelector('#__gb-modal-actions');
    const proofBtn = modal.querySelector('#__gb-btn-proof');
    const sub     = modal.querySelector('#__gb-modal-sub');

    modal.querySelector('#__gb-modal-close').addEventListener('click', () => __gbCloseModal(modal));
    modal.addEventListener('click', e => { if (e.target === modal) __gbCloseModal(modal); });
    const keyClose = e => { if (e.key === 'Escape') { __gbCloseModal(modal); document.removeEventListener('keydown', keyClose); } };
    document.addEventListener('keydown', keyClose);

    if (directUrl) {
      sub.textContent = 'Loading original file…';
      __gbLoadImageViaBackground(directUrl, (dataUrl) => {
        __gbRevealContent(modal, spinner, preview, actions, proofBtn, sub, dataUrl, directUrl, itemLink, 'Original file');
      }, () => {
        __gbRevealContent(modal, spinner, preview, actions, proofBtn, sub,
          'data:application/octet-stream;base64,', directUrl, itemLink, 'File (no preview)');
      });
      return;
    }

    __gbExtractViaCandidates(rawSrc, modal, spinner, preview, errBox, actions, proofBtn, sub, itemLink);
  }

  function __gbExtractViaCandidates(rawSrc, modal, spinner, preview, errBox, actions, proofBtn, sub, itemLink) {
    const tokenOrPath = __gbFindOverlayTokenOrPath(rawSrc);
    if (!tokenOrPath) {
      // FIX: Use setProperty to overcome !important CSS rules
      spinner.style.setProperty('display', 'none', 'important');
      errBox.textContent = 'No useroverlay parameter found in this image URL.';
      errBox.style.display = 'block';
      sub.textContent = 'Nothing found';
      return;
    }

    const candidates = __gbBuildAbsoluteCandidates(tokenOrPath);
    let idx = 0;

    function tryNext() {
      if (idx >= candidates.length) {
        // FIX: Use setProperty to overcome !important CSS rules
        spinner.style.setProperty('display', 'none', 'important');
        errBox.innerHTML = 'Could not load the logo.<br><strong>Check the Developer Console (F12) for the exact error reason.</strong>';
        errBox.style.display  = 'block';
        sub.textContent       = 'Not found';

        actions.style.display = 'flex';
        proofBtn.style.display = 'flex';
        __gbWireModalButtons(modal, rawSrc, '', proofBtn, itemLink);
        return;
      }

      const url = candidates[idx++];

      __gbLoadImageViaBackground(url, (dataUrl) => {
        __gbRevealContent(modal, spinner, preview, actions, proofBtn, sub, dataUrl, url, itemLink, 'Golfballs.com');
      }, tryNext);
    }

    tryNext();
  }

  let __gbProofModalStore = null;

  function __gbBuildProofModal(ctx = {}) {
    const logoUrl = ctx.logoUrl || '';

    if (__gbProofModalStore && __gbProofModalStore.logoUrl === logoUrl
        && document.body.contains(__gbProofModalStore.overlay)) {
      const cached = __gbProofModalStore.overlay;
      
      cached.style.setProperty('display', 'flex', 'important');
      cached.style.animation = '__gbFadeIn .16s ease forwards';
      const card = cached.querySelector('#__gb-proof-card');
      if (card) card.style.animation = '__gbSlideUp .2s cubic-bezier(.34,1.4,.64,1) forwards';

      const escKey = e => {
        if (e.key === 'Escape') { __gbHideProofModal(cached); document.removeEventListener('keydown', escKey); }
      };
      document.addEventListener('keydown', escKey);
      return;
    }

    if (__gbProofModalStore?.overlay) {
      __gbProofModalStore.overlay.remove();
      __gbProofModalStore = null;
    }

    const overlay = document.createElement('div');
    overlay.id = '__gb-proof-overlay';
    overlay.style.cssText = `
      position: fixed !important; inset: 0 !important; z-index: 999990 !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      background: rgba(0,0,0,.6) !important;
      backdrop-filter: blur(8px) !important; -webkit-backdrop-filter: blur(8px) !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
      animation: __gbFadeIn .16s ease !important;
    `;

    const GROUP_MAP = {
      'Ball': 'ball',
      'Apparel (Shirts, Polos, Outerwear, Shorts)': 'apparel',
      'Hats': 'apparel',
      'Towels': 'apparel',
      'Bags': 'apparel',
      'Gloves': 'apparel',
      'Poker Chip': 'poker',
      'Ball Marker': 'poker',
      'Divot Tools': 'poker',
      'Tees': 'tees',
      'Flags': 'flags',
      'Other': 'other'
    };

    const DYN_FIELDS = {
      'ball': [
        { id: 'logoType',    type: 'select', label: 'Logo Type',             options: ['Ball', 'Vinyl', 'Embroidery', 'Gift Set', 'Square Ball'], default: 'Ball' },
        { id: 'color',       type: 'select', label: 'Ball Color',            options: ['White','Gray','Yellow','Red','Orange','Green','Pink','Blue','Purple','Multi-Color'], default: 'White' },
        { id: 'imprint',     type: 'text',   label: 'Ball Imprint Color',    hint: 'Recommended: Black, Silver, Gold', dependsOn: 'color', dependsNotValue: 'White' },
        { id: 'dozens',      type: 'text',   label: 'Number of Dozens',      hint: 'Pad=50dz+, Digital=49dz-' },
        { id: 'printMethod', type: 'select', label: 'Print Method',          options: ['Digital', 'Pad'], default: 'Digital', hint: 'Pad=50dz+, Digital=49dz-' },
      ],
      'apparel': [
        { id: 'logoType', type: 'select', label: 'Logo Type', options: ['Ball', 'Vinyl', 'Embroidery', 'Gift Set', 'Square Ball'], default: 'Embroidery' },
        { id: 'decorator', type: 'select', label: 'Decorator', options: ['TM Works or Alphabroder (Isacord)', 'Ignite/Other (Madeira)', 'In-House (Venture Towels)'], default: 'TM Works or Alphabroder (Isacord)' },
        { id: 'method', type: 'select', label: 'Decoration Method', options: ['Embroidery', 'Heat Seal', 'Direct to Film Transfer (Ignite)', 'Screen Print', 'Sublimation', 'Other - See Special Instructions'], default: 'Embroidery' },
        { id: 'color', type: 'text', label: 'Item Color' },
        { id: 'placement', type: 'text', label: 'Logo Placement', hint: 'Ex. Left Chest, Right Sleeve' },
        { id: 'imprint', type: 'text', label: 'Imprint Color', hint: 'Notate if Pantone matching needed' }
      ],
      'poker': [
        { id: 'logoType', type: 'select', label: 'Logo Type', options: ['Ball', 'Vinyl', 'Embroidery', 'Gift Set', 'Square Ball'], default: 'Vinyl' },
        { id: 'color', type: 'text', label: 'Item Color' },
        { id: 'imprint', type: 'text', label: 'Imprint Color', hint: 'Notate if Pantone matching needed' }
      ],
      'tees': [
        { id: 'logoType', type: 'select', label: 'Logo Type', options: ['Ball', 'Vinyl', 'Embroidery', 'Gift Set', 'Square Ball'], default: 'Vinyl' },
        { id: 'size', type: 'select', label: 'Tee Size', options: ['2 3/4in', '3 1/4in'], default: '2 3/4in' },
        { id: 'imprint', type: 'select', label: 'Imprint Color (Tees)', options: ['One Color', 'Two Color'], default: 'One Color', hint: 'Black Tees: White, Silver, Gold only' },
        { id: 'color', type: 'text', label: 'Item Color' }
      ],
      'flags': [
        { id: 'logoType', type: 'select', label: 'Logo Type', options: ['Ball', 'Vinyl', 'Embroidery', 'Gift Set', 'Square Ball'], default: 'Vinyl' },
        { id: 'color', type: 'text', label: 'Item Color' }
      ],
      'other': [
        { id: 'logoType', type: 'select', label: 'Logo Type', options: ['Ball', 'Vinyl', 'Embroidery', 'Gift Set', 'Square Ball'], default: 'Vinyl' },
        { id: 'name', type: 'text', label: 'Item Name' },
        { id: 'color', type: 'text', label: 'Item Color' },
        { id: 'imprint', type: 'text', label: 'Imprint Color', hint: 'Notate if Pantone matching needed' }
      ],
      'giftset': [
        { id: 'logoType', type: 'select', label: 'Logo Type', options: ['Ball', 'Vinyl', 'Embroidery', 'Gift Set', 'Square Ball'], default: 'Gift Set' }
      ]
    };

    overlay.innerHTML = `
      <style>
        #__gb-proof-card {
          background: rgba(17,17,17,.85) !important;
          backdrop-filter: blur(16px) !important; -webkit-backdrop-filter: blur(16px) !important;
          border: 1px solid rgba(255,255,255,.08) !important; border-radius: 18px !important;
          box-shadow: 0 24px 70px rgba(0,0,0,.9), inset 0 0 0 1px rgba(255,255,255,.03) !important;
          width: min(800px, calc(100vw - 24px)) !important; 
          height: 90vh !important; max-height: 850px !important; 
          display: flex !important; flex-direction: column !important;
          box-sizing: border-box !important; overflow: hidden !important; 
          animation: __gbSlideUp .3s cubic-bezier(.34,1.56,.64,1) !important;
        }

        #__gb-proof-hdr {
          background: rgba(0,0,0,.4) !important; padding: 14px 20px !important; box-sizing: border-box !important;
          display: flex !important; align-items: center !important; gap: 12px !important;
          border-bottom: 1px solid rgba(255,255,255,.06) !important; 
          flex-shrink: 0 !important; color: var(--gb-text-primary, #fff) !important; width: 100% !important; 
        }
        .gb-proof-hdr-icon {
          width: 32px !important; height: 32px !important; background: rgba(var(--gb-brand-label-rgb, 125,184,42), .15) !important; 
          border-radius: 8px !important; display: flex !important; align-items: center !important; 
          justify-content: center !important; flex-shrink: 0 !important;
          color: var(--gb-brand-label, #7db82a) !important;
          border: 1px solid rgba(var(--gb-brand-label-rgb, 125,184,42), .3) !important;
        }
        
        #btn_pf_close {
          margin-left: auto !important; background: rgba(255,255,255,.05) !important; color: rgba(255,255,255,.8) !important;
          border: 1px solid rgba(255,255,255,.1) !important; border-radius: 7px !important;
          padding: 6px 12px !important; font-size: 11px !important; font-weight: 600 !important; cursor: pointer !important;
          display: flex !important; align-items: center !important; gap: 6px !important; flex-shrink: 0 !important;
          transition: all .15s !important; font-family: inherit !important; box-sizing: border-box !important;
        }
        #btn_pf_close:hover { background: rgba(255,255,255,.12) !important; color: #fff !important; }

        #__gb-proof-body {
          flex: 1 1 auto !important; height: 100% !important; min-height: 0 !important; 
          overflow-y: auto !important; overflow-x: hidden !important; 
          padding: 22px !important; box-sizing: border-box !important;
          display: flex !important; flex-direction: column !important; 
          width: 100% !important; scrollbar-width: thin !important; scrollbar-color: rgba(255,255,255,.1) transparent !important;
        }
        #__gb-proof-body::-webkit-scrollbar { width: 6px !important; }
        #__gb-proof-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15) !important; border-radius: 6px !important; }
        #__gb-proof-body::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.25) !important; }

        #__gb-proof-form-container { display: flex !important; flex-direction: column !important; gap: 16px !important; }

        .gb-grid-2 { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 16px !important; width: 100% !important; box-sizing: border-box !important; margin: 0 !important; padding: 0 !important; }
        .gb-col-span-2 { grid-column: 1 / -1 !important; width: 100% !important; box-sizing: border-box !important; margin: 0 !important;}
        .gb-form-group { display: flex !important; flex-direction: column !important; gap: 6px !important; width: 100% !important; box-sizing: border-box !important; margin: 0 !important;}
        .gb-label { font-size: 10px !important; font-weight: 800 !important; color: rgba(255,255,255,.5) !important; text-transform: uppercase !important; letter-spacing: 0.8px !important; }
        .gb-hint { text-transform: none !important; color: rgba(255,255,255,.3) !important; font-weight: 600 !important; }
        
        .gb-divider {
          grid-column: 1 / -1 !important; height: 1px !important;
          background: rgba(255,255,255,.06) !important;
          margin: 6px 0 !important; border-radius: 2px !important;
        }
        
        .gb-dyn-header-row {
          display: flex !important; align-items: center !important; justify-content: space-between !important;
          border-bottom: 1px dashed rgba(255,255,255,.1) !important; padding-bottom: 8px !important; padding-top: 10px !important;
        }
        .gb-section-header {
          font-size: 13px !important; font-weight: 800 !important; color: var(--gb-brand-label, #7db82a) !important; 
          text-transform: uppercase !important; letter-spacing: 0.5px !important;
        }
        .gb-dyn-delete {
          background: rgba(0,0,0,.3) !important; border: 1px solid rgba(255,255,255,.1) !important;
          border-radius: 6px !important; width: 24px !important; height: 24px !important; flex-shrink: 0 !important;
          display: flex !important; align-items: center !important; justify-content: center !important;
          cursor: pointer !important; color: rgba(255,255,255,.4) !important;
          transition: all .15s !important; padding: 0 !important; font-family: inherit !important;
        }
        .gb-dyn-delete svg { width: 12px !important; height: 12px !important; pointer-events: none !important; }
        .gb-dyn-delete:hover { background: rgba(var(--gb-error-rgb, 200,96,96),.15) !important; border-color: rgba(var(--gb-error-rgb, 200,96,96),.3) !important; color: var(--gb-error, #c86060) !important; }
        
        .gb-opt-count {
          display: none; min-width: 18px !important; height: 18px !important; padding: 0 4px !important;
          background: var(--gb-brand-label, #7db82a) !important; color: #111 !important;
          border-radius: 9px !important; font-size: 10px !important; font-weight: 800 !important;
          align-items: center !important; justify-content: center !important; flex-shrink: 0 !important;
        }

        @keyframes __gbFadeIn    { from{opacity:0}to{opacity:1} }
        @keyframes __gbSlideUp   { from{opacity:0;transform:scale(.95) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes __gbFadeOut   { from{opacity:1}to{opacity:0} }
        @keyframes __gbSlideDown { from{opacity:1;transform:scale(1) translateY(0)}to{opacity:0;transform:scale(.95) translateY(10px)} }

        @keyframes __gbDynEnter {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .gb-dyn-group {
          display: flex !important; flex-direction: column !important; gap: 14px !important; margin-top: 8px !important;
          animation: __gbDynEnter 0.25s cubic-bezier(0.34, 1.4, 0.64, 1) forwards !important;
        }

        /* Inputs & Textareas */
        .gb-input-wrap { position: relative !important; width: 100% !important; margin: 0 !important; }
        .gb-input-p { 
          -webkit-appearance: none !important; appearance: none !important;
          background: rgba(0,0,0,.3) !important; border: 1px solid rgba(255,255,255,.1) !important; color: #fff !important; 
          padding: 10px 32px 10px 14px !important; border-radius: 8px !important; width: 100% !important; box-sizing: border-box !important; 
          font-family: inherit !important; font-size: 13px !important; font-weight: 500 !important; line-height: 1.5 !important; min-height: 40px !important; 
          transition: border-color .15s, box-shadow .15s !important; margin: 0 !important; outline: none !important; color-scheme: dark !important;
        }
        .gb-input-p:focus { border-color: var(--gb-brand-label, #7db82a) !important; box-shadow: 0 0 0 2px rgba(var(--gb-brand-label-rgb, 125,184,42), .15) !important; }
        
        /* FIX: Better disabled styling to keep it clean and legible */
        .gb-input-p:disabled, .gb-dropdown-btn:disabled { 
          opacity: 1 !important; 
          background: rgba(255,255,255,.03) !important; 
          color: rgba(255,255,255,.4) !important; 
          border-color: rgba(255,255,255,.05) !important; 
          cursor: not-allowed !important; 
          pointer-events: none !important; 
        }
        .gb-input-p::placeholder { color: rgba(255,255,255,.3) !important; }
        textarea.gb-input-p { resize: vertical !important; min-height: 85px !important; }

        .gb-copy-icon-btn {
          position: absolute !important; right: 8px !important; top: 50% !important; transform: translateY(-50%) !important;
          background: transparent !important; border: none !important; color: rgba(255,255,255,.3) !important;
          padding: 6px !important; cursor: pointer !important; border-radius: 6px !important;
          display: flex !important; align-items: center !important; justify-content: center !important;
          transition: all 0.15s !important; margin: 0 !important; box-shadow: none !important;
        }
        .gb-copy-icon-btn:hover { color: #fff !important; background: rgba(255,255,255,0.08) !important; }
        textarea + .gb-copy-icon-btn { top: 8px !important; transform: none !important; }
        .gb-copy-icon-btn.copied { color: var(--gb-brand-label, #7db82a) !important; }

        .gb-tags-wrap { display: flex !important; flex-wrap: wrap !important; gap: 8px !important; align-items: center !important; min-height: 40px !important; }
        .gb-tag {
          background: rgba(0,0,0,.3) !important; border: 1px solid rgba(255,255,255,.1) !important;
          color: rgba(255,255,255,.7) !important; padding: 8px 14px !important; border-radius: 18px !important;
          font-size: 12px !important; font-weight: 600 !important; cursor: pointer !important;
          transition: all .15s !important; user-select: none !important; font-family: inherit !important;
          display: flex !important; align-items: center !important; justify-content: center !important; gap: 6px !important;
        }
        .gb-tag svg { width: 14px !important; height: 14px !important; opacity: 0.7 !important; }
        .gb-tag:hover { background: rgba(255,255,255,.05) !important; border-color: rgba(255,255,255,.2) !important; color: #fff !important; }
        .gb-tag.active { background: rgba(var(--gb-brand-label-rgb, 125,184,42), 0.15) !important; border-color: var(--gb-brand-label, #7db82a) !important; color: var(--gb-brand-label, #7db82a) !important; }
        .gb-tag.active svg { opacity: 1 !important; }

        .gb-dropdown-wrap { position: relative !important; width: 100% !important; }
        .gb-dropdown-btn {
          width: 100% !important; background: rgba(0,0,0,.3) !important; border: 1px solid rgba(255,255,255,.1) !important; border-radius: 8px !important;
          padding: 10px 32px 10px 14px !important; font-size: 13px !important; font-weight: 500 !important; color: #fff !important; cursor: pointer !important;
          text-align: left !important; display: flex !important; align-items: center !important; position: relative !important;
          min-height: 40px !important; box-sizing: border-box !important; font-family: inherit !important; transition: all .15s !important; margin: 0 !important;
        }
        .gb-dropdown-btn:hover { background: rgba(255,255,255,.05) !important; border-color: rgba(255,255,255,.2) !important; }
        .gb-dropdown-btn.open { border-color: var(--gb-brand-label, #7db82a) !important; background: rgba(255,255,255,.05) !important; box-shadow: 0 0 0 2px rgba(var(--gb-brand-label-rgb, 125,184,42), .15) !important; }
        .gb-btn-label { flex: 1 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
        .gb-dropdown-chevron { position: absolute !important; right: 12px !important; top: 50% !important; transform: translateY(-50%) !important; color: rgba(255,255,255,.4) !important; pointer-events: none !important; transition: transform .2s, color .2s !important; }
        .gb-dropdown-btn.open .gb-dropdown-chevron { transform: translateY(-50%) rotate(180deg) !important; color: var(--gb-brand-label, #7db82a) !important; }

        .gb-dropdown-menu {
          position: absolute !important; top: calc(100% + 4px) !important; left: 0 !important; right: 0 !important;
          background: var(--gb-surface-elevated, #171717) !important; border: 1px solid rgba(255,255,255,.1) !important; border-radius: 9px !important; z-index: 999990 !important;
          max-height: 200px !important; overflow-y: auto !important; scrollbar-width: thin !important; scrollbar-color: rgba(255,255,255,.1) transparent !important;
          opacity: 0 !important; transform: translateY(-5px) !important; pointer-events: none !important; 
          transition: opacity .16s ease, transform .18s cubic-bezier(.34,1.4,.64,1) !important;
          box-shadow: 0 10px 30px rgba(0,0,0,.9), 0 0 0 1px rgba(255,255,255,.03) !important; padding: 4px !important; box-sizing: border-box !important;
        }
        .gb-dropdown-menu.open { opacity: 1 !important; transform: translateY(0) !important; pointer-events: auto !important; }
        .gb-dropdown-option { padding: 9px 12px !important; margin-bottom: 2px !important; border-radius: 6px !important; cursor: pointer !important; font-size: 12.5px !important; color: var(--gb-text-secondary, #ccc) !important; transition: background .1s, color .1s !important; display:flex !important; justify-content:space-between !important; align-items:center !important;}
        .gb-dropdown-option:last-child { margin-bottom: 0 !important; border-bottom: none !important; }
        .gb-dropdown-option:hover { background: rgba(255,255,255,.08) !important; color: #fff !important; }
        .gb-dropdown-option.selected { background: rgba(var(--gb-brand-label-rgb, 125,184,42), .15) !important; color: var(--gb-brand-label, #7db82a) !important; font-weight: 600 !important; }
        
        .gb-multi-check { display: none; width: 14px; height: 14px; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; fill: none; }
        .gb-dropdown-option.selected .gb-multi-check { display: block; }

        #__gb-proof-footer {
          padding: 14px 20px !important; background: rgba(0,0,0,.3) !important; border-top: 1px solid rgba(255,255,255,.06) !important; 
          display: flex !important; justify-content: flex-end !important; gap: 12px !important; box-sizing: border-box !important; width: 100% !important;
          flex-shrink: 0 !important; 
        }
        .gb-btn-primary-send { 
          background: var(--gb-brand-dark, #5f7d18) !important; color: var(--gb-brand-text, #d8eeaa) !important; border: 1px solid rgba(var(--gb-brand-label-rgb, 125,184,42), .4) !important; 
          padding: 10px 24px !important; border-radius: 8px !important; font-size: 13px !important; font-weight: 700 !important; 
          cursor: pointer !important; transition: all 0.2s !important; 
          display: flex !important; align-items: center !important; justify-content: center !important; gap: 8px !important; font-family: inherit !important; min-height: 40px !important;
        }
        .gb-btn-primary-send:hover:not(:disabled) { background: var(--gb-brand, #6e901d) !important; border-color: var(--gb-brand-label, #7db82a) !important; color: #fff !important; }

        #__gb-proof-body.has-gallery { flex-direction: row !important; overflow: hidden !important; padding: 0 !important; align-items: stretch !important; }
        #__gb-proof-gallery {
          width: 280px !important; min-width: 280px !important; flex-shrink: 0 !important; border-right: 1px solid rgba(255,255,255,.06) !important;
          max-height: 100% !important; 
          overflow-y: auto !important; overflow-x: hidden !important; padding: 18px 20px !important; box-sizing: border-box !important;
          background: rgba(0,0,0,.15) !important; scrollbar-width: thin !important; scrollbar-color: rgba(255,255,255,.1) transparent !important; display: flex !important; flex-direction: column !important; align-self: flex-start !important;
        }
        #__gb-proof-form-scroll {
          flex: 1 1 auto !important; height: 100% !important; overflow-y: auto !important; overflow-x: hidden !important; padding: 22px !important; box-sizing: border-box !important;
          scrollbar-width: thin !important; scrollbar-color: rgba(255,255,255,.1) transparent !important; display: flex !important; flex-direction: column !important; min-height: 0 !important; 
        }
        #__gb-proof-gallery::-webkit-scrollbar, #__gb-proof-form-scroll::-webkit-scrollbar { width: 6px !important; }
        #__gb-proof-gallery::-webkit-scrollbar-thumb, #__gb-proof-form-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15) !important; border-radius: 6px !important; }
        #__gb-proof-gallery::-webkit-scrollbar-thumb:hover, #__gb-proof-form-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.25) !important; }
      </style>

      <div id="__gb-proof-card">
        <div id="__gb-proof-hdr">
          <div class="gb-proof-hdr-icon">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          </div>
          <div>
            <div style="font-size:14px !important; font-weight:700 !important; letter-spacing:0.3px !important;">Submit Proof Request</div>
            <div style="font-size:11px !important; font-weight:500 !important; color:rgba(255,255,255,.5) !important; margin-top: 2px !important;">Submit proof request form to the art team.</div>
          </div>
          <button type="button" id="btn_pf_close">
            <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Cancel
          </button>
        </div>

        <div id="__gb-proof-body">
          <div id="__gb-proof-form-container">
            
            <div class="gb-form-group">
              <label class="gb-label">Item(s) Being Proofed <span style="color:var(--gb-error, #c86060); font-size: 14px; vertical-align: middle;">*</span></label>
              <div class="gb-dropdown-wrap" id="wrap_pf_item">
                <button type="button" class="gb-dropdown-btn" id="btn_pf_item">
                  <span class="gb-btn-label" id="label_pf_item">Select Items...</span>
                  <svg class="gb-dropdown-chevron" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="gb-dropdown-menu" id="menu_pf_item">
                   ${buildMultiOptionsHtml(['Pad to Digital Request','Ball','Apparel (Shirts, Polos, Outerwear, Shorts)','Hats','Towels','Bags','Gloves','Poker Chip','Ball Marker','Divot Tools','Tees','Gift Set - 6 Ball - Wooden Box - Poker Chip','Gift Set - 6 Ball - Wooden Box - Classic Divot Tool','Gift Set - 6 Ball - Black Box - Poker Chip','Gift Set - 6 Ball - Black Box - Bartender Divot Tool','Gift Set - 6 Ball - Black Box - Lever Divot Tool','Gift Set - 6 Ball - Black Box - Classic Divot Tool','Gift Set - Single Sleeve - Black Box - Bartender Divot Tool','Gift Set - Single Sleeve - Black Box - Lever Divot Tool','Gift Set - Single Sleeve - Black Box - Poker Chip','Gift Set - Accessory - Black Box - Bartender Divot Tool','Gift Set - Accessory - Black Box - Bartender Divot Tool w/ Poker Chip','Gift Set - Accessory - Black Box - Poker Chips','Gift Set - Accessory - Black Box - Lever Divot Tool','Gift Set - Accessory - Black Box - Poker Chips with Tees','Flags','Other'])}
                </div>
                <input type="hidden" id="pf_item" value="">
              </div>
            </div>

            <div class="gb-grid-2">
              <div class="gb-form-group">
                <label class="gb-label">Order #</label>
                <div class="gb-input-wrap">
                  <input type="text" class="gb-input-p" id="pf_order" placeholder="e.g. 123456" value="${ctx.orderId || ''}" ${ctx.orderId ? 'disabled' : ''}>
                  <button type="button" class="gb-copy-icon-btn" data-target="pf_order" title="Copy"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg></button>
                </div>
              </div>
              <div class="gb-form-group">
                <label class="gb-label">Customer ID</label>
                <div class="gb-input-wrap">
                  <input type="text" class="gb-input-p" id="pf_custid" placeholder="e.g. 4650030" value="${ctx.customerId || ''}">
                  <button type="button" class="gb-copy-icon-btn" data-target="pf_custid" title="Copy"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg></button>
                </div>
              </div>
            </div>

            <div class="gb-form-group">
              <label class="gb-label">Proof Link Name <span style="color:var(--gb-error, #c86060); font-size: 14px; vertical-align: middle;">*</span></label>
              <div class="gb-input-wrap">
                <input type="text" class="gb-input-p" id="pf_name" placeholder="e.g. ATT - Divot Tool">
                <button type="button" class="gb-copy-icon-btn" data-target="pf_name" title="Copy"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg></button>
              </div>
            </div>

            <div class="gb-grid-2">
              <div class="gb-form-group">
                <label class="gb-label">Logo Status</label>
                <div class="gb-dropdown-wrap" id="wrap_pf_status">
                  <button type="button" class="gb-dropdown-btn" id="btn_pf_status">
                    <span class="gb-btn-label" id="label_pf_status">New Logo (No Proof Yet)</span>
                    <svg class="gb-dropdown-chevron" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  <div class="gb-dropdown-menu" id="menu_pf_status">
                    ${buildOptionsHtml([{val:'1',txt:'New Logo (No Proof Yet)'}, {val:'2',txt:'Awaiting Approval (Proof Created)'}, {val:'4',txt:'Digitization Queue'}, {val:'10',txt:'Approved'}], '1')}
                  </div>
                  <input type="hidden" id="pf_status" value="1">
                </div>
              </div>
              
              <div class="gb-form-group">
                <label class="gb-label">Sales Rep</label>
                <div class="gb-dropdown-wrap" id="wrap_pf_rep">
                  <button type="button" class="gb-dropdown-btn" id="btn_pf_rep">
                    <span class="gb-btn-label" id="label_pf_rep">Not Selected</span>
                    <svg class="gb-dropdown-chevron" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  <div class="gb-dropdown-menu" id="menu_pf_rep">${buildOptionsHtml(ctx.liveReps, '0')}</div>
                  <input type="hidden" id="pf_rep" value="0">
                </div>
              </div>
              <div class="gb-form-group">
                <label class="gb-label">Artist</label>
                <div class="gb-dropdown-wrap" id="wrap_pf_artist">
                  <button type="button" class="gb-dropdown-btn" id="btn_pf_artist">
                    <span class="gb-btn-label" id="label_pf_artist">All Artists</span>
                    <svg class="gb-dropdown-chevron" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  <div class="gb-dropdown-menu" id="menu_pf_artist">${buildOptionsHtml(ctx.liveArtists, '42')}</div>
                  <input type="hidden" id="pf_artist" value="42">
                </div>
              </div>
            </div>

            <div class="gb-grid-2">
              <div class="gb-form-group">
                <label class="gb-label">Proof Type</label>
                <div class="gb-tags-wrap" id="tags_pf_type">
                  <div class="gb-tag active" data-val="Live Order">Live</div>
                  <div class="gb-tag" data-val="Potential Order">Potential</div>
                  <div class="gb-tag" data-val="Jardine Order">Jardine</div>
                </div>
                <input type="hidden" id="pf_type" value="Live Order">
              </div>

              <div class="gb-form-group">
                <label class="gb-label">Order Value</label>
                <div class="gb-tags-wrap" id="tags_pf_val">
                  <div class="gb-tag active" data-val="Under $2k">Under $2k</div>
                  <div class="gb-tag" data-val="Over $2k">Over $2k</div>
                </div>
                <input type="hidden" id="pf_val" value="Under $2k">
              </div>
            </div>

            <div class="gb-form-group">
              <label class="gb-label">Flags & Overrides</label>
              <div class="gb-tags-wrap">
                <div class="gb-tag" id="tag_pf_rush" data-val="Rush"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg> Rush</div>
                <input type="hidden" id="pf_rush" value="No">

                <div class="gb-tag" id="tag_pf_canada" data-val="Canada"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> Canada Drop</div>
                <input type="hidden" id="pf_canada" value="No">

                <div class="gb-tag" id="tag_pf_dropship" data-val="Yes"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg> Drop Ship TS</div>
                <input type="hidden" id="pf_dropship" value="No">
              </div>
            </div>

            <div id="__gb-dynamic-fields-container" style="display:flex; flex-direction:column; gap:16px;"></div>

            <div class="gb-divider"></div>

            <div class="gb-form-group">
              <label class="gb-label">Item Link <span class="gb-hint">(N/A for white balls unless special align)</span></label>
              <div class="gb-input-wrap">
                <textarea class="gb-input-p" style="min-height:50px !important;" id="pf_itemlink" placeholder="Paste link(s) here...">${ctx.itemUrl || ''}</textarea>
              </div>
            </div>

            <div class="gb-form-group">
              <label class="gb-label">Reference Logo Link <span class="gb-hint">(Previous proofs)</span></label>
              <div class="gb-input-wrap">
                <textarea class="gb-input-p" style="min-height:50px !important;" id="pf_reflink" placeholder="Paste link(s) here..."></textarea>
              </div>
            </div>

            <div class="gb-form-group">
              <label class="gb-label">Special Instructions</label>
              <div class="gb-input-wrap">
                <textarea class="gb-input-p" style="min-height:60px !important;" id="pf_notes" placeholder="Write N/A if unneeded"></textarea>
                <button type="button" class="gb-copy-icon-btn" data-target="pf_notes" title="Copy"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg></button>
              </div>
            </div>

          </div>
        </div>

        <div id="__gb-proof-footer">
          <button type="button" class="gb-btn-primary-send" id="__gb-btn-submit-form">
            <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="width:16px;height:16px;"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            Send Request
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    if (ctx._devMode) {
      const banner = document.createElement('div');
      banner.style.cssText = `
        background: rgba(125,184,42,.08) !important;
        border-bottom: 1px solid rgba(125,184,42,.2) !important;
        padding: 8px 20px !important;
        display: flex !important; align-items: center !important; gap: 8px !important;
        font-size: 12px !important; font-weight: 600 !important;
        color: var(--gb-brand-label, #7db82a) !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
        flex-shrink: 0 !important;
      `;
      banner.innerHTML = `
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"
          style="flex-shrink:0">
          <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"/>
        </svg>
        Dev mode — stub data loaded. Submissions are disabled.
      `;
      const card = overlay.querySelector('#__gb-proof-card');
      const hdr  = overlay.querySelector('#__gb-proof-hdr');
      if (card && hdr) card.insertBefore(banner, hdr.nextSibling);
    }

    __gbProofModalStore = { logoUrl, overlay };

    function __gbHideProofModal(el) {
      const card = el.querySelector('#__gb-proof-card');
      
      el.style.setProperty('animation', '__gbFadeOut 0.15s ease forwards', 'important');
      if (card) card.style.setProperty('animation', '__gbSlideDown 0.15s ease forwards', 'important');

      setTimeout(() => {
        el.style.setProperty('display', 'none', 'important');
        el.style.animation = '';
        if (card) card.style.animation = '';
      }, 140);
    }

    function buildOptionsHtml(optionsArray, defaultVal) {
      if (!optionsArray || optionsArray.length === 0) return `<div class="gb-dropdown-option selected" data-value="0">Failed to load</div>`;
      return optionsArray.map(opt => {
        const isSelected = opt.val === String(defaultVal) ? 'selected' : '';
        return `<div class="gb-dropdown-option ${isSelected}" data-value="${opt.val}"><span>${opt.txt}</span></div>`;
      }).join('');
    }

    function buildMultiOptionsHtml(stringArray) {
      return stringArray.map(txt => {
        return `<div class="gb-dropdown-option" data-value="${txt}">
                  <span style="flex: 1 1 auto !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; padding-right: 12px !important;">${txt}</span>
                  
                  <div style="display: flex !important; align-items: center !important; justify-content: flex-end !important; gap: 8px !important; flex: 0 0 auto !important;">
                    
                    <div class="gb-opt-minus" style="display: none !important; width: 20px !important; height: 20px !important; border: 1px solid rgba(255,255,255,.1) !important; border-radius: 6px !important; background: rgba(0,0,0,.3) !important; color: rgba(255,255,255,.6) !important; font-size: 16px !important; font-weight: 800 !important; align-items: center !important; justify-content: center !important; cursor: pointer !important; user-select: none !important; line-height: 1 !important; transition: all .15s !important;" title="Remove one">−</div>
                    
                    <span class="gb-opt-count" style="display:none; margin: 0 !important;">0</span>
                    <svg class="gb-multi-check" viewBox="0 0 24 24" style="margin: 0 !important; flex-shrink: 0 !important;"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </div>
                </div>`;
      }).join('');
    }

    function renderDynamicFields(selectedItemsArray, multiSelectRef) {
      const container = overlay.querySelector('#__gb-dynamic-fields-container');
      container.innerHTML = ''; 
      if (selectedItemsArray.length === 0) return;

      const injectedFieldsMeta = []; 

      const itemTitleCounts = {};
      selectedItemsArray.forEach(item => { itemTitleCounts[item] = (itemTitleCounts[item] || 0) + 1; });
      const itemTitleSeen = {};

      selectedItemsArray.forEach((item, index) => {
        const groupKey = GROUP_MAP[item] || (item.startsWith('Gift Set') ? 'giftset' : null);
        if (!groupKey) return;
        
        const templateFields = DYN_FIELDS[groupKey];
        if (!templateFields) return;

        itemTitleSeen[item] = (itemTitleSeen[item] || 0) + 1;
        const instanceLabel = itemTitleCounts[item] > 1 ? ` · ${itemTitleSeen[item]}` : '';
        const headerTitle = `${item}${instanceLabel}`;

        const safeItemName = item.replace(/[^a-zA-Z0-9]/g, '');
        const idPrefix = `dyn_${index}_${safeItemName}`;

        const groupDiv = document.createElement('div');
        groupDiv.className = 'gb-dyn-group';
        groupDiv.dataset.groupIndex = index;
        
        groupDiv.style.animationDelay = `${index * 0.05}s`;
        
        let html = `
          <div class="gb-dyn-header-row">
            <div class="gb-section-header">${headerTitle}</div>
            <button type="button" class="gb-dyn-delete" title="Remove this item"><svg fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          <div class="gb-grid-2">`;
        
        templateFields.forEach(field => {
          const uniqueFieldId = `${idPrefix}_${field.id}`;
          const uniqueDependsId = field.dependsOn ? `${idPrefix}_${field.dependsOn}` : null;
          
          injectedFieldsMeta.push({
            id: uniqueFieldId,
            dependsOn: uniqueDependsId,
            dependsNotValue: field.dependsNotValue
          });
          
          const displayStyle = field.dependsOn ? 'display: none;' : '';
          
          html += `<div class="gb-form-group" id="wrap_${uniqueFieldId}" style="${displayStyle}">
                    <label class="gb-label">${field.label} ${field.hint ? `<span class="gb-hint">(${field.hint})</span>` : ''}</label>`;
          
          if (field.type === 'select') {
             html += `<div class="gb-dropdown-wrap" id="ddwrap_${uniqueFieldId}">
                        <button type="button" class="gb-dropdown-btn" id="btn_${uniqueFieldId}">
                          <span class="gb-btn-label" id="label_${uniqueFieldId}">${field.default || field.options[0]}</span>
                          <svg class="gb-dropdown-chevron" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                        <div class="gb-dropdown-menu" id="menu_${uniqueFieldId}">
                          ${buildOptionsHtml(field.options.map(o => ({val: o, txt: o})), field.default || field.options[0])}
                        </div>
                        <input type="hidden" id="${uniqueFieldId}" value="${field.default || field.options[0]}" data-dynamic="true" data-item="${item}" data-index="${index}">
                      </div>`;
          } else {
             html += `<div class="gb-input-wrap">
                        <input type="text" class="gb-input-p" id="${uniqueFieldId}" placeholder="..." data-dynamic="true" data-item="${item}" data-index="${index}">
                      </div>`;
          }
          html += `</div>`;
        });
        
        html += `</div>`; 
        groupDiv.innerHTML = html;
        container.appendChild(groupDiv);

        groupDiv.querySelector('.gb-dyn-delete').addEventListener('click', (e) => {
          e.stopPropagation();
          const hidden = overlay.querySelector('#pf_item');
          const list = hidden.value ? hidden.value.split(' | ') : [];
          list.splice(index, 1);
          hidden.value = list.join(' | ');
          if (multiSelectRef) multiSelectRef.sync();
          renderDynamicFields(list, multiSelectRef);
        });

        templateFields.forEach(field => {
          if (field.type === 'select') {
             const uniqueFieldId = `${idPrefix}_${field.id}`;
             bindSingleDropdown(uniqueFieldId, () => handleDependencies(injectedFieldsMeta));
          }
        });
      });
      
      handleDependencies(injectedFieldsMeta);
    }

    function handleDependencies(fieldsMetaArray) {
      fieldsMetaArray.forEach(field => {
        if (field.dependsOn) {
          const dependencyInput = overlay.querySelector(`#${field.dependsOn}`);
          const wrapper = overlay.querySelector(`#wrap_${field.id}`);
          if (dependencyInput && wrapper) {
             const currentVal = dependencyInput.value;
             if (field.dependsNotValue) {
               wrapper.style.display = (currentVal !== field.dependsNotValue) ? 'flex' : 'none';
             }
          }
        }
      });
    }

    const bindSingleDropdown = (baseId, onChangeCallback) => {
      const wrap = overlay.querySelector('#ddwrap_' + baseId) || overlay.querySelector('#wrap_' + baseId);
      const btn = overlay.querySelector('#btn_' + baseId);
      const menu = overlay.querySelector('#menu_' + baseId);
      const label = overlay.querySelector('#label_' + baseId);
      const hidden = overlay.querySelector('#' + baseId);
      if (!wrap || !btn || !menu || !label || !hidden) return; 

      const options = menu.querySelectorAll('.gb-dropdown-option');

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = menu.classList.contains('open');
        overlay.querySelectorAll('.gb-dropdown-menu.open').forEach(m => m.classList.remove('open'));
        overlay.querySelectorAll('.gb-dropdown-btn.open').forEach(b => b.classList.remove('open'));
        if (!isOpen) {
          menu.classList.add('open');
          btn.classList.add('open');
        }
      });

      options.forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = opt.getAttribute('data-value');
          label.textContent = opt.querySelector('span')?.textContent || opt.textContent; 
          hidden.value = val;                  
          options.forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
          menu.classList.remove('open');
          btn.classList.remove('open');
          if(onChangeCallback) onChangeCallback(val);
        });
      });

      document.addEventListener('click', (e) => {
        if (!wrap.contains(e.target)) {
          menu.classList.remove('open');
          btn.classList.remove('open');
        }
      });
    };

    const bindMultiDropdown = (baseId, onChangeCallback) => {
      const wrap   = overlay.querySelector('#wrap_' + baseId);
      const btn    = overlay.querySelector('#btn_' + baseId);
      const menu   = overlay.querySelector('#menu_' + baseId);
      const label  = overlay.querySelector('#label_' + baseId);
      const hidden = overlay.querySelector('#' + baseId);
      if (!wrap || !btn || !menu || !label || !hidden) return null;

      const options = menu.querySelectorAll('.gb-dropdown-option');

      const sync = () => {
        const list = hidden.value ? hidden.value.split(' | ') : [];
        const counts = {};
        list.forEach(v => { counts[v] = (counts[v] || 0) + 1; });

        options.forEach(opt => {
          const val   = opt.getAttribute('data-value');
          const count = counts[val] || 0;
          const badge = opt.querySelector('.gb-opt-count');
          const minus = opt.querySelector('.gb-opt-minus');
          
          if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'inline-flex' : 'none';
          }
          if (minus) {
            minus.style.setProperty('display', count > 0 ? 'flex' : 'none', 'important');
          }
          opt.classList.toggle('selected', count > 0);
        });

        if (list.length === 0)      label.textContent = 'Select Items...';
        else if (list.length === 1) label.textContent = list[0];
        else                        label.textContent = `${list.length} Items Selected`;
      };

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = menu.classList.contains('open');
        overlay.querySelectorAll('.gb-dropdown-menu.open').forEach(m => m.classList.remove('open'));
        overlay.querySelectorAll('.gb-dropdown-btn.open').forEach(b => b.classList.remove('open'));
        if (!isOpen) { menu.classList.add('open'); btn.classList.add('open'); }
      });

      options.forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const val  = opt.getAttribute('data-value');
          let list = hidden.value ? hidden.value.split(' | ') : [];

          if (e.target.closest('.gb-opt-minus')) {
            const lastIndex = list.lastIndexOf(val);
            if (lastIndex > -1) {
              list.splice(lastIndex, 1);
            }
          } 
          else {
            list.push(val); 
          }

          hidden.value = list.join(' | ');
          sync();
          if (onChangeCallback) onChangeCallback(list);
        });
      });

      return { sync };
    };

    const bindExclusiveTags = (baseId) => {
      const wrap = overlay.querySelector('#tags_' + baseId);
      const hidden = overlay.querySelector('#' + baseId);
      if (!wrap || !hidden) return;
      const tags = wrap.querySelectorAll('.gb-tag');
      tags.forEach(tag => {
        tag.addEventListener('click', (e) => {
          e.stopPropagation();
          tags.forEach(t => t.classList.remove('active'));
          tag.classList.add('active');
          hidden.value = tag.getAttribute('data-val');
        });
      });
    };

    const bindToggleTag = (baseId) => {
      const tag = overlay.querySelector('#tag_' + baseId);
      const hidden = overlay.querySelector('#' + baseId);
      if (!tag || !hidden) return;
      tag.addEventListener('click', (e) => {
        e.stopPropagation();
        tag.classList.toggle('active');
        hidden.value = tag.classList.contains('active') ? tag.getAttribute('data-val') : 'No';
      });
    };

    const multiItemSelect = bindMultiDropdown('pf_item', (selectedItems) => { renderDynamicFields(selectedItems, multiItemSelect); });
    bindSingleDropdown('pf_status');
    bindSingleDropdown('pf_rep');
    bindSingleDropdown('pf_artist');
    bindExclusiveTags('pf_type');
    bindExclusiveTags('pf_val');
    bindToggleTag('pf_rush');
    bindToggleTag('pf_canada');
    bindToggleTag('pf_dropship');

    const proofs = ctx.existingProofs || [];
    if (proofs.length > 0) {
      const card = overlay.querySelector('#__gb-proof-card');
      const body = overlay.querySelector('#__gb-proof-body');
      const formCont = overlay.querySelector('#__gb-proof-form-container');
      
      card.style.setProperty('width', 'min(1050px, calc(100vw - 24px))', 'important');
      body.classList.add('has-gallery');

      const formScroll = document.createElement('div');
      formScroll.id = '__gb-proof-form-scroll';
      formScroll.appendChild(formCont);
      body.appendChild(formScroll);

      const galleryDiv = document.createElement('div');
      galleryDiv.id = '__gb-proof-gallery';
      galleryDiv.innerHTML = `<div style="font-size: 10px !important; font-weight: 800 !important; color: rgba(255,255,255,.4) !important; text-transform: uppercase !important; letter-spacing: 0.8px !important; margin-bottom: 12px !important;">Previous Proofs (${proofs.length})</div>`;
      
      proofs.forEach(proof => {
        const item = document.createElement('div');
        item.className = 'gb-gallery-item';
        item.style.cssText = 'display: flex !important; flex-direction: column !important; gap: 8px !important; margin-bottom: 20px !important;';

        const img = document.createElement('img');
        img.src = proof.thumbUrl;
        img.alt = proof.name || '';
        img.style.cssText = 'width: 100% !important; display: block !important; border-radius: 10px !important; border: 1px solid rgba(255,255,255,.08) !important; background: rgba(0,0,0,.3) !important; object-fit: cover !important;';
        item.appendChild(img);

        const pill = document.createElement('div');
        pill.style.cssText = 'display: flex !important; align-items: center !important; justify-content: space-between !important; background: rgba(0,0,0,.3) !important; border: 1px solid rgba(255,255,255,.08) !important; border-radius: 18px !important; padding: 5px 6px 5px 12px !important;';

        const nameDiv = document.createElement('div');
        nameDiv.style.cssText = 'font-size: 11px !important; font-weight: 500 !important; color: rgba(255,255,255,.7) !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; flex: 1 !important; padding-right: 8px !important;';
        nameDiv.title = proof.name || '';
        nameDiv.textContent = proof.name || '—';
        pill.appendChild(nameDiv);

        const copyBtn = document.createElement('button');
        copyBtn.innerHTML = `Copy`;
        copyBtn.style.cssText = 'flex-shrink: 0 !important; background: rgba(255,255,255,.05) !important; border: 1px solid rgba(255,255,255,.1) !important; border-radius: 14px !important; padding: 4px 12px !important; cursor: pointer !important; color: #fff !important; font-size: 10px !important; font-weight: 600 !important; font-family: inherit !important; transition: all .15s !important; margin: 0 !important;';
        
        copyBtn.addEventListener('mouseenter', () => {
          if (!copyBtn.classList.contains('copied')) {
            copyBtn.style.setProperty('background', 'rgba(255,255,255,.1)', 'important');
            copyBtn.style.setProperty('border-color', 'rgba(255,255,255,.2)', 'important');
          }
        });
        copyBtn.addEventListener('mouseleave', () => {
          if (!copyBtn.classList.contains('copied')) {
            copyBtn.style.setProperty('background', 'rgba(255,255,255,.05)', 'important');
            copyBtn.style.setProperty('border-color', 'rgba(255,255,255,.1)', 'important');
          }
        });

        const link = proof.proofLink || '';
        copyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const done = (ok) => {
            copyBtn.classList.add('copied');
            copyBtn.textContent = ok ? 'Copied!' : 'Failed';
            copyBtn.style.setProperty('color', ok ? 'var(--gb-success, #38b000)' : 'var(--gb-error, #c86060)', 'important');
            copyBtn.style.setProperty('border-color', ok ? 'rgba(var(--gb-success-rgb, 56,176,0), 0.4)' : 'rgba(var(--gb-error-rgb, 200,96,96), 0.4)', 'important');
            copyBtn.style.setProperty('background', ok ? 'rgba(var(--gb-success-rgb, 56,176,0), 0.15)' : 'rgba(var(--gb-error-rgb, 200,96,96), 0.15)', 'important');
            
            setTimeout(() => { 
              copyBtn.classList.remove('copied');
              copyBtn.textContent = 'Copy'; 
              copyBtn.style.setProperty('color', '#fff', 'important');
              copyBtn.style.setProperty('border-color', 'rgba(255,255,255,.1)', 'important');
              copyBtn.style.setProperty('background', 'rgba(255,255,255,.05)', 'important');
            }, 2000);
          };
          if (!link) { done(false); return; }
          const fallback = () => {
            const t = document.createElement('textarea');
            t.value = link; t.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
            document.body.appendChild(t); t.focus(); t.select();
            try { document.execCommand('copy'); done(true); } catch { done(false); }
            t.remove();
          };
          navigator.clipboard?.writeText
            ? navigator.clipboard.writeText(link).then(() => done(true)).catch(fallback)
            : fallback();
        });

        pill.appendChild(copyBtn);
        item.appendChild(pill);
        
        galleryDiv.appendChild(item);
      });
      body.insertBefore(galleryDiv, formScroll);
    }

    if (ctx.salesRep) {
      const repTarget = ctx.salesRep.toLowerCase().replace(/[^a-z]/g, '');
      const repOptions = overlay.querySelectorAll('#menu_pf_rep .gb-dropdown-option');
      for (const opt of repOptions) {
        const optText = opt.textContent.toLowerCase().replace(/[^a-z]/g, '');
        if (optText === repTarget || optText.startsWith(repTarget)) {
          opt.click(); break;
        }
      }
    }

    overlay.querySelectorAll('.gb-copy-icon-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetEl = overlay.querySelector('#' + btn.getAttribute('data-target'));
        if (targetEl && targetEl.value) {
          navigator.clipboard.writeText(targetEl.value).then(() => {
            const og = btn.innerHTML;
            btn.classList.add('copied'); btn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = og; }, 1500);
          });
        }
      });
    });

    overlay.querySelector('#btn_pf_close').addEventListener('click', () => __gbHideProofModal(overlay));
    overlay.addEventListener('click', e => { if (e.target === overlay) __gbHideProofModal(overlay); });
    const pfEscKey = e => {
      if (e.key === 'Escape') { __gbHideProofModal(overlay); document.removeEventListener('keydown', pfEscKey); }
    };
    document.addEventListener('keydown', pfEscKey);
    
    overlay.querySelector('#__gb-btn-submit-form').addEventListener('click', async () => {
      const btn = overlay.querySelector('#__gb-btn-submit-form');
      if (btn.classList.contains('gb-done')) { __gbHideProofModal(overlay); return; }

      if (ctx._devMode) {
        if (typeof showGbNotification === 'function') {
          showGbNotification('Dev mode — proof submissions are disabled in the test console.', 'info', 3500);
        }
        return;
      }

      const getVal   = (id) => overlay.querySelector('#' + id)?.value || '';
      const getLabel = (id) => overlay.querySelector('#label_' + id)?.textContent?.trim() || getVal(id);

      const pfNameInput = overlay.querySelector('#pf_name');
      const pfItemInput = overlay.querySelector('#btn_pf_item');
      let hasError = false;
      if (!getVal('pf_name').trim()) { pfNameInput.style.borderColor = 'var(--gb-error, #c86060)'; hasError = true; }
      if (!getVal('pf_item'))        { pfItemInput.style.borderColor = 'var(--gb-error, #c86060)'; hasError = true; }
      if (hasError) {
        btn.style.setProperty('background-color', 'var(--gb-error, #c86060)', 'important');
        btn.style.setProperty('border-color', 'var(--gb-error, #c86060)', 'important');
        btn.style.setProperty('color', '#fff', 'important');
        btn.innerHTML = `✗ Missing Required Fields`;
        setTimeout(() => {
          pfNameInput.style.borderColor = ''; pfItemInput.style.borderColor = ''; btn.style.backgroundColor = ''; btn.style.borderColor = ''; btn.style.color = '';
          btn.innerHTML = `<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="width:16px;height:16px;"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg> Send Request`;
        }, 2500);
        return;
      }

      const selectedItems = getVal('pf_item').split(' | ').filter(Boolean);

      const dynamicData = {};
      overlay.querySelectorAll('#__gb-dynamic-fields-container input[data-dynamic="true"]').forEach(el => {
        if (el.id && el.closest('.gb-form-group').style.display !== 'none') {
          const slotIndex = parseInt(el.getAttribute('data-index'), 10);
          if (!dynamicData[slotIndex]) dynamicData[slotIndex] = {};
          const cleanId = el.id.split('_').slice(3).join('_');
          dynamicData[slotIndex][cleanId] = el.value;
        }
      });

      const basePayload = {
        orderId:      getVal('pf_order'),
        customerId:   getVal('pf_custid'),
        proofName:    getVal('pf_name'),
        logoStatus:   getVal('pf_status'),
        salesRepId:   getVal('pf_rep'),
        artistId:     getVal('pf_artist'),
        orderType:    getVal('pf_type'),
        orderValue:   getVal('pf_val'),
        multiProofs:  selectedItems.length,
        rushNeeded:   getVal('pf_rush'),
        canadaDrop:   getVal('pf_canada'),
        dropShipTS:   getVal('pf_dropship'),
        itemLink:     getVal('pf_itemlink'),
        refLink:      getVal('pf_reflink'),
        notes:        getVal('pf_notes'),
        sourceImage:  ctx.rawSrc || ctx.logoUrl || '',
      };

      const baseName = basePayload.proofName;
      const itemTotals = {};

      selectedItems.forEach((item) => {
        itemTotals[item] = (itemTotals[item] || 0) + 1;
      });

      const itemSeen = {};
      const proofNames = selectedItems.map((item) => {
        itemSeen[item] = (itemSeen[item] || 0) + 1;
        const suffix = itemTotals[item] > 1 ? ` - ${itemSeen[item]}` : '';
        return `${baseName} - ${item}${suffix}`;
      });

      btn.style.opacity = '0.7';
      btn.style.pointerEvents = 'none';

      const sendOne = (payload) => new Promise((resolve) => {
        chrome.runtime.sendMessage(payload, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message });
          } else {
            resolve(response);
          }
        });
      });

      const results = [];

      for (let i = 0; i < selectedItems.length; i++) {
        const item      = selectedItems[i];
        const dynFields = dynamicData[i] || {};
        const logoType  = dynFields.logoType || 'Ball';
        const shortName = item.length > 24 ? item.substring(0, 24) + '…' : item;

        btn.innerHTML = `<span style="opacity:.6;font-size:12px;">Generating ${i + 1} / ${selectedItems.length}</span>&nbsp; ${shortName}`;

        const response = await sendOne({
          action:        'generateProofLink',
          ...basePayload,
          proofName:     proofNames[i],
          itemsSelected: item,
          dynamicFields: { [item]: dynFields }
        });

        const link = response?.proofLink || response?.link || response?.url || '';
        const err  = response?.error || null;
        results.push({ item, logoType, proofLink: link, error: err, dynFields });
      }

      btn.style.pointerEvents = 'auto';
      btn.style.opacity = '1';
      btn.classList.add('gb-done');
      btn.innerHTML = `<svg fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24" style="width:14px;height:14px;"><polyline points="20 6 9 17 4 12"/></svg> Done — Close`;

      const repLabel    = getLabel('pf_rep');
      const artistLabel = getLabel('pf_artist');
      const flags = [
        basePayload.rushNeeded === 'Rush'   ? 'RUSH'         : null,
        basePayload.canadaDrop === 'Canada' ? 'Canada Drop'  : null,
        basePayload.dropShipTS === 'Yes'    ? 'Drop Ship TS' : null,
      ].filter(Boolean).join(' | ') || 'None';

      results.forEach((r, i) => { r.proofName = proofNames[i]; });

      __gbShowProofResults(overlay, results, basePayload, repLabel, artistLabel, flags);
    });

    function __gbShowProofResults(overlay, results, base, repLabel, artistLabel, flags) {
      const footer    = overlay.querySelector('#__gb-proof-footer');
      const scrollEl  = overlay.querySelector('#__gb-proof-form-scroll') || overlay.querySelector('#__gb-proof-body');
      const multi     = results.length > 1;

      const panel = document.createElement('div');
      panel.id = '__gb-results-panel';
      panel.style.cssText = `
        padding: 18px 0 4px;
        display: flex; flex-direction: column; gap: ${multi ? '8px' : '10px'};
        border-top: 1px solid rgba(255,255,255,.06); margin-top: 16px;
      `;

      const successCount = results.filter(r => r.proofLink).length;

      const hdr = document.createElement('div');
      hdr.style.cssText = 'font-size:10px;font-weight:800;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;';
      hdr.innerHTML = `Generated Links <span style="color:${successCount===results.length?'var(--gb-success, #38b000)':'var(--gb-error, #c86060)'};">(${successCount}/${results.length})</span>`;
      panel.appendChild(hdr);

      results.forEach((r, i) => {
        const card = document.createElement('div');
        card.style.cssText = `
          display:flex !important; flex-direction:column !important; gap:${multi?'4px':'6px'} !important;
          padding:${multi?'10px 14px':'14px 16px'} !important;
          background:rgba(0,0,0,.3) !important; border:1px solid rgba(255,255,255,.08) !important;
          border-radius:12px !important; opacity:0 !important; transform:translateY(8px) !important;
          transition: opacity .25s ease ${i*80}ms, transform .25s cubic-bezier(.34,1.4,.64,1) ${i*80}ms !important;
        `;

        const nameRow = document.createElement('div');
        nameRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;';
        nameRow.innerHTML = `
          <span style="font-size:${multi?'11':'12'}px;font-weight:600;color:rgba(255,255,255,.7);
            overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;" title="${r.proofName}">${r.proofName}</span>
          <span style="font-size:10px;font-weight:700;color:var(--gb-brand-label, #7db82a);
            background:rgba(var(--gb-brand-label-rgb, 125,184,42),0.15);border:1px solid rgba(var(--gb-brand-label-rgb, 125,184,42),0.3);
            border-radius:6px !important;padding:3px 8px;white-space:nowrap;flex-shrink:0;">${r.logoType}</span>
        `;
        card.appendChild(nameRow);

        const linkRow = document.createElement('div');
        if (r.proofLink) {
          linkRow.innerHTML = `<a href="${r.proofLink}" target="_blank" rel="noopener"
            style="font-size:${multi?'12':'13'}px;font-weight:500;color:var(--gb-brand-label, #7db82a);word-break:break-all;
            text-decoration:none;line-height:1.4;transition:color .15s;">${r.proofLink}</a>`;
        } else {
          linkRow.innerHTML = `<span style="font-size:12px;color:var(--gb-error, #c86060);">
            ⚠ Failed${r.error ? ': ' + r.error : ''}</span>`;
        }
        card.appendChild(linkRow);
        panel.appendChild(card);

        requestAnimationFrame(() => requestAnimationFrame(() => {
          card.style.opacity = '1';
          card.style.transform = 'translateY(0)';
        }));
      });

      scrollEl.appendChild(panel);
      setTimeout(() => { scrollEl.scrollTop = scrollEl.scrollHeight; }, 40);

      const LINE = '='.repeat(50);
      const line = '-'.repeat(50);

      const lbl = (k, v) => v ? `${(k + ':').padEnd(16)} ${v}` : null;

      const header = [
        LINE,
        `PROOF REQUEST  –  Order #${base.orderId || 'N/A'}`,
        LINE,
        lbl('Customer',  base.customerId),
        lbl('Sales Rep', repLabel),
        lbl('Artist',    artistLabel),
        lbl('Type',      base.orderType),
        lbl('Value',     base.orderValue),
        lbl('Source Image', base.sourceImage),
        flags !== 'None' ? lbl('Flags', flags) : null,
      ].filter(Boolean).join('\n');

      const proofBlocks = results.map((r, i) => {
        const dyn  = r.dynFields || {};
        const num  = multi ? `PROOF ${i + 1} OF ${results.length}` : 'PROOF DETAILS';
        const rows = [
          `${line}`,
          `${num}`,
          `${line}`,
          lbl('Proof Name',   r.proofName),
          lbl('Item',         r.item),
          lbl('Logo Type',    r.logoType),
          lbl('Ball Color',   dyn.color && r.item === 'Ball' ? dyn.color : null),
          lbl('Imprint',      dyn.imprint),
          lbl('Dozens',       dyn.dozens),
          lbl('Print Method', dyn.printMethod),
          lbl('Decorator',    dyn.decorator),
          lbl('Dec. Method',  dyn.method),
          lbl('Item Color',   dyn.color && r.item !== 'Ball' ? dyn.color : null),
          lbl('Placement',    dyn.placement),
          lbl('Tee Size',     dyn.size),
          lbl('Item Name',    dyn.name),
          ``,
          lbl('Proof Link',   r.proofLink || '(generation failed)'),
          ``,
          lbl('Item Link',    base.itemLink),
          lbl('Reference',    base.refLink !== 'N/A' ? base.refLink : null),
          lbl('Instructions', base.notes  !== 'N/A' ? base.notes   : null),
        ].filter(Boolean).join('\n');
        return rows;
      }).join('\n\n');

      const emailBody = [header, '', proofBlocks].join('\n');

      const isRush = base.rushNeeded === 'Rush' ? 'Rush ' : '';
      const isMulti = results.length > 1 ? 'Multi ' : '';
      const cleanValue = (base.orderValue || '').replace('$', ''); 
      const subject = `${isRush}${isMulti}${base.orderType} ${cleanValue} - ${results.map(r => r.proofName).join(', ')} - ${base.orderId || 'N/A'}`.trim();
      const allLinks = results.filter(r => r.proofLink).map(r => r.proofLink).join('\n');

      footer.innerHTML = `
        <button type="button" id="__gb-btn-copy-links" style="
          background: rgba(0,0,0,.3) !important; color: #fff !important;
          border: 1px solid rgba(255,255,255,.1) !important; border-radius: 8px !important;
          padding: 10px 20px !important; font-size: 13px !important; font-weight: 600 !important;
          cursor: pointer !important; display: flex !important; align-items: center !important; gap: 8px !important; font-family: inherit !important;
          transition: all .15s !important; margin: 0 !important;
        ">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px !important; height:14px !important; flex-shrink:0 !important;">
            <rect x="9" y="9" width="13" height="13" rx="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
          Copy All Links
        </button>
        <button type="button" id="__gb-btn-open-outlook" style="
          background: var(--gb-brand-dark, #5f7d18) !important; color: var(--gb-brand-text, #d8eeaa) !important;
          border: 1px solid rgba(var(--gb-brand-label-rgb, 125,184,42), .4) !important; border-radius: 8px !important;
          padding: 10px 24px !important; font-size: 13px !important; font-weight: 700 !important;
          cursor: pointer !important; display: flex !important; align-items: center !important; gap: 8px !important; font-family: inherit !important;
          transition: all .15s !important; margin: 0 !important;
        ">
          <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="width:16px !important; height:16px !important; flex-shrink:0 !important;">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
          </svg>
          Open in Outlook
        </button>
      `;

      const copyBtn = footer.querySelector('#__gb-btn-copy-links');
      copyBtn.addEventListener('mouseenter', () => { if(!copyBtn.classList.contains('copied')) { copyBtn.style.setProperty('background', 'rgba(255,255,255,.05)', 'important'); copyBtn.style.setProperty('border-color', 'rgba(255,255,255,.2)', 'important'); }});
      copyBtn.addEventListener('mouseleave', () => { if(!copyBtn.classList.contains('copied')) { copyBtn.style.setProperty('background', 'rgba(0,0,0,.3)', 'important'); copyBtn.style.setProperty('border-color', 'rgba(255,255,255,.1)', 'important'); }});
      
      copyBtn.addEventListener('click', function() {
        const copyFn = () => {
          this.classList.add('copied');
          this.innerHTML = `<svg fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24" style="width:14px;height:14px;flex-shrink:0;"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
          this.style.setProperty('background', 'rgba(var(--gb-success-rgb, 56,176,0), 0.15)', 'important');
          this.style.setProperty('color', 'var(--gb-success, #38b000)', 'important');
          this.style.setProperty('border-color', 'rgba(var(--gb-success-rgb, 56,176,0), 0.4)', 'important');
          setTimeout(() => {
            this.classList.remove('copied');
            this.innerHTML = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;flex-shrink:0;"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy All Links`;
            this.style.setProperty('background', 'rgba(0,0,0,.3)', 'important');
            this.style.setProperty('color', '#fff', 'important');
            this.style.setProperty('border-color', 'rgba(255,255,255,.1)', 'important');
          }, 2200);
        };
        navigator.clipboard.writeText(allLinks).then(copyFn).catch(() => {
          const tmp = document.createElement('textarea');
          tmp.value = allLinks; tmp.style.cssText = 'position:fixed;opacity:0;';
          document.body.appendChild(tmp); tmp.select(); document.execCommand('copy'); tmp.remove();
          copyFn();
        });
      });

      const outlookBtn = footer.querySelector('#__gb-btn-open-outlook');
      outlookBtn.addEventListener('mouseenter', () => { outlookBtn.style.setProperty('background', 'var(--gb-brand, #6e901d)', 'important'); outlookBtn.style.setProperty('color', '#fff', 'important'); outlookBtn.style.setProperty('border-color', 'var(--gb-brand-label, #7db82a)', 'important'); });
      outlookBtn.addEventListener('mouseleave', () => { outlookBtn.style.setProperty('background', 'var(--gb-brand-dark, #5f7d18)', 'important'); outlookBtn.style.setProperty('color', 'var(--gb-brand-text, #d8eeaa)', 'important'); outlookBtn.style.setProperty('border-color', 'rgba(var(--gb-brand-label-rgb, 125,184,42), .4)', 'important'); });
      
      outlookBtn.addEventListener('click', () => {
        const mailto = `mailto:gbcproofrequest@golfballs.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
        window.open(mailto, '_blank');
      });
    }
  }
  
  function __gbInitZoomPan(modal) {
    const wrap     = modal.querySelector('#__gb-zoom-viewport');
    const container= modal.querySelector('#__gb-preview-wrap');
    const ctrls    = modal.querySelector('#__gb-zoom-ctrls');
    const levelEl  = modal.querySelector('#__gb-zoom-level');
    if (!wrap || !container) return;

    let scale  = 1;
    let tx     = 0;
    let ty     = 0;
    const MIN  = 0.5;
    const MAX  = 8;

    ctrls.style.display  = 'flex';
    levelEl.style.display= 'block';

    function applyTransform(animate) {
      wrap.style.transition = animate ? 'transform .18s cubic-bezier(.25,.8,.25,1)' : 'none';
      wrap.style.transform  = `translate(${tx}px, ${ty}px) scale(${scale})`;
      levelEl.textContent   = Math.round(scale * 100) + '%';
    }

    function clampPan() {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const maxX = Math.max(0, (cw * scale - cw) / 2);
      const maxY = Math.max(0, (ch * scale - ch) / 2);
      tx = Math.max(-maxX, Math.min(maxX, tx));
      ty = Math.max(-maxY, Math.min(maxY, ty));
    }

    function zoom(delta, originX, originY) {
      const prev  = scale;
      scale       = Math.max(MIN, Math.min(MAX, scale * (1 + delta)));
      const ratio = scale / prev - 1;
      const cw    = container.clientWidth;
      const ch    = container.clientHeight;
      tx -= (originX - cw / 2 - tx) * ratio;
      ty -= (originY - ch / 2 - ty) * ratio;
      clampPan();
      applyTransform(false);
    }

    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect   = container.getBoundingClientRect();
      const ox     = e.clientX - rect.left - container.clientWidth  / 2;
      const oy     = e.clientY - rect.top  - container.clientHeight / 2;
      const delta  = e.deltaY < 0 ? 0.12 : -0.12;
      zoom(delta, ox + container.clientWidth / 2, oy + container.clientHeight / 2);
    }, { passive: false });

    modal.querySelector('#__gb-zoom-in').addEventListener('click',  () => { zoom( 0.35, container.clientWidth/2, container.clientHeight/2); });
    modal.querySelector('#__gb-zoom-out').addEventListener('click', () => { zoom(-0.35, container.clientWidth/2, container.clientHeight/2); });
    modal.querySelector('#__gb-zoom-reset').addEventListener('click', () => {
      scale = 1; tx = 0; ty = 0; applyTransform(true);
    });

    let dragging = false, startX = 0, startY = 0, startTx = 0, startTy = 0;

    container.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      startTx = tx; startTy = ty;
      container.classList.add('dragging');
      container.setPointerCapture(e.pointerId);
    });

    container.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      tx = startTx + (e.clientX - startX);
      ty = startTy + (e.clientY - startY);
      clampPan();
      applyTransform(false);
    });

    const stopDrag = () => { dragging = false; container.classList.remove('dragging'); };
    container.addEventListener('pointerup',     stopDrag);
    container.addEventListener('pointercancel', stopDrag);

    container.addEventListener('dblclick', () => {
      if (scale !== 1 || tx !== 0 || ty !== 0) {
        scale = 1; tx = 0; ty = 0;
      } else {
        scale = 2;
      }
      applyTransform(true);
    });

    applyTransform(false);
  }

  function __gbWireModalButtons(modal, url, dataUrl, proofBtn, itemLink) {
    const copyBtn = modal.querySelector('#__gb-btn-copy');
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(url).then(() => {
        if (!copyBtn) return;
        copyBtn.classList.add('success');
        copyBtn.innerHTML = `<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
        setTimeout(() => {
          copyBtn.classList.remove('success');
          copyBtn.innerHTML = `<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy URL`;
        }, 2200);
      }).catch(() => {
        const tmp = document.createElement('textarea');
        tmp.value = url; tmp.style.cssText = 'position:fixed;opacity:0;';
        document.body.appendChild(tmp); tmp.select();
        document.execCommand('copy'); tmp.remove();
      });
    };

    modal.querySelector('#__gb-btn-dl').onclick = () => {
      const a = document.createElement('a');
      a.href = dataUrl; a.download = __gbFilenameFromPath(url);
      a.target = '_blank'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
    };

    proofBtn.onclick = async () => {
      console.log('[GB] Submit Proof clicked. Fetching live dropdowns...');

      if (__gbProofModalStore?.logoUrl === url && document.body.contains(__gbProofModalStore?.overlay)) {
        __gbCloseModal(modal, 150);
        const cached = __gbProofModalStore.overlay;
        
        cached.style.setProperty('display', 'flex', 'important');
        cached.style.animation = '__gbFadeIn .16s ease forwards';
        const card = cached.querySelector('#__gb-proof-card');
        if (card) card.style.animation = '__gbSlideUp .2s cubic-bezier(.34,1.4,.64,1) forwards';
        
        const escKey = e => {
          if (e.key === 'Escape') {
            __gbHideProofModal(cached);
            document.removeEventListener('keydown', escKey);
          }
        };
        document.addEventListener('keydown', escKey);
        return;
      }
      
      proofBtn.style.pointerEvents = 'none';
      proofBtn.innerHTML = `
        <svg class="gb-spin-ring" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:16px!important;height:16px!important; border:none!important; animation: __gbSpin .8s linear infinite; margin-right:6px;">
           <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
           <path d="M12 2a10 10 0 0 1 10 10"></path>
        </svg>
        Loading Data...
      `;

      try {
        const smartId = smartOrderNumber();
        const custId  = smartCustomerId();
        const repName = smartSalesRep();

        const [resp128, respCRM] = await Promise.all([
          fetch('/golfballs/adminnew/Default.aspx?Page=128', { credentials: 'include' }),
          custId
            ? fetch(`/golfballs/adminnew/Default.aspx?Page=240&customerID=${custId}`, { credentials: 'include' })
            : Promise.resolve(null)
        ]);

        const html = await resp128.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');

        const scrapeOptions = (id) => {
          const selectEl = doc.getElementById(id);
          if (!selectEl) return [];
          return Array.from(selectEl.options).map(opt => ({
            val: opt.value,
            txt: opt.text.trim()
          }));
        };

        const liveReps    = scrapeOptions('ctl00_DropDownSalesRep');
        const liveArtists = scrapeOptions('ctl00_DropDownArtist');

        let existingProofs = [];
        if (respCRM) {
          try {
            const crmHtml = await respCRM.text();
            const crmDoc  = new DOMParser().parseFromString(crmHtml, 'text/html');
            const rows    = crmDoc.querySelectorAll('tr');
            for (const row of rows) {
              const cells = row.querySelectorAll('td');
              if (cells.length < 5) continue;
              const proofAnchor = cells[4].querySelector('a[href*="logoProofing"]');
              const imgEl       = cells[4].querySelector('img');
              if (!proofAnchor || !imgEl) continue;
              const href      = proofAnchor.getAttribute('href') || '';
              const guidMatch = href.match(/logoGUID=([a-f0-9-]+)/i);
              if (!guidMatch) continue;
              const guid   = guidMatch[1];
              const imgSrc = (imgEl.getAttribute('src') || '').trim();
              if (!imgSrc) continue;

              const isUseless = t => !t || /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(t) || t.length < 3;
              let name = '';
              for (let ci = 0; ci <= 3 && !name; ci++) {
                if (cells[ci] && !cells[ci].contains(proofAnchor)) {
                  const t = cells[ci].textContent.trim();
                  if (!isUseless(t)) name = t;
                }
              }
              if (!name) name = proofAnchor.textContent.trim() || proofAnchor.title || `Proof ${guid.substring(0,8)}`;

              const thumbUrl  = `https://d1tp32r8b76g0z.cloudfront.net/logo/${guid.substring(0, 2)}/${guid}-150.jpg`;
              const proofLink = /^https?:\/\//i.test(href)
                ? href
                : `https://www.golfballs.com${href.startsWith('/') ? '' : '/'}${href}`;

              existingProofs.push({
                name,
                proofLink,
                thumbUrl,
                status: cells[3]?.textContent.trim() || ''
              });
            }
          } catch (e) {
            console.warn('[GB] Could not parse existing proofs:', e);
          }
        }

        __gbCloseModal(modal, 150);

        __gbBuildProofModal({
          logoUrl: url,
          orderId: smartId,
          customerId: custId,
          salesRep: repName,
          itemUrl: itemLink,
          liveReps,
          liveArtists,
          existingProofs
        });

      } catch (err) {
        console.error('[GB] Failed to fetch live dropdowns:', err);
        alert('Failed to load Sales Reps & Artists from the server.');
        proofBtn.style.pointerEvents = 'auto';
        proofBtn.innerHTML = `Submit Proof`;
      }
    };
  }


  // ═══════════════════════════════════════════════════════

  // ── Dev mode helpers (injected by extension build) ──────────────────────────

  window.__gbDevOpenImageModal = function __gbDevOpenImageModal() {
    const svgStr = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="280" viewBox="0 0 400 280">',
      '<rect width="400" height="280" fill="#1a1a1a" rx="12"/>',
      '<circle cx="200" cy="118" r="55" fill="none" stroke="#7db82a" stroke-width="2.5"/>',
      '<circle cx="200" cy="118" r="7" fill="#7db82a"/>',
      '<path d="M148 195 Q175 158 200 178 Q225 198 252 168 Q268 150 285 163" fill="none" stroke="#7db82a" stroke-width="2.2" stroke-linecap="round"/>',
      '<text x="200" y="238" text-anchor="middle" fill="#7db82a" font-family="sans-serif" font-size="12" font-weight="bold">DEV — Logo Placeholder</text>',
      '<text x="200" y="256" text-anchor="middle" fill="#555" font-family="sans-serif" font-size="10">golfballs.com — TEST-1234</text>',
      '</svg>'
    ].join('');
    const svgSrc = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
    const modal    = __gbBuildModal();
    const spinner  = modal.querySelector('#__gb-spinner');
    const preview  = modal.querySelector('#__gb-preview-img');
    const actions  = modal.querySelector('#__gb-modal-actions');
    const proofBtn = modal.querySelector('#__gb-btn-proof');
    const sub      = modal.querySelector('#__gb-modal-sub');

    const closeBtn = modal.querySelector('#__gb-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', () => __gbCloseModal(modal));
    modal.addEventListener('click', e => { if (e.target === modal) __gbCloseModal(modal); });
    const keyClose = e => {
      if (e.key === 'Escape') { __gbCloseModal(modal); document.removeEventListener('keydown', keyClose); }
    };
    document.addEventListener('keydown', keyClose);

    if (spinner && preview && actions) {
      __gbRevealContent(modal, spinner, preview, actions, proofBtn, sub,
        svgSrc, 'dev://placeholder', null, 'Dev Placeholder');
    }

    if (proofBtn) {
      proofBtn.onclick = null;
      proofBtn.addEventListener('click', () => {
        __gbCloseModal(modal);
        window.__gbDevOpenProofModal();
      });
    }
  };

  window.__gbDevOpenProofModal = function __gbDevOpenProofModal() {
    __gbBuildProofModal({
      logoUrl:        'dev://placeholder',
      orderId:        'TEST-1234',
      customerId:     'DEV-CUST-99',
      salesRep:       'Dev Rep — Alice Johnson',
      itemUrl:        null,
      liveReps:       [{"val": "101", "txt": "Dev Rep — Alice Johnson"}, {"val": "102", "txt": "Dev Rep — Bob Smith"}, {"val": "103", "txt": "Dev Rep — Carol White"}],
      liveArtists:    [{"val": "42", "txt": "Dev Artist — Marco Studio"}, {"val": "43", "txt": "Dev Artist — Priya Designs"}],
      existingProofs: [{"name": "Logo Proof A", "status": "Approved", "thumbUrl": "https://placehold.co/150x150/1a1a1a/7db82a?text=DEV+A", "proofLink": "#"}, {"name": "Logo Proof B", "status": "Pending", "thumbUrl": "https://placehold.co/150x150/1a1a1a/c86060?text=DEV+B", "proofLink": "#"}],
      _devMode:       true,
    });
  };

  // ═══════════════════════════════════════════════════════

}