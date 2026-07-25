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

describe('contracts · input validation', () => {
  it('accepts a well-formed email and normalizes it', () => {
    const r = validateContractInput('sendEmail', {
      to: 'a@b.com', subject: 'Hi', htmlBody: '<p>x</p>',
    });
    assert.equal(r.ok, true);
    assert.deepEqual(r.value, { to: 'a@b.com', subject: 'Hi', htmlBody: '<p>x</p>' });
  });

  it('requires the required fields', () => {
    const r = validateContractInput('sendEmail', { subject: 'Hi' });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('"to"')));
  });

  it('rejects an unknown parameter', () => {
    const r = validateContractInput('createTask', { subject: 'x', bcc: 'y' });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('Unknown parameter "bcc"')));
  });

  it('enforces enum and number bounds', () => {
    assert.equal(validateContractInput('createTask', { subject: 'x', priority: 'urgent' }).ok, false);
    assert.equal(validateContractInput('createTask', { subject: 'x', daysOut: 9999 }).ok, false);
    const good = validateContractInput('createTask', { subject: 'x', priority: 'high', daysOut: 3 });
    assert.equal(good.ok, true);
    assert.deepEqual(good.value, { subject: 'x', priority: 'high', daysOut: 3 });
  });

  it('coerces booleans and clamps long strings', () => {
    const r = validateContractInput('logCall', {
      subject: 'x'.repeat(600), direction: 'inbound', voicemail: 'true',
    });
    assert.equal(r.ok, true);
    assert.equal(r.value.subject.length, 500);
    assert.equal(r.value.voicemail, true);
  });

  it('reports an unknown action rather than throwing', () => {
    const r = validateContractInput('deleteEverything', { x: 1 });
    assert.equal(r.ok, false);
    assert.ok(r.errors[0].includes('Unknown action'));
  });
});

describe('contracts · describe() is stable', () => {
  it('summarizes with and without a subject', () => {
    assert.equal(
      describeContract('sendEmail', { to: 'a@b.com', subject: 'Quote' }),
      'Send email to a@b.com — “Quote”',
    );
    assert.equal(describeContract('createTask', { subject: 'Follow up' }),
      'Create task “Follow up” for the current contact');
    assert.equal(describeContract('logCall', { subject: 'VM', direction: 'inbound' }),
      'Log inbound call “VM” for the current contact');
    assert.equal(describeContract('createTask', {}),
      'Create a task for the current contact');
  });
});
