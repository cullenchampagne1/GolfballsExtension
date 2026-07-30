// Full task reconciliation — single-record Custom Action.
//
// The SAME reconciliation the task-reconciliation-workflow.js workflow runs
// per audience record, packaged for one contact or account page — e.g. to
// initiate a brand-new account right from its page, or to re-check a single
// record after editing its tasks. The body below (from the Config marker) is
// IDENTICAL to the workflow file; a test enforces the two stay byte-identical.
//
// Custom Action setup (Actions → New action):
//   Runs on: Contact            ← the contact-page shelf
//   Entry point: (leave empty)
// Author a second copy with "Runs on: Account" to offer it on account pages
// too — account pages expose the same page.tasks / page.orders model, with
// the account's representative contact as the task writer.
//
// While on a contact (or account) page, the action appears in the Action
// Shelf. The live run reads the page through the page engine — page.orders,
// page.tasks.open / page.tasks.done (including tasks whose live date is in
// the future, which the Task List pull cannot show) — and every write goes
// through the ordinary confirmation screen. On a page that is not a CRM
// record (nothing extractable) the action skips instead of writing.
//
// What one run converges the record to — see the workflow file for the full
// rules: anniversary cycles edited in place (legacy "Prior Year …" renamed,
// live = due − 14, in-flight cycles preserved), promotion tasks live TODAY
// (config below), Q1–Q4 reach-outs placed and re-mediated at the middle of
// the gap between surrounding touches, brand tier tasks re-tiered in place.
// Running it twice in a row performs zero writes.

/* ── Config ─────────────────────────────────────────────────── */

// What counts as one of the active promotion's tasks (matched on subjects).
const PROMO_SUBJECT_RE = /srixon promotion/i;

// The full set of tasks the promotion should leave on each record. Missing
// subjects are created; daysOut sets the due date from today.
const PROMO_TASKS = [
  { subject: "#1 Srixon Promotion Campaign Follow Up", daysOut: 0 },
  { subject: "#2 Srixon Promotion Campaign Follow Up", daysOut: 7 },
];

/* CRM task categories are numeric wire ids; the page schema shows labels. */
const ANNIVERSARY_CATEGORY_ID = 7;
const ANNIVERSARY_CATEGORY_LABEL = "Order History Special";
const QUARTERLY_CATEGORY_ID = 14;
const QUARTERLY_CATEGORY_LABEL = "Workflow Task";

const QUARTERLY_SUBJECT_RE = /^Q([1-4]) Reach Out Opportunity$/i;
const ANNIVERSARY_SUBJECT_RE = /prior[\s_-]*year|order anniversary follow up/i;
const BRAND_SUBJECT_RE = /^(.+?) Customer - Tier ([123])$/i;

const DAY_MS = 24 * 60 * 60 * 1000;
const LIVE_OFFSET_DAYS = 14;   // live date = due − two weeks (anniv/quarterly/brand)
const FULFILLED_WINDOW_DAYS = 14; // a completed task this close to a slot fulfills it
const BRAND_TASK_YEAR = 2030;
const BRAND_TASK_MONTH = 11;   // December (zero-based)
const BRAND_TASK_DAY = 17;
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

/* ── Date helpers ───────────────────────────────────────────── */

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

// Inverse of calendarDayNumber — read the UTC fields so negative-offset
// timezones don't slide the calendar day back by one.
function dateFromDayNumber(dayNumber) {
  const utc = new Date(dayNumber * DAY_MS);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), 12);
}

function isoDate(value) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0")
  ].join("-");
}

function formatShortDate(value) {
  return `${value.getMonth() + 1}/${value.getDate()}/${value.getFullYear()}`;
}

function formatMonthDay(value) {
  return `${MONTHS[value.getMonth()]} ${value.getDate()}`;
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
  const daysBack = weekday === 0 ? 6 : weekday === 1 ? 7 : weekday - 1;
  monday.setDate(monday.getDate() - daysBack);
  return monday;
}

function quarterNumber(value) {
  return Math.floor(value.getMonth() / 3) + 1;
}

function quarterKey(value) {
  return `${value.getFullYear()}-Q${quarterNumber(value)}`;
}

