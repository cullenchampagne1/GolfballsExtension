// Close the current open opportunity and create this month's replacement.
//
// Setup:
//   Runs on: Contact (Account also works when it exposes a writer contact)
//   Entry point: leave empty
//
// Referencing page.opportunities tells the runtime to call Opportunity/Get
// for every row before this code runs. Each item therefore includes the full
// editable record plus isClosed / isWon / isLost helpers.

const currentOpportunity = page.opportunities.find((opportunity) => !opportunity.isClosed);

if (currentOpportunity) {
  currentOpportunity.stage = "Closed - Lost";

  // commit() preserves the requested order: the read-merge-write update must
  // finish before the replacement opportunity is created.
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
const visibleOrderValues = (page.orders || [])
  .map((order) => Number(order.revenue))
  .filter((value) => Number.isFinite(value) && value > 0);
const visibleOrderAverage = visibleOrderValues.length
  ? visibleOrderValues.reduce((sum, value) => sum + value, 0) / visibleOrderValues.length
  : 0;
const crmAverage = Number(page.stats?.avgOrderSize);
const estimatedValue = Math.round(
  (Number.isFinite(crmAverage) && crmAverage > 0 ? crmAverage : visibleOrderAverage) * 100
) / 100;

const created = await actions.createOpportunity({
  subject: `${monthName} Order`,
  description: "Monthly order opportunity created from the contact action.",
  estimatedCloseDate: isoDate(closeDate),
  estimatedValue,
  stage: "Open"
});

return currentOpportunity
  ? `Closed ${currentOpportunity.subject} as lost and created ${monthName} Order`
  : `Created ${monthName} Order (no open opportunity needed closing)`;
