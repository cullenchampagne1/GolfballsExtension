// Rebuild the contact's newest reusable order as a current proposal, then send
// the saved Prior Year email with the generated customer link appended.
//
// Setup:
//   Runs on: Contact (Account works when it exposes a writer contact)
//   Saved email required: "Prior Year"
//   Type `user.emails.` and choose PriorYear from autocomplete. Saved
//   names become code-safe properties (including names that begin with digits).
//   Entry point: leave empty

// Previous-order lines are not copied blindly. The proposal action follows the
// CRM's Duplicate Order cart, resolves discontinued items to high-confidence
// current-generation matches, applies current prices, and stops for review if a
// line is ambiguous.

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
const visibleValues = (page.orders || [])
  .map((order) => Number(order.revenue))
  .filter((value) => Number.isFinite(value) && value > 0);
const visibleAverage = visibleValues.length
  ? visibleValues.reduce((sum, value) => sum + value, 0) / visibleValues.length
  : 0;
const crmAverage = Number(page.stats?.avgOrderSize);
const estimatedValue = Math.round(
  (Number.isFinite(crmAverage) && crmAverage > 0 ? crmAverage : visibleAverage) * 100
) / 100;

const opportunity = await actions.ensureOpenOpportunity({
  subject: `${monthName} Order`,
  description: "Current-catalog proposal built from the newest reusable prior order.",
  estimatedCloseDate: isoDate(closeDate),
  estimatedValue,
  stage: "Open"
});

const proposal = await actions.createProposalFromOrder({
  opportunityId: opportunity.opportunityId,
  name: `${monthName} reorder proposal`
});

const email = await page.evaluate(user.emails.PriorYear);
email.attachProposal(proposal, "View your updated reorder proposal");
await actions.sendEmail(email);

return "Prior Year proposal created and email sent";
