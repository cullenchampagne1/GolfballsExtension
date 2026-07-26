/**
 * Feature surface config — the data layer for the reworked Features section.
 * Pins that defaults derive from the capability registry, that per-page
 * visibility resolves for BOTH surfaces, that the registry cross-implements
 * launchers (popup-only → shelf, shelf-only → popup), and that inline
 * features (email/text preview) are demoted to plain toggles.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_REGISTRY, featureByKey, shelfFeatures, popupFeatures, shelfActionDefs } from '../../src/lib/features/featureRegistry.js';
import { normalizeFeatureConfig, featureShowsOnPage, featureShowsInPopup, pageApplies, surfaceSummary, togglePage } from '../../src/lib/features/featureConfig.js';

describe('featureRegistry · surfaces', () => {
  it('a dual-surface feature has popup + a page-scoped shelf', () => {
    const call = featureByKey('callLogEnabled');
    assert.equal(call.surfaces.popup, true);
    assert.deepEqual(call.surfaces.shelf.pages, ['contact', 'account']);
    assert.ok(call.surfaces.shelf.dynamic, 'call log is a live-DOM (dynamic) action');
    assert.ok(call.surfaces.shelf.actions.some((a) => a.id === 'gb-call-contact'));
  });

  it('demotes inline features (email/text preview) to a plain toggle', () => {
    for (const key of ['emailPreviewEnabled', 'textPreviewEnabled']) {
      const f = featureByKey(key);
      assert.equal(f.surfaces.popup, false, `${key} popup`);
      assert.equal(f.surfaces.shelf, null, `${key} shelf`);
    }
  });

  it('cross-implements a formerly popup-only feature onto the shelf', () => {
    const margin = featureByKey('marginCalcEnabled');
    assert.equal(margin.surfaces.popup, true);
    assert.ok(margin.surfaces.shelf, 'margin calc now has a shelf action');
    assert.deepEqual(margin.surfaces.shelf.pages, ['order']);
    assert.equal(margin.surfaces.shelf.global, '__gbShowMarginCalcModal');
  });

  it('cross-implements a formerly shelf-only feature into the popup', () => {
    const phone = featureByKey('phoneFinderEnabled');
    assert.equal(phone.surfaces.popup, true);
    assert.deepEqual(phone.surfaces.shelf.pages, ['contact']);
  });

  it('shelfFeatures / popupFeatures list only surfaced features', () => {
    const shelf = shelfFeatures().map((f) => f.key);
    assert.ok(shelf.includes('crmSearchEnabled'));
    assert.ok(shelf.includes('marginCalcEnabled'));
    assert.ok(!shelf.includes('emailPreviewEnabled'));
    const popup = popupFeatures().map((f) => f.key);
    assert.ok(popup.includes('phoneFinderEnabled'));
    assert.ok(!popup.includes('textPreviewEnabled'));
  });

  it('shelfActionDefs flattens actions tagged with feature key + pages', () => {
    const defs = shelfActionDefs();
    const findPhone = defs.find((d) => d.id === 'gb-find-phone');
    assert.equal(findPhone.key, 'phoneFinderEnabled');
    assert.deepEqual(findPhone.pages, ['contact']);
    assert.equal(findPhone.dynamic, true);
    const crm = defs.find((d) => d.id === 'gb-open-contacts');
    assert.equal(crm.global, '__gbShowCrmSearchModal');
    assert.equal(crm.dynamic, false);
    // call log contributes TWO actions under one feature
    assert.equal(defs.filter((d) => d.key === 'callLogEnabled').length, 2);
  });
});

describe('featureConfig · defaults + queries', () => {
  it('defaults from the registry, clamps to supported surfaces', () => {
    const cfg = normalizeFeatureConfig({});
    assert.deepEqual(cfg.crmSearchEnabled, { showInPopup: true, showInShelf: true, pages: ['*'] });
    // margin calc: cross-implemented, default pages from the registry
    assert.deepEqual(cfg.marginCalcEnabled, { showInPopup: true, showInShelf: true, pages: ['order'] });
    // inline feature: both surfaces forced off, no pages
    assert.deepEqual(cfg.emailPreviewEnabled, { showInPopup: false, showInShelf: false, pages: [] });
    assert.equal(Object.keys(cfg).length, FEATURE_REGISTRY.length);
  });

  it('honors a saved override', () => {
    const cfg = normalizeFeatureConfig({ callLogEnabled: { showInPopup: false, showInShelf: true, pages: ['contact'] } });
    assert.equal(cfg.callLogEnabled.showInPopup, false);
    assert.deepEqual(cfg.callLogEnabled.pages, ['contact']);
  });

  it('pageApplies matches wildcard and specific pages', () => {
    assert.equal(pageApplies(['*'], 'order'), true);
    assert.equal(pageApplies(['*'], null), true);
    assert.equal(pageApplies(['contact'], 'contact'), true);
    assert.equal(pageApplies(['contact'], 'order'), false);
    assert.equal(pageApplies([], 'order'), false);
  });

  it('resolves per-page shelf + popup visibility', () => {
    const cfg = normalizeFeatureConfig({ callLogEnabled: { showInShelf: true, showInPopup: true, pages: ['contact'] }, crmSearchEnabled: { showInShelf: true, showInPopup: true, pages: ['*'] } });
    assert.equal(featureShowsOnPage(cfg.callLogEnabled, 'contact'), true);
    assert.equal(featureShowsOnPage(cfg.callLogEnabled, 'order'), false);
    assert.equal(featureShowsInPopup(cfg.callLogEnabled, 'order'), false);
    assert.equal(featureShowsInPopup(cfg.crmSearchEnabled, 'order'), true); // '*'
    assert.equal(featureShowsOnPage(cfg.emailPreviewEnabled, 'contact'), false); // no shelf
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
