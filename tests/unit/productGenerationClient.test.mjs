import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildProductGenerationBatchRequest,
  createDefaultProductGenerationSelection,
  createProductGenerationRequestId,
  isActiveProductGenerationBatch,
  isTerminalProductGenerationBatch,
  normalizeStudioBootstrap,
  prepareProductGenerationLogo,
  resolveProductGenerationFacet,
} from '../../src/lib/productGenerationClient.js';

const studio = {
  constraints: { max_products: 5, max_images: 20 },
  aspects: [{ id: 'square' }],
};
const products = [{
  id: 'hat-1',
  sources: [{ id: 'navy' }, { id: 'white' }],
  variations: [{ id: 'front' }, { id: 'side' }],
}, {
  id: 'hat-2',
  sources: [{ id: 'black' }],
  variations: [{ id: 'front' }],
}];
const logo = {
  filename: 'logo.png',
  mediaType: 'image/png',
  dataBase64: 'aGVsbG8=',
};
const towel = {
  id: 'venture-towel',
  option_groups: [{
    id: 'scene',
    presentation: 'thumbnail',
    columns: 2,
    options: [{ id: 'studio' }, { id: 'grass' }],
  }, {
    id: 'color',
    presentation: 'swatch',
    columns: 3,
    options: [{ id: 'black' }, { id: 'blue' }, { id: 'white' }],
  }],
  sources: [
    { id: 'studio-black', option_values: { scene: 'studio', color: 'black' } },
    { id: 'studio-blue', option_values: { scene: 'studio', color: 'blue' } },
    { id: 'studio-white', option_values: { scene: 'studio', color: 'white' } },
    { id: 'grass-black', option_values: { scene: 'grass', color: 'black' } },
    { id: 'grass-blue', option_values: { scene: 'grass', color: 'blue' } },
  ],
  variations: [{ id: 'personalized-logo' }],
};

describe('product mockup studio client contract', () => {
  it('normalizes an empty but healthy studio bootstrap', () => {
    const normalized = normalizeStudioBootstrap({
      studio: {
        configuration_revision: 'abc123',
        product_count: 0,
        constraints: { max_products: 5, max_images: 20 },
        aspects: [{ id: 'square' }],
      },
      products: [],
      batches: [],
    });
    assert.equal(normalized.studio.product_count, 0);
    assert.equal(normalized.studio.constraints.max_images, 20);
    assert.deepEqual(normalized.products, []);
    assert.deepEqual(normalized.batches, []);
  });

  it('builds a bounded source × imprint-variation batch request', () => {
    const request = buildProductGenerationBatchRequest({
      studio,
      products,
      requestId: 'mockup:request:0001',
      name: '  Spring hats  ',
      selections: [{
        productId: 'HAT-1',
        sourceIds: ['Navy', 'navy', 'white'],
        variationIds: ['front', 'side'],
      }, {
        productId: 'hat-2',
        sourceIds: ['black'],
        variationIds: ['front'],
      }],
      aspectId: 'square',
      logo,
    });
    assert.deepEqual(request, {
      requestId: 'mockup:request:0001',
      name: 'Spring hats',
      selections: [{
        productId: 'hat-1',
        sourceIds: ['navy', 'white'],
        variationIds: ['front', 'side'],
      }, {
        productId: 'hat-2',
        sourceIds: ['black'],
        variationIds: ['front'],
      }],
      aspectId: 'square',
      logo,
    });
  });

  it('resolves ordered YAML option groups to the exact product reference', () => {
    const initial = createDefaultProductGenerationSelection(towel);
    assert.deepEqual(initial, {
      sourceIds: ['studio-black'],
      variationIds: ['personalized-logo'],
      optionValues: { scene: 'studio', color: 'black' },
    });
    const blue = resolveProductGenerationFacet({
      product: towel,
      currentOptionValues: initial.optionValues,
      groupId: 'color',
      optionId: 'blue',
    });
    assert.deepEqual(blue, {
      sourceId: 'studio-blue',
      optionValues: { scene: 'studio', color: 'blue' },
    });
    const grass = resolveProductGenerationFacet({
      product: towel,
      currentOptionValues: blue.optionValues,
      groupId: 'scene',
      optionId: 'grass',
    });
    assert.deepEqual(grass, {
      sourceId: 'grass-blue',
      optionValues: { scene: 'grass', color: 'blue' },
    });
    assert.equal(resolveProductGenerationFacet({
      product: towel,
      currentOptionValues: grass.optionValues,
      groupId: 'color',
      optionId: 'white',
    }), null);
  });

  it('counts every selected source × imprint variation toward the output limit', () => {
    assert.throws(() => buildProductGenerationBatchRequest({
      studio: {
        ...studio,
        constraints: { max_products: 5, max_images: 3 },
      },
      products,
      requestId: 'mockup:request:0002',
      selections: [{
        productId: 'hat-1',
        sourceIds: ['navy', 'white'],
        variationIds: ['front', 'side'],
      }],
      aspectId: 'square',
      logo,
    }), /at most 3 images/);
  });

  it('encodes a bounded logo file for the protected worker request', async () => {
    const prepared = await prepareProductGenerationLogo({
      name: 'customer.png',
      type: 'image/png',
      size: 5,
      arrayBuffer: async () => Uint8Array.from([104, 101, 108, 108, 111]).buffer,
    });
    assert.deepEqual(prepared, {
      filename: 'customer.png',
      mediaType: 'image/png',
      dataBase64: 'aGVsbG8=',
      sizeBytes: 5,
    });
  });

  it('creates valid stable-shape request ids and classifies lifecycle states', () => {
    assert.equal(
      createProductGenerationRequestId(1_700_000_000_000, 0.5),
      'mockup:loyw3v28:0zik0zj',
    );
    assert.equal(isActiveProductGenerationBatch({ status: 'running' }), true);
    assert.equal(isActiveProductGenerationBatch({ status: 'completed' }), false);
    assert.equal(isTerminalProductGenerationBatch({ status: 'partial' }), true);
  });
});
