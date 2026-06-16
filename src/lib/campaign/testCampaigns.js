/* ───────────────────────────────────────────────────────────────
   campaign/testCampaigns.js — built-in "logic test" campaigns.

   These run against the REAL selected audience but never send: every
   step is a `custom` step, and the Campaign Manager forces dry-run for
   any `_test` campaign, so actions short-circuit to a simulated success
   (see actions.js → runCustom dry-run). What they actually exercise is
   the ENGINE's gating logic — conditions, group mutual-exclusion, branch
   taken / not-taken, child gating, the run-wide send cap, and kill-flow.

   Each step carries an `_expect` the runner checks per contact and logs
   as a ✓/✗ assertion (see useCampaignRunner). `_expect.status` is one of
   the engine's emitted statuses — 'ran' | 'skipped' | 'failed' — plus a
   synthetic 'cut', verified by the ABSENCE of a step result (a step the
   engine never reached because a branch fired or the flow was killed).

   These objects are ephemeral: they're loaded into the editor unsaved,
   not persisted, so they never go through store.normalize (which would
   strip `_test` / `_expect`).
─────────────────────────────────────────────────────────────── */

import { uid } from './store.js';
import { emptyTree } from '../matchEngine.js';

/* A condition tree that can never pass on real CRM data: "order count ≥
   1,000,000,000". Any real value (or a null when a signal can't resolve)
   fails it, so the engine deterministically skips with reason
   'conditions' — no dependence on the particular contact. */
function impossibleCond() {
  return {
    outerJoiner: 'AND',
    groups: [{
      joiner: 'AND',
      conditions: [{ source: 'signal', ref: 'order.count', type: 'number', op: 'gte', value: '999999999', not: false }],
    }],
  };
}

/* A full step in the new shape (mirrors store.newStep) so the editor can
   render it, plus the test-only `_expect`. Defaults to an inert custom
   step with empty (always-pass) conditions. */
function step(over) {
  return {
    id: uid('s'),
    kind: 'custom',
    label: 'Step',
    group: '',
    parentId: null,
    branch: false,
    templateId: '',
    variationWeights: {},
    taskMode: 'create',
    useCustom: false,
    custom: {},
    code: '',
    kill: false,
    conditions: emptyTree(),
    ...over,
  };
}

function campaign(over) {
  return {
    id: uid('cmptest'),
    name: 'Logic test',
    status: 'Draft',
    paceDelay: 0,        // no pacing — tests should rip through the audience
    paceJitter: 0,
    suppressBounced: true,
    suppressMailerRemoved: true,
    suppressDoNotContact: true,
    sendCap: 0,
    audienceOrder: 'list',
    steps: [],
    lastSaved: null,
    _test: true,
    _testNote: '',
    ...over,
  };
}

/* The suite. Each campaign isolates one gate family so the
   branch-stops-the-main-path semantics don't bleed across tests. */
export function buildTestCampaigns() {
  // Conditions + group mutual-exclusion.
  const conditions = campaign({
    name: '🧪 Test · Conditions & Groups',
    _testNote: 'An unconditional step fires; an impossible condition is skipped; a group fires once then excludes its peers.',
    steps: [
      step({ label: 'Unconditional send', _expect: { status: 'ran' } }),
      step({ label: 'Blocked by condition', conditions: impossibleCond(), _expect: { status: 'skipped', reason: 'conditions' } }),
      step({ label: 'Group A · first', group: 'gtest-A', _expect: { status: 'ran' } }),
      step({ label: 'Group A · second (excluded)', group: 'gtest-A', _expect: { status: 'skipped', reason: 'group-already-fired' } }),
    ],
  });

  // Branch taken → its child runs, the rest of the main path is cut.
  const branchTaken = (() => {
    const b = step({ label: 'Branch (fires)', branch: true, _expect: { status: 'ran' } });
    return campaign({
      name: '🧪 Test · Branch taken + child',
      _testNote: 'A branch fires, runs its child, and stops the contact’s main path (later main steps are never reached).',
      steps: [
        b,
        step({ label: 'Child of branch', parentId: b.id, _expect: { status: 'ran' } }),
        step({ label: 'Main step after branch', _expect: { status: 'cut' } }),
      ],
    });
  })();

  // Branch NOT taken → its child is gated out, the main path continues.
  const branchNotTaken = (() => {
    const b = step({ label: 'Branch (blocked)', branch: true, conditions: impossibleCond(), _expect: { status: 'skipped', reason: 'conditions' } });
    return campaign({
      name: '🧪 Test · Branch not taken',
      _testNote: 'A branch whose condition fails does not fire; its child is skipped (branch-not-taken) and the main path keeps going.',
      steps: [
        b,
        step({ label: 'Child of blocked branch', parentId: b.id, _expect: { status: 'skipped', reason: 'branch-not-taken' } }),
        step({ label: 'Main step after branch', _expect: { status: 'ran' } }),
      ],
    });
  })();

  // Run-wide send cap. Note: the cap is across the whole run, so once it
  // trips the engine stops working further contacts — the first contact
  // demonstrates the gate.
  const sendCap = campaign({
    name: '🧪 Test · Send cap',
    sendCap: 2,
    _testNote: 'The run-wide send cap (2) lets the first two sends through, then skips with reason “cap” and halts the run.',
    steps: [
      step({ label: 'Send 1 (under cap)', _expect: { status: 'ran' } }),
      step({ label: 'Send 2 (reaches cap)', _expect: { status: 'ran' } }),
      step({ label: 'Send 3 (capped)', _expect: { status: 'skipped', reason: 'cap' } }),
    ],
  });

  // Kill flow — a custom step ends the contact's whole path.
  const killFlow = campaign({
    name: '🧪 Test · Kill flow',
    _testNote: 'A kill step runs, then stops the contact’s flow — every later step is cut.',
    steps: [
      step({ label: 'Step before kill', _expect: { status: 'ran' } }),
      step({ label: 'Kill step', kill: true, _expect: { status: 'ran' } }),
      step({ label: 'Step after kill', _expect: { status: 'cut' } }),
    ],
  });

  return [conditions, branchTaken, branchNotTaken, sendCap, killFlow];
}
