import React from 'react';
import { mountFloating } from '../lib/mountFloating.js';
import { ensureTheme } from '../lib/theme.js';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import { SubmitProof } from '../modals/SubmitProof.jsx';

/* ───────────────────────────────────────────────────────────────
   submit-proof.jsx — content-script entry for the Submit Proof
   modal.

   Exposes two opener globals:

     window.__gbOpenSubmitProof(opts)
       Production entry. Called by image-preview's "Submit Proof"
       button after the user finishes cropping/aligning a logo.
       opts: { image, orderId, customerId }

     window.__gbDevOpenProofModal()
       Dev entry — fires from content/main.js's devFireModal
       dispatcher. Opens with placeholder data so the modal can be
       inspected without a real page context.

   Loads AFTER content/logo-extractor.js in the manifest so our
   __gbDevOpenProofModal definition wins. The legacy production path
   (page-detected images) still uses logo-extractor.js until that's
   migrated separately.
─────────────────────────────────────────────────────────────── */

if (!window.__gbSubmitProofLoaded) {
  window.__gbSubmitProofLoaded = true;
  ensureTheme();

  const HOST_ID = '__gb-spm';

  window.__gbOpenSubmitProof = function (opts = {}) {
    // Tracks whether the proof form ever reached the "results" stage
    // (i.e. produced at least one successful proof link). The caller's
    // onClosed receives this flag so the ImagePreview wrapper can
    // distinguish a cancel ("restore me") from a finish ("close us both").
    let submittedFlag = false;
    mountFloating(HOST_ID, ({ onClosed: mountOnClosed, bindClose }) => (
      <ToastHost installGlobal={false}>
        <SubmitProof
          image={opts.image || null}
          orderId={opts.orderId || null}
          customerId={opts.customerId || null}
          onSubmitted={() => { submittedFlag = true; }}
          onClosed={() => {
            try { opts.onClosed?.(submittedFlag); } catch {}
            mountOnClosed();
          }}
          bindClose={bindClose}
        />
      </ToastHost>
    ));
  };

  window.__gbDevOpenProofModal = function () {
    window.__gbOpenSubmitProof({
      image: { url: 'dev://placeholder', name: 'Dev Placeholder' },
      orderId: 'TEST-1234',
      customerId: 'DEV-CUST-99',
    });
  };
}
