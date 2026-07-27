// Prior-year anniversary timeline.
//
// Run this campaign against ACCOUNT records from CRM Search. The campaign
// engine runs this body once per account and hydrates page.orders + the
// account-wide page.tasks list before it starts.

const DAY_MS = 24 * 60 * 60 * 1000;
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

const orders = (Array.isArray(page.orders) ? page.orders : [])
  .map((order) => ({ order, date: calendarDate(order.date) }))
  .filter((entry) => entry.date);

if (!orders.length) {
  return "Skipped — this account has no dated orders";
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

const anniversaries = [...grouped.values()]
  .map((group) => ({
    ...group,
    averageDay: Math.min(
      daysInMonth(group.sourceYear, group.month),
      Math.max(1, Math.round(group.days.reduce((sum, day) => sum + day, 0) / group.days.length))
    )
  }))
  .sort((a, b) => a.month - b.month || a.sourceYear - b.sourceYear);

// Reset only the old Prior Year timeline. Unrelated open tasks stay untouched.
const oldPriorYearTasks = (page.tasks?.open || [])
  .filter((task) => /prior[\s_-]*year/i.test(String(task.subject || "")));
for (const task of oldPriorYearTasks) {
  await task.complete();
}

const today = new Date();
today.setHours(12, 0, 0, 0);
const accountName = page.account?.name
  || page.contact?.companyName
  || page.contact?.contactName
  || "Current account";
let createdCount = 0;

for (const anniversary of anniversaries) {
  let cycleYear = today.getFullYear();

  const buildCycle = (year) => {
    const anniversaryDate = makeCalendarDate(year, anniversary.month, anniversary.averageDay);
    return {
      anniversaryDate,
      tasks: [
        { number: 1, timing: "3 weeks before", date: addDays(anniversaryDate, -21) },
        { number: 2, timing: "2 weeks before", date: addDays(anniversaryDate, -14) },
        { number: 3, timing: "Monday before", date: mondayBefore(anniversaryDate) }
      ]
    };
  };

  let cycle = buildCycle(cycleYear);
  // Keep the three-task sequence together. Once its first step is no longer
  // in the future, schedule the whole fresh sequence for next year's cycle.
  if (calendarDayNumber(cycle.tasks[0].date) <= calendarDayNumber(today)) {
    cycleYear += 1;
    cycle = buildCycle(cycleYear);
  }

  const sourceOrders = anniversary.orders
    .sort((a, b) => a.date - b.date)
    .map(({ order, date }) => {
      const number = order.number ? `#${order.number}` : "Order";
      const summary = String(order.summary || order.title || "No description").trim();
      return `${number} · ${formatShortDate(date)} · ${summary}`;
    })
    .join("\n");

  for (const task of cycle.tasks) {
    const body = [
      `Prior-year reorder timeline for ${accountName}.`,
      `Source period: ${MONTHS[anniversary.month]} ${anniversary.sourceYear}.`,
      `Averaged reorder anniversary: ${formatMonthDay(cycle.anniversaryDate)}.`,
      `Scheduled cycle: ${formatShortDate(cycle.anniversaryDate)}.`,
      `Follow-up timing: ${task.timing}.`,
      "",
      "Source orders:",
      sourceOrders
    ].join("\n").slice(0, 4000);

    await actions.createTask({
      subject: `Prior Year #${task.number} [${anniversary.sourceYear}] · ${formatMonthDay(cycle.anniversaryDate)}`,
      body,
      priority: "med",
      daysOut: Math.max(0, Math.round(
        calendarDayNumber(task.date) - calendarDayNumber(today)
      ))
    });
    createdCount += 1;
  }
}

return `Completed ${oldPriorYearTasks.length} old Prior Year task(s) and created ${createdCount} fresh task(s) across ${anniversaries.length} anniversary date(s)`;
