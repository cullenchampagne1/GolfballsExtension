/* ───────────────────────────────────────────────────────────────
   templateMigration.js — one-version backwards-compat pass that lifts
   legacy template variables onto the page engine.

   Legacy `builtin` vars resolve via smart-detection's DOM scrape and
   legacy `dom`/`selector` vars via raw querySelector — neither goes
   through the schema engine. This converts the ones whose NAME matches
   a contact/account engine field into engine-native `schema` vars
   (e.g. a `firstName` builtin → { type:'schema', path:'contact.firstName' }).

   Scope (per product decision): CONTACT/ACCOUNT vars only.
     • Order/case builtins (order_number, payment_link, oos_item,
       recommended_replacement, and `email` outside account templates)
       have no engine path yet → KEPT untouched, first-class.
     • Computed builtins (fullName, today, todayLong, daysSinceLastOrder)
       aren't page fields → KEPT (still resolve via smart-detection).
     • A legacy builtin/dom/selector var that maps to a field → CONVERTED.
     • A legacy builtin/dom/selector var that maps to NOTHING (a custom
       CSS selector, an unknown name) → FLAGGED deprecated: it still
       resolves (so nothing silently breaks), the editor shows a notice,
       and sending throws until the user fixes it.

   Runs once per template (stamped with MIGRATION_VERSION). Defaults to
   DRY-RUN: it computes + logs the plan but does NOT mutate storage until
   a caller passes { dryRun:false }.
─────────────────────────────────────────────────────────────── */

export const MIGRATION_VERSION = 1;

/* Normalized legacy-name → engine path. Keys are normalize()'d so
   `first_name`, `firstName`, and `First Name` all land on the same entry.
   Built from the account/contact/stats schema field set (+ salesRep /
   userType, which were added to the schema spec for this). */
const PATH_ALIASES = {
  // contact.*
  firstname:        'contact.firstName',
  lastname:         'contact.lastName',
  middleinit:       'contact.middleInitial',
  middleinitial:    'contact.middleInitial',
  jobtitle:         'contact.jobTitle',
  contactemail:     'contact.email',
  email:            'contact.email',        // account-template scope only (guarded below)
  phonenumber:      'contact.phone',
  phone:            'contact.phone',
  zipcode:          'contact.zipCode',
  linkedin:         'contact.linkedInUrl',
  linkedinurl:      'contact.linkedInUrl',
  companyname:      'contact.companyName',
  // account.*
  accountname:      'account.name',
  webaddress:       'account.webAddress',
  mainaddress:      'account.mainAddress',
  maincity:         'account.city',
  mainstate:        'account.state',
  mainzip:          'account.postal',
  maincountry:      'account.country',
  salesrep:         'account.salesRep',
  usertype:         'account.userType',
  createdby:        'account.createdBy',
  creditapproved:   'account.creditApproved',
  creditreqs:       'account.creditRequirements',
  creditrequirements: 'account.creditRequirements',
  // ids
  contactid:        'ids.contact',
  accountid:        'ids.account',
  // stats.*
  ordercount:       'stats.orderCount',
  totalrevenue:     'stats.totalRevenue',
  ytdrevenue:       'stats.ytdRevenue',
  prioryearrev:     'stats.priorYearRevenue',
  prioryearrevenue: 'stats.priorYearRevenue',
  avgordersize:     'stats.avgOrderSize',
  lastorderdate:    'stats.lastOrderDate',
  creationdate:     'stats.creationDate',
};

/* Order/case builtins that now DO have an engine path (the order schema
   exists). Keyed by builtin id → order path. */
const ORDER_ALIASES = {
  order_number: 'order.number',
  payment_link: 'order.paymentLink',
};

/* Builtins that have NO engine path and must be left alone (not converted,
   not deprecated): computed values + the order builtins that are derived /
   async rather than page fields. `email` is handled separately (it's the
   contact email on account templates, the order recipient elsewhere). */
const KEEP_BUILTINS = new Set([
  'oos_item', 'recommended_replacement',
  'fullName', 'today', 'todayLong', 'daysSinceLastOrder',
]);

/* `email` resolves to the order recipient (smartEmail) on order/case
   templates but to the contact's email on account templates. Only treat it
   as contact.email inside an account template. */
function isOrderEmailBuiltin(varDef, templateType) {
  return varDef.builtin === 'email' && templateType !== 'account';
}

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[\s._-]+/g, '');
}

/* The legacy var TYPES this pass touches. `schema`/`path`/`code`/`literal`
   are already engine-native or fine as-is. */
function isLegacyType(type) {
  return type === 'builtin' || type === 'dom' || type === 'selector';
}

/* Decide what to do with one var. Returns one of:
   { action:'keep' }
   { action:'convert', path }
   { action:'deprecate', reason } */
function classifyVar(name, def, templateType) {
  const type = def && def.type;
  if (!isLegacyType(type)) return { action: 'keep' };

  if (type === 'builtin') {
    if (KEEP_BUILTINS.has(def.builtin)) return { action: 'keep' };
    if (isOrderEmailBuiltin(def, templateType)) return { action: 'keep' };
    // Order builtins map onto the order schema; contact/account builtins
    // onto contact/account; fall back to a name match for either.
    const path = ORDER_ALIASES[def.builtin]
      || PATH_ALIASES[normalize(def.builtin)]
      || PATH_ALIASES[normalize(name)];
    if (path) return { action: 'convert', path };
    return { action: 'deprecate', reason: `Unknown builtin "${def.builtin}" with no engine field` };
  }

  // dom / selector — match on the var NAME (its CSS selector is opaque).
  const path = PATH_ALIASES[normalize(name)];
  if (path) return { action: 'convert', path };
  return { action: 'deprecate', reason: `Custom ${type} selector with no matching engine field` };
}

