/**
 * Mockup catalog authoring — draft → managed document lowering.
 *
 * These pin the rules the backend loader enforces (option-group shape, sources
 * mapping every group, the 20-source ceiling, the sparse grid) so an authoring
 * mistake surfaces in the editor rather than as a rejected write. The shipped
 * towel is the fixture: a real 2x6 grid with a deliberate hole.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SOURCES, MIN_PRODUCT_PROMPT,
  axisFromCatalogProperty, buildCatalogProduct, combinationKey, combinationsOf,
  draftFromCatalogProduct, mergeCatalogProduct, referenceNameFor, remapCells, toOptionId,
  toProductId,
} from '../../src/lib/mockupCatalogDraft.js';

const REF = 'https://api.cullenchampagne.com/projects/golfballs-extension'
  + '/product-generation/references/towel';

const SCENE = {
  id: 'scene', label: 'Scene', presentation: 'thumbnail', columns: 2,
  options: [
    { id: 'studio', label: 'Studio' },
    { id: 'grass', label: 'Golf course' },
  ],
};
const COLOR = {
  id: 'color', label: 'Color', presentation: 'swatch', columns: 3,
  options: [
    { id: 'black', label: 'Black', swatch: '#17191b' },
    { id: 'blue', label: 'Blue', swatch: '#254ac7' },
    { id: 'white', label: 'White', swatch: '#f4f3ee' },
  ],
};

/** Every combination except grass/white — the hole the live towel really has. */
function towelCells({ omit = ['grass-white'] } = {}) {
  const cells = {};
  for (const combination of combinationsOf([SCENE, COLOR])) {
    const key = combinationKey(combination);
    if (omit.includes(key)) continue;
    cells[key] = { referenceUrl: `${REF}/${key}.png` };
  }
  return cells;
}

const draft = (overrides = {}) => ({
  id: 'venture-towel',
  title: 'Venture Golf Microfiber Magnetic Towel',
  brand: 'Venture Golf',
  category: 'Golf Towels',
  promptVersion: 'venture-towel-v1',
  prompt: 'Edit Image 1 by placing the logo from Image 2 inside the outlined area.',
  axes: [SCENE, COLOR],
  cells: towelCells(),
  ...overrides,
});

describe('catalog draft · ids', () => {
  it('slugifies labels into loader-legal ids', () => {
    assert.equal(toOptionId('Golf course'), 'golf-course');
    assert.equal(toOptionId('  Navy  '), 'navy');
    assert.equal(toOptionId('Black / White'), 'black-white');
    assert.equal(toProductId('Venture Golf Microfiber Towel'),
      'venture-golf-microfiber-towel');
  });

  it('falls back rather than emitting an illegal id', () => {
    assert.equal(toOptionId('!!!', 'fallback'), 'fallback');
    assert.equal(toOptionId('', ''), '');
    assert.equal(toOptionId('-leading'), 'leading');
  });
});

describe('catalog draft · catalog properties become axes', () => {
  it('derives a swatch axis from a catalog colour facet', () => {
    const axis = axisFromCatalogProperty({
      label: 'Accessories Color', options: ['Black', 'Navy', 'Red'],
    });
    assert.equal(axis.id, 'color', 'the trailing facet word names the axis');
    assert.equal(axis.label, 'Color');
    assert.equal(axis.presentation, 'swatch');
    assert.deepEqual(axis.options.map((o) => o.id), ['black', 'navy', 'red']);
    assert.equal(axis.catalogLabel, 'Accessories Color');
  });

  it('derives a button axis for non-colour facets', () => {
    const axis = axisFromCatalogProperty({
      label: 'Apparel Size', options: ['S', 'M', 'L'],
    });
    assert.equal(axis.id, 'size');
    assert.equal(axis.presentation, 'button');
  });

  it('drops duplicates and caps at the loader option ceiling', () => {
    const axis = axisFromCatalogProperty({
      label: 'Color', options: ['Red', 'red', ' RED ', 'Blue'],
    });
    assert.deepEqual(axis.options.map((o) => o.id), ['red', 'blue']);
    const wide = axisFromCatalogProperty({
      label: 'Color',
      options: Array.from({ length: 60 }, (_, i) => `Shade ${i}`),
    });
    assert.equal(wide.options.length, 50);
  });

  it('rejects a facet with no usable options', () => {
    assert.equal(axisFromCatalogProperty({ label: 'Color', options: [] }), null);
    assert.equal(axisFromCatalogProperty({ label: '', options: ['Red'] }), null);
  });
});

describe('catalog draft · the combination grid', () => {
  it('expands axes in order', () => {
    const rows = combinationsOf([SCENE, COLOR]);
    assert.equal(rows.length, 6);
    assert.equal(combinationKey(rows[0]), 'studio-black');
    assert.equal(combinationKey(rows.at(-1)), 'grass-white');
  });

  it('names an uploaded reference after its cell', () => {
    assert.equal(referenceNameFor(combinationsOf([SCENE, COLOR])[1]), 'studio-blue');
  });
});

