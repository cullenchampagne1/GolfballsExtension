/**
 * A contact row is a pointer; the contact page is the content. When the page
 * fetch fails, every template variable resolves empty and renders as its smart
 * fallback — so the send goes out looking personalized while carrying only
 * defaults. Both send paths must fail the row instead.
 *
 * The regression these pin: the failure used to be swallowed whenever the row
 * happened to carry an email address, because a recipient was treated as
 * enough to proceed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { contactPageFetchError, contactDataUnavailable } = await import('../../src/lib/contactPageFetch.js');
const { runStepAction } = await import('../../src/lib/workflow/actions.js');

const CRM_ROW = { contactId: '4471', contactUrl: 'https://api.golfballs.com/x?Page=240&customerID=4471', email: 'buyer@example.com' };
const TEMPLATE = {
  name: 'Restock',
  subject: 'Time for a restock, {firstName}',
  body: '<p>Hi {firstName}, your last order was {lastOrderDate}.</p>',
  vars: { firstName: { type: 'builtin', builtin: 'firstName', fallback: 'there' } },
  toField: { type: 'auto' },
};

function context({ error = null, contact = CRM_ROW } = {}) {
  const calls = [];
  return {
    calls,
    ctx: {
      contact,
      error,
      html: '',
      data: {},
      email: contact.email || '',
      contactId: contact.contactId || '',
      dispatch: async (msg) => {
        calls.push(msg);
        return { resolved: {}, toEmail: '' };
      },
    },
  };
}

describe('contact page fetch guard', () => {
  it('fails a row whose fetch never reached the background', () => {
    assert.equal(
      contactPageFetchError(null, CRM_ROW),
      'Background not reachable (extension reloaded?)',
    );
  });

  it('fails a row on an HTTP error and names the status', () => {
    assert.equal(
      contactPageFetchError({ ok: false, status: 503, text: '' }, CRM_ROW),
      'Fetch failed (HTTP 503)',
    );
  });

  it('prefers the reply’s own error message over the generic status line', () => {
    assert.equal(
      contactPageFetchError({ ok: false, status: 0, text: '', error: 'Blocked URL' }, CRM_ROW),
      'Blocked URL',
    );
  });

  it('fails a row even when it already carries a recipient address', () => {
    // The regression: a usable `email` on the row used to suppress the error,
    // and the send went out with every page variable falling back.
    assert.equal(CRM_ROW.email, 'buyer@example.com');
    assert.equal(
      contactPageFetchError({ ok: false, status: 500, text: '' }, CRM_ROW),
      'Fetch failed (HTTP 500)',
    );
  });

  it('passes a page that loaded', () => {
    assert.equal(
      contactPageFetchError({ ok: true, status: 200, text: '<html><body>Kade</body></html>' }, CRM_ROW),
      '',
    );
  });

  it('exempts imported rows, whose values come from the CSV rather than the page', () => {
    assert.equal(
      contactPageFetchError({ ok: false, status: 503, text: '' }, { ...CRM_ROW, imported: true }),
      '',
    );
  });

  it('reads the same verdict off a built workflow context', () => {
    assert.equal(contactDataUnavailable({ contact: CRM_ROW, error: 'Fetch failed (HTTP 503)' }), 'Fetch failed (HTTP 503)');
    assert.equal(contactDataUnavailable({ contact: CRM_ROW, error: null }), '');
    assert.equal(contactDataUnavailable({ contact: { ...CRM_ROW, imported: true }, error: 'Fetch failed (HTTP 503)' }), '');
  });
});

describe('workflow email step on a dead contact fetch', () => {
  const step = { id: 's1', kind: 'email', templateId: 't1' };

  it('refuses to send, and never reaches the resolver or the sender', async () => {
    const { ctx, calls } = context({ error: 'Fetch failed (HTTP 503)' });
    const res = await runStepAction(step, TEMPLATE, ctx, { dryRun: false });

    assert.equal(res.ok, false);
    assert.match(res.error, /Contact page unavailable/);
    assert.match(res.error, /HTTP 503/);
    // Nothing was resolved and nothing was sent — the guard runs first.
    assert.deepEqual(calls, []);
  });

  it('reports the same verdict in a dry run, so the preview does not lie', async () => {
    const { ctx } = context({ error: 'Background not reachable (extension reloaded?)' });
    const res = await runStepAction(step, TEMPLATE, ctx, { dryRun: true });

    assert.equal(res.ok, false);
    assert.match(res.error, /Contact page unavailable/);
  });

  it('lets a healthy contact through to variable resolution', async () => {
    const { ctx, calls } = context({ error: null });
    await runStepAction(step, TEMPLATE, ctx, { dryRun: false });

    assert.equal(calls.length > 0, true);
    assert.equal(calls[0].action, 'resolveVarsForHtml');
  });

  it('still sends for an imported row whose page fetch failed', async () => {
    const imported = { ...CRM_ROW, imported: true };
    const { ctx, calls } = context({ error: 'Fetch failed (HTTP 503)', contact: imported });
    const res = await runStepAction(step, TEMPLATE, ctx, { dryRun: true });

    assert.equal(res.ok, true);
    assert.match(res.detail, /Would email buyer@example\.com/);
    assert.equal(calls.length > 0, true);
  });
});
