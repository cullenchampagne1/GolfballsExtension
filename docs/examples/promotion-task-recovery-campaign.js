// Promotion task recovery + coverage — Campaign Manager automation.
//
// Run this campaign against the SAME contact/account audience the promotion
// campaign originally targeted. The campaign engine runs this body once per
// selected record and hydrates that record's own page.tasks list from its
// contact/account page — which still lists tasks whose live date sits in the
// future, unlike the Task List pull (the CRM's Page=349 list only renders
// tasks that are already live).
//
// Per record it:
//   1. Revives every open promotion task whose live date was pushed into the
//      future (the quarterly reconcile regression): live date → today.
//   2. Creates any promotion task from PROMO_TASKS that is missing — a task
//      that is already open OR already completed counts as covered.
//   3. Never edits Q1–Q4 reach-out, Prior Year / Order Anniversary, or brand
//      tier tasks: those belong to the quarterly + anniversary flows.
//   4. Reports every other open task that is still not live, so hidden tasks
//      stay visible from the run log even when nothing needed fixing.
//
// EDIT THE CONFIG BLOCK to match your promotion's task subjects and cadence
// before running. Dry-run on one record first, then run live.

/* ── Config ─────────────────────────────────────────────────── */

// What counts as one of this promotion's tasks (matched against subjects).
const PROMO_SUBJECT_RE = /srixon promotion/i;

// The full set of tasks the promotion campaign is supposed to leave on each
// record. Missing ones are created (live today); daysOut sets the due date.
const PROMO_TASKS = [
  { subject: "#1 Srixon Promotion Campaign Follow Up", daysOut: 0 },
  { subject: "#2 Srixon Promotion Campaign Follow Up", daysOut: 7 },
];

/* Tasks owned by the quarterly + anniversary flows — never edited here. */
const OFF_LIMITS_RE = /^Q[1-4] Reach Out Opportunity$|\bPrior\s+Year\b|\bOrder\s+Anniversary\s+Follow\s+Up\b|Customer - Tier [1-3]$/i;

/* ── Date helpers (same conventions as the anniversary campaign) ─ */

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

function isoDate(value) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatShortDate(value) {
  return `${value.getMonth() + 1}/${value.getDate()}/${value.getFullYear()}`;
}

const today = new Date();
today.setHours(12, 0, 0, 0);

function isFutureLive(task) {
  const live = calendarDate(task.liveDate || task.live_date);
  return !!live && live.getTime() > today.getTime();
}

function normalizedSubject(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

/* ── Gather this record's tasks ─────────────────────────────── */

const openTasks = Array.isArray(page.tasks?.open) ? page.tasks.open : [];
const doneTasks = Array.isArray(page.tasks?.done) ? page.tasks.done : [];

const subjectOf = (task) => String(task?.subject || "");
const isPromo = (task) =>
  PROMO_SUBJECT_RE.test(subjectOf(task)) && !OFF_LIMITS_RE.test(subjectOf(task));

/* ── 1. Revive hidden promotion tasks ───────────────────────── */

let revivedCount = 0;
let alreadyLiveCount = 0;

for (const task of openTasks) {
  if (!task?.id || !isPromo(task)) continue;
  if (isFutureLive(task)) {
    // Staged assignment — the executor groups these into one confirm-gated
    // updateTask write per task at the end of the program.
    task.liveDate = isoDate(today);
    revivedCount += 1;
  } else {
    alreadyLiveCount += 1;
  }
}

/* ── 2. Create the promotion tasks that are missing ─────────── */

const coveredSubjects = new Set(
  [...openTasks, ...doneTasks].filter(isPromo).map((task) => normalizedSubject(subjectOf(task))),
);

let createdCount = 0;
for (const wanted of PROMO_TASKS) {
  if (coveredSubjects.has(normalizedSubject(wanted.subject))) continue;
  const dueDate = new Date(today);
  dueDate.setDate(dueDate.getDate() + Math.max(0, Number(wanted.daysOut) || 0));
  await actions.createTask({
    subject: wanted.subject,
    body: [
      "Promotion follow-up coverage.",
      `Scheduled for ${formatShortDate(dueDate)} by the promotion recovery campaign`,
      "because no open or completed task carried this subject.",
    ].join("\n"),
    priority: "med",
    daysOut: Math.max(0, Number(wanted.daysOut) || 0),
  });
  createdCount += 1;
}

/* ── 3. Report every other task that is still not live ──────── */

const hiddenOthers = openTasks
  .filter((task) => task?.id && !isPromo(task) && isFutureLive(task))
  .map((task) => {
    const live = calendarDate(task.liveDate || task.live_date);
    return `"${subjectOf(task)}" (live ${live ? formatShortDate(live) : "?"})`;
  });

const hiddenNote = hiddenOthers.length
  ? ` Left ${hiddenOthers.length} other non-live task(s) untouched: ${hiddenOthers.slice(0, 6).join(", ")}${hiddenOthers.length > 6 ? ", …" : ""}.`
  : "";

return [
  `Revived ${revivedCount} promotion task(s) to live today,`,
  `left ${alreadyLiveCount} already live,`,
  `and created ${createdCount} missing promotion task(s).`,
].join(" ") + hiddenNote;
