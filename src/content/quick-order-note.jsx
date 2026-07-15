import React from 'react';
import { mountFloating } from '../lib/mountFloating.js';
import { ensureTheme } from '../lib/theme.js';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import { QuickOrderNote } from '../modals/QuickOrderNote.jsx';
import { submitOrderNote } from '../lib/submitOrderNote.js';

if (!window.__gbQuickOrderNoteLoaded) {
  window.__gbQuickOrderNoteLoaded = true;
  ensureTheme();

  window.__gbShowQuickOrderNoteModal = function (options = {}) {
    const orderId = options.orderId || window.location.href.match(/[?&]orderID=(\d+)/i)?.[1] || '';
    mountFloating('__gb-quick-order-note-modal', ({ onClosed, bindClose }) => (
      <ToastHost installGlobal={false}>
        <QuickOrderNote orderId={orderId} onSubmit={submitOrderNote} onClosed={onClosed} bindClose={bindClose} />
      </ToastHost>
    ));
  };
}
