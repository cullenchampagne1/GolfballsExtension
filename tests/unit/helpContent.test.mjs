import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HELP_ARTICLES, HELP_TUTORIALS, HELP_TREE, HELP_SEARCH_INDEX,
} from '../../src/lib/helpContent.js';
import { FEATURE_DEFAULTS } from '../../src/lib/flags.js';
import { DEV_SETTINGS } from '../../src/lib/devSettings.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inventory = JSON.parse(readFileSync(path.join(ROOT, 'docs/inventory.json'), 'utf8'));

function walkTree(nodes, visit) {
  for (const node of nodes) {
    for (const item of node.items || []) visit(item);
    if (node.groups) walkTree(node.groups, visit);
  }
}

describe('generated operator guide coverage', () => {
  it('keeps every React modal inventoried and covered by an article', () => {
    const sourceFiles = readdirSync(path.join(ROOT, 'src/modals'))
      .filter((file) => file.endsWith('.jsx')).sort();
    const inventoryFiles = inventory.modals.map((modal) => path.basename(modal.file)).sort();
    assert.deepEqual(inventoryFiles, sourceFiles);

    const covered = new Set(HELP_ARTICLES.flatMap((article) => article.covers || []));
    for (const modal of inventory.modals) {
      assert.ok(covered.has(modal.id), `${modal.id} must be covered by a help article`);
    }
  });

  it('keeps every boolean feature flag and all developer settings in generated reference data', () => {
    const coveredFlags = new Set();
    for (const article of HELP_ARTICLES) {
      if (article.flag) coveredFlags.add(article.flag);
      for (const flag of article.coversFlags || []) coveredFlags.add(flag);
    }
    for (const [key, value] of Object.entries(FEATURE_DEFAULTS)) {
      if (typeof value === 'boolean') assert.ok(coveredFlags.has(key), `${key} must be documented`);
    }

    const devArticle = HELP_ARTICLES.find((article) => article.coversAllDevSettings);
    const generatedKeys = new Set(
      Object.values(devArticle?.body || {}).flat().flatMap((block) => block.meta?.settingKeys || []),
    );
    assert.equal(generatedKeys.size, DEV_SETTINGS.length);
  });

  it('keeps every article and workflow reachable from the help tree and search', () => {
    const treeArticles = new Set();
    const treeTutorials = new Set();
    walkTree(HELP_TREE, (item) => {
      if (item.article) treeArticles.add(item.article);
      if (item.tutorial) treeTutorials.add(item.tutorial);
    });
    assert.deepEqual([...treeArticles].sort(), HELP_ARTICLES.map((article) => article.slug).sort());
    assert.deepEqual([...treeTutorials].sort(), HELP_TUTORIALS.map((tutorial) => tutorial.id).sort());

    const searchableArticles = new Set(HELP_SEARCH_INDEX.filter((row) => row.article).map((row) => row.article));
    const searchableTutorials = new Set(HELP_SEARCH_INDEX.filter((row) => row.tutorial).map((row) => row.tutorial));
    for (const article of HELP_ARTICLES) assert.ok(searchableArticles.has(article.slug), `${article.slug} must be searchable`);
    for (const tutorial of HELP_TUTORIALS) assert.ok(searchableTutorials.has(tutorial.id), `${tutorial.id} must be searchable`);
  });

  it('documents admin notifications and labels proposal checkout as preview-only', () => {
    const notifications = HELP_ARTICLES.find((article) => article.slug === 'reply-notifications');
    assert.equal(notifications?.flag, 'notificationsEnabled');
    assert.ok(notifications?.covers.includes('notifications'));

    const checkout = HELP_ARTICLES.find((article) => article.slug === 'proposal-checkout-preview');
    const checkoutText = JSON.stringify(checkout).toLowerCase();
    assert.ok(checkout?.covers.includes('proposal-checkout'));
    assert.match(checkoutText, /preview only/);
    assert.match(checkoutText, /does not post an order|performs no order post/);
  });

  it('keeps theme inventory and exact reference routing aligned with live registries', () => {
    const themeSource = readFileSync(path.join(ROOT, 'src/lib/theme.js'), 'utf8');
    const variantRegistry = themeSource.match(/export const THEME_VARIANTS = \[([\s\S]*?)\n\];/)?.[1] || '';
    const registeredThemeIds = [...variantRegistry.matchAll(/\{ id: '([^']+)'/g)].map((match) => match[1]);
    assert.deepEqual(inventory.settings.theme.variants, registeredThemeIds);
    const appSource = readFileSync(path.join(ROOT, 'src/guide/lib/app.jsx'), 'utf8');
    assert.match(appSource, /r\.article \|\| r\.tutorial/);
    assert.match(appSource, /`manual\/\$\{encodeURIComponent\(r\.article\)\}`/);
    assert.match(appSource, /`workflows\/\$\{encodeURIComponent\(r\.tutorial\)\}`/);
    assert.equal(inventory.extensionPages.some((page) => page.id === 'charge-window'), false);
  });
});
