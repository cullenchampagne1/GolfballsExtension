/* ───────────────────────────────────────────────────────────────
   logoArming.js — page image detection + the floating hover affordance
   that feeds the React Image Preview / Submit Proof modals.

   Ported from the legacy src/vanilla/modals/logo-extractor.js
   production path. That vanilla file's modal UI is now ImagePreview.jsx
   / SubmitProof.jsx; only the page-scanning + logo-candidate resolution
   lived outside React, and that's what this module carries over. The
   resolved logo is handed to the React modal via window.__gbOpenImagePreview.

   installLogoArming() exposes two page globals that src/vanilla/main.js
   drives (initial load, MutationObserver, and the imagePreviewEnabled
   feature-flag toggle) — exactly like the email/text-preview scanners:

     window.__gbScanForRenderImages()  — arm logo/render images on the page
     window.__gbHideHoverBtn()         — hide the floating affordance
─────────────────────────────────────────────────────────────── */

const CDN_HOST = 's.customizationapps.com';
const ALT_HOST = 'www.icustomize.com';

// ── URL / token helpers ───────────────────────────────────────

// Recursively URL-decodes until the string stabilises or the iteration
// cap is hit, so a multiply-encoded overlay token resolves to plain text
// without risking an infinite loop on malformed input.
function decodeDeep(str, max = 8) {
  let prev = str, cur = str;
  for (let i = 0; i < max; i++) {
    try { cur = decodeURIComponent(prev); } catch { break; }
    if (cur === prev) break;
    prev = cur;
  }
  return prev;
}

