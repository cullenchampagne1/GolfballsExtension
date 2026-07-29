// Quarterly reach-out coverage — Task List custom action.
//
// Authoring settings:
//   Runs on: Custom (any page)
//   Entry point: .gb-task-list-modal
//
// The Task List provider supplies every loaded row under
// page.entryPoint.data.tasks, independent of the modal's current filters.
// Any dated task counts as scheduled contact for its contact + quarter.
// Only tasks this flow OWNS are ever edited: legacy "Prior Year #N [year]"
// subjects are renamed to "Order Anniversary Follow Up #N [followUpYear]" —
// the number is kept and the year is refreshed to the task's due-date year —
// and those anniversary tasks get a live date exactly two weeks before their
// due date. Every other task (promotion follow-ups, manual follow-ups, brand
// tiers) counts toward quarter coverage but keeps its subject, live date, and
// category untouched. Missing rolling quarters receive one task placed at the
// middle of the gap between the contact's surrounding touches (same rule as
// the reconciliation campaign), with the same two-week live-date offset.

const data = page.entryPoint?.data;
const taskRows = Array.isArray(data?.tasks) ? data.tasks : [];
const contacts = Array.isArray(data?.contacts) ? data.contacts : [];

if (!taskRows.length) {
  return "Skipped — Task List has no tasks to evaluate";
}

const DAY_MS = 24 * 60 * 60 * 1000;

/* CRM task categories are numeric wire ids (taskCategoryID). Labels are what
   the UI shows; the ids are what Update/Create accept. */
const ANNIVERSARY_CATEGORY_ID = 7;                       // "Order History Special"
const ANNIVERSARY_CATEGORY_LABEL = "Order History Special";
const QUARTERLY_CATEGORY_ID = 14;                        // "Workflow Task"
const QUARTERLY_SUBJECT_RE = /^Q[1-4] Reach Out Opportunity$/i;
/* The only existing tasks this action is allowed to edit: the legacy
   "Prior Year …" subjects and their renamed "Order Anniversary Follow Up"
   successors. Anything else on the list is someone else's task. */
const ANNIVERSARY_SUBJECT_RE = /\bPrior\s+Year\b|\bOrder\s+Anniversary\s+Follow\s+Up\b/i;

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

// Inverse of calendarDayNumber — read the UTC fields so negative-offset
// timezones don't slide the calendar day back by one.
function dateFromDayNumber(dayNumber) {
  const utc = new Date(dayNumber * DAY_MS);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), 12);
}

/* Same placement rule as the reconciliation campaign: the reach-out sits at
   the middle of the real gap around the quarter — from the last touch at or
   before the window to the next touch landing by the end of the FOLLOWING
   quarter (else the start of the following quarter); touches inside the
   window split it and the largest gap wins; clamped into the quarter, never
   in the past. Here `busy` is the contact's dated Task List rows (including
   existing quarterly tasks — this surface never re-places them). */
function gapMidpointForSlot(slot, busy, today) {
  const todayNum = calendarDayNumber(today);
  const qStartNum = calendarDayNumber(new Date(slot.year, (slot.quarter - 1) * 3, 1, 12));
  const qEndNum = calendarDayNumber(new Date(slot.year, (slot.quarter - 1) * 3 + 3, 0, 12));
  const windowStart = Math.max(qStartNum, todayNum);
  if (windowStart > qEndNum) return null;
  const followingQuarterEnd = calendarDayNumber(new Date(slot.year, (slot.quarter - 1) * 3 + 6, 0, 12));

  const sorted = [...busy].sort((a, b) => a - b);
  const before = sorted.filter((day) => day <= windowStart);
  const gapStart = before.length ? before[before.length - 1] : windowStart;
  const inside = sorted.filter((day) => day > windowStart && day <= qEndNum);
  const after = sorted.find((day) => day > qEndNum && day <= followingQuarterEnd);
  const gapEnd = after != null ? after : qEndNum + 1;

  const boundaries = [gapStart, ...inside, gapEnd];
  let best = null;
  for (let i = 0; i + 1 < boundaries.length; i += 1) {
    const span = boundaries[i + 1] - boundaries[i];
    if (!best || span > best.span) {
      best = { span, mid: Math.round((boundaries[i] + boundaries[i + 1]) / 2) };
    }
  }
  return dateFromDayNumber(Math.min(qEndNum, Math.max(windowStart, best.mid)));
}

