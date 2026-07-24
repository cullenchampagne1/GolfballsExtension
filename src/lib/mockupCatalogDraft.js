/**
 * Mockup catalog authoring — the pure draft model behind the admin sub-modal.
 *
 * A draft is the editor's own shape (axes with picked values, a sparse map of
 * reference cells). `buildCatalogProduct` lowers that into the exact managed
 * document the backend loader accepts:
 *
 *   axes            → option_groups[]        (1-6 groups, <=20 options each)
 *   picked combos   → sources[]              (each maps EVERY group, needs an image)
 *   placements      → variations[]           (imprint locations, >=1)
 *
 * The combination grid is deliberately SPARSE: the live towel ships 11 sources
 * for a 2x6 grid because there is no grass/white photo. Only cells carrying a
 * reference image become sources, so a hole is a normal authoring state rather
 * than an error.
 *
 * Nothing here touches the network or the DOM — the modal owns that, and these
 * rules stay unit-testable against the real loader's constraints.
 */

/** Mirrors the loader: OPTION_ID_RE / PRODUCT_ID_RE. */
const OPTION_ID_RE = /^[a-z0-9][a-z0-9._-]{0,39}$/;
const PRODUCT_ID_RE = /^[a-z0-9][a-z0-9._-]{0,99}$/;
const PROMPT_VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;

export const MAX_OPTION_GROUPS = 6;
export const MAX_OPTIONS_PER_GROUP = 20;
export const MAX_SOURCES = 20;
export const MAX_VARIATIONS = 20;
export const MIN_PRODUCT_PROMPT = 20;
export const MAX_PRODUCT_PROMPT = 16_000;
export const MAX_OPTION_PROMPT = 2_000;
export const MIN_VARIATION_PROMPT = 10;

const PRESENTATIONS = new Set(['button', 'swatch', 'thumbnail']);

/** Slugify a human label into a loader-legal id ("Golf course" → "golf-course"). */
export function toOptionId(value, fallback = '') {
  const id = String(value ?? '')
    .trim().toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/[-._]+$/, '')
    .slice(0, 40);
  return OPTION_ID_RE.test(id) ? id : fallback;
}

export function toProductId(value, fallback = '') {
  const id = String(value ?? '')
    .trim().toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/[-._]+$/, '')
    .slice(0, 100);
  return PRODUCT_ID_RE.test(id) ? id : fallback;
}

/** A catalog product's faceted `properties` → a selectable authoring axis. */
export function axisFromCatalogProperty(property, { limit = MAX_OPTIONS_PER_GROUP } = {}) {
  const label = String(property?.label || '').trim();
  const seen = new Set();
  const options = [];
  for (const raw of Array.isArray(property?.options) ? property.options : []) {
    const optionLabel = String(raw ?? '').trim();
    if (!optionLabel) continue;
    const id = toOptionId(optionLabel);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    options.push({ id, label: optionLabel.slice(0, 80), description: '', swatch: '' });
    if (options.length >= limit) break;
  }
  if (!label || !options.length) return null;
  // "Accessories Color" / "Apparel Color" both author as the `color` axis so
  // the generated ids stay readable across categories.
  const words = label.split(/\s+/);
  const tail = words[words.length - 1] || label;
  return {
    id: toOptionId(tail, toOptionId(label, 'option')),
    label: tail.replace(/^./, (c) => c.toUpperCase()).slice(0, 80),
    description: '',
    presentation: /colou?r/i.test(label) ? 'swatch' : 'button',
    columns: /colou?r/i.test(label) ? 3 : 2,
    source: 'catalog',
    catalogLabel: label,
    options,
  };
}

/** Every axis combination, in axis order — the grid the editor renders. */
export function combinationsOf(axes) {
  const list = Array.isArray(axes) ? axes.filter((a) => a?.options?.length) : [];
  if (!list.length) return [];
  return list.reduce(
    (rows, axis) => rows.flatMap(
      (row) => axis.options.map((option) => [...row, { axis: axis.id, option: option.id }]),
    ),
    [[]],
  );
}

/** Stable id/key for one combination cell ("studio-black"). */
export function combinationKey(combination) {
  return (Array.isArray(combination) ? combination : [])
    .map((entry) => entry.option).join('-');
}

export function combinationValues(combination) {
  return Object.fromEntries(
    (Array.isArray(combination) ? combination : []).map((e) => [e.axis, e.option]),
  );
}

function labelFor(axes, combination) {
  const byAxis = new Map(axes.map((axis) => [axis.id, axis]));
  return combination
    .map((entry) => {
      const option = byAxis.get(entry.axis)?.options
        ?.find((candidate) => candidate.id === entry.option);
      return option?.label || entry.option;
    })
    .join(' · ')
    .slice(0, 160);
}