describe('catalog draft · lowering to a managed product', () => {
  it('maps axes to option groups and cells to sources', () => {
    const { product, issues } = buildCatalogProduct(draft());

    assert.deepEqual(issues, []);
    assert.deepEqual(product.option_groups.map((g) => g.id), ['scene', 'color']);
    assert.equal(product.option_groups[1].options[0].swatch, '#17191b');
    assert.equal(product.sources.length, 5, 'the empty cell must not become a source');
    assert.deepEqual(product.sources[0].option_values, { scene: 'studio', color: 'black' });
    assert.equal(product.sources[0].label, 'Studio · Black');
    assert.equal(product.sources[0].thumbnail_url, product.sources[0].reference_image_url,
      'thumbnail falls back to the reference image');
  });

  it('keeps the grid sparse rather than inventing a missing cell', () => {
    const { product } = buildCatalogProduct(draft());
    assert.equal(
      product.sources.some((s) => s.id === 'grass-white'), false,
      'a combination with no photo must be absent, not blank',
    );
  });

  it('defaults to a single imprint placement', () => {
    const { product } = buildCatalogProduct(draft());
    assert.deepEqual(product.variations.map((v) => v.id), ['personalized-logo']);
  });

  it('carries the corporate catalog back-link when supplied', () => {
    const { product } = buildCatalogProduct(draft({
      catalogSku: 'M6594', catalogId: '5241-venture-towel',
    }));
    assert.equal(product.catalog_sku, 'M6594');
    assert.equal(product.catalog_id, '5241-venture-towel');
  });

  it('omits the catalog link entirely when absent', () => {
    const { product } = buildCatalogProduct(draft());
    assert.equal(Object.hasOwn(product, 'catalog_sku'), false,
      'an unlinked product must not emit an empty key the loader would reject');
  });

  it('uses the first reference as the display image when none is set', () => {
    const { product } = buildCatalogProduct(draft());
    assert.equal(product.display_image_url, `${REF}/studio-black.png`);
  });
});

describe('catalog draft · blocking issues', () => {
  it('requires a prompt of at least the loader minimum', () => {
    const { issues } = buildCatalogProduct(draft({ prompt: 'too short' }));
    assert.ok(issues.some((i) => i.includes(String(MIN_PRODUCT_PROMPT))));
  });

  it('requires a prompt version', () => {
    const { issues } = buildCatalogProduct(draft({ promptVersion: '' }));
    assert.ok(issues.some((i) => i.toLowerCase().includes('prompt version')));
  });

  it('requires at least one reference photo', () => {
    const { issues } = buildCatalogProduct(draft({ cells: {} }));
    assert.ok(issues.some((i) => i.includes('at least one combination')));
  });

  it('reports the source ceiling instead of silently truncating', () => {
    const wide = {
      id: 'color', label: 'Color', presentation: 'swatch', columns: 3,
      options: Array.from({ length: 26 }, (_, i) => ({ id: `c${i}`, label: `C${i}` })),
    };
    const cells = {};
    for (const combination of combinationsOf([SCENE, wide])) {
      cells[combinationKey(combination)] = { referenceUrl: `${REF}/x.png` };
    }
    const { product, issues } = buildCatalogProduct(draft({ axes: [SCENE, wide], cells }));
    assert.equal(product.sources.length, 52);
    assert.ok(issues.some((i) => i.includes(String(MAX_SOURCES))),
      'over-capacity must be reported, not truncated behind the user’s back');
  });

  it('rejects a placement prompt that is short but not empty', () => {
    const { issues } = buildCatalogProduct(draft({
      placements: [{ id: 'p', label: 'Left chest', prompt: 'short' }],
    }));
    assert.ok(issues.some((i) => i.includes('at least 10')));
  });

  it('accepts an empty placement prompt, as the shipped towel has', () => {
    const { issues } = buildCatalogProduct(draft({
      placements: [{ id: 'personalized-logo', label: 'Personalized logo', prompt: '' }],
    }));
    assert.deepEqual(issues, []);
  });
});

describe('catalog draft · option prompts', () => {
  it('carries an option prompt so a scene is described once', () => {
    const scene = {
      ...SCENE,
      options: [
        { id: 'studio', label: 'Studio', prompt: 'Clean seamless white background.' },
        { id: 'grass', label: 'Golf course', prompt: 'Hanging from a bag on the course.' },
      ],
    };
    const { product, issues } = buildCatalogProduct(draft({ axes: [scene, COLOR] }));

    assert.deepEqual(issues, []);
    const options = product.option_groups[0].options;
    assert.equal(options[0].prompt, 'Clean seamless white background.');
    assert.equal(options[1].prompt, 'Hanging from a bag on the course.');
    assert.equal(
      product.sources.filter((s) => s.option_values.scene === 'studio').length, 3,
      'one scene prompt covers every colour that selects it',
    );
  });

  it('omits an empty option prompt rather than emitting a blank key', () => {
    const { product } = buildCatalogProduct(draft());
    assert.equal(Object.hasOwn(product.option_groups[0].options[0], 'prompt'), false);
  });

  it('round-trips an option prompt back into the editor', () => {
    const scene = {
      ...SCENE,
      options: [
        { id: 'studio', label: 'Studio', prompt: 'Clean seamless white.' },
        { id: 'grass', label: 'Golf course' },
      ],
    };
    const { product } = buildCatalogProduct(draft({ axes: [scene, COLOR] }));
    const restored = draftFromCatalogProduct(product);
    assert.equal(restored.axes[0].options[0].prompt, 'Clean seamless white.');
    assert.equal(restored.axes[0].options[1].prompt, '');
  });
});

