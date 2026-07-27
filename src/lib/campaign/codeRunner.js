/* ───────────────────────────────────────────────────────────────
   campaign/codeRunner — policy-complete audience runner for code campaigns.

   The UI owns React state; this module owns execution semantics. Each selected
   record is hydrated before its program runs, then the existing code engine
   invokes the existing CRM helper executor in trace order.
─────────────────────────────────────────────────────────────── */

import {
  campaignActionCap,
  campaignPaceMs,
  campaignSuppressionReason,
  orderCampaignAudience,
} from './runPolicy.js';

const noop = () => {};

async function pauseAwareDelay(ms, control = {}) {
  let remaining = Math.max(0, Number(ms) || 0);
  while (remaining > 0) {
    if (control.isStopped?.()) return false;
    while (control.isPaused?.() && !control.isStopped?.()) {
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    if (control.isStopped?.()) return false;
    const slice = Math.min(120, remaining);
    await new Promise((resolve) => setTimeout(resolve, slice));
    remaining -= slice;
  }
  return !control.isStopped?.();
}

/**
 * Execute one code program per audience record.
 *
 * Required callbacks:
 *   prepareContact(contact, orderedAudience) -> { context, page }
 *   executeProgram({ contact, prepared, beforeEffect, onEffect }) -> result
 */
export async function runCodeCampaign({
  campaign,
  audience,
  prepareContact,
  executeProgram,
  control = {},
  on = {},
  dryRun = false,
  random = Math.random,
  delay = pauseAwareDelay,
} = {}) {
  if (typeof prepareContact !== 'function') throw new Error('Campaign runner needs prepareContact');
  if (typeof executeProgram !== 'function') throw new Error('Campaign runner needs executeProgram');

  const ordered = orderCampaignAudience(audience, campaign?.audienceOrder, random);
  const total = ordered.length;
  const cap = campaignActionCap(campaign);
  const results = [];
  let effectCount = 0;
  let attemptedEffect = false;

  const onContactStart = on.contactStart || noop;
  const onContactDone = on.contactDone || noop;
  const onProgress = on.progress || noop;
  const onComplete = on.complete || noop;
  const onEffectEvent = on.effect || noop;

  for (let index = 0; index < ordered.length; index += 1) {
    if (control.isStopped?.()) break;
    if (cap && effectCount >= cap) {
      for (let pending = index; pending < ordered.length; pending += 1) {
        const summary = {
          contact: ordered[pending],
          status: 'skipped',
          ran: 0,
          trace: [],
          suppressReason: 'action-cap',
          error: null,
        };
        results.push(summary);
        onContactDone(summary);
        onProgress({ done: pending + 1, total, effects: effectCount });
      }
      break;
    }
    while (control.isPaused?.() && !control.isStopped?.()) {
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    if (control.isStopped?.()) break;

    const contact = ordered[index];
    onContactStart(contact, index);
    onProgress({ done: index, total, effects: effectCount });

    let prepared;
    try {
      prepared = await prepareContact(contact, ordered);
    } catch (error) {
      const summary = {
        contact,
        status: 'failed',
        ran: 0,
        trace: [],
        error: String(error?.message || error),
      };
      results.push(summary);
      onContactDone(summary);
      onProgress({ done: index + 1, total, effects: effectCount });
      continue;
    }

    const suppressReason = campaignSuppressionReason(campaign, prepared.context);
    if (suppressReason) {
      const summary = {
        contact,
        status: 'skipped',
        ran: 0,
        trace: [],
        suppressReason,
        error: null,
      };
      results.push(summary);
      onContactDone(summary);
      onProgress({ done: index + 1, total, effects: effectCount });
      continue;
    }

    const beforeEffect = async () => {
      if (cap && effectCount >= cap) {
        return { allow: false, reason: 'Campaign action cap reached' };
      }
      if (!dryRun && attemptedEffect) {
        const waited = await delay(campaignPaceMs(campaign, random), control);
        if (!waited) return { allow: false, reason: 'Campaign stopped' };
      }
      attemptedEffect = true;
      return { allow: true };
    };
    const onEffect = async (event) => {
      if (event.status === 'ran') effectCount += 1;
      try {
        await onEffectEvent({
          contact,
          index,
          event,
          effects: effectCount,
        });
      } catch {
        // Presentation/telemetry must never turn a successful CRM effect into
        // a failed campaign. The trace remains the execution authority.
      }
    };

    let result;
    try {
      result = await executeProgram({
        contact,
        prepared,
        beforeEffect,
        onEffect,
        remainingEffects: cap ? Math.max(0, cap - effectCount) : Infinity,
      });
    } catch (error) {
      result = { ok: false, trace: [], error: String(error?.message || error), result: null };
    }

    const trace = Array.isArray(result?.trace) ? result.trace : [];
    // Function-entry traces animate Simulate but are not CRM effects and must
    // not inflate live-run action counts.
    const ran = trace.filter((entry) => entry.kind !== 'function' && entry.status === 'ran').length;
    const failed = !result?.ok || trace.some((entry) => entry.status === 'failed');
    const summary = {
      contact,
      status: failed ? 'failed' : ran ? 'sent' : 'skipped',
      ran,
      trace,
      result: result?.result ?? null,
      error: result?.error || null,
    };
    results.push(summary);
    onContactDone(summary);
    onProgress({ done: index + 1, total, effects: effectCount });
  }

  const stopped = !!control.isStopped?.();
  const output = { stopped, results, effects: effectCount, total };
  onComplete(output);
  return output;
}
