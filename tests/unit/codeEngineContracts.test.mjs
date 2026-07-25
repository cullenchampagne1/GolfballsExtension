/**
 * Code-engine contract registry — the shared control surface.
 *
 * The registry is the single place where a code call and a JSON verb converge,
 * and where the effect class sets the gate. These pin that a money contract is
 * never `auto`, that input validation rejects anything off-schema (so a payload
 * can't smuggle a field past it), and that the human describe() is stable — it's
 * the same text the block label and the confirmation card show.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRACTS, EFFECT_CLASSES, GATE_BY_EFFECT,
  contractFor, contractGate, describeContract, listContracts, validateContractInput,
} from '../../src/lib/codeEngine/contracts.js';

describe('contracts · identity & lookup', () => {
  it('resolves a contract by code name or by JSON verb', () => {
    assert.equal(contractFor('sendEmail')?.name, 'sendEmail');
    assert.equal(contractFor('send_email')?.name, 'sendEmail');
    assert.equal(contractFor('nope'), null);
  });

  it('keeps code name ↔ verb parity for every contract', () => {
    for (const c of Object.values(CONTRACTS)) {
      assert.equal(contractFor(c.name), c);
      assert.equal(contractFor(c.verb), c, `${c.name} must resolve from its verb ${c.verb}`);
    }
  });

  it('lists contracts with their gate resolved', () => {
    const byName = Object.fromEntries(listContracts().map((c) => [c.name, c]));
    assert.equal(byName.sendEmail.gate, 'confirm');
    assert.equal(byName.createTask.gate, 'confirm');
    assert.ok(byName.sendEmail.params.includes('to'));
  });
});

describe('contracts · effect → gate is the safety spine', () => {
  it('maps every effect class to a gate', () => {
    for (const effect of EFFECT_CLASSES) {
      assert.ok(GATE_BY_EFFECT[effect], `effect ${effect} must have a gate`);
    }
  });

  it('never lets an outward or money contract auto-run', () => {
    for (const c of Object.values(CONTRACTS)) {
      const gate = GATE_BY_EFFECT[c.effect];
      if (c.effect === 'outward') assert.equal(gate, 'confirm');
      if (c.effect === 'money') assert.equal(gate, 'hard');
      assert.notEqual(
        (c.effect === 'outward' || c.effect === 'money') && gate === 'auto', true,
        `${c.name} must not auto-run`,
      );
    }
  });

  it('gates send/create/log correctly', () => {
    assert.equal(contractGate('sendEmail'), 'confirm'); // outward
    assert.equal(contractGate('createTask'), 'confirm'); // remote
    assert.equal(contractGate('logCall'), 'confirm'); // remote
    assert.equal(contractGate('unknown'), null);
  });
});

describe('contracts · input validation (template OR custom object)', () => {
  it('accepts a custom email with a subject', () => {
    const r = validateContractInput('sendEmail', { to: 'a@b.com', subject: 'Hi', body: '<p>x</p>' });
    assert.equal(r.ok, true);
  });

  it('accepts a saved email template (id + name), no subject needed', () => {
    const r = validateContractInput('sendEmail', { id: 't1', name: 'Win-back', subject: 'We miss you' });
    assert.equal(r.ok, true);
  });

  it('rejects an email that is neither a template nor has a subject', () => {
    const r = validateContractInput('sendEmail', { to: 'a@b.com' });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /saved email or a subject/.test(e)));
  });

  it('accepts a saved task or a custom task, rejects an empty one', () => {
    assert.equal(validateContractInput('createTask', { id: 't2', name: 'Follow up' }).ok, true);
    assert.equal(validateContractInput('createTask', { subject: 'Call them' }).ok, true);
    const bad = validateContractInput('createTask', {});
    assert.equal(bad.ok, false);
    assert.ok(bad.errors.some((e) => /saved task or a subject/.test(e)));
  });

  it('reports an unknown action rather than throwing', () => {
    const r = validateContractInput('deleteEverything', { x: 1 });
    assert.equal(r.ok, false);
    assert.ok(r.errors[0].includes('Unknown action'));
  });
});

describe('contracts · describe() is stable', () => {
  it('summarizes a saved template by its name', () => {
    assert.equal(describeContract('sendEmail', { id: 't1', name: 'Win-back' }), 'Send “Win-back”');
    assert.equal(describeContract('createTask', { id: 't2', name: 'Follow up' }), 'Create task “Follow up”');
  });

  it('summarizes a custom email/task by its subject', () => {
    assert.equal(describeContract('sendEmail', { to: 'a@b.com', subject: 'Quote' }), 'Send email “Quote” to a@b.com');
    assert.equal(describeContract('createTask', { subject: 'Follow up' }), 'Create task “Follow up”');
    assert.equal(describeContract('logCall', { subject: 'VM', direction: 'inbound' }), 'Log inbound call “VM”');
    assert.equal(describeContract('createTask', {}), 'Create a task for the current contact');
  });
});
