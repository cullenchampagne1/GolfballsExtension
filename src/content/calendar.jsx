import React from 'react';
import { mountFloating } from '../lib/mountFloating.js';
import { ensureTheme } from '../lib/theme.js';
import { CalendarModal } from '../modals/CalendarModal.jsx';
import { runOrderDateUpdate } from '../lib/submitOrderDates.js';

/* ───────────────────────────────────────────────────────────────
   calendar.jsx — content-script entry for the React Order Date
   Manager (replaces the legacy vanilla overlay in
   src/vanilla/calendar.js).

   window.__gbOpenOrderCalendar(data)
     Mounts the modal. `data` comes from the order iframe's
     calendar-bridge.js (posted up as GB_OPEN_CALENDAR, relayed by
     src/vanilla/main.js):
       { orderID, calendarUrl, defaultApproval, defaultCommitment }

   On "Update Dates" the picked dates run through runOrderDateUpdate,
   which fires a CENTERED step notification on the page-wide
   window.__gbToast (the actions-shelf host) — so the progress
   survives the modal closing — and posts GB_CALENDAR_SAVE down to the
   iframe to run the real ASP.NET postback chain.
─────────────────────────────────────────────────────────────── */

if (!window.__gbOrderCalendarLoaded) {
  window.__gbOrderCalendarLoaded = true;
  ensureTheme();

  const HOST_ID = '__gb-order-calendar';

  window.__gbOpenOrderCalendar = function (data = {}) {
    const { orderID, calendarUrl, defaultApproval, defaultCommitment } = data;
    mountFloating(HOST_ID, ({ onClosed, bindClose }) => (
      <CalendarModal
        orderID={orderID}
        defaultApproval={defaultApproval}
        defaultCommitment={defaultCommitment}
        onSubmit={({ approval, commitment }) => {
          runOrderDateUpdate(window.__gbToast, { orderID, calendarUrl, approval, commitment });
        }}
        onClosed={onClosed}
        bindClose={bindClose}
      />
    ));
  };
}
