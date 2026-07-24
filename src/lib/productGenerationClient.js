const ACTIVE_BATCH_STATUSES = new Set(['queued', 'running']);
const TERMINAL_BATCH_STATUSES = new Set([
  'completed', 'partial', 'failed', 'cancelled',
]);
const MAX_LOGO_BYTES = 12 * 1024 * 1024;
const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

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
        max_images: Math.max(1, Number(constraints.max_images) || 20),
      },
      aspects: asArray(studio.aspects),
    },
    products: asArray(source.products).map((product) => ({
      ...product,
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

export function buildProductGenerationBatchRequest({
  studio,
  products,
  requestId,
  name,
  selections,
  aspectId,
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
  const selectedAspect = cleanId(aspectId);
  const aspects = new Set(
    asArray(studio?.aspects).map((item) => cleanId(item?.id)),
  );
  if (!aspects.has(selectedAspect)) {
    throw new Error('Choose a valid aspect ratio');
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
    aspectId: selectedAspect,
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
