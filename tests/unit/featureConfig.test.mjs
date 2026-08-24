/**
 * Feature surface config — the data layer for the reworked Features section.
 * Pins that defaults derive from the capability registry, that per-page
 * visibility resolves for BOTH surfaces, that the registry cross-implements
 * launchers (popup-only → shelf, shelf-only → popup), and that inline
 * features (email/text preview) are demoted to plain toggles.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FEATURE_DEFAULTS, FEATURE_FLAG_META } from '../../src/lib/flags.js';
import { FEATURE_REGISTRY, featureByKey, shelfFeatures, popupFeatures, shelfActionDefs } from '../../src/lib/features/featureRegistry.js';
import { normalizeFeatureConfig, featureShowsOnPage, featureShowsInPopup, pageApplies, urlMatches, surfaceSummary, togglePage } from '../../src/lib/features/featureConfig.js';

const popupSource = await readFile(new URL('../../src/popup/popup.jsx', import.meta.url), 'utf8');
const backgroundSource = await readFile(new URL('../../background.js', import.meta.url), 'utf8');
const salesFantasyHtml = await readFile(new URL('../../sales-fantasy.html', import.meta.url), 'utf8');

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

  it('demotes Workflow Manager to a toggle (opened only from CRM Search / Tasks)', () => {
    const cm = featureByKey('workflowManagerEnabled');
    assert.equal(cm.surfaces.popup, false);
    assert.equal(cm.surfaces.shelf, null);
  });

  it('scopes Order Edit to order pages on both surfaces', () => {
    const oe = featureByKey('orderEditEnabled');
    assert.equal(oe.surfaces.popup, true);
    assert.deepEqual(oe.surfaces.shelf.pages, ['order']);
    assert.equal(oe.surfaces.shelf.global, '__gbShowOrderEditModal');
  });

  it('unifies image viewer + submit proof: one feature, per-surface labels', () => {
    const img = featureByKey('imagePreviewEnabled');
    assert.equal(img.surfaces.shelf.actions[0].label, 'Image Viewer'); // shelf reads "Image Viewer"
    assert.equal(img.surfaces.popupLabel, 'Submit Proof');             // popup reads "Submit Proof"
    // The old standalone Submit Proof flag is merged away (no separate feature).
    assert.equal(featureByKey('submitProofEnabled'), null);
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

describe('featureRegistry · Sales Fantasy event', () => {
  it('is a managed-ready, default-off event without a generic page launcher', () => {
    assert.equal(FEATURE_DEFAULTS.salesFantasyEnabled, false);
    assert.equal(FEATURE_FLAG_META.find((item) => item.key === 'salesFantasyEnabled')?.name, 'Sales Fantasy');
    const event = featureByKey('salesFantasyEnabled');
    assert.ok(event);
    assert.equal(event.surfaces.popup, false);
    assert.equal(event.surfaces.shelf, null);
  });

  it('gates the special popup button and opens the Coming soon event window', () => {
    assert.match(popupSource, /flags\.salesFantasyEnabled === true/);
    assert.match(popupSource, /action: 'openSalesFantasy'/);
    assert.match(popupSource, />\s*Sales Fantasy\s*</);
    assert.match(popupSource, /linear-gradient\(180deg, var\(--gb-fill-subtle\) 36%, color-mix\(in srgb, var\(--gb-brand-label\) 11%, var\(--gb-fill-subtle\)\) 100%\)/);
    assert.match(popupSource, /inset 0 -10px 16px color-mix\(in srgb, var\(--gb-brand-label\) 9%, transparent\)/);
    assert.match(popupSource, /border: '1px solid var\(--gb-border-default\)'/);
    assert.match(popupSource, /background: 'var\(--gb-brand-tint-soft\)'/);
    assert.doesNotMatch(popupSource, /#4c1d95|#7c3aed|#db2777/);
    assert.match(backgroundSource, /const MANAGER_WINDOW_BOUNDS = Object\.freeze\(\{ width: 860, height: 700 \}\)/);
    assert.match(backgroundSource, /url: chrome\.runtime\.getURL\('editor\.html'\),\s*type: 'popup', \.\.\.MANAGER_WINDOW_BOUNDS/);
    assert.match(backgroundSource, /url: chrome\.runtime\.getURL\('sales-fantasy\.html'\),\s*type: 'popup', \.\.\.MANAGER_WINDOW_BOUNDS/);
    assert.match(salesFantasyHtml, /<title>Sales Fantasy · Coming soon<\/title>/);
    assert.match(salesFantasyHtml, /<p class="coming-soon">Coming soon<\/p>/);
  });
});

describe('featureConfig · defaults + queries', () => {
  it('defaults from the registry, clamps to supported surfaces', () => {
    const cfg = normalizeFeatureConfig({});
    assert.deepEqual(cfg.crmSearchEnabled, { showInPopup: true, showInShelf: true, pages: ['*'], customUrl: '' });
    // margin calc: cross-implemented, default pages from the registry
    assert.deepEqual(cfg.marginCalcEnabled, { showInPopup: false, showInShelf: true, pages: ['order'], customUrl: '' });
    // inline feature: both surfaces forced off, no pages, no custom link
    assert.deepEqual(cfg.emailPreviewEnabled, { showInPopup: false, showInShelf: false, pages: [], customUrl: '' });
    assert.equal(Object.keys(cfg).length, FEATURE_REGISTRY.length);
  });

  it('defaults the popup to edit, watch, tasks, search, notifications, and submit proof only', () => {
    const cfg = normalizeFeatureConfig({});
    const visible = popupFeatures()
      .filter((feature) => cfg[feature.key].showInPopup)
      .map((feature) => feature.key)
      .sort();
    assert.deepEqual(visible, [
      'crmSearchEnabled',
      'imagePreviewEnabled',
      'notificationsEnabled',
      'orderEditEnabled',
      'taskListEnabled',
      'watchListEnabled',
    ]);
  });

  it('honors a saved override', () => {
    const cfg = normalizeFeatureConfig({ callLogEnabled: { showInPopup: true, showInShelf: true, pages: ['contact'] } });
    assert.equal(cfg.callLogEnabled.showInPopup, true);
    assert.deepEqual(cfg.callLogEnabled.pages, ['contact']);
  });

  it('pageApplies matches wildcard and specific pages', () => {
    assert.equal(pageApplies(['*'], 'order'), true);
    assert.equal(pageApplies(['*'], null), true);
    assert.equal(pageApplies(['contact'], 'contact'), true);
    assert.equal(pageApplies(['contact'], 'order'), false);
    assert.equal(pageApplies([], 'order'), false);
  });

  it('resolves per-page shelf visibility (page chips gate the shelf only)', () => {
    const cfg = normalizeFeatureConfig({ callLogEnabled: { showInShelf: true, showInPopup: true, pages: ['contact'] }, crmSearchEnabled: { showInShelf: true, showInPopup: true, pages: ['*'] } });
    assert.equal(featureShowsOnPage(cfg.callLogEnabled, 'contact'), true);
    assert.equal(featureShowsOnPage(cfg.callLogEnabled, 'order'), false);
    assert.equal(featureShowsOnPage(cfg.emailPreviewEnabled, 'contact'), false); // no shelf
  });

  it('popup is GLOBAL — enabled popup shows on every page, ignoring page chips', () => {
    // Regression: the popup used to be gated by the shelf's page chips, so a
    // contact-scoped feature vanished from the popup on an order page.
    const cfg = normalizeFeatureConfig({ callLogEnabled: { showInShelf: true, showInPopup: true, pages: ['contact'] } });
    assert.equal(featureShowsInPopup(cfg.callLogEnabled), true);      // even though pages=['contact']
    const off = normalizeFeatureConfig({ callLogEnabled: { showInPopup: false } });
    assert.equal(featureShowsInPopup(off.callLogEnabled), false);
  });

  it('summarizes surfaces for the collapsed row', () => {
    assert.match(surfaceSummary(normalizeFeatureConfig({}).crmSearchEnabled), /Popup · Shelf · all pages/);
    assert.match(surfaceSummary(normalizeFeatureConfig({ callLogEnabled: { showInPopup: false, showInShelf: true, pages: ['contact', 'account'] } }).callLogEnabled), /Shelf · 2 pages/);
  });
});

describe('featureConfig · custom-link matcher', () => {
  it('normalizes and trims a custom link on shelf-capable features', () => {
    const cfg = normalizeFeatureConfig({ callLogEnabled: { showInShelf: true, customUrl: '  Page=271  ' } });
    assert.equal(cfg.callLogEnabled.customUrl, 'Page=271');
  });

  it('urlMatches is a case-sensitive substring test; empty never matches', () => {
    assert.equal(urlMatches('Page=271', 'https://crm/Default.aspx?Page=271&x=1'), true);
    assert.equal(urlMatches('Page=999', 'https://crm/Default.aspx?Page=271'), false);
    assert.equal(urlMatches('', 'https://crm/anything'), false);
  });

  it('shows a shelf action when the URL contains the custom link even off its pages', () => {
    const cfg = normalizeFeatureConfig({ callLogEnabled: { showInShelf: true, pages: ['contact'], customUrl: '/Admin/Order' } });
    // Not a contact page, but the URL contains the custom link → shows.
    assert.equal(featureShowsOnPage(cfg.callLogEnabled, 'order', 'https://crm/golfballs/crm/Admin/Order/View'), true);
    // Neither the page nor the URL matches → hidden.
    assert.equal(featureShowsOnPage(cfg.callLogEnabled, 'order', 'https://crm/somewhere/else'), false);
  });

  it('reflects the custom link in the collapsed summary', () => {
    const cfg = normalizeFeatureConfig({ callLogEnabled: { showInShelf: true, pages: ['contact'], customUrl: 'Page=271' } });
    assert.match(surfaceSummary(cfg.callLogEnabled), /\+ link/);
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
