/**
 * Extract the proposal rows rendered by the native CRM Opportunity page.
 *
 * The CRM does not expose a separate deleted flag. Instead, it marks the
 * proposal name cell (`<cartId>row`) with an inline line-through. Preserve that
 * marker so proposal surfaces can present deleted proposals the same way.
 */

function hasLineThrough(node) {
  if (!node) return false;
  const inline = typeof node.getAttribute === 'function' ? (node.getAttribute('style') || '') : '';
  const decoration = [
    inline,
    node.style && node.style.textDecoration,
    node.style && node.style.textDecorationLine,
  ].filter(Boolean).join(' ');
  return /\bline-through\b/i.test(decoration);
}

function isDeletedProposal(toggle, cartId, doc) {
  const row = typeof toggle.closest === 'function' ? toggle.closest('tr') : null;
  const nameCell = (doc && typeof doc.getElementById === 'function')
    ? doc.getElementById(`${cartId}row`)
    : null;
  if (hasLineThrough(nameCell) || hasLineThrough(toggle.closest && toggle.closest('td')) || hasLineThrough(row)) return true;
  if (!row || typeof row.querySelectorAll !== 'function') return false;
  return Array.from(row.querySelectorAll('[style]')).some(hasLineThrough);
}

export function extractOpportunityProposals(doc = globalThis.document) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return [];
  const out = [];
  const seen = new Set();

  try {
    doc.querySelectorAll('[onchange*="ProposalCheckToggle"], [onclick*="ProposalCheckToggle"]').forEach((el) => {
      const handler = el.getAttribute('onchange') || el.getAttribute('onclick') || '';
      const match = /ProposalCheckToggle\(\s*this\s*,\s*'((?:\\.|[^'])*)'\s*,\s*'((?:\\.|[^'])*)'\s*,\s*'((?:\\.|[^'])*)'\s*,\s*([^)]*)\)/.exec(handler);
      if (!match || seen.has(match[1])) return;

      const cartId = match[1];
      seen.add(cartId);
      out.push({
        cartId,
        name: (match[2] || '').replace(/\\'/g, "'").trim(),
        expiration: match[3],
        newSite: /true/i.test(match[4]),
        deleted: isDeletedProposal(el, cartId, doc),
      });
    });
  } catch {
    return out;
  }

  return out;
}

const DELETED_PROPOSAL_TEXT_STYLE = Object.freeze({
  textDecoration: 'line-through',
  textDecorationThickness: '1px',
});

export function proposalTextStyle(proposal) {
  return proposal && proposal.deleted ? DELETED_PROPOSAL_TEXT_STYLE : null;
}
