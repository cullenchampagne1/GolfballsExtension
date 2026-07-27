import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeImportedCampaign,
  parseCampaignBlob,
} from '../../src/lib/campaign/campaignImport.js';

describe('campaign import · code-first executable source', () => {
  it('keeps automation and delivery policy on an imported campaign', () => {
    const { campaign, warnings } = normalizeImportedCampaign({
      name: 'CRM verification',
      automation: 'await actions.createTask({ subject: "Verify" });',
      paceDelay: 3,
      paceJitter: 1,
      sendCap: 25,
      audienceOrder: 'valueDesc',
    });

    assert.equal(campaign.name, 'CRM verification');
    assert.equal(campaign.automation, 'await actions.createTask({ subject: "Verify" });');
    assert.equal(campaign.paceDelay, 3);
    assert.equal(campaign.paceJitter, 1);
    assert.equal(campaign.sendCap, 25);
    assert.equal(campaign.audienceOrder, 'valueDesc');
    assert.deepEqual(warnings, []);
  });

  it('rejects a legacy steps-only blob instead of importing an empty campaign', () => {
    assert.throws(() => normalizeImportedCampaign({
      name: 'Legacy only',
      steps: [{ kind: 'task', useCustom: true, custom: { subject: 'Never wired' } }],
    }), /missing executable "automation" JavaScript/);
  });

  it('rejects malformed automation before it reaches saved storage', () => {
    assert.throws(() => normalizeImportedCampaign({
      name: 'Broken',
      automation: 'if (',
    }), /invalid automation JavaScript/);
  });

  it('parses a wrapped list and accepts code as the automation alias', () => {
    const parsed = parseCampaignBlob(JSON.stringify({
      campaigns: [{ name: 'Alias', code: 'await actions.addNote({ body: "QA" });' }],
    }));
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].campaign.automation, 'await actions.addNote({ body: "QA" });');
  });
});
