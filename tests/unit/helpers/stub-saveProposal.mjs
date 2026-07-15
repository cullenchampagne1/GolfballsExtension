/**
 * Stub for src/lib/saveProposal.js (chrome.storage + network backed).
 * Serves proposal-cart fixtures from globalThis.__gbTestProposalCarts —
 * each fixture is { lines: [...] } keyed by cartId. cartToEntry /
 * linesFromSaved collapse to a passthrough so the test controls the exact
 * lines entering proposalEmailSource's own pipeline.
 */
export async function loadProposalCart(cartId) {
  const carts = globalThis.__gbTestProposalCarts || {};
  if (!(cartId in carts)) throw new Error(`No test fixture for cart "${cartId}"`);
  return carts[cartId];
}

export function cartToEntry(cart, meta) {
  return { cart, meta };
}

export function linesFromSaved(entry) {
  return (entry && entry.cart && entry.cart.lines) || [];
}