function filenameFromPath(p) {
  try {
    const clean = p.split(/[?#]/)[0];
    const seg = clean.split('/').pop() || 'user-upload';
    return /\.(png|jpe?g|webp|gif|svg)$/i.test(seg) ? seg : seg + '.png';
  } catch { return 'user-upload.png'; }
}

function urlsFor(host, pathOrUrl) {
  if (!host || !pathOrUrl) return [];
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return [
      pathOrUrl.replace(/^http:\/\//i, 'https://'),
      pathOrUrl.replace(/^https:\/\//i, 'http://'),
    ];
  }
  const path = pathOrUrl.replace(/^\/+/, '');
  return [
    `https://${host}/${path}`,
    `http://${host}/${path}`,
  ];
}

function looksLikeIconToken(s) {
  return !!s && !/[\/\\]/.test(s) && !/\.[a-z0-9]+$/i.test(s);
}

function withoutSizeSuffix(p) {
  return p.replace(/-(\d+)(\.(?:png|jpe?g|webp|gif|svg))(?:$|[?#])/i, '$2');
}

function withCaseVariants(relPath) {
  const out = new Set([relPath]);
  const m = relPath.match(/^([^/]+)\/(.*)$/);
  if (m) {
    const head = m[1], tail = m[2];
    if (head.toLowerCase() === 'logo')  { out.add(`logo/${tail}`);  out.add(`Logo/${tail}`);  }
    if (head.toLowerCase() === 'logos') { out.add(`logos/${tail}`); out.add(`Logos/${tail}`); }
  }
  return [...out];
}

function findOverlayTokenOrPath(rawUrl) {
  if (!rawUrl) return null;
  const deep = decodeDeep(rawUrl);

  const mTop = deep.match(/[?&]userOverlay=([^&#]+)/i);
  if (mTop && mTop[1]) return decodeDeep(mTop[1]);

  try {
    const u = new URL(deep, location.origin);
    for (const [, v] of u.searchParams.entries()) {
      const dv = decodeDeep(v);
      const m = dv.match(/userOverlay=([^&#]+)/i);
      if (m && m[1]) return decodeDeep(m[1]);
    }
  } catch {}

  const overlayRegex = /((?:https?:\/\/)?(?:[^/]*\/)?(?:UserUploads(?:\/Crops)?|logo|logos)\/[A-Za-z0-9/_\-.%]+?\.(?:png|jpe?g|webp|gif|svg))/i;
  const direct = deep.match(overlayRegex);
  if (direct && direct[1]) return direct[1];

  return null;
}

function buildAbsoluteCandidates(tokenOrPath) {
  if (/^https?:\/\//i.test(tokenOrPath)) {
    const base = [
      tokenOrPath.replace(/^http:\/\//i,  'https://'),
      tokenOrPath.replace(/^https:\/\//i, 'http://'),
    ];
    const noSize = withoutSizeSuffix(tokenOrPath);
    return noSize !== tokenOrPath ? [
      ...base,
      noSize.replace(/^http:\/\//i,  'https://'),
      noSize.replace(/^https:\/\//i, 'http://'),
    ] : base;
  }

  if (looksLikeIconToken(tokenOrPath)) {
    const bases = ['icons','icon','logo','Logo','logos','Logos','images/icons','Images/Icons','flags','Flags','images/flags','Images/Flags','images','Images'];
    const exts  = ['svg','png','webp','jpg','jpeg','gif'];
    const abs   = [];
    for (const b of bases) {
      for (const e of exts) {
        abs.push(...urlsFor(CDN_HOST, `${b}/${tokenOrPath}.${e}`));
        abs.push(...urlsFor(ALT_HOST, `${b}/${tokenOrPath}.${e}`));
      }
      abs.push(...urlsFor(CDN_HOST, `${b}/${tokenOrPath}`));
      abs.push(...urlsFor(ALT_HOST, `${b}/${tokenOrPath}`));
    }
    return abs;
  }

  const variants = withCaseVariants(tokenOrPath);
  const noSize   = withoutSizeSuffix(tokenOrPath);
  if (noSize !== tokenOrPath) variants.push(...withCaseVariants(noSize));

  const abs = [];
  for (const v of variants) {
    abs.push(...urlsFor(CDN_HOST, v));
    abs.push(...urlsFor(ALT_HOST, v));
  }
  return abs;
}

// ── Image classification ──────────────────────────────────────

function isRenderAspxImg(img) {
  const src = decodeURIComponent(img.getAttribute('src') || '');
  const isTargetEndpoint = /Render\.aspx|\/r\b/i.test(src);
  const hasOverlayToken  = /useroverlay/i.test(src);
  if (isTargetEndpoint && hasOverlayToken) return true;
  if (/CustomerUpload|CustomerLogo|CustomLogo/i.test(src)) return true;
  return false;
}

// Walks the siblings after an <img> looking for an adjacent "Original
// file" / image anchor (the CRM lays these out as img<br><a>).
function findDirectLink(img) {
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

// Resolves the admin "item" page URL for an image by finding a nearby
// 7-9 digit item id (an a[name] anchor preceding the image, or an
// ancestor element whose id is the item id).
function findItemLinkForImage(img) {
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

// ── Background fetch (CORS / mixed-content immune) ─────────────

// Content-script <img> tags get blocked as mixed content when the asset
// is http://s.customizationapps.com/... on an https CRM page, so every
// fetch routes through the background service worker. The dataUrl it
// returns is same-origin, keeping the modal's canvas eyedropper CORS-clean.
function loadImageViaBackground(url, onSuccess, onFail) {
  chrome.runtime.sendMessage(
    { action: 'proxyFetchImage', url },
    (resp) => {
      if (chrome.runtime.lastError) { onFail?.(chrome.runtime.lastError.message); return; }
      if (!resp || !resp.ok)        { onFail?.(resp?.error); return; }
      onSuccess?.(resp.dataUrl);
    }
  );
}

// ── Shift-click headless download ─────────────────────────────

function headlessDownload(rawSrc) {
  const tokenOrPath = findOverlayTokenOrPath(rawSrc);
  if (!tokenOrPath) {
    window.__gbToast?.warning?.('Could not find a logo to download in this image.');
    return;
  }

  const candidates = buildAbsoluteCandidates(tokenOrPath);
  let idx = 0;
  window.__gbToast?.info?.('Fetching logo…', { duration: 4000 });

  function tryNext() {
    if (idx >= candidates.length) {
      window.__gbToast?.error?.('Download failed — logo missing or blocked.');
      return;
    }
    const url = candidates[idx++];
    loadImageViaBackground(url, (dataUrl) => {
      const a = document.createElement('a');
      a.href     = dataUrl;
      a.download = filenameFromPath(url);
      a.target   = '_blank';
      a.rel      = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.__gbToast?.success?.('Logo downloaded.');
    }, tryNext);
  }

  tryNext();
}

// ── Express / custom-logo: resolve the RAW upload via order state ──
// The page <img> for an express order is the composite render; the raw
// upload's path (Source/CustomerUploads/…) is NOT a static CDN file — it
// lives only in the order's design state, fetched read-only via the
// editOrder API (routed through chargeApiProxy, which carries the admin
// JWT). We resolve it on the order page and fall back to the composite
// render on any miss, so there's no regression off the order page.

function findOrderMessageId() {
  try {
    for (const span of document.querySelectorAll('span')) {
      const m = (span.textContent || '').match(/messageID\s*:\s*([0-9a-f-]{36})/i);
      if (m) return m[1];
    }
    for (const a of document.querySelectorAll('a[href]')) {
      const m = (a.getAttribute('href') || '').match(/(?:editOrderMessageID|messageID)=([0-9a-f-]{36})/i);
      if (m) return m[1];
    }
    const m = (document.body.innerHTML || '').match(/messageID[^>]*>([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    return m ? m[1] : '';
  } catch { return ''; }
}

function extractOriginalFilePath(text, cropGuid) {
  if (!text) return null;
  // filePath + cropFilePath live in the SAME upload object (no braces between
  // them), so matching by the clicked image's crop GUID ties the original to
  // the exact item — important when an order has multiple uploads.
  if (cropGuid) {
    const g = cropGuid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = text.match(new RegExp('"filePath"\\s*:\\s*"(Source/CustomerUploads/[^"]+)"[^{}]*?"cropFilePath"\\s*:\\s*"[^"]*' + g, 'i'));
    if (m) return m[1];
  }
  const m2 = text.match(/"filePath"\s*:\s*"(Source\/CustomerUploads\/[^"]+)"/i);
  return m2 ? m2[1] : null;
}

function resolveExpressOriginal(rawSrc, itemLink, openWithBgFetch) {
  const composite = () => openWithBgFetch(rawSrc);
  const deep = decodeDeep(rawSrc);
  const om = deep.match(/UserUploads\/[A-Za-z0-9/_\-.]+?\.(?:png|jpe?g|webp|gif)/i);
  const cropGuid = om ? om[0].split('/').pop() : null;
  const messageId = findOrderMessageId();
  if (!messageId || typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
    composite();
    return;
  }
  let done = false;
  const fall = () => { if (!done) { done = true; composite(); } };
  const timer = setTimeout(fall, 6000);
  try {
    chrome.runtime.sendMessage(
      { action: 'chargeApiProxy', url: 'https://master.api.icustomize.com/admin/editOrder', method: 'PUT', body: { messageID: messageId } },
      (resp) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (chrome.runtime.lastError || !resp || !resp.ok || !resp.text) { composite(); return; }
        const filePath = extractOriginalFilePath(resp.text, cropGuid);
        if (filePath) openWithBgFetch('https://static.golfballs.com/' + filePath.replace(/^\/+/, ''));
        else composite();
      },
    );
  } catch { fall(); }
}

// ── Click → resolve logo → open the React Image Preview ───────

function extractAndShow(rawSrc, directUrl, itemLink) {
  if (typeof window.__gbOpenImagePreview !== 'function') {
    console.error('[gb] __gbOpenImagePreview missing — image-preview.js not loaded?');
    return;
  }

  // Each fetch carries a 3-second cap so an unreachable CDN (timeout,
  // mixed-content block, slow proxy) can't freeze the flow waiting on the
  // browser's ~90s default. On cap we fall through to opening the modal on
  // just the URL — its <img> can still try to display it (or surface an
  // error). MIME gate: octet-stream / HTML error pages aren't rendered as
  // images — we drop the dataUrl and let the modal load from the URL.
  const FETCH_CAP_MS = 3000;
  const isImageDataUrl = (du) => /^data:image\//i.test(du || '');

  const openWithBgFetch = (url) => {
    let settled = false;
    const settle = (dataUrl) => {
      if (settled) return;
      settled = true;
      const safe = isImageDataUrl(dataUrl) ? dataUrl : '';
      window.__gbOpenImagePreview({ url, dataUrl: safe, itemLink });
    };
    const timer = setTimeout(() => settle(null), FETCH_CAP_MS);
    loadImageViaBackground(url,
      (dataUrl) => { clearTimeout(timer); settle(dataUrl); },
      () => { clearTimeout(timer); settle(null); }
    );
  };

  if (directUrl) { openWithBgFetch(directUrl); return; }

  // Express render SKUs (e.g. sku=GolfBallPhotoExpress): the page <img> is the
  // composite (ball + photo) and the raw upload isn't a CDN file, so probing
  // for it 404s and hangs. Resolve the ORIGINAL upload from the order's design
  // state (editOrder) and show that; resolveExpressOriginal falls back to the
  // composite render whenever we're off an order page or anything misses.
  if (/[?&]sku=[^&]*express/i.test(rawSrc)) { resolveExpressOriginal(rawSrc, itemLink, openWithBgFetch); return; }

  const tokenOrPath = findOverlayTokenOrPath(rawSrc);
  if (!tokenOrPath) { openWithBgFetch(rawSrc); return; }

  // Render.aspx case — multiple candidate hosts / casings. Probe each via
  // the background script until one returns image bytes, same per-candidate cap.
  const candidates = buildAbsoluteCandidates(tokenOrPath);
  let idx = 0;
  const tryNext = () => {
    if (idx >= candidates.length) {
      // Every overlay candidate failed — fall back to the original
      // Render.aspx URL (the server renders something that loads) rather
      // than candidates[0], a guessed CDN path that 404s and freezes the
      // modal spinner.
      window.__gbOpenImagePreview({ url: rawSrc || candidates[0], itemLink });
      return;
    }
    const url = candidates[idx++];
    let resolved = false;
    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      tryNext();
    }, FETCH_CAP_MS);
    loadImageViaBackground(url,
      (dataUrl) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        const safe = isImageDataUrl(dataUrl) ? dataUrl : '';
        window.__gbOpenImagePreview({ url, dataUrl: safe, itemLink });
      },
      () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        tryNext();
      }
    );
  };
  tryNext();
}

// ── Floating hover affordance ─────────────────────────────────

let hoverBtn = null;
let hoverTarget = null;
let hoverHideTimer = null;

function ensureHoverBtn() {
  if (hoverBtn) return hoverBtn;

  // Liquid-glass circle button — same color tokens / blur as the overlay
  // chips on the React ImagePreview so the page-injected affordance reads
  // as part of the same UI family. Icon-only (no label) so it sits on top
  // of small thumbnails without obscuring them.
  const btn = document.createElement('div');
  btn.id = '__gb-img-hover-btn';
  btn.innerHTML = `
    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
    </svg>
  `;
  btn.style.cssText = `
    position: fixed !important; display: flex !important; align-items: center !important; justify-content: center !important;
    width: 32px !important; height: 32px !important;
    background: color-mix(in srgb, var(--gb-surface-1, #1a1a1a) 70%, transparent) !important;
    backdrop-filter: blur(8px) saturate(1.2) !important; -webkit-backdrop-filter: blur(8px) saturate(1.2) !important;
    color: var(--gb-brand-label, #7db82a) !important;
    border: 1px solid color-mix(in srgb, var(--gb-border-default, #444) 60%, transparent) !important;
    border-radius: 50% !important; padding: 0 !important;
    cursor: pointer !important; z-index: 999990 !important; pointer-events: auto !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18), inset 0 0 0 1px rgba(255, 255, 255, 0.04) !important;
    opacity: 0 !important;
    transition: opacity .15s ease, transform .18s cubic-bezier(.34,1.4,.64,1), background .15s ease, color .15s ease, border-color .15s ease !important;
    transform: scale(.88) translateY(3px) !important; user-select: none !important;
  `;

  btn.addEventListener('mouseenter', () => {
    clearTimeout(hoverHideTimer);
    btn.style.setProperty('background', 'color-mix(in srgb, var(--gb-brand-label, #7db82a) 30%, var(--gb-surface-1, #1a1a1a))', 'important');
    btn.style.setProperty('color', '#ffffff', 'important');
    btn.style.setProperty('border-color', 'color-mix(in srgb, var(--gb-brand-label, #7db82a) 70%, transparent)', 'important');
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.setProperty('background', 'color-mix(in srgb, var(--gb-surface-1, #1a1a1a) 70%, transparent)', 'important');
    btn.style.setProperty('color', 'var(--gb-brand-label, #7db82a)', 'important');
    btn.style.setProperty('border-color', 'color-mix(in srgb, var(--gb-border-default, #444) 60%, transparent)', 'important');
    hoverHideTimer = setTimeout(hideHoverBtn, 100);
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const target = hoverTarget;
    hideHoverBtn();
    if (!target) return;

    const src        = target.getAttribute('src');
    const directLink = target.__gbDirectLink || null;
    const itemLink   = findItemLinkForImage(target);

    if (e.shiftKey) {
      if (directLink) {
        const a = document.createElement('a');
        a.href = directLink; a.download = filenameFromPath(directLink);
        a.target = '_blank'; a.rel = 'noopener';
        document.body.appendChild(a); a.click(); a.remove();
      } else {
        headlessDownload(src);
      }
    } else {
      extractAndShow(src, directLink, itemLink);
    }
  });

  document.body.appendChild(btn);
  hoverBtn = btn;
  return btn;
}

function positionHoverBtn(img) {
  const btn  = ensureHoverBtn();
  const rect = img.getBoundingClientRect();
  const bw = btn.offsetWidth  || 32;
  const bh = btn.offsetHeight || 32;
  btn.style.left = Math.round(rect.left + (rect.width  - bw) / 2) + 'px';
  btn.style.top  = Math.round(rect.top  + (rect.height - bh) / 2) + 'px';
}

function showHoverBtn(img) {
  clearTimeout(hoverHideTimer);
  hoverTarget = img;
  positionHoverBtn(img);
  const btn = ensureHoverBtn();
  btn.style.setProperty('opacity',   '0',                           'important');
  btn.style.setProperty('transform', 'scale(.88) translateY(3px)', 'important');
  requestAnimationFrame(() => {
    btn.style.setProperty('opacity',   '1',                     'important');
    btn.style.setProperty('transform', 'scale(1) translateY(0)', 'important');
  });
}

function hideHoverBtn() {
  if (!hoverBtn) return;
  hoverBtn.style.setProperty('opacity',   '0',                           'important');
  hoverBtn.style.setProperty('transform', 'scale(.88) translateY(3px)', 'important');
  hoverTarget = null;
}

function attachHover(img) {
  if (img.__gbHoverAttached) return;
  img.__gbHoverAttached = true;
  if (!img.__gbDirectLink) img.__gbDirectLink = findDirectLink(img);
  img.addEventListener('mouseenter', () => showHoverBtn(img));
  img.addEventListener('mouseleave', () => {
    hoverHideTimer = setTimeout(hideHoverBtn, 100);
  });
}

function scanForRenderImages() {
  if (window.__gbFeatureFlags?.imagePreviewEnabled === false) return;
  document.querySelectorAll('img').forEach((img) => {
    if (isRenderAspxImg(img) || findDirectLink(img)) {
      attachHover(img);
    }
  });
}

// Exposes the page globals that src/vanilla/main.js drives (initial scan,
// MutationObserver, feature-flag toggle). Idempotent — safe to call once
// per content-script load.
export function installLogoArming() {
  window.__gbScanForRenderImages = scanForRenderImages;
  window.__gbHideHoverBtn = hideHoverBtn;
}
