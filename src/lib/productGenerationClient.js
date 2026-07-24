const ACTIVE_BATCH_STATUSES = new Set(['queued', 'running']);
const TERMINAL_BATCH_STATUSES = new Set([
  'completed', 'partial', 'failed', 'cancelled',
]);
const MAX_LOGO_BYTES = 12 * 1024 * 1024;
const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const RESULT_ASSET_CACHE = new Map();
const BATCH_ID_RE = /^batch_[a-f0-9]{32}$/;

export const PRODUCT_GENERATION_OPEN_BATCH_EVENT = (
  'gb:product-generation:open-batch'
);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanId(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeProductGenerationBatchId(value) {
  const batchId = String(value || '').trim();
  return BATCH_ID_RE.test(batchId) ? batchId : '';
}

export function mergeProductGenerationBatch(rows, batch) {
  const batchId = normalizeProductGenerationBatchId(batch?.batch_id);
  if (!batchId) return asArray(rows);
  return [
    batch,
    ...asArray(rows).filter((row) => row?.batch_id !== batchId),
  ];
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
        max_images: Math.max(1, Number(constraints.max_images) || 20),
      },
    },
    products: asArray(source.products).map((product) => ({
      ...product,
      option_groups: asArray(product?.option_groups).map((group) => ({
        ...group,
        options: asArray(group?.options),
      })),
      sources: asArray(product?.sources),
      variations: asArray(product?.variations),
    })),
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

export function createDefaultProductGenerationSelection(product) {
  const firstSource = asArray(product?.sources)[0];
  const firstVariation = asArray(product?.variations)[0];
  const faceted = asArray(product?.option_groups).length > 0;
  return {
    sourceIds: !faceted && firstSource?.id ? [cleanId(firstSource.id)] : [],
    variationIds: firstVariation?.id ? [cleanId(firstVariation.id)] : [],
    optionValues: { ...(firstSource?.option_values || {}) },
  };
}

export function resolveProductGenerationFacet({
  product, currentOptionValues, groupId, optionId,
}) {
  const groups = asArray(product?.option_groups);
  const sources = asArray(product?.sources);
  const normalizedGroup = cleanId(groupId);
  const normalizedOption = cleanId(optionId);
  const groupIndex = groups.findIndex(
    (group) => cleanId(group?.id) === normalizedGroup,
  );
  if (groupIndex < 0) return null;
  const desired = {
    ...(currentOptionValues || {}),
    [normalizedGroup]: normalizedOption,
  };
  let source = sources.find((candidate) => groups.every((group) => {
    const id = cleanId(group?.id);
    return desired[id]
      && cleanId(candidate?.option_values?.[id]) === cleanId(desired[id]);
  }));
  if (!source) {
    const lockedGroups = groups.slice(0, groupIndex);
    source = sources.find((candidate) => (
      cleanId(candidate?.option_values?.[normalizedGroup]) === normalizedOption
      && lockedGroups.every((group) => {
        const id = cleanId(group?.id);
        return !desired[id]
          || cleanId(candidate?.option_values?.[id]) === cleanId(desired[id]);
      })
    ));
  }
  if (!source) return null;
  return {
    sourceId: cleanId(source.id),
    optionValues: { ...(source.option_values || {}) },
  };
}

export function updateProductGenerationFacetSelection({
  product, selection, groupId, optionId,
}) {
  const groups = asArray(product?.option_groups);
  const groupIndex = groups.findIndex(
    (group) => cleanId(group?.id) === cleanId(groupId),
  );
  if (groupIndex < 0) return null;
  const current = selection && typeof selection === 'object' ? selection : {};
  const resolved = resolveProductGenerationFacet({
    product,
    currentOptionValues: current.optionValues,
    groupId,
    optionId,
  });
  if (!resolved) return null;
  const sourceIds = asArray(current.sourceIds).map(cleanId).filter(Boolean);
  if (groupIndex === groups.length - 1) {
    const nextIds = sourceIds.includes(resolved.sourceId)
      ? sourceIds.filter((id) => id !== resolved.sourceId)
      : [...sourceIds, resolved.sourceId];
    return {
      ...current,
      sourceIds: nextIds,
      optionValues: resolved.optionValues,
    };
  }
  return {
    ...current,
    sourceIds,
    optionValues: resolved.optionValues,
  };
}