function rollingQuarter(offset, reference) {
  const absolute = reference.getFullYear() * 4 + Math.floor(reference.getMonth() / 3) + offset;
  const year = Math.floor(absolute / 4);
  const quarter = (absolute % 4) + 1;
  return { year, quarter, key: `${year}-Q${quarter}` };
}

const today = new Date();
today.setHours(12, 0, 0, 0);
const todayNum = calendarDayNumber(today);

function daysOutFor(date) {
  return Math.max(0, Math.round(calendarDayNumber(date) - todayNum));
}

function liveDateFor(due) {
  return isoDate(addDays(due, -LIVE_OFFSET_DAYS));
}

/* ── Task classification & field diffing ────────────────────── */

function classifyTask(subject) {
  const text = String(subject || "").trim();
  if (QUARTERLY_SUBJECT_RE.test(text)) return "quarterly";
  if (ANNIVERSARY_SUBJECT_RE.test(text)) return "anniversary";
  if (BRAND_SUBJECT_RE.test(text)) return "brand";
  if (PROMO_SUBJECT_RE.test(text)) return "promo";
  return "other";
}

function taskDueNum(task) {
  const due = calendarDate(task?.dueDate || task?.due || task?.date);
  return due ? calendarDayNumber(due) : null;
}

function sameCalendarValue(current, desiredIso) {
  const parsed = calendarDate(current);
  return !!parsed && isoDate(parsed) === desiredIso;
}

/* Stage only the fields that actually differ; the task proxy groups the
   assignments into ONE confirm-gated CRM write per task. `description` can't
   be read back from the page schema, so it is refreshed only when some other
   field changed (otherwise every run would write every task). Category
   labels likewise: only correct a category we can actually see is wrong. */
function stageTaskEdits(task, desired) {
  let changed = false;
  if (desired.subject !== undefined && String(task.subject || "").trim() !== desired.subject) {
    task.subject = desired.subject;
    changed = true;
  }
  if (desired.dueDateIso !== undefined && !sameCalendarValue(task.dueDate || task.due, desired.dueDateIso)) {
    task.dueDate = desired.dueDateIso;
    changed = true;
  }
  if (desired.liveDateIso !== undefined && !sameCalendarValue(task.liveDate || task.live_date, desired.liveDateIso)) {
    task.liveDate = desired.liveDateIso;
    changed = true;
  }
  if (desired.categoryId !== undefined && desired.categoryLabel !== undefined) {
    const label = String(task.category || "").trim();
    if (label && label.toLowerCase() !== desired.categoryLabel.toLowerCase()) {
      task.categoryId = desired.categoryId;
      changed = true;
    }
  }
  if (changed && desired.description !== undefined) {
    task.description = desired.description;
  }
  return changed;
}

/* ── Record context ─────────────────────────────────────────── */

const openTasks = (page.tasks?.open || []).filter((task) => task && task.id);
const doneTasks = (page.tasks?.done || []).filter((task) => task && task.id);
const recordName = page.account?.name
  || page.contact?.companyName
  || page.contact?.contactName
  || "Current record";

/* ── Orders → anniversaries + brand plans ───────────────────── */

