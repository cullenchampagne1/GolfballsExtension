/*
 * Pause coordination for the bulk-email runner.
 *
 * Cancellation and pausing intentionally use separate controls. Cancelling
 * invalidates the EmailRunner token and clears the run UI; pausing holds the
 * same token at a safe checkpoint so counts, row states, and the remaining
 * queue stay intact.
 */

export function createPauseGate() {
  let paused = false;
  const waiters = new Set();

  const releaseWaiters = () => {
    for (const resolve of waiters) resolve();
    waiters.clear();
  };

  return {
    get paused() { return paused; },

    pause() {
      if (paused) return false;
      paused = true;
      return true;
    },

    resume() {
      if (!paused) return false;
      paused = false;
      releaseWaiters();
      return true;
    },

    /* Reset also releases a paused checkpoint. EmailRunner calls this when a
       run is cancelled, the popup closes, or managed access is revoked. */
    reset() {
      const changed = paused || waiters.size > 0;
      paused = false;
      releaseWaiters();
      return changed;
    },

    async waitUntilResumed(isActive = () => true) {
      while (paused && isActive()) {
        await new Promise((resolve) => waiters.add(resolve));
      }
      return isActive();
    },
  };
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* A pacing delay whose remaining time stops advancing while the gate is
   paused. It resolves false when the owning run token is no longer active. */
export async function waitForPausableDelay({
  durationMs,
  pauseGate,
  isActive = () => true,
  onProgress,
  tickMs = 80,
  sleep = defaultSleep,
  now = Date.now,
}) {
  const total = Math.max(0, Number(durationMs) || 0);
  let remaining = total;
  onProgress?.({ remaining, total });

  while (remaining > 0 && isActive()) {
    if (pauseGate?.paused) {
      const active = await pauseGate.waitUntilResumed(isActive);
      if (!active) return false;
      continue;
    }

    const startedAt = now();
    await sleep(Math.min(Math.max(1, tickMs), remaining));
    const elapsed = Math.max(0, now() - startedAt);

    /* A pause can land while the short timer is pending. Do not charge that
       slice against the pacing countdown; at worst this preserves one extra
       tick, which is safer than letting a paused queue advance. */
    if (!pauseGate?.paused) remaining = Math.max(0, remaining - elapsed);
    onProgress?.({ remaining, total });
  }

  return isActive();
}