export function buildProductGenerationBatchRequest({
  studio,
  products,
  requestId,
  name,
  selections,
  logo,
}) {
  const constraints = studio?.constraints || {};
  const maxProducts = Number(constraints.max_products) || 5;
  const maxImages = Number(constraints.max_images) || 20;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,79}$/.test(String(requestId || ''))) {
    throw new Error('A valid request id is required');
  }
  const productMap = new Map(
    asArray(products).map((product) => [cleanId(product?.id), product]),
  );
  const normalizedSelections = asArray(selections).map((selection) => {
    const productId = cleanId(selection?.productId);
    const product = productMap.get(productId);
    const sourceIds = [...new Set(
      asArray(selection?.sourceIds).map(cleanId).filter(Boolean),
    )];
    const variationIds = [...new Set(
      asArray(selection?.variationIds).map(cleanId).filter(Boolean),
    )];
    const availableSources = new Set(
      asArray(product?.sources).map((item) => cleanId(item?.id)),
    );
    const availableVariations = new Set(
      asArray(product?.variations).map((item) => cleanId(item?.id)),
    );
    if (!product
        || !sourceIds.length || sourceIds.some((id) => !availableSources.has(id))
        || !variationIds.length
        || variationIds.some((id) => !availableVariations.has(id))) {
      throw new Error('Choose valid product references and imprint variations');
    }
    return {
      productId,
      sourceIds,
      variationIds,
    };
  });
  if (!normalizedSelections.length || normalizedSelections.length > maxProducts) {
    throw new Error(`Select between 1 and ${maxProducts} products`);
  }
  if (new Set(normalizedSelections.map((row) => row.productId)).size
      !== normalizedSelections.length) {
    throw new Error('Each product can be selected only once');
  }
  const imageCount = normalizedSelections.reduce(
    (total, row) => total + (row.sourceIds.length * row.variationIds.length),
    0,
  );
  if (imageCount > maxImages) {
    throw new Error(`A batch can contain at most ${maxImages} images`);
  }
  const normalizedLogo = logo && typeof logo === 'object' ? {
    filename: String(logo.filename || '').trim().slice(0, 180),
    mediaType: String(logo.mediaType || '').trim().toLowerCase(),
    dataBase64: String(logo.dataBase64 || ''),
  } : {};
  if (!normalizedLogo.filename
      || !LOGO_TYPES.has(normalizedLogo.mediaType)
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalizedLogo.dataBase64)
      || normalizedLogo.dataBase64.length > (MAX_LOGO_BYTES * 4 / 3) + 8) {
    throw new Error('Add a valid PNG, JPEG, or WebP logo');
  }
  return {
    requestId: String(requestId),
    name: String(name || 'Mockup batch').trim().slice(0, 120) || 'Mockup batch',
    selections: normalizedSelections,
    logo: normalizedLogo,
  };
}

export async function prepareProductGenerationLogo(file) {
  const mediaType = String(file?.type || '').toLowerCase();
  const size = Number(file?.size || 0);
  if (!file || !LOGO_TYPES.has(mediaType) || size < 1 || size > MAX_LOGO_BYTES) {
    throw new Error('Choose a PNG, JPEG, or WebP logo up to 12 MB');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return {
    filename: String(file.name || 'logo').trim().slice(0, 180) || 'logo',
    mediaType,
    dataBase64: btoa(binary),
    sizeBytes: bytes.length,
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
  const normalized = normalizeProductGenerationBatchId(batchId);
  if (!normalized) {
    return Promise.reject(new Error('Invalid product mockup batch'));
  }
  return runtimeMessage({
    action: 'productGenerationGetBatch',
    batchId: normalized,
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

export function getProductGenerationResult(jobId) {
  const id = String(jobId || '').trim();
  if (!/^img_[a-f0-9]{32}$/.test(id)) {
    return Promise.reject(new Error('Invalid product mockup image'));
  }
  if (!RESULT_ASSET_CACHE.has(id)) {
    const request = runtimeMessage({
      action: 'productGenerationGetResult',
      jobId: id,
    }).catch((error) => {
      RESULT_ASSET_CACHE.delete(id);
      throw error;
    });
    RESULT_ASSET_CACHE.set(id, request);
  }
  return RESULT_ASSET_CACHE.get(id);
}
