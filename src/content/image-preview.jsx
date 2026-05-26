import React from 'react';
import { mountFloating } from '../lib/mountFloating.js';
import { ensureTheme } from '../lib/theme.js';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import { ImagePreview } from '../modals/ImagePreview.jsx';

/* ───────────────────────────────────────────────────────────────
   image-preview.jsx — content-script entry for the Image Preview
   modal (a.k.a. the legacy "logo extractor" modal, now React).

   Exposes two opener globals:

     window.__gbOpenImagePreview(opts)
       Production entry. Called when an image is identified on the
       host page (CRM page button, paste, drop, etc.). `opts` may
       include `{ url, itemLink }` to seed the modal with a known
       image; if omitted, the modal opens in drop-zone state so the
       user can paste / drop a URL or file.

     window.__gbDevOpenImageModal()
       Dev entry — fires from content/main.js's dev panel
       (devFireModal → image-viewer). Opens with a placeholder SVG
       so the modal can be inspected without a real page context.

   This script LOADS AFTER content/logo-extractor.js in the manifest,
   so our window.__gbDevOpenImageModal definition wins (overwrites
   the legacy one). The production logo-extraction code in
   logo-extractor.js stays intact until that path is migrated too —
   for now, both files coexist and the React modal is what dev opens.

   The "Submit Proof" hand-off goes through window.__gbOpenSubmitProof
   (defined by submit-proof.jsx) so the two modals stay decoupled.
─────────────────────────────────────────────────────────────── */

if (!window.__gbImagePreviewLoaded) {
  window.__gbImagePreviewLoaded = true;
  ensureTheme();

  const HOST_ID = '__gb-imp';

  window.__gbOpenImagePreview = function (opts = {}) {
    mountFloating(HOST_ID, ({ onClosed, bindClose }) => (
      <ToastHost installGlobal={false}>
        <ImagePreview
          url={opts.url || ''}
          dataUrl={opts.dataUrl || ''}
          itemLink={opts.itemLink || null}
          onClosed={onClosed}
          bindClose={bindClose}
          onLaunchSubmitProof={(image) => {
            // Pass through to the submit-proof opener — that script
            // owns its own mount and toast host so the two modals
            // can run independently (proof can outlive preview).
            if (typeof window.__gbOpenSubmitProof === 'function') {
              window.__gbOpenSubmitProof({
                image,
                orderId: opts.orderId,
                customerId: opts.customerId,
              });
            }
          }}
        />
      </ToastHost>
    ));
  };

  // Dev placeholder — keeps the global signature compatible with the
  // legacy version so content/main.js's devFireModal dispatcher just
  // works without changes.
  window.__gbDevOpenImageModal = function () {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="280" viewBox="0 0 400 280">',
      '<rect width="400" height="280" fill="#1a1a1a" rx="12"/>',
      '<circle cx="200" cy="118" r="55" fill="none" stroke="#7db82a" stroke-width="2.5"/>',
      '<circle cx="200" cy="118" r="7" fill="#7db82a"/>',
      '<path d="M148 195 Q175 158 200 178 Q225 198 252 168 Q268 150 285 163" fill="none" stroke="#7db82a" stroke-width="2.2" stroke-linecap="round"/>',
      '<text x="200" y="238" text-anchor="middle" fill="#7db82a" font-family="sans-serif" font-size="12" font-weight="bold">DEV - Logo Placeholder</text>',
      '<text x="200" y="256" text-anchor="middle" fill="#555" font-family="sans-serif" font-size="10">golfballs.com - TEST-1234</text>',
      '</svg>',
    ].join('');
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    window.__gbOpenImagePreview({ url, orderId: 'TEST-1234', customerId: 'DEV-CUST-99' });
  };
}
