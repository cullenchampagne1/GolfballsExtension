import React from 'react';

import { mountFloating } from '../lib/mountFloating.js';
import { ensureTheme } from '../lib/theme.js';
import { ensureScales } from '../lib/scales.js';
import { CATALOG_MOUNT_SCALE_CATEGORY } from '../lib/catalogPresentation.js';
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
    mountFloating(HOST_ID, ({ onClosed, bindClose }) => (
      <ToastHost installGlobal={false}>
        <MockupStudio onClose={onClosed} bindClose={bindClose} />
      </ToastHost>
    ), { scaleCategory: CATALOG_MOUNT_SCALE_CATEGORY });
  };
}
