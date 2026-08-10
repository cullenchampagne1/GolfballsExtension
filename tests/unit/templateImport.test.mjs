/**
 * Unit tests — src/lib/templateImport.js
 *
 * Follows tests/unit/findPhone.test.mjs conventions. Pure module except
 * importTemplates, which needs a chrome.storage.local stub (installed
 * before the dynamic import).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const store = {};
globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const out = {};
        for (const k of [].concat(keys)) if (k in store) out[k] = store[k];
        cb(out);
      },
      set: (obj, cb) => { Object.assign(store, obj); if (cb) cb(); },
    },
  },
  runtime: { lastError: null },
};

const {
  normalizeTemplate, parseTemplateBlob, buildEmailTemplateFile, parseEmailTemplateFile,
  importTemplates, EMAIL_TEMPLATE_FILE_KIND, EMAIL_TEMPLATE_FILE_VERSION,
} = await import('../../src/lib/templateImport.js');

const minimal = { name: 'Welcome', body: 'Hi {{firstName}}' };

describe('normalizeTemplate — required fields and defaults', () => {
  it('fills defaults: fresh tpl_ id, type order, enabled, auto toField, standalone replyMode', () => {
    const t = normalizeTemplate(minimal);
    assert.match(t.id, /^tpl_/);
    assert.equal(t.type, 'order');
    assert.equal(t.enabled, true);
    assert.equal(t.subject, '');
    assert.equal(t.body, 'Hi {{firstName}}');
    assert.deepEqual(t.toField, { type: 'auto' });
    assert.deepEqual(t.vars, {});
    assert.deepEqual(t.varOrder, []);
    assert.equal(t.replyMode, 'standalone');
  });

  it('generates a different id on every import (no collisions/overwrites)', () => {
    assert.notEqual(normalizeTemplate(minimal).id, normalizeTemplate(minimal).id);
  });

  it('throws a numbered message when name is missing', () => {
    assert.throws(() => normalizeTemplate({ body: 'x' }, 2), /Template #3 is missing "name"/);
  });

  it('throws when body is missing or blank', () => {
    assert.throws(() => normalizeTemplate({ name: 'T', body: '   ' }), /Template "T" is missing "body"/);
  });

  it('rejects a variable name with characters outside \\w', () => {
    assert.throws(
      () => normalizeTemplate({ ...minimal, vars: { 'first-name': { type: 'literal', value: 'x' } } }),
      /letters\/numbers\/underscores/,
    );
  });

  it('rejects a variable with an unknown type, listing the allowed types', () => {
    assert.throws(
      () => normalizeTemplate({ ...minimal, vars: { v: { type: 'sql' } } }),
      /unknown type .*schema, path, code/,
    );
  });
});

describe('normalizeTemplate — variable normalization', () => {
  it("canonicalizes type 'path' to 'schema' and keeps the path", () => {
    const t = normalizeTemplate({ ...minimal, vars: { fn: { type: 'path', path: 'contact.firstName' } } });
    assert.deepEqual(t.vars.fn, { type: 'schema', path: 'contact.firstName' });
  });

  it('normalizes a regex var: pattern kept, bad source falls back to body, group coerced to number', () => {
    const t = normalizeTemplate({
      ...minimal,
      vars: {
        ok: { type: 'regex', pattern: 'Order #(\\d+)', source: 'subject', group: '2' },
        bad: { type: 'regex', pattern: 'x', source: 'clipboard' },
      },
    });
    assert.deepEqual(t.vars.ok, { type: 'regex', pattern: 'Order #(\\d+)', source: 'subject', group: 2 });
    assert.equal(t.vars.bad.source, 'body');
  });

  it('defaults an attachment var to inline/url with clamped width and a conditional line-scope smart block', () => {
    const t = normalizeTemplate({ ...minimal, vars: { file: { type: 'attachment', width: 9999 } } });
    assert.deepEqual(t.vars.file, {
      type: 'attachment', mode: 'inline', source: 'url', url: '', filename: 'attachment',
      width: 600, align: 'left', smart: { conditionalScope: 'line', conditional: true },
    });
  });

  it('respects an explicit conditional:false opt-out on an attachment var', () => {
    const t = normalizeTemplate({ ...minimal, vars: { file: { type: 'attachment', smart: { conditional: false } } } });
    assert.equal(t.vars.file.smart, undefined);
  });

  it('orders vars by varOrder first, then appends the leftovers', () => {
    const t = normalizeTemplate({
      ...minimal,
      vars: { b: { type: 'literal', value: '2' }, a: { type: 'literal', value: '1' } },
      varOrder: ['a'],
    });
    assert.deepEqual(t.varOrder, ['a', 'b']);
  });

  it('whitelists smart options (fallback/transform/conditional) and drops unknown keys', () => {
    const t = normalizeTemplate({
      ...minimal,
      vars: { v: { type: 'literal', value: 'x', smart: { fallback: 'friend', transform: 'upper', evil: 'nope' } } },
    });
    assert.deepEqual(t.vars.v.smart, { fallback: 'friend', transform: 'upper' });
  });
});

describe('normalizeTemplate — recipients, variations, sender', () => {
  it('accepts literal and selector toField shapes', () => {
    const lit = normalizeTemplate({ ...minimal, toField: { type: 'literal', value: 'ap@corp.com' } });
    assert.deepEqual(lit.toField, { type: 'literal', value: 'ap@corp.com' });
    const sel = normalizeTemplate({ ...minimal, toField: { type: 'selector', selector: '#email' } });
    assert.deepEqual(sel.toField, { type: 'selector', selector: '#email' });
  });

  it('normalizes variations with fresh var_ ids, subject fallback, and carries baseLabel', () => {
    const t = normalizeTemplate({
      ...minimal, subject: 'Base subject', baseLabel: 'Original',
      variations: [{ label: 'Casual', body: 'Yo' }, { subject: 'Alt subj', body: 'Alt' }],
    });
    assert.equal(t.variations.length, 2);
    assert.match(t.variations[0].id, /^var_/);
    assert.equal(t.variations[0].label, 'Casual');
    assert.equal(t.variations[0].subject, 'Base subject');
    assert.equal(t.variations[1].label, 'Variation 2');
    assert.equal(t.baseLabel, 'Original');
  });

  it("keeps replyMode 'reply' but coerces anything else to 'standalone', and carries sender fields", () => {
    const a = normalizeTemplate({ ...minimal, replyMode: 'reply', senderAccount: 'loyaltylogo', senderRandomize: 1 });
    assert.equal(a.replyMode, 'reply');
    assert.equal(a.senderAccount, 'loyaltylogo');
    assert.equal(a.senderRandomize, true);
    assert.equal(normalizeTemplate({ ...minimal, replyMode: 'forward' }).replyMode, 'standalone');
  });

  it('preserves task and custom-action follow-ups on non-case templates', () => {
    const t = normalizeTemplate({
      ...minimal,
      presetTaskId: ' task_4 ',
      followUpActionId: ' action_9 ',
    });
    assert.equal(t.presetTaskId, 'task_4');
    assert.equal(t.followUpActionId, 'action_9');
  });

  it('normalizes a case template: caseVars kinds/config fallbacks, caseRules filtered, no replyMode', () => {
    const t = normalizeTemplate({
      name: 'Case', body: 'b', type: 'case',
      caseVars: [
        { name: 'order', kind: 'regex', pattern: '#(\\d+)', source: 'subject', group: 1 },
        { name: 'greet' }, // kind defaults to literal, config ''
        { noName: true },  // dropped
      ],
      caseRules: [{ field: 'subject', op: 'contains', value: 'refund' }, { op: 'broken' }],
      caseTags: ['billing', 7],
    });
    assert.equal(t.caseVars.length, 2);
    assert.deepEqual(t.caseVars[0], {
      name: 'order', kind: 'regex', config: '#(\\d+)', source: 'subject', group: 1, smart: {},
    });
    assert.equal(t.caseVars[1].kind, 'literal');
    assert.deepEqual(t.caseRules, [{ field: 'subject', op: 'contains', value: 'refund' }]);
    assert.deepEqual(t.caseTags, ['billing', '7']);
    assert.equal('replyMode' in t, false);
    assert.equal('presetTaskId' in t, false);
    assert.equal('followUpActionId' in t, false);
  });
});

describe('parseTemplateBlob', () => {
  it('accepts a single object, an array, and a {templates:[…]} wrapper', () => {
    assert.equal(parseTemplateBlob(JSON.stringify(minimal)).length, 1);
    assert.equal(parseTemplateBlob(JSON.stringify([minimal, minimal])).length, 2);
    assert.equal(parseTemplateBlob(JSON.stringify({ templates: [minimal] })).length, 1);
  });

  it('throws a readable error for invalid JSON', () => {
    assert.throws(() => parseTemplateBlob('{oops'), /Not valid JSON/);
  });

  it('throws when the wrapper contains no templates', () => {
    assert.throws(() => parseTemplateBlob('{"templates": []}'), /No templates found/);
  });
});

describe('email template file envelope', () => {
  it('buildEmailTemplateFile wraps a normalized template in the versioned envelope', () => {
    const file = buildEmailTemplateFile(minimal);
    assert.equal(file.kind, EMAIL_TEMPLATE_FILE_KIND);
    assert.equal(file.schemaVersion, EMAIL_TEMPLATE_FILE_VERSION);
    assert.equal(file.template.name, 'Welcome');
    assert.match(file.template.id, /^tpl_/);
  });

  it('parseEmailTemplateFile round-trips a built file and re-issues a fresh id', () => {
    const file = buildEmailTemplateFile(minimal);
    const t = parseEmailTemplateFile(JSON.stringify(file));
    assert.equal(t.name, 'Welcome');
    assert.equal(t.body, 'Hi {{firstName}}');
    assert.notEqual(t.id, file.template.id);
  });

  it('rejects a raw template object that is not in the envelope', () => {
    assert.throws(() => parseEmailTemplateFile(JSON.stringify(minimal)), /not a versioned Golfballs email template file/);
  });

  it('rejects an unsupported schemaVersion', () => {
    const file = { ...buildEmailTemplateFile(minimal), schemaVersion: 99 };
    assert.throws(() => parseEmailTemplateFile(JSON.stringify(file)), /version is not supported/);
  });

  it('rejects files over 256 KB before parsing', () => {
    const big = JSON.stringify({ kind: EMAIL_TEMPLATE_FILE_KIND, pad: 'x'.repeat(256 * 1024) });
    assert.throws(() => parseEmailTemplateFile(big), /256 KB or smaller/);
  });
});

describe('importTemplates', () => {
  it('appends to the existing stored templates and resolves the imported count', async () => {
    store.templates = [{ id: 'tpl_existing', name: 'Old' }];
    const incoming = [normalizeTemplate(minimal), normalizeTemplate({ name: 'Second', body: 'b' })];
    const count = await importTemplates(incoming);
    assert.equal(count, 2);
    assert.equal(store.templates.length, 3);
    assert.equal(store.templates[0].id, 'tpl_existing');
    assert.equal(store.templates[2].name, 'Second');
  });
});
