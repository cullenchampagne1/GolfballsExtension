import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPAIGN_MANAGER_SCALE_DEFAULT,
  fitCampaignManagerScale,
  normalizeCampaignManagerScale,
} from '../../src/lib/campaign/presentation.js';
import { applyFloatingHostScale } from '../../src/lib/floatingHost.js';
import { DEV_SETTINGS } from '../../src/lib/devSettings.js';

function fakeHost() {
  const attributes = new Map();
  return {
    attributes,
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
  };
}

describe('Campaign Manager presentation scale', () => {
  it('accepts the requested 0.5× scale and clamps unsafe stored values', () => {
    const registry = DEV_SETTINGS.find((setting) => setting.key === 'campaignManager.scale');
    assert.equal(registry?.min, 0.5);
    assert.equal(normalizeCampaignManagerScale(0.5), 0.5);
    assert.equal(normalizeCampaignManagerScale('0.75'), 0.75);
    assert.equal(normalizeCampaignManagerScale(0.1), 0.5);
    assert.equal(normalizeCampaignManagerScale(9), 2);
    assert.equal(normalizeCampaignManagerScale('not-a-number'), CAMPAIGN_MANAGER_SCALE_DEFAULT);
  });

  it('lets a self-scaled surface opt out of the shared modal root scale', () => {
    const host = fakeHost();
    applyFloatingHostScale(host);
    assert.equal(host.attributes.get('data-gb-scale'), 'modals');

    applyFloatingHostScale(host, null);
    assert.equal(host.attributes.has('data-gb-scale'), false);
  });

  it('uniformly fits the full editor when page zoom reduces the CSS viewport', () => {
    assert.equal(fitCampaignManagerScale(1.2, 1920, 1080), 1.2);
    assert.equal(fitCampaignManagerScale(1.2, 800, 600), 0.5875);
    assert.equal(fitCampaignManagerScale(0.5, 1920, 1080), 0.5);
  });
});
