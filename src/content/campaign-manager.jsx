import React from 'react';
import { mountFloating } from '../lib/mountFloating.js';
import { ensureTheme } from '../lib/theme.js';
import { ensureScales } from '../lib/scales.js';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import { CampaignManager } from '../modals/CampaignManager.jsx';

/* ───────────────────────────────────────────────────────────────
   campaign-manager.jsx — content-script entry for the Campaign
   Manager surface.

   Exposes:
     window.__gbOpenCampaignManager(contacts)
       Mounts the full-page manager over the page. `contacts` is the
       audience handed off from CRM Search / Task List (the same
       { contactId, contactName, contactUrl } shape EmailRunner
       receives). The manager owns the editor, the run engine, and
       the audience run view.
─────────────────────────────────────────────────────────────── */

if (!window.__gbCampaignManagerLoaded) {
  window.__gbCampaignManagerLoaded = true;
  ensureTheme();
  ensureScales();

  const HOST_ID = '__gb-campaign-manager';

  window.__gbOpenCampaignManager = function (contacts = []) {
    if ((window.__gbFeatureFlags || {}).campaignManagerEnabled === false) return;
    mountFloating(HOST_ID, ({ onClosed }) => (
      <ToastHost installGlobal={false}>
        <CampaignManager onClose={onClosed} contacts={Array.isArray(contacts) ? contacts : []} />
      </ToastHost>
    ));
  };
}
