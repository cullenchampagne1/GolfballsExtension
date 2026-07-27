import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  campaignActionCap,
  campaignPaceMs,
  campaignSuppressionReason,
  orderCampaignAudience,
} from '../../src/lib/campaign/runPolicy.js';

describe('campaign run policy · audience and delivery controls', () => {
  it('orders a copy by value without mutating the selected audience', () => {
    const audience = [
      { id: 'low', value: 12 },
      { id: 'high', value: 90 },
      { id: 'middle', ytd: 45 },
    ];
    const ordered = orderCampaignAudience(audience, 'valueDesc');

    assert.deepEqual(ordered.map((row) => row.id), ['high', 'middle', 'low']);
    assert.deepEqual(audience.map((row) => row.id), ['low', 'high', 'middle']);
  });

  it('uses the injected random source for deterministic shuffling', () => {
    const ordered = orderCampaignAudience(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      'shuffle',
      () => 0,
    );
    assert.deepEqual(ordered.map((row) => row.id), ['b', 'c', 'a']);
  });

  it('reports the first enabled suppression reason only', () => {
    const campaign = {
      suppressDoNotContact: true,
      suppressBounced: true,
      suppressMailerRemoved: true,
    };
    assert.equal(campaignSuppressionReason(campaign, {
      doNotContact: true,
      bounceCode: '550',
      mailerRemoved: true,
    }), 'do-not-contact');
    assert.equal(campaignSuppressionReason({
      ...campaign,
      suppressDoNotContact: false,
    }, {
      bounceCode: '550',
      mailerRemoved: true,
    }), 'bounced');
  });

  it('calculates bounded jitter and normalizes the run-wide action cap', () => {
    assert.equal(campaignPaceMs({ paceDelay: 10, paceJitter: 2 }, () => 0), 8_000);
    assert.equal(campaignPaceMs({ paceDelay: 10, paceJitter: 2 }, () => 1), 12_000);
    assert.equal(campaignPaceMs({ paceDelay: 0, paceJitter: 5 }, () => 0), 0);
    assert.equal(campaignActionCap({ sendCap: 3.9 }), 3);
    assert.equal(campaignActionCap({ sendCap: -8 }), 0);
  });
});