// Rename a legacy "Prior Year …" subject to the "Order Anniversary Follow Up"
// wording, keeping the sequence number exactly (#2 stays #2) and refreshing the
// [year] bracket to the follow-up year when one is known. `followUpYear` comes
// from the task's own due date — the year the reach-out actually happens — so
// "Prior Year #1 [2018]" due in 2028 becomes "Order Anniversary Follow Up #1
// [2028]". With no follow-up year the original bracket is left intact. The Call
// variant ("Prior Year Call - [Month]") is renamed too, month bracket kept.
function anniversarySubject(subject, followUpYear) {
  const yr = followUpYear ? String(followUpYear) : null;
  return String(subject || "")
    .replace(
      /\bPrior\s+Year\s*#\s*(\d+)\s*(\[[^\]]*\])?/gi,
      (_match, number, bracket) =>
        `Order Anniversary Follow Up #${number}` +
        (yr ? ` [${yr}]` : bracket ? ` ${bracket}` : "")
    )
    .replace(/\bPrior\s+Year\s+Call\b/gi, "Order Anniversary Follow Up Call");
}

function reconcileExistingTask(task) {
  if (!task?.id) return { liveDate: false, renamed: false };

  // Quarterly reach-out tasks this action created on a previous run are
  // OFF-LIMITS: never edit (or re-create/delete) an existing one.
  if (QUARTERLY_SUBJECT_RE.test(String(task.subject || ""))) {
    return { liveDate: false, renamed: false };
  }

  // Every other task that isn't a Prior Year / Order Anniversary subject —
  // promotion follow-ups, manual follow-ups, brand tiers — is OFF-LIMITS
  // too. Rewriting a promotion task's live date to due − 14 pushed tasks
  // due more than two weeks out past "live", which hid them from the Task
  // List pull entirely. They still count as quarter coverage below.
  if (!ANNIVERSARY_SUBJECT_RE.test(String(task.subject || ""))) {
    return { liveDate: false, renamed: false };
  }

  let liveDateChanged = false;
  let renamed = false;
  const dueDate = calendarDate(task.dueDate || task.due);
  if (dueDate) {
    task.liveDate = liveDateFor(dueDate);
    liveDateChanged = true;
  }

  // Follow-up year = the due-date year, so the bracket tracks when the
  // reach-out is scheduled rather than the original order year.
  const followUpYear = dueDate ? dueDate.getFullYear() : null;
  const nextSubject = anniversarySubject(task.subject, followUpYear);
  if (nextSubject !== String(task.subject || "")) {
    task.subject = nextSubject;
    renamed = true;
  }
  // Anniversary tasks (just renamed OR renamed on an earlier run) also get
  // the Order History Special category — sent as the CRM's numeric wire id.
  if (/\bOrder Anniversary Follow Up\b/i.test(nextSubject)
      && String(task.category || "").trim() !== ANNIVERSARY_CATEGORY_LABEL) {
    task.categoryId = ANNIVERSARY_CATEGORY_ID;
  }

  // The task proxy automatically groups the assignments into one
  // confirmation-gated updateTask write at the end of the program.
  return { liveDate: liveDateChanged, renamed };
}

function rollingQuarter(offset, today) {
  const absolute = today.getFullYear() * 4 + Math.floor(today.getMonth() / 3) + offset;
  const year = Math.floor(absolute / 4);
  const quarter = (absolute % 4) + 1;
  return { year, quarter, key: `${year}-Q${quarter}` };
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
    occupied: new Set(),
    busy: []
  });
}

for (const task of taskRows) {
  const key = contactKey(task);
  const dueDate = calendarDate(task?.dueDate || task?.due);
  const plan = key ? contactPlans.get(key) : null;
  if (!plan) continue;
  if (dueDate) {
    plan.occupied.add(quarterKey(dueDate));
    plan.busy.push(calendarDayNumber(dueDate));
  }
  // Belt-and-braces dedupe: an EXISTING "QN Reach Out Opportunity" on this
  // contact claims its quarter even when its due date was cleared/moved, so
  // re-running the action can never create a second copy of the same slot.
  const m = String(task?.subject || "").match(QUARTERLY_SUBJECT_RE);
  if (m) {
    const qn = Number(String(task.subject).charAt(1));
    for (const slot of targetQuarters) {
      if (slot.quarter === qn) plan.occupied.add(slot.key);
    }
  }
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

    const dueDate = gapMidpointForSlot(slot, plan.busy, today);
    if (!dueDate) {
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
        "Created from the Task List because no dated task covered this quarter.",
        "Scheduled at the middle of the gap between surrounding touches."
      ].filter(Boolean).join("\n"),
      categoryId: QUARTERLY_CATEGORY_ID,   // "Workflow Task"
      priority: "med",
      daysOut: Math.max(
        0,
        Math.round(calendarDayNumber(dueDate) - calendarDayNumber(today))
      )
    });
    if (created?.taskId) {
      await actions.updateTask({
        id: created.taskId,
        fields: {
          liveDate: liveDateFor(dueDate)
        }
      });
    }
    plan.occupied.add(slot.key);
    plan.busy.push(calendarDayNumber(dueDate));
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
