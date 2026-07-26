/* ───────────────────────────────────────────────────────────────
   codeEngine/contracts — the shared action-contract registry.

   ONE control surface, two front-ends: a code call `actions.sendEmail(x)`
   and a JSON payload verb `{command:'send_email'}` resolve to the same
   contract. A contract declares its identity, the object it acts on, its
   effect class (which decides the gate), a parameter schema, and a pure
   human `describe()` used for both the block label and the confirmation.

   This module is PURE — no DOM, storage, network, or the actual side-
   effecting lib functions. The executor binds a contract to its real
   implementation and applies the gate; keeping the registry pure lets the
   whole safety table be unit-tested against the exact metadata the
   executor uses.
─────────────────────────────────────────────────────────────── */

/** How reversible/outward a contract is — this, not the caller, sets the gate. */
export const EFFECT_CLASSES = Object.freeze(['read', 'local', 'remote', 'outward', 'money']);

/** Effect class → execution gate. Mirrors the payload-API §3 matrix. */
export const GATE_BY_EFFECT = Object.freeze({
  read: 'auto',      // no prompt
  local: 'auto',     // trivially reversible
  remote: 'confirm', // CRM write — visible preview + click
  outward: 'confirm',// sends something external
  money: 'hard',     // never auto-runs; explicit human confirmation + admin gate
});

const str = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const clip = (value, max) => { const s = str(value); return s.length > max ? `${s.slice(0, max - 1)}…` : s; };

/* A "template reference" is a saved email/task/call object (it carries id +
   name), or an explicit { template } wrapper. Returns the template or null. */
function templateOf(input) {
  if (!input || typeof input !== 'object') return null;
  if (input.id != null && input.name != null) return input;
  // An evaluated outbound object carries templateId + name.
  if (input.templateId != null && input.name != null) return input;
  if (input.template && typeof input.template === 'object') return input.template;
  return null;
}

/**
 * The Phase-1 contracts (contact/order composer actions). Each is keyed by its
 * camelCase code name; `verb` is the snake_case JSON-payload parity name.
 * `params` is the input schema the executor validates; `describe(input)` is a
 * pure summary shown on the block and in the confirmation card.
 */
export const CONTRACTS = Object.freeze({
  sendEmail: {
    name: 'sendEmail',
    verb: 'send_email',
    object: 'email',
    effect: 'outward',
    summary: 'Send an email',
    // Accepts a saved email (user.emails[…]) OR a custom { subject, body }.
    // `to` defaults to the current contact; the signature is appended by the
    // send engine after the body — never inside your text.
    accepts: 'a saved email or { subject, body }',
    params: {
      subject: { type: 'string', max: 300 },
      body: { type: 'string', max: 200_000 },
      to: { type: 'string', max: 320 },
      from: { type: 'string', max: 320 },
    },
    validate: (i) => {
      const errors = [];
      if (!templateOf(i) && !str(i.subject)) errors.push('sendEmail needs a saved email or a subject');
      return { errors, value: i };
    },
    describe: (i) => {
      const tpl = templateOf(i);
      const to = clip(i?.to, 46);
      const who = to ? ` to ${to}` : '';
      if (tpl) return `Send “${clip(tpl.name || tpl.subject, 46)}”${who}`;
      const subj = clip(i?.subject, 52);
      return subj ? `Send email “${subj}”${who}` : 'Send an email';
    },
  },
  createTask: {
    name: 'createTask',
    verb: 'create_task',
    object: 'task',
    effect: 'remote',
    summary: 'Create a task for the current contact',
    accepts: 'a saved task or { subject, body, priority, daysOut }',
    params: {
      subject: { type: 'string', max: 500 },
      body: { type: 'string', max: 4_000 },
      priority: { type: 'enum', options: ['high', 'med', 'low'] },
      daysOut: { type: 'number', min: 0, max: 3650 },
    },
    validate: (i) => {
      const errors = [];
      if (!templateOf(i) && !str(i.subject)) errors.push('createTask needs a saved task or a subject');
      return { errors, value: i };
    },
    describe: (i) => {
      const tpl = templateOf(i);
      const label = clip(tpl ? (tpl.name || tpl.subject) : i?.subject, 60);
      return label ? `Create task “${label}”` : 'Create a task for the current contact';
    },
  },
  logCall: {
    name: 'logCall',
    verb: 'log_call',
    object: 'call',
    effect: 'remote',
    summary: 'Log a call for the current contact',
    accepts: 'a saved call or { subject, body, direction }',
    params: {
      subject: { type: 'string', max: 500 },
      body: { type: 'string', max: 4_000 },
      direction: { type: 'enum', options: ['outbound', 'inbound'] },
      voicemail: { type: 'bool' },
    },
    validate: (i) => {
      const errors = [];
      if (!templateOf(i) && !str(i.subject)) errors.push('logCall needs a saved call or a subject');
      return { errors, value: i };
    },
    describe: (i) => {
      const tpl = templateOf(i);
      const label = clip(tpl ? (tpl.name || tpl.subject) : i?.subject, 60);
      const dir = i?.direction === 'inbound' ? 'inbound' : 'outbound';
      return label ? `Log ${dir} call “${label}”` : `Log an ${dir} call for the current contact`;
    },
  },
  // Complete a CRM task — the effect behind page.tasks.open[0].complete().
  // Executor: crmTasks.completeTaskById(id) (Task/Update.ajax, taskStatusID:3).
  completeTask: {
    name: 'completeTask',
    verb: 'complete_task',
    object: 'task',
    effect: 'remote',
    summary: 'Complete a CRM task',
    accepts: 'a task from page.tasks.open — page.tasks.open[0].complete()',
    params: {
      id: { type: 'string' },
      subject: { type: 'string', max: 500 },
    },
    validate: (i) => ({ errors: (i && (i.id != null || str(i.subject))) ? [] : ['completeTask needs a task (page.tasks.open[…])'] }),
    describe: (i) => {
      const s = clip(i?.subject, 55);
      return s ? `Complete task “${s}”` : 'Complete a task';
    },
  },
  // Apply grouped field edits to the current contact — the effect behind
  // `page.contact.field = value` (+ commit). Executor: crmUpdateContact(id, edits)
  // (Contact/Update.ajax, one grouped write). Only approved fields (see
  // APPROVED_CONTACT_FIELDS) may be set.
  editContact: {
    name: 'editContact',
    verb: 'edit_contact',
    object: 'contact',
    effect: 'remote',
    summary: 'Edit the current contact’s fields',
    accepts: 'grouped field changes — page.contact.firstName = "…" (approved fields), committed together',
    params: {
      fields: { type: 'object' },
    },
    validate: (i) => {
      const keys = i && i.fields && typeof i.fields === 'object' ? Object.keys(i.fields) : [];
      const errors = [];
      if (!keys.length) errors.push('editContact has no changes');
      for (const k of keys) if (!Object.hasOwn(APPROVED_CONTACT_FIELDS, k)) errors.push(`“${k}” is not an editable contact field`);
      return { errors, value: i };
    },
    describe: (i) => {
      const keys = i && i.fields ? Object.keys(i.fields) : [];
      if (!keys.length) return 'Edit the current contact';
      return `Edit contact — ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ` +${keys.length - 3}` : ''}`;
    },
  },
});

