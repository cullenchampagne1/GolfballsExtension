import React from 'react';
import { mountFloating } from '../lib/mountFloating.js';
import { ensureTheme } from '../lib/theme.js';
import { ensureScales } from '../lib/scales.js';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import { WorkflowManager } from '../modals/WorkflowManager.jsx';

/* ───────────────────────────────────────────────────────────────
   workflow-manager.jsx — content-script entry for the Workflow
   Manager surface.

   Exposes:
     window.__gbOpenWorkflowManager(contacts)
       Mounts the full-page manager over the page. `contacts` is the
       audience handed off from CRM Search / Task List (the same
       { contactId, contactName, contactUrl } shape EmailRunner
       receives). The manager owns the editor, the run engine, and
       the audience run view.
─────────────────────────────────────────────────────────────── */

if (!window.__gbWorkflowManagerLoaded) {
  window.__gbWorkflowManagerLoaded = true;
  ensureTheme();
  ensureScales();

  const HOST_ID = '__gb-workflow-manager';

  window.__gbOpenWorkflowManager = function (contacts = []) {
    if ((window.__gbFeatureFlags || {}).workflowManagerEnabled === false) return;
    mountFloating(HOST_ID, ({ onClosed }) => (
      <ToastHost installGlobal={false}>
        <WorkflowManager onClose={onClosed} contacts={Array.isArray(contacts) ? contacts : []} />
      </ToastHost>
    ), { scaleCategory: null });
  };
}