/**
 * Lower a draft into one managed catalog product.
 *
 * Returns `{ product, issues }`. `issues` lists every blocking problem in the
 * loader's own terms, so the editor can show them inline instead of waiting
 * for a rejected write.
 */
export function buildCatalogProduct(draft) {
  const issues = [];
  const axes = (Array.isArray(draft?.axes) ? draft.axes : [])
    .filter((axis) => axis?.enabled !== false && axis?.options?.length);
  const cells = draft?.cells && typeof draft.cells === 'object' ? draft.cells : {};

  const id = toProductId(draft?.id || draft?.title);
  const title = String(draft?.title || '').trim().slice(0, 160);
  const prompt = String(draft?.prompt || '').trim();
  const promptVersion = String(draft?.promptVersion || '').trim();
  const displayImageUrl = String(draft?.displayImageUrl || '').trim();

  if (!id) issues.push('Product id must be lowercase letters, numbers, dot, dash, or underscore');
  if (!title) issues.push('Product title is required');
  if (prompt.length < MIN_PRODUCT_PROMPT) {
    issues.push(`Product prompt must be at least ${MIN_PRODUCT_PROMPT} characters`);
  }
  if (prompt.length > MAX_PRODUCT_PROMPT) {
    issues.push(`Product prompt must be at most ${MAX_PRODUCT_PROMPT} characters`);
  }
  if (!PROMPT_VERSION_RE.test(promptVersion)) {
    issues.push('Prompt version is required (letters, numbers, dot, dash, colon)');
  }
  if (axes.length > MAX_OPTION_GROUPS) {
    issues.push(`A product supports at most ${MAX_OPTION_GROUPS} option groups`);
  }

  const seenAxis = new Set();
  const optionGroups = axes.map((axis) => {
    const axisId = toOptionId(axis.id, toOptionId(axis.label));
    if (!axisId) issues.push(`Option group “${axis.label || axis.id}” needs a valid id`);
    else if (seenAxis.has(axisId)) issues.push(`Option group “${axisId}” is duplicated`);
    seenAxis.add(axisId);
    if (axis.options.length > MAX_OPTIONS_PER_GROUP) {
      issues.push(`Option group “${axisId}” exceeds ${MAX_OPTIONS_PER_GROUP} options`);
    }
    const group = {
      id: axisId,
      label: String(axis.label || axisId).trim().slice(0, 80),
      description: String(axis.description || '').trim().slice(0, 300),
      presentation: PRESENTATIONS.has(axis.presentation) ? axis.presentation : 'button',
      columns: Math.min(6, Math.max(1, Number(axis.columns) || 3)),
      options: axis.options.slice(0, MAX_OPTIONS_PER_GROUP).map((option) => {
        const row = {
          id: toOptionId(option.id, toOptionId(option.label)),
          label: String(option.label || option.id).trim().slice(0, 80),
          description: String(option.description || '').trim().slice(0, 300),
        };
        const swatch = String(option.swatch || '').trim();
        if (swatch) row.swatch = swatch.slice(0, 200);
        if (!row.description) delete row.description;
        return row;
      }),
    };
    if (!group.description) delete group.description;
    return group;
  });

  // Only cells that carry a reference image become sources — a hole in the
  // grid is a normal authoring state, not an error.
  const sources = [];
  for (const combination of combinationsOf(axes)) {
    const key = combinationKey(combination);
    const cell = cells[key];
    const referenceUrl = String(cell?.referenceUrl || '').trim();
    if (!referenceUrl) continue;
    const source = {
      id: key,
      label: labelFor(axes, combination),
      description: String(cell?.description || '').trim().slice(0, 500),
      option_values: combinationValues(combination),
      reference_image_url: referenceUrl,
      thumbnail_url: String(cell?.thumbnailUrl || '').trim() || referenceUrl,
    };
    const cellPrompt = String(cell?.prompt || '').trim();
    if (cellPrompt) source.prompt = cellPrompt.slice(0, MAX_OPTION_PROMPT);
    if (!source.description) delete source.description;
    if (!axes.length) delete source.option_values;
    sources.push(source);
  }

  if (!sources.length) {
    issues.push('Add a reference photo to at least one combination');
  } else if (sources.length > MAX_SOURCES) {
    issues.push(
      `${sources.length} references exceed the ${MAX_SOURCES}-source limit — `
      + 'remove options or split the product',
    );
  }

  const placements = (Array.isArray(draft?.placements) ? draft.placements : [])
    .filter((placement) => String(placement?.label || '').trim());
  const variations = (placements.length ? placements : [{
    id: 'personalized-logo',
    label: 'Personalized logo',
    description: '',
    prompt: '',
  }]).slice(0, MAX_VARIATIONS).map((placement) => {
    const row = {
      id: toOptionId(placement.id, toOptionId(placement.label)),
      label: String(placement.label || '').trim().slice(0, 160),
      description: String(placement.description || '').trim().slice(0, 500),
      prompt: String(placement.prompt || '').trim().slice(0, MAX_OPTION_PROMPT),
    };
    if (row.prompt && row.prompt.length < MIN_VARIATION_PROMPT) {
      issues.push(
        `Placement “${row.label}” prompt must be empty or at least `
        + `${MIN_VARIATION_PROMPT} characters`,
      );
    }
    const reference = String(placement.referenceUrl || '').trim();
    if (reference) row.reference_image_url = reference;
    if (!row.description) delete row.description;
    return row;
  });

  const display = displayImageUrl || sources[0]?.reference_image_url || '';
  if (!display) issues.push('A display image is required');

  const product = {
    id,
    title,
    ...(draft?.brand ? { brand: String(draft.brand).trim().slice(0, 120) } : {}),
    ...(draft?.category ? { category: String(draft.category).trim().slice(0, 120) } : {}),
    ...(draft?.description
      ? { description: String(draft.description).trim().slice(0, 500) } : {}),
    display_image_url: display,
    ...(draft?.catalogSku ? { catalog_sku: String(draft.catalogSku).trim().slice(0, 80) } : {}),
    ...(draft?.catalogId ? { catalog_id: String(draft.catalogId).trim().slice(0, 120) } : {}),
    enabled: draft?.enabled !== false,
    sort: Number.isInteger(draft?.sort) ? draft.sort : 10,
    prompt_version: promptVersion,
    prompt,
    ...(optionGroups.length ? { option_groups: optionGroups } : {}),
    sources,
    variations,
  };
  return { product, issues };
}