/**
 * Approved editable contact fields → the crmUpdateContact payload key.
 * This is the write allowlist for `page.contact.<field> = …`. Mirrors the
 * de-facto allowlist in contact-detail-shared.jsx crmUpdateContact (the only
 * persisted-edit path). Fields NOT here (and ALL account fields) have no write
 * path and are rejected. Keep in sync with that writer.
 */
export const APPROVED_CONTACT_FIELDS = Object.freeze({
  firstName: 'firstName',
  middleInitial: 'middleInit',
  lastName: 'lastName',
  companyName: 'companyName',
  jobTitle: 'jobTitle',
  email: 'email',
  phone: 'phoneNumber',
  zipCode: 'zipCode',
  userType: 'UserType',
  country: 'userCountry',
});

/** The contract for a call name, or null. Also accepts the snake_case verb. */
export function contractFor(nameOrVerb) {
  const key = str(nameOrVerb);
  if (CONTRACTS[key]) return CONTRACTS[key];
  return Object.values(CONTRACTS).find((c) => c.verb === key) || null;
}

/** The gate a contract runs behind (auto | confirm | hard), or null. */
export function contractGate(nameOrVerb) {
  const c = contractFor(nameOrVerb);
  return c ? GATE_BY_EFFECT[c.effect] : null;
}

/** Human summary of a specific call, for the block label / confirmation card. */
export function describeContract(nameOrVerb, input) {
  const c = contractFor(nameOrVerb);
  return c ? c.describe(input || {}) : str(nameOrVerb) || 'action';
}

/** Every registered contract, as a flat list (for autocomplete / docs). */
export function listContracts() {
  return Object.values(CONTRACTS).map((c) => ({
    name: c.name, verb: c.verb, object: c.object, effect: c.effect,
    gate: GATE_BY_EFFECT[c.effect], summary: c.summary,
    params: Object.keys(c.params),
  }));
}

/**
 * Validate a call's input against its param schema. Returns
 * `{ ok, value, errors }` — a normalized value on success, a list of
 * problems otherwise. Never throws. Unknown fields are rejected so a
 * payload can't smuggle anything past the schema.
 */
export function validateContractInput(nameOrVerb, rawInput) {
  const c = contractFor(nameOrVerb);
  if (!c) return { ok: false, value: null, errors: [`Unknown action "${str(nameOrVerb)}"`] };
  const input = rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput) ? rawInput : {};

  // A contract may own a shape-aware validator (template OR custom object).
  if (typeof c.validate === 'function') {
    const r = c.validate(input) || { errors: [] };
    const errs = Array.isArray(r.errors) ? r.errors : [];
    return { ok: errs.length === 0, value: errs.length ? null : (r.value ?? input), errors: errs };
  }

  const errors = [];
  const value = {};

  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(c.params, key)) errors.push(`Unknown parameter "${key}" for ${c.name}`);
  }
  for (const [key, rule] of Object.entries(c.params)) {
    const present = Object.hasOwn(input, key) && input[key] != null && input[key] !== '';
    if (!present) {
      if (rule.required) errors.push(`${c.name} needs "${key}"`);
      continue;
    }
    const raw = input[key];
    if (rule.type === 'string') {
      const s = str(raw);
      if (!s) { if (rule.required) errors.push(`${c.name} "${key}" is empty`); continue; }
      value[key] = rule.max ? s.slice(0, rule.max) : s;
    } else if (rule.type === 'enum') {
      const s = str(raw);
      if (!rule.options.includes(s)) errors.push(`${c.name} "${key}" is not one of ${rule.options.join('/')}`);
      else value[key] = s;
    } else if (rule.type === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n)) errors.push(`${c.name} "${key}" must be a number`);
      else if (rule.min != null && n < rule.min) errors.push(`${c.name} "${key}" must be ≥ ${rule.min}`);
      else if (rule.max != null && n > rule.max) errors.push(`${c.name} "${key}" must be ≤ ${rule.max}`);
      else value[key] = n;
    } else if (rule.type === 'bool') {
      value[key] = raw === true || raw === 'true';
    }
  }
  return { ok: errors.length === 0, value: errors.length ? null : value, errors };
}
