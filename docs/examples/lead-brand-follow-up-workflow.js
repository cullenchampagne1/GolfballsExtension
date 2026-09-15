// Route every lead to a brand-specific email from its account order history,
// then create a follow-up task after the email succeeds.
//
// Setup:
//   Runs on: Contact or Account (an account must expose a writer contact)
//   Saved emails required, with these exact names:
//     "Titleist", "Srixon", "Bridgestone", "TaylorMade", "Callaway", "Check In"
//   Entry point: leave empty
//
// "Top brand" means the supported brand found in the greatest number of
// orders during the rolling two-calendar-year period. The most recently
// ordered brand wins a tie. An order may count for more than one brand when
// its visible order text contains products from multiple supported brands.

const BRAND_ROUTES = [
  { name: "Titleist", pattern: /\btitleist\b/i },
  { name: "Srixon", pattern: /\bsrixon\b/i },
  { name: "Bridgestone", pattern: /\bbridgestone\b/i },
  { name: "TaylorMade", pattern: /\btaylor\s*made\b/i },
  { name: "Callaway", pattern: /\bcallaway\b/i }
];

const CHECK_IN_TEMPLATE = "Check In";
const FOLLOW_UP_DAYS = 3;

function calendarDate(value) {
  if (!value) return null;
  const calendarMatch = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (calendarMatch) {
    const parsed = new Date(
      Number(calendarMatch[1]),
      Number(calendarMatch[2]) - 1,
      Number(calendarMatch[3]),
      12
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function orderSearchText(order) {
  const itemText = (Array.isArray(order?.items) ? order.items : [])
    .map((item) => [item?.brand, item?.name, item?.title, item?.description].join(" "))
    .join(" ");
  return [
    order?.brand,
    order?.summary,
    order?.title,
    order?.description,
    itemText
  ].join(" ");
}

const recipient = String(page.contact?.email || "").trim();
if (!recipient) {
  return "Skipped — the lead has no email address";
}

const today = new Date();
today.setHours(12, 0, 0, 0);
const cutoff = new Date(today);
cutoff.setFullYear(cutoff.getFullYear() - 2);

const recentOrders = (Array.isArray(page.orders) ? page.orders : [])
  .map((order) => ({ order, date: calendarDate(order?.date) }))
  .filter(({ date }) => date && date >= cutoff && date <= today);

const brandRanking = BRAND_ROUTES.map((brand, priority) => {
  const matchingOrders = recentOrders.filter(({ order }) => (
    brand.pattern.test(orderSearchText(order))
  ));
  const latestOrderTime = matchingOrders.reduce(
    (latest, entry) => Math.max(latest, entry.date.getTime()),
    0
  );
  return {
    name: brand.name,
    priority,
    orderCount: matchingOrders.length,
    latestOrderTime
  };
}).sort((left, right) => (
  right.orderCount - left.orderCount
  || right.latestOrderTime - left.latestOrderTime
  || left.priority - right.priority
));

const topBrand = brandRanking.find((brand) => brand.orderCount > 0) || null;
const templateName = topBrand?.name || CHECK_IN_TEMPLATE;
const email = await page.evaluate(user.email(templateName));

await actions.sendEmail(email);

await actions.createTask({
  subject: `Follow up — ${templateName} lead email`,
  body: topBrand
    ? `Follow up after the ${topBrand.name} email. ${topBrand.orderCount} matching order(s) were found in the last two years.`
    : "Follow up after the Check In email. No supported-brand order was found in the last two years.",
  priority: "med",
  daysOut: FOLLOW_UP_DAYS
});

return topBrand
  ? `Sent ${topBrand.name} email and scheduled follow-up (${topBrand.orderCount} recent order(s))`
  : "Sent Check In email and scheduled follow-up";
