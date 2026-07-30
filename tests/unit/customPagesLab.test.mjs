import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildActionReviewFixture,
  buildOpportunityFixture,
  buildPageFixture,
  buildProposalFixtures,
  buildSearchFixture,
  createActionReviewFixtureClient,
  createSearchFixtureClient,
  createFixtureStore,
  resolveLabMode,
  resolveLabPage,
} from '../../dev/custom-pages-lab/fixtures.js';

describe('custom pages lab', () => {
  it('provides populated fixtures for every registered detail page surface', () => {
    for (const page of ['contact', 'account', 'opportunity', 'search']) {
      const fixture = buildPageFixture(page, 'populated');
      assert.equal(fixture.ids.contact, '44210');
      assert.ok(fixture.ids.account);
      assert.ok(fixture.orders.length >= 10);
      assert.ok(fixture.items.length >= 6);
      assert.ok(fixture.activities.length >= 10);
      assert.ok(fixture.emails.length >= 10);
      assert.ok(fixture.tasks.open.length >= 8);
      assert.ok(fixture.tasks.done.length >= 6);
      assert.ok(fixture.tasks.open.every((task) => task.id && task.owner && task.liveDate && task.dueDate));
      assert.ok(fixture.tasks.done.every((task) => task.id && task.owner && task.liveDate && task.dueDate));
      assert.ok(fixture.opportunities.length >= 4);
      assert.ok(fixture.opportunities.every((opportunity) => opportunity.owner));
      assert.ok(fixture.proofs.length >= 3);
      assert.ok(fixture.lookups.length >= 3);
    }
  });

  it('provides stress and empty modes for overflow and zero-data states', () => {
    const stress = buildPageFixture('contact', 'stress');
    const empty = buildPageFixture('contact', 'empty');
    assert.ok(stress.orders.length >= 70);
    assert.ok(stress.activities.length >= 75);
    assert.ok(stress.tasks.open.length >= 40);
    assert.deepEqual(empty.orders, []);
    assert.deepEqual(empty.emails, []);
    assert.deepEqual(empty.tasks, { open: [], done: [] });
  });

  it('provides opportunity scalars and proposals without network reads', () => {
    const opportunity = buildOpportunityFixture('populated');
    const proposals = buildProposalFixtures('populated');
    assert.equal(opportunity.id, '38012');
    assert.equal(opportunity.stage, 'Proposed');
    assert.ok(opportunity.description.length > 80);
    assert.equal(proposals.length, 4);
    assert.equal(buildProposalFixtures('empty').length, 0);
  });

  it('provides searchable CRM results and facet counts without Solr', async () => {
    const fixture = buildSearchFixture('stress');
    const client = createSearchFixtureClient(fixture);
    const result = await client({ query: 'northstar', type: 'all', start: 0 });
    assert.ok(fixture.docs.length >= 100);
    assert.ok(result.docs.length > 0);
    assert.ok(result.facets.fields.salesRep_s.length >= 10);
    assert.ok(Object.keys(result.facets.queries).length >= 8);
  });

  it('provides a write-disabled Action Review fixture with large-table modes', async () => {
    const populated = buildActionReviewFixture('populated');
    const stress = buildActionReviewFixture('stress');
    const empty = buildActionReviewFixture('empty');
    const client = createActionReviewFixtureClient(populated);
    const filtered = await client({
      type: 'filter',
      filters: {
        rep: '1114',
        dateOption: 'BETWEEN',
        date1: '2026-07-20',
        date2: '2026-07-29',
      },
    });

    assert.equal(populated.activities.length, 80);
    assert.equal(populated.emails.length, 40);
    assert.ok(populated.tasks.length >= 200);
    assert.ok(stress.tasks.length >= 2_000);
    assert.deepEqual(empty.tasks, []);
    assert.equal(empty.searched, true);
    assert.deepEqual(empty.resultTables, {
      activities: true,
      emails: true,
      tasks: true,
    });
    assert.deepEqual(filtered.selected, {
      rep: '1114',
      dateOption: 'BETWEEN',
      date1: '2026-07-20',
      date2: '2026-07-29',
    });
  });

  it('normalizes unknown query values to stable defaults', () => {
    assert.equal(resolveLabPage('not-a-page'), 'contact');
    assert.equal(resolveLabMode('not-a-mode'), 'populated');
  });

  it('notifies subscribers when a fixture is replaced and supports unsubscribe', () => {
    const first = buildPageFixture('contact', 'populated');
    const next = buildPageFixture('contact', 'empty');
    const store = createFixtureStore(first);
    let calls = 0;
    const unsubscribe = store.subscribe(() => { calls += 1; });
    store.set(next);
    assert.equal(store.get(), next);
    assert.equal(calls, 1);
    unsubscribe();
    store.set(first);
    assert.equal(calls, 1);
  });
});
