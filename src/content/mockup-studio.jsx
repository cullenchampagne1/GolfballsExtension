import React from 'react';

import { mountFloating } from '../lib/mountFloating.js';
import { ensureTheme } from '../lib/theme.js';
import { ensureScales } from '../lib/scales.js';
import {
  normalizeProductGenerationBatchId,
  PRODUCT_GENERATION_OPEN_BATCH_EVENT,
} from '../lib/productGenerationClient.js';
import { MockupStudio } from '../modals/MockupStudio.jsx';
import { ToastHost } from '../ui/components/ToastHost.jsx';

/* Global Product Mockup Studio entry. It deliberately has no CRM context
   requirement, so the Actions Shelf can open it from every supported page. */
if (!window.__gbMockupStudioLoaded) {
  window.__gbMockupStudioLoaded = true;
  ensureTheme();
  ensureScales();

  const HOST_ID = '__gb-mockup-studio';

  window.__gbOpenMockupStudio = function (requestedBatchId) {
    if ((window.__gbFeatureFlags || {}).mockupStudioEnabled === false) return;
    const rawBatchId = String(requestedBatchId || '').trim();
    const batchId = normalizeProductGenerationBatchId(rawBatchId);
    // A supplied identifier is an action payload, not a generic toggle.
    // Reject malformed values instead of accidentally closing the studio.
    if (rawBatchId && !batchId) return;

    // mountFloating intentionally toggles an existing surface closed. A
    // notification deep-link should instead retarget the gallery already on
    // screen, so deliver that intent to the mounted studio in place.
    if (batchId && document.getElementById(HOST_ID)) {
      window.dispatchEvent(new CustomEvent(
        PRODUCT_GENERATION_OPEN_BATCH_EVENT,
        { detail: { batchId } },
      ));
      return;
    }

    // The studio is a plain flex modal with no CSS grid of its own, so the
    // shared Modals zoom applies cleanly here — unlike the Gift Catalog, which
    // opts out because `zoom` rounds its grid rows into each other.
    mountFloating(HOST_ID, ({ onClosed, bindClose }) => (
      <ToastHost installGlobal={false}>
        <MockupStudio
          initialBatchId={batchId}
          onClose={onClosed}
          bindClose={bindClose}
        />
      </ToastHost>
    ));
  };
}
