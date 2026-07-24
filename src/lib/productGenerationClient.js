const ACTIVE_BATCH_STATUSES = new Set(['queued', 'running']);
const TERMINAL_BATCH_STATUSES = new Set([
  'completed', 'partial', 'failed', 'cancelled',
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanId(value) {
  return String(value || '').trim().toLowerCase();
}

function runtimeMessage(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message || 'Extension request failed'));
          return;
        }
        if (!response?.ok) {
          const error = new Error(response?.error || 'Extension request failed');
          error.status = Number(response?.status || 0);
          reject(error);
          return;
        }
        resolve(response.payload);
      });
    } catch (error) {
      reject(error);
    }
  });
}

export function normalizeStudioBootstrap(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const studio = source.studio && typeof source.studio === 'object'
    ? source.studio : {};
  const constraints = studio.constraints && typeof studio.constraints === 'object'
    ? studio.constraints : {};
  return {
    studio: {
      configuration_revision: String(studio.configuration_revision || ''),
      product_count: Math.max(0, Number(studio.product_count) || 0),
      constraints: {
        max_products: Math.max(1, Number(constraints.max_products) || 5),
        max_variations: Math.max(1, Number(constraints.max_variations) || 4),
        max_images: Math.max(1, Number(constraints.max_images) || 20),
      },
      scenes: asArray(studio.scenes),
      aspects: asArray(studio.aspects),
      lighting: asArray(studio.lighting),
    },
    products: asArray(source.products),
    batches: asArray(source.batches),
  };
}

export function createProductGenerationRequestId(now = Date.now(), random = Math.random()) {
  const time = Math.max(0, Number(now) || 0).toString(36);
  const nonce = Math.floor(Math.max(0, Math.min(0.999999999, Number(random) || 0)) * 0xFFFFFFFF)
    .toString(36)
    .padStart(7, '0');
  return `mockup:${time}:${nonce}`;
}

export function buildProductGenerationBatchRequest({
  studio,
  requestId,
  name,
  productIds,
  sceneId,
  aspectId,
  lightingId,
  variations,
  brief = '',
}) {
  const constraints = studio?.constraints || {};
  const ids = [...new Set(asArray(productIds).map(cleanId).filter(Boolean))];
  const count = Number(variations);
  const maxProducts = Number(constraints.max_products) || 5;
  const maxVariations = Number(constraints.max_variations) || 4;
  const maxImages = Number(constraints.max_images) || 20;
  const optionIds = (key) => new Set(asArray(studio?.[key]).map((item) => cleanId(item?.id)));
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,79}$/.test(String(requestId || ''))) {
    throw new Error('A valid request id is required');
  }
  if (!ids.length || ids.length > maxProducts) {
    throw new Error(`Select between 1 and ${maxProducts} products`);
  }
  if (!Number.isInteger(count) || count < 1 || count > maxVariations) {
    throw new Error(`Choose between 1 and ${maxVariations} variations`);
  }
  if (ids.length * count > maxImages) {
    throw new Error(`A batch can contain at most ${maxImages} images`);
  }
  const selectedScene = cleanId(sceneId);
  const selectedAspect = cleanId(aspectId);
  const selectedLighting = cleanId(lightingId);
  if (!optionIds('scenes').has(selectedScene)
      || !optionIds('aspects').has(selectedAspect)
      || !optionIds('lighting').has(selectedLighting)) {
    throw new Error('Choose valid scene, aspect, and lighting options');
  }
  return {
    requestId: String(requestId),
    name: String(name || 'Mockup batch').trim().slice(0, 120) || 'Mockup batch',
    productIds: ids,
    sceneId: selectedScene,
    aspectId: selectedAspect,
    lightingId: selectedLighting,
    variations: count,
    brief: String(brief || '').trim().slice(0, 2_000),
  };
}

export function isActiveProductGenerationBatch(batch) {
  return ACTIVE_BATCH_STATUSES.has(String(batch?.status || ''));
}

export function isTerminalProductGenerationBatch(batch) {
  return TERMINAL_BATCH_STATUSES.has(String(batch?.status || ''));
}

export async function bootstrapProductGenerationStudio() {
  return normalizeStudioBootstrap(await runtimeMessage({
    action: 'productGenerationBootstrap',
  }));
}

export async function listProductGenerationBatches() {
  const payload = await runtimeMessage({ action: 'productGenerationListBatches' });
  return asArray(payload?.batches);
}

export function createProductGenerationBatch(input) {
  return runtimeMessage({
    action: 'productGenerationCreateBatch',
    ...buildProductGenerationBatchRequest(input),
  });
}

export function getProductGenerationBatch(batchId) {
  return runtimeMessage({
    action: 'productGenerationGetBatch',
    batchId: String(batchId || ''),
  });
}

export function cancelProductGenerationBatch(batchId) {
  return runtimeMessage({
    action: 'productGenerationCancelBatch',
    batchId: String(batchId || ''),
  });
}

export function deleteProductGenerationBatch(batchId) {
  return runtimeMessage({
    action: 'productGenerationDeleteBatch',
    batchId: String(batchId || ''),
  });
}
