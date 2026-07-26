/**
 * buildCodeSpec — the machine-readable API an assistant reads to author
 * campaigns. Pins that it enumerates every action with its params + gate
 * (derived from the live registry), documents the bindings, and carries the
 * rep's saved template names so generated code references real templates.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCodeSpec } from '../../src/lib/codeEngine/spec.js';
import { CONTRACTS } from '../../src/lib/codeEngine/contracts.js';

describe('spec · machine-readable code API', () => {
  it('lists every contract with a gate', () => {
    const spec = buildCodeSpec();
    const names = spec.actions.map((a) => a.name).sort();
    assert.deepEqual(names, Object.keys(CONTRACTS).sort());
    for (const a of spec.actions) {
      assert.ok(['auto', 'confirm', 'hard'].includes(a.gate), `${a.name} needs a gate`);
      assert.ok(a.call.startsWith(`actions.${a.name}(`));
    }
  });

  it('documents page / user / h bindings', () => {
    const spec = buildCodeSpec();
    assert.ok(spec.bindings.page['page.contact']);
    assert.ok(spec.bindings.user['user.email(name|id)'].includes('dependency'));
    assert.ok(spec.bindings.h.includes('h.fmt'));
  });

  it('carries the rep\'s saved template names', () => {
    const spec = buildCodeSpec({ emails: ['Win-back'], tasks: ['Follow up'], calls: [] });
    assert.deepEqual(spec.saved.emails, ['Win-back']);
    assert.deepEqual(spec.saved.tasks, ['Follow up']);
  });

  it('states the template-dependency + signature rules', () => {
    const rules = buildCodeSpec().rules.join(' ');
    assert.match(rules, /dependency error/);
    assert.match(rules, /signature is appended/);
  });
});
