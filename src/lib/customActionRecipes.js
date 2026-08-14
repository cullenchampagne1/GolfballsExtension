/* Ready-to-edit programs for the Custom Action editor. Recipes only seed the
   draft; they never save or run until the rep explicitly does so. */

export const PRIOR_YEAR_REORDER_SOURCE = `// Contact action: reuse an open opportunity (or create one), rebuild the
// newest order that exposes a usable Duplicate Order cart against today's
// catalog, save it as a fully editable proposal, and email its customer link.
// Required saved email: "Prior Year" (autocomplete: user.emails.PriorYear).

const today = new Date();
const closeDate = new Date(today);
closeDate.setDate(closeDate.getDate() + 30);

function isoDate(value) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0")
  ].join("-");
}

const monthName = today.toLocaleString("en-US", { month: "long" });
const opportunity = await actions.ensureOpenOpportunity({
  subject: \`\${monthName} Order\`,
  description: "Current-catalog proposal built from the newest reusable prior order.",
  estimatedCloseDate: isoDate(closeDate),
  estimatedValue: Number(page.stats?.avgOrderSize) || 0,
  stage: "Open"
});

const proposal = await actions.createProposalFromOrder({
  opportunityId: opportunity.opportunityId,
  name: \`\${monthName} reorder proposal\`
});

const email = await page.evaluate(user.emails.PriorYear);
email.attachProposal(proposal, "View your updated proposal");
await actions.sendEmail(email);

return "Prior Year proposal created and email sent";
`;

export const SKU_PROPOSAL_SOURCE = `// Contact action: create a proposal directly from current catalog SKUs.
// Omit price to use today's quantity-break price. Set customLogo:false when
// you explicitly want the stock product instead of its commissionable version.

const opportunity = await actions.ensureOpenOpportunity({
  subject: "New catalog proposal",
  description: "Proposal assembled from current catalog SKUs.",
  estimatedCloseDate: new Date().toISOString().slice(0, 10),
  stage: "Open"
});

const proposal = await actions.createProposal({
  opportunityId: opportunity.opportunityId,
  name: "Custom catalog proposal",
  items: [
    { sku: "B5338", quantity: 12 },
    { sku: "M6428", quantity: 24, price: 29.95 }
  ]
});

// The saved proposal appears under Current Proposals and opens with the full
// Gift Catalog editor: products, logo options, variants, splits, prices, promo,
// expiration, preview, and sharing remain available.
return proposal.proposalUrl;
`;

export const CUSTOM_ACTION_RECIPES = Object.freeze([
  Object.freeze({
    id: 'prior-year-reorder',
    name: 'Prior Year Reorder',
    description: 'Find or create an opportunity, rebuild the latest usable order, and email its proposal.',
    icon: 'card',
    pageType: 'contact',
    source: PRIOR_YEAR_REORDER_SOURCE,
  }),
  Object.freeze({
    id: 'sku-proposal',
    name: 'Proposal from SKUs',
    description: 'Build an editable current-catalog proposal from SKU, quantity, and optional price.',
    icon: 'card',
    pageType: 'contact',
    source: SKU_PROPOSAL_SOURCE,
  }),
]);

export function customActionRecipe(id) {
  return CUSTOM_ACTION_RECIPES.find((recipe) => recipe.id === id) || null;
}
