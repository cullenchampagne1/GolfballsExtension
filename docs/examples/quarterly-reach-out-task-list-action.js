// Quarterly reach-out coverage — Task List custom action.
//
// Authoring settings:
//   Runs on: Custom (any page)
//   Entry point: .gb-task-list-modal
//
// The Task List provider supplies every loaded row under
// page.entryPoint.data.tasks, independent of the modal's current filters.
// Any dated task counts as scheduled contact for its contact + quarter.
// Every loaded dated task is reconciled so its live date is exactly two
// weeks before its due date. Legacy "Prior Year #N" subjects are renamed to
// "Order Anniversary Follow Up #N". Missing rolling quarters receive one
// task, and those new tasks receive the same two-week live-date offset.

const data = page.entryPoint?.data;
const taskRows = Array.isArray(data?.tasks) ? data.tasks : [];
const contacts = Array.isArray(data?.contacts) ? data.contacts : [];

if (!taskRows.length) {
  return "Skipped — Task List has no tasks to evaluate";
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

function isoDate(value) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0")
  ].join("-");
}

function liveDateFor(dueDate) {
  const liveDate = new Date(dueDate);
  liveDate.setDate(liveDate.getDate() - 14);
  return isoDate(liveDate);
}

function anniversarySubject(subject) {
  return String(subject || "").replace(
    /\bPrior\s+Year\s*#\s*(\d+)\b/gi,
    "Order Anniversary Follow Up #$1"
  );
}

function reconcileExistingTask(task) {
  if (!task?.id) return { liveDate: false, renamed: false };

  let liveDateChanged = false;
  let renamed = false;
  const dueDate = calendarDate(task.dueDate || task.due);
  if (dueDate) {
    task.liveDate = liveDateFor(dueDate);
    liveDateChanged = true;
  }

  const nextSubject = anniversarySubject(task.subject);
  if (nextSubject !== String(task.subject || "")) {
    task.subject = nextSubject;
    renamed = true;
  }

  // The task proxy automatically groups both assignments into one
  // confirmation-gated updateTask write at the end of the program.
  return { liveDate: liveDateChanged, renamed };
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
let liveDateUpdateCount = 0;
let renamedTaskCount = 0;

// progress.* drives the run modal (percentage, section label, live log) and
// gives the run a cancel point. The percentage total is derived automatically
// from the write plan; here we just label the phases and yield for cancel.
progress.log(`Evaluating ${taskRows.length} task(s) across ${contacts.length} contact(s).`);
progress.section("Reconciling existing task live dates & names");

for (const task of taskRows) {
  const result = reconcileExistingTask(task);
  if (result.liveDate) liveDateUpdateCount += 1;
  if (result.renamed) renamedTaskCount += 1;
}

// Group by a stable key: the real contact id when the row exposed one, else
// the task's own id (the executor resolves the real contact from taskId at
// write time). This keeps contacts whose row had no usable contact link.
function contactKey(row) {
  const cid = String(row?.contactId || "");
  if (cid) return cid;
  return row?.id ? "task:" + row.id : "";
}

for (const contact of contacts) {
  const key = String(contact?.key || contactKey(contact) || "");
  if (!key) continue;
  contactPlans.set(key, {
    key,
    contactId: String(contact.contactId || ""),
    taskId: String(contact.taskId || ""),
    contactName: String(contact.contactName || contact.contactId || key),
    accountId: String(contact.accountId || ""),
    accountName: String(contact.accountName || ""),
    occupied: new Set()
  });
}

for (const task of taskRows) {
  const key = contactKey(task);
  const dueDate = calendarDate(task?.dueDate || task?.due);
  const plan = key ? contactPlans.get(key) : null;
  if (plan && dueDate) plan.occupied.add(quarterKey(dueDate));
}

let createdCount = 0;
let coveredCount = 0;
let touchedContacts = 0;

progress.section(`Creating quarterly reach-outs for ${contactPlans.size} contact(s)`);

for (const plan of contactPlans.values()) {
  // Yield once per contact: repaints the modal and, if the user hit Cancel,
  // throws to stop the run before any more tasks are created.
  await progress.checkpoint();
  let contactCreated = 0;
  for (const slot of targetQuarters) {
    if (plan.occupied.has(slot.key)) {
      coveredCount += 1;
      continue;
    }

    const created = await actions.createTask({
      contactId: plan.contactId,
      taskId: plan.taskId,   // executor resolves the real contact from this when contactId is unusable
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
    if (created?.taskId) {
      await actions.updateTask({
        id: created.taskId,
        fields: {
          liveDate: liveDateFor(slot.dueDate)
        }
      });
    }
    plan.occupied.add(slot.key);
    createdCount += 1;
    contactCreated += 1;
  }
  if (contactCreated) touchedContacts += 1;
}

return [
  `Updated ${liveDateUpdateCount} existing live date(s)`,
  `and renamed ${renamedTaskCount} anniversary task(s).`,
  `Created ${createdCount} quarterly reach-out task(s)`,
  `for ${touchedContacts} contact(s)`,
  `with live dates two weeks before due,`,
  `and preserved ${coveredCount} already-covered contact-quarter(s).`
].join(" ");
