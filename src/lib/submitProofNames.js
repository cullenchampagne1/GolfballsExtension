const GIFT_SET_PREFIX = /^gift\s*set\b/i;

/** Keep the selected item intact for submission, but use the concise product
 * family anywhere the proof itself is named. */
export function proofItemLabel(item) {
  const label = String(item ?? '').trim();
  return GIFT_SET_PREFIX.test(label) ? 'Gift Set' : label;
}

/** The proof form uses friendly labels, while the legacy ASP.NET endpoint
 * expects its enum token without a space. Keep that conversion at the wire
 * boundary so the UI can continue displaying "Gift Set". */
export function proofLogoTypeValue(value) {
  const label = String(value ?? '').trim();
  return /^gift\s*set$/i.test(label) ? 'GiftSet' : label;
}

/** Build the names sent to the proof-link service and shown in its results.
 * Once gift-set variants share one concise label, number them as duplicates so
 * a multi-proof request still produces distinct names. */
export function buildAutoProofNames(proofName, selectedItems = []) {
  const base = String(proofName ?? '').trim();
  const labels = selectedItems.map(proofItemLabel);
  const totals = {};
  const seen = {};

  for (const label of labels) totals[label] = (totals[label] || 0) + 1;
  return labels.map((label) => {
    seen[label] = (seen[label] || 0) + 1;
    const suffix = totals[label] > 1 ? ` - ${seen[label]}` : '';
    return `${base} - ${label}${suffix}`;
  });
}

export function buildProofEmailSubject({
  rush = false,
  proofNames = [],
  orderType = '',
  orderValue = '',
  orderId = '',
} = {}) {
  const rushPrefix = rush ? 'Rush ' : '';
  const multiPrefix = proofNames.length > 1 ? 'Multi ' : '';
  const cleanValue = String(orderValue || '').replace('$', '');
  const names = proofNames.map((name) => String(name || '').trim()).filter(Boolean).join(', ');
  return `${rushPrefix}${multiPrefix}${orderType} ${cleanValue} - ${names} - ${String(orderId || '').trim() || 'N/A'}`.trim();
}
