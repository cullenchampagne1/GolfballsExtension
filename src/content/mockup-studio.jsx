import React from 'react';

import { mountFloating } from '../lib/mountFloating.js';
import { ensureTheme } from '../lib/theme.js';
import { ensureScales } from '../lib/scales.js';
import { MockupStudio } from '../modals/MockupStudio.jsx';
import { ToastHost } from '../ui/components/ToastHost.jsx';

/* Global Product Mockup Studio entry. It deliberately has no CRM context
   requirement, so the Actions Shelf can open it from every supported page. */
if (!window.__gbMockupStudioLoaded) {
  window.__gbMockupStudioLoaded = true;
  ensureTheme();
  ensureScales();

  const HOST_ID = '__gb-mockup-studio';

  window.__gbOpenMockupStudio = function () {
    if ((window.__gbFeatureFlags || {}).mockupStudioEnabled === false) return;
    // The studio is a plain flex modal with no CSS grid of its own, so the
    // shared Modals zoom applies cleanly here — unlike the Gift Catalog, which
    // opts out because `zoom` rounds its grid rows into each other.
    mountFloating(HOST_ID, ({ onClosed, bindClose }) => (
      <ToastHost installGlobal={false}>
        <MockupStudio onClose={onClosed} bindClose={bindClose} />
      </ToastHost>
    ));
  };
}
