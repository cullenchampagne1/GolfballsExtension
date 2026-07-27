// Quarterly reach-out coverage — Task List custom action.
//
// Authoring settings:
//   Runs on: Custom (any page)
//   Entry point: .gb-task-list-modal
//
// The Task List provider supplies every loaded row under
// page.entryPoint.data.tasks, independent of the modal's current filters.
// Any dated task counts as scheduled contact for its contact + quarter.
// Missing quarters in the rolling four-quarter window receive one task.

const data = page.entryPoint?.data;
const taskRows = Array.isArray(data?.tasks) ? data.tasks : [];
const contacts = Array.isArray(data?.contacts) ? data.contacts : [];

if (!taskRows.length || !contacts.length) {
  return "Skipped — Task List has no contact-linked tasks to evaluate";
}

const DAY_MS = 24 * 60 * 60 * 1000;

function calendarDate(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12);
}

function calendarDayNumber(value) {
  return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / DAY_MS;
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
  // Middle of the quarter keeps opportunities away from quarter boundaries.
  let dueDate = new Date(year, (quarter - 1) * 3 + 1, 15, 12);
  if (offset === 0 && calendarDayNumber(dueDate) < calendarDayNumber(today)) {
    dueDate = new Date(today);
  }
  return { year, quarter, key: `${year}-Q${quarter}`, dueDate };
}

const today = new Date();
today.setHours(12, 0, 0, 0);
const targetQuarters = [0, 1, 2, 3].map((offset) => rollingQuarter(offset, today));
const contactPlans = new Map();

for (const contact of contacts) {
  const contactId = String(contact?.contactId || "");
  if (!contactId) continue;
  contactPlans.set(contactId, {
    contactId,
    contactName: String(contact.contactName || contactId),
    accountId: String(contact.accountId || ""),
    accountName: String(contact.accountName || ""),
    occupied: new Set()
  });
}

for (const task of taskRows) {
  const contactId = String(task?.contactId || "");
  const dueDate = calendarDate(task?.dueDate || task?.due);
  const plan = contactPlans.get(contactId);
  if (plan && dueDate) plan.occupied.add(quarterKey(dueDate));
}

let createdCount = 0;
let coveredCount = 0;
let touchedContacts = 0;

for (const plan of contactPlans.values()) {
  let contactCreated = 0;
  for (const slot of targetQuarters) {
    if (plan.occupied.has(slot.key)) {
      coveredCount += 1;
      continue;
    }

    await actions.createTask({
      contactId: plan.contactId,
      contactName: plan.contactName,
      accountId: plan.accountId,
      subject: `Q${slot.quarter} Reach Out Opportunity`,
      body: [
        `Quarterly reach-out coverage for ${plan.contactName}.`,
        plan.accountName ? `Account: ${plan.accountName}.` : "",
        `Coverage period: Q${slot.quarter} ${slot.year}.`,
        "Created from the Task List because no dated task covered this quarter."
      ].filter(Boolean).join("\n"),
      priority: "med",
      daysOut: Math.max(
        0,
        Math.round(calendarDayNumber(slot.dueDate) - calendarDayNumber(today))
      )
    });
    plan.occupied.add(slot.key);
    createdCount += 1;
    contactCreated += 1;
  }
  if (contactCreated) touchedContacts += 1;
}

return [
  `Created ${createdCount} quarterly reach-out task(s)`,
  `for ${touchedContacts} contact(s)`,
  `and preserved ${coveredCount} already-covered contact-quarter(s)`
].join(" ");
