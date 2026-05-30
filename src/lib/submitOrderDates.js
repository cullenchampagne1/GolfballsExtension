/* ───────────────────────────────────────────────────────────────
   submitOrderDates.js — order approval/commitment date update.

   Ported from the save flow in src/vanilla/calendar.js. The REAL path
   posts GB_CALENDAR_SAVE down to the admin.icustomize.com iframe (its
   calendar-bridge.js runs the 3-step ASP.NET postback chain) and
   receives step/done/error back through window.__gbActiveCalendar,
   which src/vanilla/main.js relays from the iframe's postMessages.

   With NO calendarUrl (or no chrome runtime) it runs the dev
   simulation, so the modal is fully exercisable in the playground.

   Progress is surfaced through a CENTERED step notification (StepToast)
   via runOrderDateUpdate() — replacing the old in-modal loading view.
─────────────────────────────────────────────────────────────── */

export const ORDER_DATE_STEPS = ['Selecting approval date', 'Selecting commitment date', 'Saving to server'];

/* ASP.NET day offset from 2000-01-01 — the wire format the calendar
   postback chain expects (verbatim from the legacy save payload). */
function aspOffset(d) {
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2000, 0, 1)) / 86400000);
}

const hasChromeRuntime = () => {
  try { return typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage; } catch { return false; }
};

/**
 * Run the date update.
 *   onStep(stepIndex0Based, label?) · onDone() · onError(message)
 * Dev simulation when there's no calendarUrl / chrome runtime.
 */
export function submitOrderDates({ calendarUrl, approval, commitment, onStep, onDone, onError }) {
  if (!approval || !commitment) { onError?.('Pick both dates first'); return; }

  /* ── Dev / playground simulation ── */
  if (!calendarUrl || !hasChromeRuntime()) {
    let step = 0;
    onStep?.(0, `${ORDER_DATE_STEPS[0]}…`);
    const iv = setInterval(() => {
      step += 1;
      if (step >= ORDER_DATE_STEPS.length) { clearInterval(iv); onDone?.(); return; }
      onStep?.(step, `${ORDER_DATE_STEPS[step]}…`);
    }, 650);
    return;
  }

  /* ── Real path — the iframe bridge runs the postback chain ──
     Register callbacks main.js drives from GB_CALENDAR_STEP/DONE/ERROR,
     then post the save down. The iframe emits 1-based step numbers. */
  window.__gbActiveCalendar = {
    onStep: (step, label) => onStep?.(Math.max(0, (parseInt(step, 10) || 1) - 1), label),
    onDone: () => { window.__gbActiveCalendar = null; onDone?.(); },
    onError: (err) => { window.__gbActiveCalendar = null; onError?.(err); },
  };
  try {
    chrome.runtime.sendMessage({
      action: 'broadcastToFrames',
      payload: {
        action: 'GB_CALENDAR_SAVE',
        calendarUrl,
        approvalOffset: String(aspOffset(approval)),
        commitmentOffset: String(aspOffset(commitment)),
      },
    });
  } catch (err) {
    window.__gbActiveCalendar = null;
    onError?.(err?.message || String(err));
  }
}

/**
 * Fire a CENTERED step notification and drive it through the date
 * update. `toast` must be a persistent host (window.__gbToast on a real
 * page, the playground's toast) so it survives the modal closing.
 */
export function runOrderDateUpdate(toast, { orderID, calendarUrl, approval, commitment } = {}) {
  if (!toast?.step) return;
  const id = toast.step({
    steps: ORDER_DATE_STEPS,
    currentStep: 0,
    title: orderID ? `Updating order #${orderID} dates…` : 'Updating order dates…',
    placement: 'top-center',
  });
  submitOrderDates({
    calendarUrl, approval, commitment,
    onStep: (i) => toast.update?.(id, { currentStep: i }),
    onDone: () => {
      toast.update?.(id, { currentStep: ORDER_DATE_STEPS.length });
      setTimeout(() => {
        toast.dismiss?.(id);
        toast.success?.('Order dates updated', { placement: 'top-center', duration: 2600 });
      }, 700);
    },
    onError: (msg) => {
      toast.dismiss?.(id);
      toast.error?.(`Date update failed: ${msg || 'unknown error'}`, { placement: 'top-center', duration: 5000 });
    },
  });
}