describe('catalog draft · axis changes keep the photos', () => {
  const COLOR_ONLY = [COLOR];
  const cells = {
    black: { referenceUrl: `${REF}/black.png` },
    blue: { referenceUrl: `${REF}/blue.png` },
    white: { referenceUrl: `${REF}/white.png` },
  };

  it('fans every photo across a newly added scene axis', () => {
    const next = remapCells(cells, COLOR_ONLY, [COLOR, SCENE]);

    assert.deepEqual(Object.keys(next).sort(), [
      'black-grass', 'black-studio', 'blue-grass', 'blue-studio',
      'white-grass', 'white-studio',
    ]);
    assert.equal(next['black-studio'].referenceUrl, `${REF}/black.png`);
    assert.equal(next['black-grass'].referenceUrl, `${REF}/black.png`,
      'the existing photo seeds both scenes rather than orphaning');
  });

  it('keeps photos when an axis is removed', () => {
    const twoAxis = remapCells(cells, COLOR_ONLY, [COLOR, SCENE]);
    const collapsed = remapCells(twoAxis, [COLOR, SCENE], COLOR_ONLY);

    assert.deepEqual(Object.keys(collapsed).sort(), ['black', 'blue', 'white']);
    assert.equal(collapsed.black.referenceUrl, `${REF}/black.png`);
  });

  it('rewrites keys when axes are reordered', () => {
    const forward = remapCells(cells, COLOR_ONLY, [COLOR, SCENE]);
    const swapped = remapCells(forward, [COLOR, SCENE], [SCENE, COLOR]);

    assert.equal(swapped['studio-black'].referenceUrl, `${REF}/black.png`);
    assert.equal(Object.hasOwn(swapped, 'black-studio'), false);
  });

  it('preserves a per-cell prompt through the remap', () => {
    const withPrompt = { black: { referenceUrl: `${REF}/black.png`, prompt: 'Note.' } };
    const next = remapCells(withPrompt, COLOR_ONLY, [COLOR, SCENE]);
    assert.equal(next['black-studio'].prompt, 'Note.');
  });

  it('drops nothing and invents nothing when the axes are unchanged', () => {
    assert.deepEqual(remapCells(cells, COLOR_ONLY, COLOR_ONLY), cells);
  });

  it('survives removing the last axis', () => {
    assert.deepEqual(remapCells(cells, COLOR_ONLY, []), {});
  });

  it('keeps the product buildable straight after adding an axis', () => {
    const next = remapCells(cells, COLOR_ONLY, [COLOR, SCENE]);
    const { product, issues } = buildCatalogProduct(
      draft({ axes: [COLOR, SCENE], cells: next }),
    );
    assert.deepEqual(issues, []);
    assert.equal(product.sources.length, 6,
      'every fanned-out combination is a usable source');
  });
});

describe('catalog draft · round-trip', () => {
  it('rebuilds an editable draft from a managed product', () => {
    const { product } = buildCatalogProduct(draft());
    const restored = draftFromCatalogProduct(product);

    assert.equal(restored.title, 'Venture Golf Microfiber Magnetic Towel');
    assert.deepEqual(restored.axes.map((a) => a.id), ['scene', 'color']);
    assert.equal(restored.axes[1].presentation, 'swatch');
    assert.equal(restored.cells['studio-black'].referenceUrl, `${REF}/studio-black.png`);
    assert.equal(Object.hasOwn(restored.cells, 'grass-white'), false);
  });

  it('lowers back to an identical product', () => {
    const { product } = buildCatalogProduct(draft());
    const { product: again, issues } = buildCatalogProduct(draftFromCatalogProduct(product));
    assert.deepEqual(issues, []);
    assert.deepEqual(again, product, 'editing an existing product must not drift');
  });

  it('replaces by id instead of appending a duplicate', () => {
    const { product } = buildCatalogProduct(draft());
    const existing = [{ id: 'other' }, { id: 'venture-towel', title: 'stale' }];
    const merged = mergeCatalogProduct(existing, product);
    assert.equal(merged.length, 2);
    assert.equal(merged[1].title, 'Venture Golf Microfiber Magnetic Towel');
    assert.equal(mergeCatalogProduct([{ id: 'other' }], product).length, 2);
  });
});
