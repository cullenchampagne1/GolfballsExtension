/**
 * Proposal stores — share saved proposals via the backend, mirroring the
 * custom-items product-store workflow. Tests the pure transport pieces
 * (normalize / build / parse); the backend link path is a thin
 * sendBackgroundMessage wrapper over the same /product-stores endpoint.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  normalizeProposalEntry, buildProposalStoreFile, parseProposalStoreFile,
  saveProposalDraft, removeSavedProposal, savedProposalsForSelection,
  linesFromSaved, saveCurrentProposal, loadCurrentProposal,
  saveProposalToOpportunity,
  buildProposalEmailCreatePayload, buildProposedOpportunityUpdate,
  submitProposalEmail,
  PROPOSAL_STORE_FILE_KIND, PROPOSAL_STORE_FILE_VERSION,
} from '../../src/lib/saveProposal.js';

const entry = () => ({
  id: 'prop-abc123',
  name: 'Fall gift picks',
  date: '2026-07-30',
  promotion: { promo: 'BUY12GET4FREE', promoType: 'FREE_QUANTITY' },
  lines: [{
    product: { id: 'P00WSY', title: 'Z-Star 8' },
    decoration: { engine: 'ballLogo' },
    variant: null,
    free: false,
    freeValue: null,
    splits: [{ qty: 12, price: 57.99 }],
  }],
});

describe('proposal store · normalize', () => {
  it('allowlists a saved-proposal entry to the persisted shape', () => {
    const n = normalizeProposalEntry({ ...entry(), junk: 'x', lines: [{ ...entry().lines[0], junk: 1 }] });
    assert.deepEqual(Object.keys(n).sort(), ['date', 'id', 'lines', 'name', 'promotion']);
    assert.equal(n.lines[0].junk, undefined, 'unknown line fields are dropped');
    assert.deepEqual(n.lines[0].splits, [{ qty: 12, price: 57.99 }]);
  });

  it('drops a promotion object with no promo and coerces split numbers', () => {
    const n = normalizeProposalEntry({ lines: [{ splits: [{ qty: '6', price: '10.5' }] }], promotion: { x: 1 } });
    assert.equal(n.promotion, null);
    assert.deepEqual(n.lines[0].splits, [{ qty: 6, price: 10.5 }]);
    assert.match(n.id, /^prop-/); // missing id gets a fresh one
    assert.equal(n.name, 'Untitled draft');
  });

  it('keeps an edited price through named-draft save and reload', async () => {
    const priorChrome = globalThis.chrome;
    const data = {};
    globalThis.chrome = {
      storage: { local: {
        get(key, callback) { callback({ [key]: structuredClone(data[key] || []) }); },
        set(values, callback) { Object.assign(data, structuredClone(values)); callback?.(); },
      } },
    };
    try {
      const proposal = [{
        id: 'live-line', productId: 'P01155', product: { id: 'P01155', title: 'Pro V1x' },
        decoration: { engine: 'ballLogo' },
        splits: [{ id: 'live-split', qty: 16, price: 59.99, priceEdited: true }],
      }];
      const { entry: saved } = await saveProposalDraft('Negotiated tiers', proposal);
      assert.deepEqual(saved.lines[0].splits, [
        { qty: 16, price: 59.99, priceEdited: true },
      ]);
      const [restored] = linesFromSaved(saved, () => 'fresh-id');
      assert.equal(restored.splits[0].priceEdited, true);
      assert.equal(restored.splits[0].price, 59.99);
    } finally {
      if (priorChrome === undefined) delete globalThis.chrome;
      else globalThis.chrome = priorChrome;
    }
  });

  it('keeps prior-order review state through reload and blocks an unresolved CRM save', async () => {
    const review = {
      status: 'review',
      previousTitle: 'Discontinued hat',
      currentTitle: '',
      previousPrice: 18.5,
      currentPrice: null,
      score: 0,
      reason: 'No unambiguous current item was found.',
    };
    const [restored] = linesFromSaved({
      lines: [{ ...entry().lines[0], unavailable: true, refresh: review }],
    }, () => 'fresh-id');

    assert.equal(restored.unavailable, true);
    assert.deepEqual(restored.refresh, review);
    await assert.rejects(
      saveProposalToOpportunity([restored], { opportunityID: '88', name: 'Unsafe reorder' }),
      /1 prior-order item need review/,
    );
  });
});

describe('proposal store · working draft ordering', () => {
  it('serializes rapid writes so reopening reads the newest price', async () => {
    const priorChrome = globalThis.chrome;
    const data = {};
    let writes = 0;
    globalThis.chrome = {
      storage: { local: {
        get(key, callback) { callback({ [key]: structuredClone(data[key] || []) }); },
        set(values, callback) {
          const delay = writes++ === 0 ? 20 : 0;
          setTimeout(() => { Object.assign(data, structuredClone(values)); callback?.(); }, delay);
        },
      } },
    };
    try {
      const line = (price) => [{
        id: 'line-1', productId: 'P01155', product: { id: 'P01155' },
        splits: [{ id: 'split-1', qty: 16, price, priceEdited: true }],
      }];
      const first = saveCurrentProposal(line(61.99));
      const latest = saveCurrentProposal(line(59.99));
      await Promise.all([first, latest]);
      const restored = await loadCurrentProposal();
      assert.equal(restored[0].splits[0].price, 59.99);
      assert.equal(restored[0].splits[0].priceEdited, true);
      assert.equal(restored[0].productId, 'P01155');
    } finally {
      if (priorChrome === undefined) delete globalThis.chrome;
      else globalThis.chrome = priorChrome;
    }
  });
});

describe('proposal library menu · delete and share selection', () => {
  it('shares exactly the checked live drafts as selection changes', () => {
    const proposals = [
      { ...entry(), id: 'prop-a', name: 'A' },
      { ...entry(), id: 'prop-b', name: 'B' },
      { ...entry(), id: 'prop-c', name: 'C' },
    ];

    assert.deepEqual(
      savedProposalsForSelection(proposals, new Set(['prop-a', 'prop-c'])).map((proposal) => proposal.id),
      ['prop-a', 'prop-c'],
    );
    assert.deepEqual(
      savedProposalsForSelection(proposals, new Set(['prop-c'])).map((proposal) => proposal.id),
      ['prop-c'],
    );
    assert.deepEqual(savedProposalsForSelection(proposals, new Set()), []);
  });

  it('deletes only the requested draft from persistent storage', async () => {
    const priorChrome = globalThis.chrome;
    const data = { gbSavedProposals: [
      { ...entry(), id: 'prop-a', name: 'A' },
      { ...entry(), id: 'prop-b', name: 'B' },
    ] };
    globalThis.chrome = { storage: { local: {
      get(key, callback) { callback({ [key]: structuredClone(data[key]) }); },
      set(values, callback) { Object.assign(data, structuredClone(values)); callback?.(); },
    } } };
    try {
      const remaining = await removeSavedProposal('prop-a');
      assert.deepEqual(remaining.map((proposal) => proposal.id), ['prop-b']);
      assert.deepEqual(data.gbSavedProposals.map((proposal) => proposal.id), ['prop-b']);
    } finally {
      if (priorChrome === undefined) delete globalThis.chrome;
      else globalThis.chrome = priorChrome;
    }
  });

  it('keeps delete visible and feeds the transfer panel the checked subset', () => {
    const source = readFileSync(new URL('../../src/modals/GiftCatalog.jsx', import.meta.url), 'utf8');
    assert.match(source, /title="Delete saved proposal"/);
    assert.match(source, />Confirm delete<\/Btn>/);
    assert.match(source, /mode=\{savedTransfer\.mode\} items=\{selectedSavedProposals\}/);
    assert.doesNotMatch(source, /const \[tagHover, setTagHover\]/);
  });
});

describe('proposal email · Proposed opportunity lifecycle', () => {
  it('builds native-shaped create and update payloads with Proposed stage 2', () => {
    assert.equal(buildProposalEmailCreatePayload({
      opportunityID: 456789, cartID: 'cart-1', contactId: 9633545,
    }).OpportunityStatus, '2');
    assert.deepEqual(buildProposedOpportunityUpdate({
      opportunityID: 456789, contactId: 9633545,
      subject: 'Fallback subject', expiration: '8/18/2026', total: 1536.7,
    }, {
      opportunityId: 456789,
      Subject: 'Corporate gifting', Description: 'Fall order',
      OpportunityStageId: 1, empAssignedId: 42, contactId: 9633545, LeadID: null,
    }), {
      opportunityId: '456789',
      Subject: 'Corporate gifting', Description: 'Fall order',
      EstimatedClosedDate: '08-18-2026', EstimatedValue: 1537,
      OpportunityStageId: '2', empAssignedId: '42', contactId: 9633545, LeadID: null,
    });
  });

  it('tracks the proposal and sends a full Proposed-stage opportunity update', async () => {
    const priorChrome = globalThis.chrome;
    const calls = [];
    globalThis.chrome = { runtime: {
      lastError: null,
      sendMessage(message, callback) {
        calls.push(structuredClone(message));
        if (message.url.includes('/Opportunity/Get.ajax?')) {
          callback({ ok: true, text: JSON.stringify({
            opportunityId: 456789, Subject: 'Corporate gifting', Description: '',
            EstimatedClosedDate: '08/01/2026', EstimatedValue: '1200',
            OpportunityStageId: 1, empAssignedId: 42, contactId: 9633545, LeadID: null,
          }) });
        } else callback({ ok: true, text: '{}' });
      },
    } };
    try {
      const result = await submitProposalEmail({
        opportunityID: 456789, cartID: 'cart-1', adminId: 77,
        contactId: 9633545, name: 'Pro V1x tiers',
        expiration: '8/18/2026', total: 1536.7,
      });
      assert.deepEqual(result, { ok: true, opportunityUpdated: true });
      const create = calls.find((call) => call.url.includes('/CreateProposalEmail.ajax?'));
      const update = calls.find((call) => call.url.includes('/Opportunity/Update.ajax?'));
      assert.equal(JSON.parse(decodeURIComponent(create.url.split('?')[1])).OpportunityStatus, '2');
      assert.deepEqual(JSON.parse(decodeURIComponent(update.url.split('?')[1])), {
        opportunityId: '456789', Subject: 'Corporate gifting', Description: '',
        EstimatedClosedDate: '08-18-2026', EstimatedValue: 1537,
        OpportunityStageId: '2', empAssignedId: '42', contactId: 9633545, LeadID: null,
      });
      assert.deepEqual(calls.map((call) => call.url.split('/').at(-1).split('?')[0]), [
        'CreateProposalEmail.ajax', 'TrackProposal.ajax', 'Get.ajax', 'Update.ajax',
      ]);
    } finally {
      if (priorChrome === undefined) delete globalThis.chrome;
      else globalThis.chrome = priorChrome;
    }
  });

  it('reports a partial success without sending an unsafe update when the opportunity cannot be read', async () => {
    const priorChrome = globalThis.chrome;
    const calls = [];
    globalThis.chrome = { runtime: {
      lastError: null,
      sendMessage(message, callback) {
        calls.push(structuredClone(message));
        if (message.url.includes('/Opportunity/Get.ajax?')) {
          callback({ ok: false, error: 'opportunity unavailable' });
        } else callback({ ok: true, text: '{}' });
      },
    } };
    try {
      const result = await submitProposalEmail({
        opportunityID: 456789, cartID: 'cart-1', adminId: 77,
        contactId: 9633545, expiration: '8/18/2026', total: 1536.7,
      });
      assert.equal(result.ok, true);
      assert.equal(result.opportunityUpdated, false);
      assert.match(result.warning, /opportunity unavailable/);
      assert.equal(calls.some((call) => call.url.includes('/Opportunity/Update.ajax?')), false);
    } finally {
      if (priorChrome === undefined) delete globalThis.chrome;
      else globalThis.chrome = priorChrome;
    }
  });
});

describe('proposal store · file transport', () => {
  it('build → parse round-trips the entries under a versioned envelope', () => {
    const file = buildProposalStoreFile('Set A', [entry()]);
    assert.equal(file.kind, PROPOSAL_STORE_FILE_KIND);
    assert.equal(file.schemaVersion, PROPOSAL_STORE_FILE_VERSION);
    const parsed = parseProposalStoreFile(JSON.stringify(file));
    assert.equal(parsed.name, 'Set A');
    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.items[0].id, 'prop-abc123');
    assert.deepEqual(parsed.items[0].lines[0].splits, [{ qty: 12, price: 57.99 }]);
  });

  it('rejects a non-proposal envelope (e.g. a product store) and bad input', () => {
    assert.throws(() => parseProposalStoreFile('not json'), /valid JSON/);
    assert.throws(() => parseProposalStoreFile(JSON.stringify({ kind: 'golfballs-product-store', schemaVersion: 1, name: 'x', items: [{ id: '1' }] })), /not a versioned Golfballs proposal store/);
    // Right kind but items aren't proposals (no `lines`) → rejected.
    assert.throws(
      () => parseProposalStoreFile(JSON.stringify({ kind: PROPOSAL_STORE_FILE_KIND, schemaVersion: 1, name: 'x', items: [{ id: '1', sku: 'ABC' }] })),
      /no proposals/,
    );
  });

  it('requires a name and at least one proposal to build', () => {
    assert.throws(() => buildProposalStoreFile('', [entry()]), /name is required/);
    assert.throws(() => buildProposalStoreFile('Set', []), /at least one/);
  });
});