/** Rebuild an editor draft from a managed product, so editing round-trips. */
export function draftFromCatalogProduct(product) {
  const groups = Array.isArray(product?.option_groups) ? product.option_groups : [];
  const cells = {};
  for (const source of Array.isArray(product?.sources) ? product.sources : []) {
    const key = groups.length
      ? groups.map((group) => String(source?.option_values?.[group.id] || '')).join('-')
      : String(source?.id || '');
    cells[key] = {
      referenceUrl: String(source?.reference_image_url || ''),
      thumbnailUrl: String(source?.thumbnail_url || ''),
      prompt: String(source?.prompt || ''),
      description: String(source?.description || ''),
    };
  }
  return {
    id: String(product?.id || ''),
    title: String(product?.title || ''),
    brand: String(product?.brand || ''),
    category: String(product?.category || ''),
    description: String(product?.description || ''),
    displayImageUrl: String(product?.display_image_url || ''),
    catalogSku: String(product?.catalog_sku || ''),
    catalogId: String(product?.catalog_id || ''),
    enabled: product?.enabled !== false,
    sort: Number.isInteger(product?.sort) ? product.sort : 10,
    promptVersion: String(product?.prompt_version || ''),
    prompt: String(product?.prompt || ''),
    axes: groups.map((group) => ({
      id: String(group?.id || ''),
      label: String(group?.label || ''),
      description: String(group?.description || ''),
      presentation: PRESENTATIONS.has(group?.presentation) ? group.presentation : 'button',
      columns: Math.min(6, Math.max(1, Number(group?.columns) || 3)),
      enabled: true,
      source: 'existing',
      options: (Array.isArray(group?.options) ? group.options : []).map((option) => ({
        id: String(option?.id || ''),
        label: String(option?.label || ''),
        description: String(option?.description || ''),
        swatch: String(option?.swatch || ''),
      })),
    })),
    cells,
    placements: (Array.isArray(product?.variations) ? product.variations : []).map((row) => ({
      id: String(row?.id || ''),
      label: String(row?.label || ''),
      description: String(row?.description || ''),
      prompt: String(row?.prompt || ''),
      referenceUrl: String(row?.reference_image_url || ''),
    })),
  };
}

/** Replace-or-append a product within the managed products list, by id. */
export function mergeCatalogProduct(products, product) {
  const list = Array.isArray(products) ? products : [];
  const index = list.findIndex((row) => String(row?.id || '') === product.id);
  if (index < 0) return [...list, product];
  return list.map((row, position) => (position === index ? product : row));
}

/** The reference filename for one cell, matching the shipped towel convention. */
export function referenceNameFor(combination) {
  return combinationKey(combination) || 'reference';
}
