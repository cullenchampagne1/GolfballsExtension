/**
 * Feature surface config — the data layer for the reworked Features section.
 * Pins that defaults derive from the capability registry (a popup-only feature
 * can't be shown-in-shelf), that per-page visibility resolves correctly, and
 * that the registry declares the surfaces the shelf/popup bindings used to
 * hardcode.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_REGISTRY, featureByKey, shelfFeatures } from '../../src/lib/features/featureRegistry.js';
import { normalizeFeatureConfig, featureShowsOnPage, surfaceSummary, togglePage } from '../../src/lib/features/featureConfig.js';

describe('featureRegistry · surfaces', () => {
  it('declares popup + shelf for a dual-surface feature', () => {
    const call = featureByKey('callLogEnabled');
    assert.equal(call.surfaces.popup, '__gbShowCallLogModal');
    assert.deepEqual(call.surfaces.shelf.pages, ['contact', 'account']);
    assert.ok(call.surfaces.shelf.actions.some((a) => a.id === 'gb-call-contact'));
  });

  it('marks a popup-only feature with no shelf', () => {
    const margin = featureByKey('marginCalcEnabled');
    assert.equal(margin.surfaces.popup, '__gbShowMarginCalcModal');
    assert.equal(margin.surfaces.shelf, null);
  });

  it('shelfFeatures lists only shelf-capable features', () => {
    const keys = shelfFeatures().map((f) => f.key);
    assert.ok(keys.includes('crmSearchEnabled'));
    assert.ok(!keys.includes('marginCalcEnabled'));
  });
});

describe('featureConfig · defaults + queries', () => {
  it('defaults from the registry, clamps to supported surfaces', () => {
    const cfg = normalizeFeatureConfig({});
    assert.deepEqual(cfg.crmSearchEnabled, { showInPopup: true, showInShelf: true, pages: ['*'] });
    // popup-only: shelf forced off, no pages
    assert.deepEqual(cfg.marginCalcEnabled, { showInPopup: true, showInShelf: false, pages: [] });
    // every registry feature is present
    assert.equal(Object.keys(cfg).length, FEATURE_REGISTRY.length);
  });

  it('honors a saved override', () => {
    const cfg = normalizeFeatureConfig({ callLogEnabled: { showInPopup: false, showInShelf: true, pages: ['contact'] } });
    assert.equal(cfg.callLogEnabled.showInPopup, false);
    assert.deepEqual(cfg.callLogEnabled.pages, ['contact']);
  });

  it('resolves per-page shelf visibility', () => {
    const cfg = normalizeFeatureConfig({ callLogEnabled: { showInShelf: true, pages: ['contact'] }, crmSearchEnabled: { showInShelf: true, pages: ['*'] } });
    assert.equal(featureShowsOnPage(cfg.callLogEnabled, 'contact'), true);
    assert.equal(featureShowsOnPage(cfg.callLogEnabled, 'order'), false);
    assert.equal(featureShowsOnPage(cfg.crmSearchEnabled, 'order'), true); // '*'
    assert.equal(featureShowsOnPage(cfg.marginCalcEnabled, 'contact'), false); // no shelf
  });

  it('summarizes surfaces for the collapsed row', () => {
    assert.match(surfaceSummary(normalizeFeatureConfig({}).crmSearchEnabled), /Popup · Shelf · all pages/);
    assert.match(surfaceSummary(normalizeFeatureConfig({ callLogEnabled: { showInPopup: false, showInShelf: true, pages: ['contact', 'account'] } }).callLogEnabled), /Shelf · 2 pages/);
  });
});

describe('featureConfig · togglePage', () => {
  it('selecting a specific page drops the `*` wildcard', () => {
    assert.deepEqual(togglePage(['*'], 'contact'), ['contact']);
  });

  it('selecting `*` collapses back to all-pages', () => {
    assert.deepEqual(togglePage(['contact', 'account'], '*'), ['*']);
  });

  it('adds a page and keeps registry order (not click order)', () => {
    assert.deepEqual(togglePage(['order'], 'contact'), ['contact', 'order']);
  });

  it('removing the last specific page falls back to `*`', () => {
    assert.deepEqual(togglePage(['contact'], 'contact'), ['*']);
  });

  it('toggling a present page removes just that page', () => {
    assert.deepEqual(togglePage(['contact', 'account'], 'account'), ['contact']);
  });
});
