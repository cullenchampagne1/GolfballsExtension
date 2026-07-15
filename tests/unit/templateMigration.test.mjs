/**
 * Unit tests — src/lib/templateMigration.js
 *
 * Follows tests/unit/findPhone.test.mjs conventions. Pure module — no
 * globals needed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  planTemplateMigration, templateHasDeprecatedVar, deprecatedVarNames,
  migrateTemplates, MIGRATION_VERSION,
} = await import('../../src/lib/templateMigration.js');

const tpl = (over = {}) => ({ id: 't1', name: 'Follow-up', type: 'order', vars: {}, ...over });

describe('planTemplateMigration — conversions', () => {
  it('converts a contact-name builtin to the matching schema path, preserving smart options', () => {
    const t = tpl({ vars: { firstName: { type: 'builtin', builtin: 'firstName', smart: { fallback: 'there' } } } });
    const plan = planTemplateMigration(t);
    assert.deepEqual(plan.result.vars.firstName, {
      type: 'schema', path: 'contact.firstName', smart: { fallback: 'there' },
    });
    assert.deepEqual(plan.changes, [{
      name: 'firstName', action: 'convert', from: 'builtin:firstName', to: 'schema:contact.firstName',
    }]);
    assert.equal(plan.result.varsMigratedVersion, MIGRATION_VERSION);
    assert.equal(t.vars.firstName.type, 'builtin'); // input never mutated
  });

  it('normalizes name spellings (first_name / First-Name) onto the same alias', () => {
    const t = tpl({ vars: { greet: { type: 'builtin', builtin: 'First_Name' } } });
    assert.equal(planTemplateMigration(t).result.vars.greet.path, 'contact.firstName');
  });

  it('maps order builtins onto the order schema (order_number → order.number)', () => {
    const t = tpl({ vars: { num: { type: 'builtin', builtin: 'order_number' } } });
    assert.equal(planTemplateMigration(t).result.vars.num.path, 'order.number');
  });

  it('converts a dom/selector var by its NAME when it matches an engine field', () => {
    const t = tpl({ vars: { phone: { type: 'selector', selector: '#contactPhone' } } });
    const plan = planTemplateMigration(t);
    assert.deepEqual(plan.result.vars.phone, { type: 'schema', path: 'contact.phone' });
    assert.equal(plan.changes[0].from, 'selector:#contactPhone');
  });
});

describe('planTemplateMigration — keeps and deprecations', () => {
  it('keeps computed builtins (today, fullName) untouched but still stamps the version', () => {
    const t = tpl({ vars: { today: { type: 'builtin', builtin: 'today' } } });
    const plan = planTemplateMigration(t);
    assert.deepEqual(plan.result.vars.today, { type: 'builtin', builtin: 'today' });
    assert.deepEqual(plan.changes, []);
    assert.equal(plan.result.varsMigratedVersion, MIGRATION_VERSION);
  });

  it("keeps the 'email' builtin on order templates but converts it on account templates", () => {
    const orderPlan = planTemplateMigration(tpl({ vars: { email: { type: 'builtin', builtin: 'email' } } }));
    assert.equal(orderPlan.result.vars.email.type, 'builtin');
    const accountPlan = planTemplateMigration(
      tpl({ type: 'account', vars: { email: { type: 'builtin', builtin: 'email' } } }),
    );
    assert.deepEqual(accountPlan.result.vars.email, { type: 'schema', path: 'contact.email' });
  });

  it('leaves engine-native vars (schema/code/literal) alone', () => {
    const vars = {
      a: { type: 'schema', path: 'account.name' },
      b: { type: 'code', body: 'return 1' },
      c: { type: 'literal', value: 'x' },
    };
    const plan = planTemplateMigration(tpl({ vars }));
    assert.deepEqual(plan.result.vars, vars);
    assert.deepEqual(plan.changes, []);
  });

  it('flags an unmappable selector var as deprecated with a reason, keeping its definition', () => {
    const t = tpl({ vars: { widget: { type: 'selector', selector: '.random-node' } } });
    const plan = planTemplateMigration(t);
    assert.equal(plan.result.vars.widget.type, 'selector');
    assert.equal(plan.result.vars.widget.selector, '.random-node');
    assert.equal(plan.result.vars.widget.deprecated, true);
    assert.match(plan.result.vars.widget.deprecatedReason, /no matching engine field/);
    assert.equal(plan.changes[0].action, 'deprecate');
  });

  it('flags an unknown builtin as deprecated', () => {
    const plan = planTemplateMigration(tpl({ vars: { x: { type: 'builtin', builtin: 'magic8ball' } } }));
    assert.match(plan.result.vars.x.deprecatedReason, /Unknown builtin "magic8ball"/);
  });

  it('clears legacy auto-match rules on order templates and records the change', () => {
    const t = tpl({ rules: [{ sel: '#x', op: 'exists' }] });
    const plan = planTemplateMigration(t);
    assert.deepEqual(plan.result.rules, []);
    assert.deepEqual(plan.changes, [{ name: '(auto-match rules)', action: 'clear-rules', from: '1 legacy rule(s)' }]);
  });
});

describe('deprecated-var helpers', () => {
  it('templateHasDeprecatedVar is true only when some var carries the flag', () => {
    assert.equal(templateHasDeprecatedVar(tpl({ vars: { a: { type: 'selector', deprecated: true } } })), true);
    assert.equal(templateHasDeprecatedVar(tpl({ vars: { a: { type: 'schema', path: 'x' } } })), false);
    assert.equal(templateHasDeprecatedVar({}), false);
  });

  it('deprecatedVarNames lists exactly the flagged names', () => {
    const t = tpl({ vars: {
      good: { type: 'schema', path: 'contact.firstName' },
      old1: { type: 'selector', selector: '.a', deprecated: true },
      old2: { type: 'builtin', builtin: 'zap', deprecated: true },
    } });
    assert.deepEqual(deprecatedVarNames(t), ['old1', 'old2']);
    assert.deepEqual(deprecatedVarNames(null), []);
  });
});

describe('migrateTemplates', () => {
  const legacy = () => tpl({ vars: { firstName: { type: 'builtin', builtin: 'firstName' } } });

  it('defaults to dry-run: reports changed but hands back the ORIGINAL list', () => {
    const list = [legacy()];
    const r = migrateTemplates(list);
    assert.equal(r.changed, true);
    assert.equal(r.migrated, list);
    assert.equal(r.migrated[0].vars.firstName.type, 'builtin');
    assert.equal(r.plans[0].changes.length, 1);
  });

  it('applies the rewrite when dryRun:false', () => {
    const r = migrateTemplates([legacy()], { dryRun: false });
    assert.equal(r.changed, true);
    assert.deepEqual(r.migrated[0].vars.firstName, { type: 'schema', path: 'contact.firstName' });
    assert.equal(r.migrated[0].varsMigratedVersion, MIGRATION_VERSION);
  });

  it('passes an already-stamped template through with a null plan and changed:false', () => {
    const done = { ...tpl(), varsMigratedVersion: MIGRATION_VERSION };
    const r = migrateTemplates([done], { dryRun: false });
    assert.equal(r.changed, false);
    assert.deepEqual(r.plans, [null]);
    assert.equal(r.migrated[0], done);
  });

  it('routes the human-readable report through the provided log sink', () => {
    const lines = [];
    migrateTemplates([legacy()], { log: (s) => lines.push(s) });
    assert.match(lines[0], /DRY-RUN \(no writes\)/);
    assert.ok(lines.some((l) => l.includes('convert  firstName: builtin:firstName → schema:contact.firstName')));
  });
});
