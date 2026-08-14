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
  CONTRACTS, EFFECT_CLASSES, GATE_BY_EFFECT, APPROVED_CONTACT_FIELDS,
  APPROVED_TASK_FIELDS, APPROVED_OPPORTUNITY_FIELDS,
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
    assert.ok(byName.createTask.params.includes('contactId'));
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
    assert.equal(contractGate('addNote'), 'confirm'); // remote
    assert.equal(contractGate('updateOpportunity'), 'confirm'); // remote
    assert.equal(contractGate('createOpportunity'), 'confirm'); // remote
    assert.equal(contractGate('ensureOpenOpportunity'), 'confirm'); // remote
    assert.equal(contractGate('createProposalFromOrder'), 'confirm'); // remote
    assert.equal(contractGate('createProposal'), 'confirm'); // remote
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

  it('completeTask needs a task; describes by subject', () => {
    assert.equal(contractGate('completeTask'), 'confirm'); // remote
    assert.equal(validateContractInput('completeTask', {}).ok, false);
    assert.equal(validateContractInput('completeTask', { id: 't1', subject: 'Follow up' }).ok, true);
    assert.equal(describeContract('completeTask', { subject: 'Follow up' }), 'Complete task “Follow up”');
  });

  it('updateTask accepts approved aliases and rejects unknown task fields', () => {
    assert.equal(contractGate('updateTask'), 'confirm');
    assert.equal(validateContractInput('updateTask', { id: '91', fields: {} }).ok, false);
    assert.equal(validateContractInput('updateTask', {
      id: '91',
      subject: 'Future follow-up',
      fields: { live_date: '2026-08-01', dueDate: '2026-08-08' },
    }).ok, true);
    const bad = validateContractInput('updateTask', {
      id: '91',
      fields: { contactId: 'replace-owner' },
    });
    assert.equal(bad.ok, false);
    assert.match(bad.errors.join(' '), /not an editable task field/);
    assert.equal(APPROVED_TASK_FIELDS.live_date, 'liveDate');
    assert.equal(
      describeContract('updateTask', {
        id: '91',
        subject: 'Future follow-up',
        fields: { live_date: '2026-08-01', due_date: '2026-08-08' },
      }),
      'Edit task “Future follow-up” — liveDate, dueDate',
    );
  });

  it('registers a first-class activity note contract', () => {
    assert.equal(validateContractInput('addNote', { body: 'Reviewed account' }).ok, true);
    assert.equal(validateContractInput('addNote', {}).ok, false);
    assert.equal(
      describeContract('addNote', { subject: 'Workflow QA' }),
      'Add activity note “Workflow QA”',
    );
  });

  it('validates full opportunity edits and creation', () => {
    assert.equal(validateContractInput('updateOpportunity', {
      id: '71',
      fields: {
        subject: 'Renewal',
        estimated_close_date: '2026-09-13',
        stage: 'Closed-Lost',
        assignedToId: '7',
      },
    }).ok, true);
    assert.equal(APPROVED_OPPORTUNITY_FIELDS.stage, 'stageId');
    assert.equal(validateContractInput('updateOpportunity', {
      id: '71', fields: { actualValue: 500 },
    }).ok, false);
    assert.equal(validateContractInput('createOpportunity', {
      subject: 'August Order', estimatedValue: 2400, stage: 'Open',
    }).ok, true);
    assert.equal(validateContractInput('createOpportunity', {
      subject: 'August Order', stage: 'Definitely Closed',
    }).ok, false);
    assert.equal(
      describeContract('updateOpportunity', {
        id: '71', subject: 'Renewal', fields: { stage: 'Closed - Lost' },
      }),
      'Edit opportunity “Renewal” — stageId',
    );
    assert.equal(
      describeContract('createOpportunity', {
        subject: 'August Order', estimatedValue: 2400,
      }),
      'Create opportunity “August Order” · $2,400',
    );
  });

  it('accepts newest-reusable or explicit-order proposals and validates scratch SKU lines', () => {
    assert.equal(validateContractInput('createProposalFromOrder', {
      order: { number: '1001', url: '91' }, opportunityId: '88', name: 'August reorder',
    }).ok, true);
    assert.equal(validateContractInput('createProposalFromOrder', { opportunityId: '88' }).ok, true);
    assert.equal(validateContractInput('createProposalFromOrder', { order: { url: '91' } }).ok, false);
    assert.equal(
      describeContract('createProposalFromOrder', {
        order: { number: '1001' }, opportunityId: '88', name: 'August reorder',
      }),
      'Create proposal “August reorder” from order 1001',
    );

    assert.equal(validateContractInput('ensureOpenOpportunity', {
      subject: 'August Order', estimatedValue: 2400, stage: 'Open',
    }).ok, true);
    assert.equal(validateContractInput('ensureOpenOpportunity', {}).ok, false);
    assert.equal(validateContractInput('ensureOpenOpportunity', {
      subject: 'August Order', stage: 'Not a stage',
    }).ok, false);
    assert.equal(
      describeContract('ensureOpenOpportunity', { subject: 'August Order' }),
      'Use an open opportunity or create “August Order”',
    );

    assert.equal(validateContractInput('createProposal', {
      opportunityId: '88',
      items: [{ sku: 'B5338', quantity: 12 }, { sku: 'M6428', quantity: 24, price: 29.95 }],
    }).ok, true);
    assert.equal(validateContractInput('createProposal', {
      opportunityId: '88', items: [{ sku: 'B5338', quantity: -1 }],
    }).ok, false);
    assert.equal(validateContractInput('createProposal', {
      opportunityId: '88', items: [{ sku: 'B5338' }],
    }).ok, false);
    assert.equal(validateContractInput('createProposal', {
      opportunityId: '88', items: [{ sku: 'B5338', quantity: 12, secret: true }],
    }).ok, false);
    assert.equal(
      describeContract('createProposal', {
        opportunityId: '88', name: 'Scratch', items: [{ sku: 'B5338', quantity: 12 }],
      }),
      'Create proposal “Scratch” from 1 catalog item',
    );
  });

  it('editContact only allows approved fields, grouped', () => {
    assert.equal(contractGate('editContact'), 'confirm');
    assert.equal(validateContractInput('editContact', { fields: {} }).ok, false);
    assert.equal(validateContractInput('editContact', { fields: { phone: '555', jobTitle: 'VP' } }).ok, true);
    const bad = validateContractInput('editContact', { fields: { ssn: '123' } });
    assert.equal(bad.ok, false);
    assert.ok(bad.errors.some((e) => /not an editable contact field/.test(e)));
    assert.equal(describeContract('editContact', { fields: { phone: '5', jobTitle: 'x' } }), 'Edit contact — phone, jobTitle');
    // phone maps to the crmUpdateContact payload key.
    assert.equal(APPROVED_CONTACT_FIELDS.phone, 'phoneNumber');
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
    assert.equal(
      describeContract('createTask', { subject: 'Q4 Reach Out Opportunity', contactName: 'Avery Buyer' }),
      'Create task “Q4 Reach Out Opportunity” for Avery Buyer',
    );
    assert.equal(describeContract('logCall', { subject: 'VM', direction: 'inbound' }), 'Log inbound call “VM”');
    assert.equal(describeContract('createTask', {}), 'Create a task for the current contact');
  });
});
