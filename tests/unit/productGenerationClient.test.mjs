import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildProductGenerationBatchRequest,
  createProductGenerationRequestId,
  isActiveProductGenerationBatch,
  isTerminalProductGenerationBatch,
  normalizeStudioBootstrap,
} from '../../src/lib/productGenerationClient.js';

const studio = {
  constraints: { max_products: 5, max_variations: 4, max_images: 20 },
  scenes: [{ id: 'studio' }],
  aspects: [{ id: 'square' }],
  lighting: [{ id: 'soft' }],
};

describe('product mockup studio client contract', () => {
  it('normalizes an empty but healthy studio bootstrap', () => {
    const normalized = normalizeStudioBootstrap({
      studio: {
        configuration_revision: 'abc123',
        product_count: 0,
        constraints: { max_products: 5, max_variations: 4, max_images: 20 },
        scenes: [{ id: 'studio' }],
        aspects: [{ id: 'square' }],
        lighting: [{ id: 'soft' }],
      },
      products: [],
      batches: [],
    });
    assert.equal(normalized.studio.product_count, 0);
    assert.equal(normalized.studio.constraints.max_images, 20);
    assert.deepEqual(normalized.products, []);
    assert.deepEqual(normalized.batches, []);
  });

  it('builds a bounded batch request and removes duplicate products', () => {
    const request = buildProductGenerationBatchRequest({
      studio,
      requestId: 'mockup:request:0001',
      name: '  Spring hats  ',
      productIds: ['Hat-1', 'hat-1', 'hat-2'],
      sceneId: 'STUDIO',
      aspectId: 'square',
      lightingId: 'soft',
      variations: 3,
      brief: '  Use the approved logo  ',
    });
    assert.deepEqual(request, {
      requestId: 'mockup:request:0001',
      name: 'Spring hats',
      productIds: ['hat-1', 'hat-2'],
      sceneId: 'studio',
      aspectId: 'square',
      lightingId: 'soft',
      variations: 3,
      brief: 'Use the approved logo',
    });
  });

  it('rejects a batch that exceeds the server-advertised image limit', () => {
    assert.throws(() => buildProductGenerationBatchRequest({
      studio: {
        ...studio,
        constraints: { max_products: 5, max_variations: 4, max_images: 6 },
      },
      requestId: 'mockup:request:0002',
      productIds: ['hat-1', 'hat-2'],
      sceneId: 'studio',
      aspectId: 'square',
      lightingId: 'soft',
      variations: 4,
    }), /at most 6 images/);
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