function brandFromOrder(order) {
  const title = String(order?.summary || order?.title || "").trim();
  const firstWord = title.split(/\s+/)[0] || "";
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

/* Surface guard — on the Action Shelf this body runs against whatever page
   the rep is on. A page whose extraction produced no contact id, no tasks,
   and no orders is not a CRM record; skip instead of failing at the first
   contact-indexed write. A genuinely NEW account (id but nothing else) still
   runs and gets initiated. */
const writerContactId = String(
  page.contact?.contactId || page.contact?.id || page.contact?.customerId || ""
).trim();
if (!writerContactId && !openTasks.length && !doneTasks.length && !allOrders.length) {
  return "Skipped — no CRM record readable on this page";
}

progress.log(
  `Reconciling ${recordName}: ${openTasks.length} open / ${doneTasks.length} completed task(s), ${allOrders.length} order(s).`
);

const orders = allOrders
  .map((order) => ({ order, date: calendarDate(order.date) }))
  .filter((entry) => entry.date);

const brandGroups = new Map();
for (const order of allOrders) {
  const brand = brandFromOrder(order);
  if (!brand) continue;
  const key = brand.toLowerCase();
  if (!brandGroups.has(key)) brandGroups.set(key, { brand, orders: [] });
  brandGroups.get(key).orders.push(order);
}

// A source period is one source year + calendar month; several orders in the
// period become one anniversary at the rounded average day.
const grouped = new Map();
for (const entry of orders) {
  const sourceYear = entry.date.getFullYear();
  const month = entry.date.getMonth();
  const key = `${sourceYear}-${month}`;
  if (!grouped.has(key)) grouped.set(key, { sourceYear, month, days: [], orders: [] });
  const group = grouped.get(key);
  group.days.push(entry.date.getDate());
  group.orders.push(entry);
}

// Keep only each month's newest source year so one calendar month can never
// produce competing anniversary workflows.
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
  .map((group) => ({ ...group, tier: tierForOrderCount(group.orders.length) }))
  .sort((a, b) => a.brand.localeCompare(b.brand));

/* ── Anniversary cycles: build, salvage in-flight, resolve overlaps ── */

function buildCycle(anniversary, year) {
  const anniversaryDate = makeCalendarDate(year, anniversary.month, anniversary.averageDay);
  return {
    anniversaryDate,
    tasks: [
      { kind: 1, timing: "3 weeks before", date: addDays(anniversaryDate, -21) },
      { kind: 2, timing: "2 weeks before", date: addDays(anniversaryDate, -14) },
      { kind: "call", timing: "1 week before", date: addDays(anniversaryDate, -7) },
      { kind: 3, timing: "Monday before", date: mondayBefore(anniversaryDate) }
    ]
  };
}

const anniversaryPool = [...openTasks, ...doneTasks]
  .filter((task) => classifyTask(task.subject) === "anniversary");

function chooseCycle(anniversary) {
  let cycleYear = today.getFullYear();
  let cycle = buildCycle(anniversary, cycleYear);
  const firstNum = calendarDayNumber(cycle.tasks[0].date);
  const lastNum = Math.max(...cycle.tasks.map((task) => calendarDayNumber(task.date)));

  if (firstNum > todayNum) return { cycleYear, ...cycle };

  // First task already passed. Keep this year's cycle ONLY when it is still
  // in progress AND some existing task (open or done) sits inside its cycle
  // — evidence the cycle was actually started. Otherwise plan next year's.
  const inFlight = lastNum >= todayNum && anniversaryPool.some((task) => {
    const dueNum = taskDueNum(task);
    return dueNum != null && dueNum >= firstNum - 7 && dueNum <= lastNum + 7;
  });
  if (inFlight) return { cycleYear, ...cycle };

  cycleYear += 1;
  return { cycleYear, ...buildCycle(anniversary, cycleYear) };
}

const rankedWorkflows = anniversaries
  .map((anniversary) => ({
    key: `${anniversary.sourceYear}-${anniversary.month}`,
    anniversary,
    ...chooseCycle(anniversary)
  }))
  .sort((a, b) => (
    b.anniversary.latestSourceTime - a.anniversary.latestSourceTime
    || b.anniversary.sourceYear - a.anniversary.sourceYear
    || b.anniversary.month - a.anniversary.month
  ));

// Newer source evidence wins: reject a lower-ranked workflow when any of its
// tasks lands within 20 days of an accepted workflow's task. One workflow's
// own four tasks are exempt from this guard.
const scheduledWorkflows = [];
const scheduledTaskDates = [];
const skippedWorkflows = [];
for (const workflow of rankedWorkflows) {
  const conflict = workflow.tasks.some((candidateTask) => (
    scheduledTaskDates.some((scheduledTask) => (
      scheduledTask.workflowKey !== workflow.key
      && Math.abs(
        calendarDayNumber(candidateTask.date) - calendarDayNumber(scheduledTask.date)
      ) <= 20
    ))
  ));
  if (conflict) { skippedWorkflows.push(workflow); continue; }
  scheduledWorkflows.push(workflow);
  for (const task of workflow.tasks) {
    scheduledTaskDates.push({ workflowKey: workflow.key, date: task.date });
  }
}
scheduledWorkflows.sort((a, b) => (
  calendarDayNumber(a.tasks[0].date) - calendarDayNumber(b.tasks[0].date)
));

/* The flat desired anniversary task list, chronological. */
const desiredAnniversary = [];
for (const workflow of scheduledWorkflows) {
  const { anniversary, anniversaryDate, cycleYear } = workflow;
  const sourceOrders = anniversary.orders
    .slice()
    .sort((a, b) => a.date - b.date)
    .map(({ order, date }) => describeOrder(order, date))
    .join("\n");
  for (const task of workflow.tasks) {
    desiredAnniversary.push({
      kind: task.kind,
      date: task.date,
      subject: task.kind === "call"
        ? `Order Anniversary Follow Up Call - [${MONTHS[anniversary.month]}]`
        : `Order Anniversary Follow Up #${task.kind} [${cycleYear}]`,
      description: [
        `Prior-year reorder timeline for ${recordName}.`,
        `Source period: ${MONTHS[anniversary.month]} ${anniversary.sourceYear}.`,
        `Averaged reorder anniversary: ${formatMonthDay(anniversaryDate)}.`,
        `Scheduled cycle: ${formatShortDate(anniversaryDate)}.`,
        `Follow-up timing: ${task.timing}.`,
        "",
        "Source orders:",
        sourceOrders
      ].join("\n").slice(0, 4000)
    });
  }
}
desiredAnniversary.sort((a, b) => calendarDayNumber(a.date) - calendarDayNumber(b.date));

/* ── Reconcile anniversary tasks (edit > fulfill > create > retire) ── */

function anniversaryKind(subject) {
  const text = String(subject || "");
  if (/call/i.test(text)) return "call";
  const number = text.match(/#\s*([1-3])/);
  return number ? Number(number[1]) : null;
}

const annivOpenPool = openTasks
  .filter((task) => classifyTask(task.subject) === "anniversary")
  .map((task) => ({ task, kind: anniversaryKind(task.subject), dueNum: taskDueNum(task), matched: false }));
const annivDonePool = doneTasks
  .filter((task) => classifyTask(task.subject) === "anniversary")
  .map((task) => ({ task, kind: anniversaryKind(task.subject), dueNum: taskDueNum(task), matched: false }));

function nearestUnmatched(pool, kind, targetNum, maxDistance = Infinity) {
  let best = null;
  for (const entry of pool) {
    if (entry.matched || entry.kind !== kind) continue;
    const distance = entry.dueNum == null ? Infinity : Math.abs(entry.dueNum - targetNum);
    if (distance > maxDistance) continue;
    if (!best || distance < best.distance) best = { entry, distance };
  }
  return best ? best.entry : null;
}

let annivEdited = 0;
let annivUnchanged = 0;
let annivCreated = 0;
let annivFulfilled = 0;
let annivPastSkipped = 0;
let annivRetired = 0;
const fulfilledDayNums = [];
const createdAnniversaryDayNums = [];

progress.section(`Reconciling ${desiredAnniversary.length} anniversary slot(s)`);
for (const desired of desiredAnniversary) {
  await progress.checkpoint();
  const desiredNum = calendarDayNumber(desired.date);
  const openMatch = nearestUnmatched(annivOpenPool, desired.kind, desiredNum);
  if (openMatch) {
    openMatch.matched = true;
    const isPastSlot = desiredNum < todayNum;
    // An overdue in-flight task keeps its own dates — the rep still owes the
    // touch — and only its naming/category are corrected.
    const changed = stageTaskEdits(openMatch.task, {
      subject: desired.subject,
      description: desired.description,
      categoryId: ANNIVERSARY_CATEGORY_ID,
      categoryLabel: ANNIVERSARY_CATEGORY_LABEL,
      ...(isPastSlot ? {} : {
        dueDateIso: isoDate(desired.date),
        liveDateIso: liveDateFor(desired.date),
      })
    });
    if (changed) annivEdited += 1; else annivUnchanged += 1;
    continue;
  }
  const doneMatch = nearestUnmatched(annivDonePool, desired.kind, desiredNum, FULFILLED_WINDOW_DAYS);
  if (doneMatch) {
    doneMatch.matched = true;
    annivFulfilled += 1;
    fulfilledDayNums.push(doneMatch.dueNum ?? desiredNum);
    continue;
  }
  if (desiredNum < todayNum) { annivPastSkipped += 1; continue; }
  const created = await actions.createTask({
    subject: desired.subject,
    body: desired.description,
    categoryId: ANNIVERSARY_CATEGORY_ID,
    priority: "med",
    daysOut: daysOutFor(desired.date)
  });
  if (created?.taskId) {
    await actions.updateTask({ id: created.taskId, fields: { liveDate: liveDateFor(desired.date) } });
  }
  createdAnniversaryDayNums.push(desiredNum);
  annivCreated += 1;
}

// Open anniversary tasks with no slot left (older duplicates, or tasks from a
// skipped overlapping workflow) are retired. Only when this record produced
// desired slots at all — with no dated orders we cannot rebuild, so we leave
// everything untouched.
const retiredTasks = new Set();
if (desiredAnniversary.length) {
  for (const entry of annivOpenPool) {
    if (entry.matched) continue;
    await entry.task.complete();
    retiredTasks.add(entry.task);
    annivRetired += 1;
  }
}

/* ── Reconcile promotion tasks ──────────────────────────────── */

progress.section("Reconciling promotion tasks");

const normalizedSubject = (value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();

let promoRevived = 0;
let promoAlreadyLive = 0;
let promoCreated = 0;

const promoOpen = openTasks.filter((task) => classifyTask(task.subject) === "promo");
const promoDone = doneTasks.filter((task) => classifyTask(task.subject) === "promo");
for (const task of promoOpen) {
  const live = calendarDate(task.liveDate || task.live_date);
  if (!live || calendarDayNumber(live) > todayNum) {
    task.liveDate = isoDate(today);
    promoRevived += 1;
  } else {
    promoAlreadyLive += 1;
  }
}

const promoCovered = new Set([...promoOpen, ...promoDone].map((task) => normalizedSubject(task.subject)));
const promoCreatedDayNums = [];
for (const wanted of PROMO_TASKS) {
  if (promoCovered.has(normalizedSubject(wanted.subject))) continue;
  const daysOut = Math.max(0, Number(wanted.daysOut) || 0);
  await actions.createTask({
    subject: wanted.subject,
    body: [
      `Promotion follow-up coverage for ${recordName}.`,
      "Created by the reconciliation workflow because no open or completed",
      "task carried this subject.",
    ].join("\n"),
    priority: "med",
    daysOut
  });
  promoCreatedDayNums.push(todayNum + daysOut);
  promoCreated += 1;
}

/* ── Busy touches & quarter coverage ────────────────────────── */

// Every date the contact is being touched, using RECONCILED dates (the task
// proxy reads back staged edits, so matched anniversary tasks contribute
// their corrected dates). Quarterly tasks are excluded — they are placed
// against these touches. Completed anniversary tasks are represented by
// their fulfilled slots so retiring a duplicate on one run cannot shift
// placements on the next; skipped past slots have no task and are not
// touches.
const busyDayNums = [];
const coverageKeys = new Set();
function noteTouch(dayNum) {
  if (dayNum == null) return;
  busyDayNums.push(dayNum);
  coverageKeys.add(quarterKey(dateFromDayNumber(dayNum)));
}
for (const dayNum of fulfilledDayNums) noteTouch(dayNum);
for (const dayNum of promoCreatedDayNums) noteTouch(dayNum);
for (const dayNum of createdAnniversaryDayNums) noteTouch(dayNum);
for (const task of openTasks) {
  const kind = classifyTask(task.subject);
  if (kind === "quarterly" || retiredTasks.has(task)) continue;
  noteTouch(taskDueNum(task));
}
for (const task of doneTasks) {
  const kind = classifyTask(task.subject);
  // Done anniversary tasks are already represented by fulfilled slots (or
  // belong to long-gone cycles); done quarterly tasks count as coverage below.
  if (kind === "anniversary" || kind === "quarterly") continue;
  noteTouch(taskDueNum(task));
}
// A completed quarterly reach-out covers its own quarter (dated), or claims
// its quarter slot when undated — but its date is not a future touch.
const windowSlots = [0, 1, 2, 3].map((offset) => rollingQuarter(offset, today));
for (const task of doneTasks) {
  const match = String(task.subject || "").match(QUARTERLY_SUBJECT_RE);
  if (!match) continue;
  const dueNum = taskDueNum(task);
  if (dueNum != null) {
    coverageKeys.add(quarterKey(dateFromDayNumber(dueNum)));
  } else {
    const slot = windowSlots.find((candidate) => candidate.quarter === Number(match[1]));
    if (slot) coverageKeys.add(slot.key);
  }
}

/* ── Quarterly reach-outs: gap-midpoint placement + mediation ── */

/* The reach-out belongs in the middle of the real gap around the quarter:
   from the last touch at or before the quarter start (or the quarter start
   itself) to the next touch when one lands by the end of the FOLLOWING
   quarter, otherwise to the start of the following quarter. Touches inside
   the quarter split it — the reach-out takes the middle of the LARGEST gap,
   clamped into the quarter and never in the past. */
function gapMidpointForSlot(slot, busy) {
  const qStartNum = calendarDayNumber(new Date(slot.year, (slot.quarter - 1) * 3, 1, 12));
  const qEndNum = calendarDayNumber(new Date(slot.year, (slot.quarter - 1) * 3 + 3, 0, 12));
  const windowStart = Math.max(qStartNum, todayNum);
  if (windowStart > qEndNum) return null;
  const nextQuarterStart = qEndNum + 1;
  const followingQuarterEnd = calendarDayNumber(new Date(slot.year, (slot.quarter - 1) * 3 + 6, 0, 12));

  const sorted = [...busy].sort((a, b) => a - b);
  const before = sorted.filter((day) => day <= windowStart);
  const gapStart = before.length ? before[before.length - 1] : windowStart;
  const inside = sorted.filter((day) => day > windowStart && day <= qEndNum);
  const after = sorted.find((day) => day > qEndNum && day <= followingQuarterEnd);
  const gapEnd = after != null ? after : nextQuarterStart;

  const boundaries = [gapStart, ...inside, gapEnd];
  let best = null;
  for (let i = 0; i + 1 < boundaries.length; i += 1) {
    const span = boundaries[i + 1] - boundaries[i];
    if (!best || span > best.span) {
      best = { span, mid: Math.round((boundaries[i] + boundaries[i + 1]) / 2) };
    }
  }
  const clamped = Math.min(qEndNum, Math.max(windowStart, best.mid));
  return dateFromDayNumber(clamped);
}

let quarterlyCreated = 0;
let quarterlyMediated = 0;
let quarterlyInPlace = 0;
let quarterlyCovered = 0;
let quarterlyRetired = 0;

const quarterlyPool = openTasks
  .map((task) => ({ task, match: String(task.subject || "").match(QUARTERLY_SUBJECT_RE) }))
  .filter((entry) => entry.match)
  .map((entry) => ({ ...entry, qn: Number(entry.match[1]), dueNum: taskDueNum(entry.task) }));

progress.section("Placing quarterly reach-outs");
for (const slot of windowSlots) {
  await progress.checkpoint();
  const claimants = quarterlyPool
    .filter((entry) => entry.qn === slot.quarter)
    .sort((a, b) => (a.dueNum ?? Infinity) - (b.dueNum ?? Infinity));

  if (claimants.length) {
    // Keep the earliest-due task, retire exact duplicates of the same slot.
    for (const duplicate of claimants.slice(1)) {
      await duplicate.task.complete();
      quarterlyRetired += 1;
    }
    const keeper = claimants[0].task;
    const desiredDate = gapMidpointForSlot(slot, busyDayNums);
    if (desiredDate) {
      const changed = stageTaskEdits(keeper, {
        dueDateIso: isoDate(desiredDate),
        liveDateIso: liveDateFor(desiredDate),
        categoryId: QUARTERLY_CATEGORY_ID,
        categoryLabel: QUARTERLY_CATEGORY_LABEL,
        description: [
          `Quarterly reach-out coverage for ${recordName}.`,
          `Coverage period: Q${slot.quarter} ${slot.year}.`,
          "Scheduled at the middle of the gap between surrounding touches.",
        ].join("\n")
      });
      if (changed) quarterlyMediated += 1; else quarterlyInPlace += 1;
      busyDayNums.push(calendarDayNumber(desiredDate));
    } else {
      quarterlyInPlace += 1;
    }
    continue;
  }

  if (coverageKeys.has(slot.key)) { quarterlyCovered += 1; continue; }

  const desiredDate = gapMidpointForSlot(slot, busyDayNums);
  if (!desiredDate) { quarterlyCovered += 1; continue; }
  const createdQ = await actions.createTask({
    subject: `Q${slot.quarter} Reach Out Opportunity`,
    body: [
      `Quarterly reach-out coverage for ${recordName}.`,
      `Coverage period: Q${slot.quarter} ${slot.year}.`,
      "Scheduled at the middle of the gap between surrounding touches.",
    ].join("\n"),
    categoryId: QUARTERLY_CATEGORY_ID,
    priority: "med",
    daysOut: daysOutFor(desiredDate)
  });
  if (createdQ?.taskId) {
    await actions.updateTask({ id: createdQ.taskId, fields: { liveDate: liveDateFor(desiredDate) } });
  }
  busyDayNums.push(calendarDayNumber(desiredDate));
  coverageKeys.add(slot.key);
  quarterlyCreated += 1;
}

/* ── Brand tier tasks: edit the tier in place ───────────────── */

const brandTaskDate = makeCalendarDate(BRAND_TASK_YEAR, BRAND_TASK_MONTH, BRAND_TASK_DAY);
let brandEdited = 0;
let brandUnchanged = 0;
let brandCreated = 0;
let brandRetired = 0;

progress.section(`Reconciling ${brandPlans.length} brand tier task(s)`);
for (const plan of brandPlans) {
  await progress.checkpoint();
  const desiredSubject = `${plan.brand} Customer - Tier ${plan.tier}`;
  const sourceOrders = [...plan.orders]
    .sort((a, b) => {
      const left = calendarDate(a.date);
      const right = calendarDate(b.date);
      return (left?.getTime() || 0) - (right?.getTime() || 0);
    })
    .map((order) => describeOrder(order))
    .join("\n");
  const description = [
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

  const matches = openTasks.filter((task) => {
    const parsed = String(task.subject || "").trim().match(BRAND_SUBJECT_RE);
    return parsed && parsed[1].toLowerCase() === plan.brand.toLowerCase();
  });

  if (!matches.length) {
    const createdBrand = await actions.createTask({
      subject: desiredSubject,
      body: description,
      priority: "med",
      daysOut: daysOutFor(brandTaskDate)
    });
    if (createdBrand?.taskId) {
      await actions.updateTask({ id: createdBrand.taskId, fields: { liveDate: liveDateFor(brandTaskDate) } });
    }
    brandCreated += 1;
    continue;
  }

  for (const duplicate of matches.slice(1)) {
    await duplicate.complete();
    brandRetired += 1;
  }
  const changed = stageTaskEdits(matches[0], {
    subject: desiredSubject,
    dueDateIso: isoDate(brandTaskDate),
    liveDateIso: liveDateFor(brandTaskDate),
    description
  });
  if (changed) brandEdited += 1; else brandUnchanged += 1;
}

/* ── Summary ────────────────────────────────────────────────── */

return [
  `Anniversary: ${annivEdited} edited, ${annivUnchanged} unchanged, ${annivCreated} created, `
    + `${annivFulfilled} already completed, ${annivPastSkipped} past slot(s) skipped, ${annivRetired} retired`,
  `promotion: ${promoRevived} revived to live today, ${promoAlreadyLive} already live, ${promoCreated} created`,
  `quarterly: ${quarterlyCreated} created, ${quarterlyMediated} rescheduled, ${quarterlyInPlace} already placed, `
    + `${quarterlyCovered} covered, ${quarterlyRetired} duplicate(s) retired`,
  `brand: ${brandEdited} edited, ${brandUnchanged} unchanged, ${brandCreated} created, ${brandRetired} retired`,
  `skipped ${grouped.size - anniversaries.length} older same-month source period(s)`,
  `skipped ${skippedWorkflows.length} overlapping anniversary workflow(s)`
].join("; ");