/* Build the migrated `vars` object + a list of human-readable changes for
   ONE template. Pure — never mutates the input. */
export function planTemplateMigration(template) {
  const out = { id: template.id, name: template.name, type: template.type, changes: [], result: template };
  const vars = (template && typeof template.vars === 'object' && template.vars) || {};

  const nextVars = {};
  let touched = false;

  for (const [name, def] of Object.entries(vars)) {
    const verdict = classifyVar(name, def, template.type);
    if (verdict.action === 'convert') {
      // Preserve smart options; swap the resolution source to the engine path.
      nextVars[name] = { type: 'schema', path: verdict.path, ...(def.smart ? { smart: def.smart } : {}) };
      out.changes.push({ name, action: 'convert', from: describeSource(def), to: `schema:${verdict.path}` });
      touched = true;
    } else if (verdict.action === 'deprecate') {
      // Keep resolving via the original definition, but flag it.
      nextVars[name] = { ...def, deprecated: true, deprecatedReason: verdict.reason };
      if (!def.deprecated) touched = true;
      out.changes.push({ name, action: 'deprecate', from: describeSource(def), reason: verdict.reason });
    } else {
      nextVars[name] = def;
    }
  }

  /* Scratch legacy order auto-match rules. They predate the order schema and
     test classic DOM selectors / variables; now that order.* fields exist the
     rep re-authors them as schema rules. Order templates only — account uses
     accountConditions (already schema-capable), case uses caseRules. */
  let clearRules = false;
  if (template.type === 'order' && Array.isArray(template.rules) && template.rules.length > 0) {
    clearRules = true;
    out.changes.push({ name: '(auto-match rules)', action: 'clear-rules', from: `${template.rules.length} legacy rule(s)` });
  }

  if (touched || clearRules) {
    out.result = {
      ...template,
      ...(touched ? { vars: nextVars } : {}),
      ...(clearRules ? { rules: [] } : {}),
      varsMigratedVersion: MIGRATION_VERSION,
    };
  } else if (template.varsMigratedVersion !== MIGRATION_VERSION) {
    // Nothing to change, but stamp it so we don't re-scan next load.
    out.result = { ...template, varsMigratedVersion: MIGRATION_VERSION };
  }
  return out;
}

function describeSource(def) {
  if (def.type === 'builtin') return `builtin:${def.builtin}`;
  if (def.type === 'dom' || def.type === 'selector') return `${def.type}:${def.selector || ''}`;
  return def.type;
}

/* True if a template still carries a flagged-deprecated var (drives the
   editor notice + the send-time throw). */
export function templateHasDeprecatedVar(template) {
  const vars = template && template.vars;
  if (!vars) return false;
  return Object.values(vars).some((d) => d && d.deprecated);
}

/* Names of the deprecated vars on a template (for the error message + UI). */
export function deprecatedVarNames(template) {
  const vars = (template && template.vars) || {};
  return Object.entries(vars).filter(([, d]) => d && d.deprecated).map(([name]) => name);
}

/**
 * Migrate a list of templates.
 * @param {Array} templates
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun=true]  when true, returns the plans + logs but
 *                                      does NOT signal a write (result mirrors input)
 * @param {Function} [opts.log]         optional caller-owned report sink
 * @returns {{ plans, migrated, changed }}  `migrated` is the rewritten array;
 *          `changed` is true if anything would change. Caller persists `migrated`
 *          only when dryRun is false.
 */
export function migrateTemplates(templates, opts = {}) {
  const dryRun = opts.dryRun !== false;
  const log = typeof opts.log === 'function' ? opts.log : () => {};
  const list = Array.isArray(templates) ? templates : [];

  const plans = [];
  const migrated = [];
  let changed = false;

  for (const t of list) {
    // Already migrated AND no deprecated vars lingering → pass through.
    if (t && t.varsMigratedVersion === MIGRATION_VERSION) { migrated.push(t); plans.push(null); continue; }
    const plan = planTemplateMigration(t);
    plans.push(plan);
    migrated.push(plan.result);
    if (plan.result !== t) changed = true;
  }

  if (changed) {
    const report = plans.filter((p) => p && p.changes.length);
    log(`[gb][templateMigration]${dryRun ? ' DRY-RUN (no writes)' : ' applying'} — ${report.length} template(s) with changes:`);
    for (const p of report) {
      log(`  • "${p.name}" (${p.type || '—'})`);
      for (const c of p.changes) {
        if (c.action === 'convert') log(`      convert  ${c.name}: ${c.from} → ${c.to}`);
        else if (c.action === 'clear-rules') log(`      CLEAR RULES ${c.name}: ${c.from} — re-author as schema rules`);
        else log(`      DEPRECATE ${c.name}: ${c.from} — ${c.reason}`);
      }
    }
  }

  // In dry-run we report but hand back the ORIGINAL list so nothing persists.
  return { plans, migrated: dryRun ? list : migrated, changed };
}
