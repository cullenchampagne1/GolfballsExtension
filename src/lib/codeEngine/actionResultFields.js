/* Serializable fields a dry sandbox exposes for dependent action steps. */

const PROPOSAL_FIELDS = Object.freeze([
  'proposalId', 'cartID', 'proposalUrl', 'proposalUrlHtml', 'opportunityId',
  'orderId', 'name', 'lineCount', 'itemCount', 'total', 'promoCode',
]);

export const ACTION_RESULT_FIELDS = Object.freeze({
  createTask: Object.freeze(['taskId']),
  createOpportunity: Object.freeze(['opportunityId']),
  ensureOpenOpportunity: Object.freeze(['opportunityId']),
  createProposalFromOrder: PROPOSAL_FIELDS,
  createProposal: PROPOSAL_FIELDS,
});
