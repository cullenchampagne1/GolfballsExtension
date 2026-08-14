/** Opportunity action adapter: full hydration plus safe read/merge/write. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOpportunityPayload,
  createOpportunity,
  ensureOpenOpportunity,
  findOpenOpportunity,
  hydrateOpportunityRows,
  sourceUsesOpportunityRecords,
  updateOpportunityById,
} from '../../src/lib/crmOpportunities.js';
import {
  normalizeOpportunityRecord,
  normalizeOpportunityStageId,
  opportunityStageLabel,
  toOpportunityDate,
} from '../../src/lib/opportunityFields.js';

function response(value, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    async text() { return typeof value === 'string' ? value : JSON.stringify(value); },
  };
}

describe('crm opportunities · normalized full records', () => {
  it('accepts stage ids and human labels with flexible punctuation', () => {
    assert.equal(normalizeOpportunityStageId('Closed-Won'), '4');
    assert.equal(normalizeOpportunityStageId('closed lost'), '5');
    assert.equal(opportunityStageLabel(5), 'Closed - Lost');
    assert.equal(toOpportunityDate('2026-09-13'), '09-13-2026');
  });

  it('hydrates every table row through Opportunity/Get and preserves order', async () => {
    const calls = [];
    const rows = await hydrateOpportunityRows([
      { id: '11', subject: 'table one', owner: 'Ada' },
      { id: '12', subject: 'table two', owner: 'Grace' },
    ], {
      getOpportunity: async (id) => {
        calls.push(id);
        return {
          opportunityId: id,
          Subject: `Full ${id}`,
          Description: `Description ${id}`,
          EstimatedValue: id === '11' ? '1200.50' : '800',
          EstimatedClosedDate: '09-13-2026',
          OpportunityStageId: id === '11' ? 1 : 5,
          empAssignedId: 42,
          contactId: 99,
        };
      },
    });

    assert.deepEqual(calls.sort(), ['11', '12']);
    assert.deepEqual(rows.map((row) => row.id), ['11', '12']);
    assert.equal(rows[0].description, 'Description 11');
    assert.equal(rows[0].estimatedValue, 1200.5);
    assert.equal(rows[0].isClosed, false);
    assert.equal(rows[1].isLost, true);
    assert.equal(rows[1].owner, 'Grace');
  });

  it('normalizes all native editor fields and closed helpers', () => {
    const record = normalizeOpportunityRecord({
      opportunityId: 71,
      Subject: 'Renewal',
      Description: 'Annual order',
      EstimatedValue: '2700',
      EstimatedClosedDate: '10-01-2026',
      OpportunityStageId: 4,
      empAssignedId: 7,
      contactId: 42,
      LeadID: null,
    });
    assert.equal(record.subject, 'Renewal');
    assert.equal(record.stage, 'Closed - Won');
    assert.equal(record.assignedToId, '7');
    assert.equal(record.isClosed, true);
    assert.equal(record.isWon, true);
  });
});

describe('crm opportunities · safe writes', () => {
  const current = {
    opportunityId: 71,
    Subject: 'Old subject',
    Description: 'Keep this',
    EstimatedClosedDate: '08-01-2026',
    EstimatedValue: '1800',
    OpportunityStageId: 1,
    empAssignedId: 22,
    contactId: 42,
    LeadID: null,
  };

  it('builds a full payload while overlaying only approved edits', () => {
    assert.deepEqual(buildOpportunityPayload(current, {
      stage: 'Closed-Lost',
      estimated_close_date: '2026-09-13',
    }), {
      opportunityId: '71',
      Subject: 'Old subject',
      Description: 'Keep this',
      EstimatedClosedDate: '09-13-2026',
      EstimatedValue: 1800,
      OpportunityStageId: '5',
      empAssignedId: '22',
      contactId: 42,
      LeadID: null,
    });
  });

  it('GETs the latest record before sending a complete Update payload', async () => {
    const urls = [];
    const result = await updateOpportunityById('71', { stage: 'Closed - Lost' }, {
      origin: 'https://crm.example.test',
      fetchImpl: async (url) => {
        urls.push(url);
        if (url.includes('/Get.ajax?')) return response(current);
        return response({ success: true });
      },
    });

    assert.equal(urls.length, 2);
    assert.match(urls[0], /Opportunity\/Get\.ajax\?71$/);
    const updatePayload = JSON.parse(decodeURIComponent(urls[1].split('?')[1]));
    assert.equal(updatePayload.OpportunityStageId, '5');
    assert.equal(updatePayload.Description, 'Keep this');
    assert.equal(result.ok, true);
  });

  it('creates a native-shaped opportunity for the current contact', async () => {
    let url = '';
    const result = await createOpportunity({
      subject: 'August Order',
      estimatedCloseDate: '2026-09-13',
      estimatedValue: 2450.25,
      stage: 'Open',
    }, {
      contactId: '42',
      origin: 'https://crm.example.test',
      fetchImpl: async (value) => { url = value; return response({ opportunityId: 88 }); },
    });

    const payload = JSON.parse(decodeURIComponent(url.split('?')[1]));
    assert.deepEqual(payload, {
      opportunityId: '',
      Subject: 'August Order',
      Description: '',
      EstimatedClosedDate: '09-13-2026',
      EstimatedValue: 2450.25,
      OpportunityStageId: '1',
      empAssignedId: '0',
      contactId: 42,
      LeadID: null,
    });
    assert.equal(result.opportunityId, '88');
  });

  it('reuses an open opportunity and only creates when every existing row is closed', async () => {
    const open = { id: '71', subject: 'Existing reorder', stageId: '2', isClosed: false };
    const closed = { id: '70', subject: 'Won', stageId: '4', isClosed: true };
    assert.equal(findOpenOpportunity([closed, open]), open);

    let creates = 0;
    const reused = await ensureOpenOpportunity({ subject: 'Fallback subject' }, {
      contactId: '42',
      opportunities: [closed, open],
      createOpportunity: async () => { creates += 1; return { ok: true, opportunityId: 'new' }; },
    });
    assert.equal(reused.opportunityId, '71');
    assert.equal(reused.created, false);
    assert.equal(creates, 0);

    const created = await ensureOpenOpportunity({ subject: 'August Order' }, {
      contactId: '42',
      opportunities: [closed],
      createOpportunity: async (fields, options) => {
        creates += 1;
        assert.equal(fields.subject, 'August Order');
        assert.equal(options.contactId, '42');
        return { ok: true, opportunityId: '88' };
      },
    });
    assert.equal(created.opportunityId, '88');
    assert.equal(created.created, true);
    assert.equal(creates, 1);
  });
});

describe('crm opportunities · source hydration trigger', () => {
  it('detects dot/bracket opportunity access without matching unrelated code', () => {
    assert.equal(sourceUsesOpportunityRecords('page.opportunities.find(Boolean)'), true);
    assert.equal(sourceUsesOpportunityRecords('page["opportunities"]'), true);
    assert.equal(sourceUsesOpportunityRecords('actions.createOpportunity({ subject: "x" })'), false);
    assert.equal(sourceUsesOpportunityRecords('actions.ensureOpenOpportunity({ subject: "x" })'), true);
  });
});
