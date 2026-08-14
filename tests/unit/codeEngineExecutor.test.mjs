/**
 * executor — the content-side real writer. Verifies each contract routes to the
 * right injected lib call with the contact context, that edits map to the
 * crmUpdateContact payload keys, and that a live run (executor passed to
 * simulateProgram) actually fires the writes in order.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeExecutor,
  mapEditFields,
  mapOpportunityEditFields,
  mapTaskEditFields,
} from '../../src/lib/codeEngine/executor.js';
import { simulateProgram, asyncFunctionRunner } from '../../src/lib/codeEngine/simulate.js';

describe('executor · field mapping', () => {
  it('maps approved schema fields to crmUpdateContact payload keys', () => {
    assert.deepEqual(mapEditFields({ phone: '555', jobTitle: 'VP', ssn: 'x' }), { phoneNumber: '555', jobTitle: 'VP' });
  });

  it('normalizes task field aliases without forwarding unsupported fields', () => {
    const date = new Date(2026, 7, 1, 12);
    assert.deepEqual(mapTaskEditFields({
      live_date: date,
      due: '2026-08-08',
      body: 'Follow up',
      ownerId: 'blocked',
    }), {
      liveDate: date,
      dueDate: '2026-08-08',
      description: 'Follow up',
    });
  });

  it('normalizes opportunity aliases, stages, dates, and values', () => {
    assert.deepEqual(mapOpportunityEditFields({
      stage: 'Closed-Lost',
      estimated_close_date: '2026-09-13',
      estimated_value: '2400.50',
      actualValue: 999,
    }), {
      stageId: '5',
      estimatedCloseDate: '09-13-2026',
      estimatedValue: 2400.5,
    });
  });
});

describe('executor · routing', () => {
  const calls = [];
  const deps = {
    ctx: { contactId: '42', contactName: 'Ada', phone: '555', employeeId: '7', accountId: '9', email: 'ada@x.com' },
    sendEmail: (i, ctx) => { calls.push(['sendEmail', i.subject, ctx.contactId]); },
    submitQuickTask: (a) => { calls.push(['task', a.template.subject, a.context.contactId]); },
    submitCallLog: (a) => { calls.push(['call', a.template.subject, a.context.phone]); },
    updateTaskById: (id, fields) => { calls.push(['updateTask', id, fields]); },
    completeTaskById: (id) => { calls.push(['complete', id]); },
    updateOpportunityById: (id, fields, options) => { calls.push(['updateOpportunity', id, fields, options.contactId]); },
    createOpportunity: (fields, options) => {
      calls.push(['createOpportunity', fields.subject, options.contactId]);
      return { ok: true, opportunityId: 'new-88' };
    },
    createProposalFromOrder: (input, ctx) => {
      calls.push(['createProposal', input.order.number, input.opportunityId, ctx.contactId]);
      return { ok: true, cartID: 'cart-9', proposalUrl: 'https://www.golfballs.com/cart?proposalMode=true&cartID=cart-9', lineCount: 2 };
    },
    updateContact: (id, payload) => { calls.push(['edit', id, payload]); },
  };

  it('routes each contract + commits edits', async () => {
    const ex = makeExecutor(deps);
    await ex.run('sendEmail', { subject: 'Hi' });
    await ex.run('createTask', { subject: 'Do it' });
    await ex.run('logCall', { subject: 'Called' });
    await ex.run('addNote', { subject: 'Reviewed', body: 'QA note' });
    await ex.run('updateTask', { id: 't8', fields: { live_date: '2026-08-01' } });
    await ex.run('completeTask', { id: 't9' });
    await ex.run('updateOpportunity', { id: 'o7', fields: { stage: 'Closed - Lost' } });
    const created = await ex.run('createOpportunity', { subject: 'August Order' });
    const proposal = await ex.run('createProposalFromOrder', { order: { number: '1001' }, opportunityId: created.opportunityId });
    await ex.commitEdits({ jobTitle: 'VP', phone: '999' });
    assert.equal(created.opportunityId, 'new-88');
    assert.equal(proposal.proposalId, 'cart-9');
    assert.equal(proposal.lineCount, 2);
    assert.deepEqual(calls, [
      ['sendEmail', 'Hi', '42'],
      ['task', 'Do it', '42'],
      ['call', 'Called', '555'],
      ['call', 'Reviewed', '555'],
      ['updateTask', 't8', { liveDate: '2026-08-01' }],
      ['complete', 't9'],
      ['updateOpportunity', 'o7', { stageId: '5' }, '42'],
      ['createOpportunity', 'August Order', '42'],
      ['createProposal', '1001', 'new-88', '42'],
      ['edit', '42', { jobTitle: 'VP', phoneNumber: '999' }],
    ]);
  });

  it('throws a clear error when a capability is not configured', async () => {
    const ex = makeExecutor({ ctx: {} });
    await assert.rejects(() => ex.run('sendEmail', {}), /not configured/);
  });

  it('routes find-or-create, latest-order, and scratch catalog proposal results in sequence', async () => {
    const calls = [];
    const ctx = {
      contactId: '42',
      orders: [{ number: '1002', orderId: '1002' }],
      opportunities: [{ id: '71', stage: 'Open' }],
    };
    const ex = makeExecutor({
      ctx,
      ensureOpenOpportunity: async (input, receivedCtx) => {
        calls.push(['ensure', input.subject, receivedCtx.opportunities[0].id]);
        return { ok: true, opportunityId: '71', created: false, subject: 'Existing' };
      },
      createProposalFromOrder: async (input, receivedCtx) => {
        calls.push(['reorder', input.opportunityId, receivedCtx.orders[0].number]);
        return {
          ok: true,
          cartID: 'cart-order',
          proposalUrl: 'https://www.golfballs.com/cart?proposalMode=true&cartID=cart-order',
          orderId: '1002',
          lineCount: 2,
          total: 1400,
        };
      },
      createProposal: async (input, receivedCtx) => {
        calls.push(['scratch', input.items[0].sku, receivedCtx.contactId]);
        return {
          ok: true,
          cartID: 'cart-sku',
          proposalUrl: 'https://www.golfballs.com/cart?proposalMode=true&cartID=cart-sku',
          itemCount: 1,
          lineCount: 1,
          total: 755.88,
        };
      },
    });

    const opportunity = await ex.run('ensureOpenOpportunity', { subject: 'August Order' });
    const reorder = await ex.run('createProposalFromOrder', { opportunityId: opportunity.opportunityId });
    const scratch = await ex.run('createProposal', {
      opportunityId: opportunity.opportunityId,
      items: [{ sku: 'B5338', quantity: 12 }],
    });

    assert.equal(opportunity.created, false);
    assert.equal(reorder.proposalId, 'cart-order');
    assert.equal(reorder.orderId, '1002');
    assert.equal(scratch.proposalId, 'cart-sku');
    assert.equal(scratch.total, 755.88);
    assert.deepEqual(calls, [
      ['ensure', 'August Order', '71'],
      ['reorder', '71', '1002'],
      ['scratch', 'B5338', '42'],
    ]);
  });

  it('surfaces a helper {ok:false} response as a failed action', async () => {
    const ex = makeExecutor({
      ctx: { contactId: '42', employeeId: '7' },
      submitQuickTask: async () => ({ ok: false, error: 'CRM rejected task' }),
    });
    await assert.rejects(
      () => ex.run('createTask', { subject: 'QA' }),
      /CRM rejected task/,
    );
  });

  it('prepares a saved helper input before routing it to the CRM writer', async () => {
    let received;
    const ex = makeExecutor({
      ctx: { contactId: '42', employeeId: '7' },
      prepareInput: async (contract, input) => ({
        ...input,
        subject: `${contract} · rendered`,
      }),
      submitQuickTask: async ({ template }) => {
        received = template;
        return { ok: true, taskId: '88' };
      },
    });
    const result = await ex.run('createTask', {
      id: 'saved-1',
      name: 'Follow up',
      subject: 'raw {{firstName}}',
    });
    assert.equal(received.subject, 'createTask · rendered');
    assert.equal(result.taskId, '88');
  });

  it('targets an explicit contact for modal-backed bulk task creation', async () => {
    let request;
    const ex = makeExecutor({
      ctx: { contactId: '', employeeId: '7' },
      submitQuickTask: async (value) => {
        request = value;
        return { ok: true, taskId: 'bulk-1' };
      },
    });

    await ex.run('createTask', {
      contactId: '991',
      contactName: 'Morgan Buyer',
      accountId: '81',
      subject: 'Q4 Reach Out Opportunity',
      daysOut: 45,
    });

    assert.equal(request.context.contactId, '991');
    assert.equal(request.context.contactName, 'Morgan Buyer');
    assert.equal(request.context.accountId, '81');
    assert.equal(request.template.subject, 'Q4 Reach Out Opportunity');
    assert.equal(request.template.contactId, undefined);
  });

  it('rejects task creation when neither page nor input supplies a contact id', async () => {
    const ex = makeExecutor({
      ctx: { employeeId: '7' },
      submitQuickTask: async () => ({ ok: true }),
    });
    await assert.rejects(
      () => ex.run('createTask', { subject: 'Quarterly reach out' }),
      /no valid contact id/,
    );
  });
});

describe('executor · live run through simulateProgram', () => {
  it('fires real writes in order and reports failures on the trace', async () => {
    const fired = [];
    const executor = {
      run: async (name, input) => { if (name === 'completeTask') throw new Error('boom'); fired.push([name, input.subject]); },
      commitEdits: async (f) => { fired.push(['edit', Object.keys(f).join(',')]); },
    };
    const code = `
      await actions.sendEmail({ subject: "Hi" });
      page.tasks.open[0].complete();
      page.contact.jobTitle = "VP";
    `;
    const { trace } = await simulateProgram(code, { tasks: { open: [{ id: 't1', subject: 'Call' }] } }, { run: asyncFunctionRunner, executor });
    assert.deepEqual(fired, [['sendEmail', 'Hi'], ['edit', 'jobTitle']]);
    // the failing completeTask surfaces on its trace entry
    const ct = trace.find((t) => t.contract === 'completeTask');
    assert.equal(ct.status, 'failed');
    assert.match(ct.errors[0], /boom/);
  });
});
