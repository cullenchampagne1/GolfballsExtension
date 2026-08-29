/**
 * Content-free feature utilization events shared by extension workflow code.
 *
 * This module deliberately owns the only event shape feature code can send.
 * It accepts counts and fixed enum-like dimensions, never message content,
 * recipients, CRM identifiers, URLs, filenames, or search text.
 */

const MESSAGE = 'gbUsageEvent';

export const USAGE_FEATURES = Object.freeze([
  'email_send',
  'email_preview',
  'contact_import',
  'proof_submit',
  'gift_catalog_open',
  'gift_catalog_search',
  'gift_catalog_add',
  'gift_catalog_proposal_save',
  'gift_catalog_publish',
  'gift_catalog_email',
  'gift_catalog_checkout',
]);

export const USAGE_SOURCES = Object.freeze([
  'popup',
  'task_list',
  'crm_search',
  'email_preview',
  'contact',
  'submit_proof',
  'gift_catalog',
  'other',
]);

export const USAGE_TRANSPORTS = Object.freeze(['pa', 'mailto', 'none']);

const nonNegativeInt = (value, maximum = 1_000_000) => {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number >= 0 ? Math.min(number, maximum) : 0;
};

export function sendUsageEvent(event, { flush = 'periodic' } = {}) {
  if (globalThis.__gbUsageSilent) return false;
  try {
    chrome.runtime?.sendMessage?.({ action: MESSAGE, event, flush }, () => {
      void chrome.runtime?.lastError;
    });
    return true;
  } catch {
    // Analytics never interrupts the workflow it describes.
    return false;
  }
}

/** Record one fixed feature action. Numeric fields may already be aggregates. */
export function reportFeatureUsage(feature, dimensions = {}, options = {}) {
  return sendUsageEvent({
    kind: 'feature',
    feature,
    source: dimensions.source || 'other',
    ...(dimensions.transport ? { transport: dimensions.transport } : {}),
    count: Math.max(1, nonNegativeInt(dimensions.count || 1, 10_000)),
    word_count: nonNegativeInt(dimensions.word_count),
    attachment_count: nonNegativeInt(dimensions.attachment_count),
    inline_image_count: nonNegativeInt(dimensions.inline_image_count),
    ok: dimensions.ok !== false,
  }, options);
}

/**
 * Aggregate-only email dimensions. Word count excludes the stored signature:
 * callers provide the authored/rendered body, which makes comparisons between
 * templates meaningful instead of measuring the same signature every time.
 */
export function emailUsageDimensions(htmlBody, attachments = []) {
  const html = String(htmlBody || '');
  const withoutFileMarkers = html.replace(
    /<span\b[^>]*\bdata-gb-attach\s*=\s*(["'])[^"']*\1[^>]*>[\s\S]*?<\/span>/gi,
    ' ',
  );
  const text = withoutFileMarkers
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
  const words = text.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu) || [];
  const list = Array.isArray(attachments) ? attachments : [];
  const hasFileAttachment = /\bdata-gb-attach\s*=/i.test(html)
    || list.some((item) => item && item.isInline !== true);
  const hasInlineImage = /<img\b|\bcid:/i.test(html)
    || list.some((item) => item && item.isInline === true);
  return {
    word_count: words.length,
    attachment_count: hasFileAttachment ? 1 : 0,
    inline_image_count: hasInlineImage ? 1 : 0,
  };
}
