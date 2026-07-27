// Prior-year anniversary + brand-tier timeline.
//
// Run this campaign against CONTACT or ACCOUNT records from CRM Search. The
// campaign engine runs this body once per selected record and hydrates that
// record's own page.orders + page.tasks list before it starts.
//
// It also maintains one long-range brand task per first-word product brand:
//   1 order → Tier 3 · 2–3 orders → Tier 2 · 4+ orders → Tier 1.

const DAY_MS = 24 * 60 * 60 * 1000;
const BRAND_TASK_YEAR = 2030;
const BRAND_TASK_MONTH = 11; // December (zero-based)
const BRAND_TASK_DAY = 17;
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function calendarDate(value) {
  if (!value) return null;

  // page.orders dates are calendar dates. Preserve their YYYY-MM-DD portion
  // instead of letting a timezone turn midnight UTC into the previous day.
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12);
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function makeCalendarDate(year, month, day) {
  return new Date(year, month, Math.min(day, daysInMonth(year, month)), 12);
}

function addDays(value, amount) {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

function mondayBefore(value) {
  const monday = new Date(value);
  const weekday = monday.getDay();
  // "Monday before" means the previous Monday when the anniversary itself
  // falls on Monday, not the same day.
  const daysBack = weekday === 0 ? 6 : weekday === 1 ? 7 : weekday - 1;
  monday.setDate(monday.getDate() - daysBack);
  return monday;
}

function calendarDayNumber(value) {
  return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / DAY_MS;
}

function formatMonthDay(value) {
  return `${MONTHS[value.getMonth()]} ${value.getDate()}`;
}

function formatShortDate(value) {
  return `${value.getMonth() + 1}/${value.getDate()}/${value.getFullYear()}`;
}

function quarterNumber(value) {
  return Math.floor(value.getMonth() / 3) + 1;
}

function quarterKey(value) {
  return `${value.getFullYear()}-Q${quarterNumber(value)}`;
}

function rollingQuarter(offset, today) {
  const absolute = today.getFullYear() * 4 + Math.floor(today.getMonth() / 3) + offset;
  const year = Math.floor(absolute / 4);
  const quarter = (absolute % 4) + 1;
  let dueDate = new Date(year, (quarter - 1) * 3 + 1, 15, 12);
  if (offset === 0 && calendarDayNumber(dueDate) < calendarDayNumber(today)) {
    dueDate = new Date(today);
  }
  return { year, quarter, key: `${year}-Q${quarter}`, dueDate };
}

function brandFromOrder(order) {
  const title = String(order?.summary || order?.title || "").trim();
  const firstWord = title.split(/\s+/)[0] || "";
  // Keep ordinary brand punctuation (TaylorMade+, A.G., etc.) while dropping
  // trademark symbols or row decoration around the first word.
  return firstWord
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/[^A-Za-z0-9&+.'’/-]+$/, "");
}

function tierForOrderCount(count) {
  if (count >= 4) return 1;
  if (count >= 2) return 2;
  return 3;
}

function describeOrder(order, parsedDate = null) {
  const number = order?.number ? `#${order.number}` : "Order";
  const date = parsedDate || calendarDate(order?.date);
  const summary = String(order?.summary || order?.title || "No description").trim();
  return [number, date ? formatShortDate(date) : null, summary]
    .filter(Boolean)
    .join(" · ");
}

const allOrders = Array.isArray(page.orders) ? page.orders : [];
const orders = allOrders
  .map((order) => ({ order, date: calendarDate(order.date) }))
  .filter((entry) => entry.date);

// Count order rows by the first word in the product title. The order history
// is the authority here: a $0.01 completed order still establishes that this
// customer buys the brand.
const brandGroups = new Map();
for (const order of allOrders) {
  const brand = brandFromOrder(order);
  if (!brand) continue;
  const key = brand.toLowerCase();
  if (!brandGroups.has(key)) {
    brandGroups.set(key, { brand, orders: [] });
  }
  brandGroups.get(key).orders.push(order);
}

// A source period is one source year + calendar month. Multiple orders in
// that period become one anniversary whose day is the rounded average.
const grouped = new Map();
for (const entry of orders) {
  const sourceYear = entry.date.getFullYear();
  const month = entry.date.getMonth();
  const key = `${sourceYear}-${month}`;
  if (!grouped.has(key)) {
    grouped.set(key, { sourceYear, month, days: [], orders: [] });
  }
  const group = grouped.get(key);
  group.days.push(entry.date.getDate());
  group.orders.push(entry);
}

// A customer may reorder in the same month across several years. Keep only
// that month's newest source year so one calendar month can never create
// several competing Prior Year campaigns.
const mostRecentGroupByMonth = new Map();
for (const group of grouped.values()) {
  const current = mostRecentGroupByMonth.get(group.month);
  if (!current || group.sourceYear > current.sourceYear) {
    mostRecentGroupByMonth.set(group.month, group);
  }
}

const anniversaries = [...mostRecentGroupByMonth.values()]
  .map((group) => ({
    ...group,
    latestSourceTime: Math.max(...group.orders.map(({ date }) => date.getTime())),
    averageDay: Math.min(
      daysInMonth(group.sourceYear, group.month),
      Math.max(1, Math.round(group.days.reduce((sum, day) => sum + day, 0) / group.days.length))
    )
  }))
  .sort((a, b) => a.month - b.month || a.sourceYear - b.sourceYear);

const brandPlans = [...brandGroups.values()]
  .map((group) => ({
    ...group,
    tier: tierForOrderCount(group.orders.length)
  }))
  .sort((a, b) => a.brand.localeCompare(b.brand));

// Reset only the timelines this campaign owns. Unrelated open tasks stay
// untouched. A prior tier for a detected brand is replaced even if its order
// count moved that customer into another tier.
const openTasks = page.tasks?.open || [];
const oldPriorYearTasks = anniversaries.length
  ? openTasks.filter((task) => /prior[\s_-]*year/i.test(String(task.subject || "")))
  : [];
const oldBrandTasks = openTasks.filter((task) => {
  const subject = String(task.subject || "").trim().toLowerCase();
  return brandPlans.some((plan) => (
    subject.startsWith(`${plan.brand.toLowerCase()} customer - tier `)
    && /[123]$/.test(subject)
  ));
});
for (const task of oldPriorYearTasks) {
  await task.complete();
}
for (const task of oldBrandTasks) {
  await task.complete();
}

const today = new Date();
today.setHours(12, 0, 0, 0);
const recordName = page.account?.name
  || page.contact?.companyName
  || page.contact?.contactName
  || "Current record";

function buildCampaign(anniversary) {
  let cycleYear = today.getFullYear();

  const buildCycle = (year) => {
    const anniversaryDate = makeCalendarDate(year, anniversary.month, anniversary.averageDay);
    return {
      anniversaryDate,
      tasks: [
        { number: 1, timing: "3 weeks before", date: addDays(anniversaryDate, -21) },
        { number: 2, timing: "2 weeks before", date: addDays(anniversaryDate, -14) },
        { kind: "call", timing: "1 week before", date: addDays(anniversaryDate, -7) },
        { number: 3, timing: "Monday before", date: mondayBefore(anniversaryDate) }
      ]
    };
  };

  let cycle = buildCycle(cycleYear);
  // Keep the four-task sequence together. Once its first step is no longer
  // in the future, schedule the whole fresh sequence for next year's cycle.
  if (calendarDayNumber(cycle.tasks[0].date) <= calendarDayNumber(today)) {
    cycleYear += 1;
    cycle = buildCycle(cycleYear);
  }

  return {
    key: `${anniversary.sourceYear}-${anniversary.month}`,
    anniversary,
    ...cycle
  };
}

// Resolve close campaigns before writing anything. Newer source evidence wins:
// after ranking by the latest supporting order, reject a different campaign
// when any of its four tasks would land within 20 calendar days of a task in
// an accepted campaign. The four tasks inside one campaign are intentionally
// exempt from this guard.
const rankedCampaigns = anniversaries
  .map(buildCampaign)
  .sort((a, b) => (
    b.anniversary.latestSourceTime - a.anniversary.latestSourceTime
    || b.anniversary.sourceYear - a.anniversary.sourceYear
    || b.anniversary.month - a.anniversary.month
  ));
const scheduledCampaigns = [];
const scheduledTaskDates = [];
const skippedCampaigns = [];

for (const campaign of rankedCampaigns) {
  const conflict = campaign.tasks.some((candidateTask) => (
    scheduledTaskDates.some((scheduledTask) => (
      scheduledTask.campaignKey !== campaign.key
      && Math.abs(
        calendarDayNumber(candidateTask.date) - calendarDayNumber(scheduledTask.date)
      ) <= 20
    ))
  ));

  if (conflict) {
    skippedCampaigns.push(campaign);
    continue;
  }

  scheduledCampaigns.push(campaign);
  for (const task of campaign.tasks) {
    scheduledTaskDates.push({ campaignKey: campaign.key, date: task.date });
  }
}

// Ranking decides which campaigns survive; task creation remains chronological.
scheduledCampaigns.sort((a, b) => (
  calendarDayNumber(a.tasks[0].date) - calendarDayNumber(b.tasks[0].date)
));

let createdCount = 0;
for (const campaign of scheduledCampaigns) {
  const { anniversary, anniversaryDate, tasks } = campaign;
  const sourceOrders = anniversary.orders
    .slice()
    .sort((a, b) => a.date - b.date)
    .map(({ order, date }) => describeOrder(order, date))
    .join("\n");

  for (const task of tasks) {
    const body = [
      `Prior-year reorder timeline for ${recordName}.`,
      `Source period: ${MONTHS[anniversary.month]} ${anniversary.sourceYear}.`,
      `Averaged reorder anniversary: ${formatMonthDay(anniversaryDate)}.`,
      `Scheduled cycle: ${formatShortDate(anniversaryDate)}.`,
      `Follow-up timing: ${task.timing}.`,
      "",
      "Source orders:",
      sourceOrders
    ].join("\n").slice(0, 4000);

    await actions.createTask({
      subject: task.kind === "call"
        ? `Prior Year Call - [${MONTHS[anniversary.month]}]`
        : `Prior Year #${task.number} [${anniversary.sourceYear}]`,
      body,
      priority: "med",
      daysOut: Math.max(0, Math.round(
        calendarDayNumber(task.date) - calendarDayNumber(today)
      ))
    });
    createdCount += 1;
  }
}

// Maintain one scheduled contact opportunity in every quarter of the rolling
// four-quarter window. Any existing dated task counts as coverage, as do the
// fresh Prior Year tasks planned above. Tasks this campaign just retired do
// not count toward the new schedule.
const resetTasks = new Set([...oldPriorYearTasks, ...oldBrandTasks]);
const occupiedQuarterKeys = new Set();
for (const task of [
  ...openTasks.filter((candidate) => !resetTasks.has(candidate)),
  ...(page.tasks?.done || [])
]) {
  const dueDate = calendarDate(task?.dueDate || task?.due || task?.date);
  if (dueDate) occupiedQuarterKeys.add(quarterKey(dueDate));
}
for (const campaign of scheduledCampaigns) {
  for (const task of campaign.tasks) {
    occupiedQuarterKeys.add(quarterKey(task.date));
  }
}

let quarterlyCreatedCount = 0;
let quarterlyCoveredCount = 0;
const targetQuarters = [0, 1, 2, 3].map((offset) => rollingQuarter(offset, today));
for (const slot of targetQuarters) {
  if (occupiedQuarterKeys.has(slot.key)) {
    quarterlyCoveredCount += 1;
    continue;
  }

  await actions.createTask({
    subject: `Q${slot.quarter} Reach Out Opportunity`,
    body: [
      `Quarterly reach-out coverage for ${recordName}.`,
      `Coverage period: Q${slot.quarter} ${slot.year}.`,
      "Created because no existing or newly planned task covered this quarter."
    ].join("\n"),
    priority: "med",
    daysOut: Math.max(
      0,
      Math.round(calendarDayNumber(slot.dueDate) - calendarDayNumber(today))
    )
  });
  occupiedQuarterKeys.add(slot.key);
  quarterlyCreatedCount += 1;
}

const brandTaskDate = makeCalendarDate(
  BRAND_TASK_YEAR,
  BRAND_TASK_MONTH,
  BRAND_TASK_DAY
);
const brandDaysOut = Math.max(
  0,
  Math.round(calendarDayNumber(brandTaskDate) - calendarDayNumber(today))
);
let brandCreatedCount = 0;

for (const plan of brandPlans) {
  const sourceOrders = [...plan.orders]
    .sort((a, b) => {
      const left = calendarDate(a.date);
      const right = calendarDate(b.date);
      return (left?.getTime() || 0) - (right?.getTime() || 0);
    })
    .map((order) => describeOrder(order))
    .join("\n");
  const body = [
    `Brand-customer classification for ${recordName}.`,
    `Brand: ${plan.brand}.`,
    `Order count: ${plan.orders.length}.`,
    `Tier: ${plan.tier}.`,
    "Tier rules: 1 order = Tier 3; 2–3 orders = Tier 2; 4+ orders = Tier 1.",
    `Review date: ${formatShortDate(brandTaskDate)}.`,
    "",
    "Matching orders:",
    sourceOrders
  ].join("\n").slice(0, 4000);

  await actions.createTask({
    subject: `${plan.brand} Customer - Tier ${plan.tier}`,
    body,
    priority: "med",
    daysOut: brandDaysOut
  });
  brandCreatedCount += 1;
}

return [
  `Completed ${oldPriorYearTasks.length} old Prior Year task(s)`,
  `completed ${oldBrandTasks.length} old brand task(s)`,
  `created ${createdCount} fresh Prior Year task(s) across ${scheduledCampaigns.length} anniversary date(s)`,
  `skipped ${grouped.size - anniversaries.length} older same-month source period(s)`,
  `skipped ${skippedCampaigns.length} overlapping Prior Year campaign(s)`,
  `created ${quarterlyCreatedCount} quarterly reach-out task(s)`,
  `preserved ${quarterlyCoveredCount} covered quarter(s)`,
  `and created ${brandCreatedCount} brand task(s)`
].join(", ");
