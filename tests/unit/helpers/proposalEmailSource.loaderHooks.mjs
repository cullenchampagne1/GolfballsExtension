/**
 * Module-loader hooks for tests/unit/proposalEmailSource.test.mjs.
 *
 * proposalEmailSource.js statically imports:
 *   • ../modals/giftCustomize.jsx — 2,400 lines of JSX node cannot parse;
 *     only `colorNameOf` is used. Redirected to a tiny stub.
 *   • ./saveProposal.js — chrome.storage/network-backed cart loading.
 *     Redirected to a stub that serves fixtures from
 *     globalThis.__gbTestProposalCarts.
 *
 * Everything else (cartSerializer, giftCatalogMath, giftImprints, giftSets…)
 * resolves normally so the real pipeline logic is under test.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('modals/giftCustomize.jsx')) {
    return { url: new URL('./stub-giftCustomize.mjs', import.meta.url).href, shortCircuit: true };
  }
  if (specifier.endsWith('/saveProposal.js')) {
    return { url: new URL('./stub-saveProposal.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
