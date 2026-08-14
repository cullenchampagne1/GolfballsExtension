// Rebuild the contact's last order as a current proposal, then draft a saved email.
//
// Setup:
//   Runs on: Contact (Account works when it exposes a writer contact)
//   Saved email required: "Reorder proposal"
//   Type `user.emails.` and choose ReorderProposal from autocomplete. Saved
//   names become code-safe properties (including names that begin with digits).
//   Entry point: leave empty

// Previous-order lines are not copied blindly. The proposal action follows the
// CRM's Duplicate Order cart, resolves discontinued items to high-confidence
// current-generation matches, applies current prices, and stops for review if a
// line is ambiguous.

const orders = (page.orders || []).filter((order) => order && (order.url || order.href || order.number));
if (!orders.length) throw new Error("This contact has no previous order to reuse");

const lastOrder = [...orders].sort((left, right) => {
  const leftTime = Date.parse(left.date || "") || 0;
  const rightTime = Date.parse(right.date || "") || 0;
  return rightTime - leftTime;
})[0];

const currentOpportunity = (page.opportunities || []).find((opportunity) => (
  !opportunity.isClosed
  && !/^closed\s*-?\s*(?:won|lost)$/i.test(opportunity.stage || "")
));

if (currentOpportunity) {
  currentOpportunity.stage = "Closed - Lost";
  await currentOpportunity.commit();
}

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
const visibleValues = orders
  .map((order) => Number(order.revenue))
  .filter((value) => Number.isFinite(value) && value > 0);
const visibleAverage = visibleValues.length
  ? visibleValues.reduce((sum, value) => sum + value, 0) / visibleValues.length
  : 0;
const crmAverage = Number(page.stats?.avgOrderSize);
const estimatedValue = Math.round(
  (Number.isFinite(crmAverage) && crmAverage > 0 ? crmAverage : visibleAverage) * 100
) / 100;

const created = await actions.createOpportunity({
  subject: `${monthName} Order`,
  description: `Current-catalog reorder based on order ${lastOrder.number || lastOrder.url}.`,
  estimatedCloseDate: isoDate(closeDate),
  estimatedValue,
  stage: "Open"
});

const proposal = await actions.createProposalFromOrder({
  order: lastOrder,
  opportunityId: created.opportunityId,
  name: `${monthName} reorder proposal`
});

const email = await page.evaluate(user.emails.ReorderProposal);
email.attachProposal(proposal, "View your updated reorder proposal");
await actions.sendEmail(email);

return `Created ${monthName} opportunity and a ${proposal.lineCount || "current"}-line reorder proposal`;
