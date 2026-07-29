import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/guide/lib/mock-chrome.js';
import './lab.css';
import {
  LAB_MODES,
  LAB_PAGES,
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
} from './fixtures.js';

window.__gbCustomPagesLab = true;

// Never let a preview interaction write to the CRM. Opportunity reads are
// fixtures; accidental remote calls exercise the production error UI.
const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
  if (url.origin === window.location.origin) return nativeFetch(input, init);
  return Promise.resolve(new Response(JSON.stringify({ preview: true, message: 'CRM writes are disabled in Custom Pages Lab.' }), {
    status: 503,
    headers: { 'content-type': 'application/json' },
  }));
};

let ContactDetailsApp;
let AccountDetailsApp;
let OpportunityDetailsApp;
let CrmSearchPageApp;
let ActionReviewApp;

function updateQuery(page, mode) {
  const url = new URL(window.location.href);
  url.searchParams.set('page', page);
  url.searchParams.set('mode', mode);
  if (page === 'opportunity') url.searchParams.set('opportunityID', '38012');
  else url.searchParams.delete('opportunityID');
  window.history.replaceState({}, '', url);
}

function Lab() {
  const params = new URLSearchParams(window.location.search);
  const [page, setPage] = useState(() => resolveLabPage(params.get('page')));
  const [mode, setMode] = useState(() => resolveLabMode(params.get('mode')));
  const [notice, setNotice] = useState('');
  const store = useMemo(() => createFixtureStore(buildPageFixture(page, mode)), [page, mode]);

  useEffect(() => {
    updateQuery(page, mode);
    document.title = `${LAB_PAGES.find((item) => item.id === page)?.label || 'Custom page'} · Lab`;
  }, [page, mode]);

  useEffect(() => {
    window.__gbToast = { info: setNotice, success: setNotice, warning: setNotice, error: setNotice };
    const interceptLinks = (event) => {
      const anchor = event.target.closest?.('a');
      if (!anchor || !anchor.href || anchor.href.startsWith('data:')) return;
      event.preventDefault();
      setNotice('Navigation is disabled in preview mode.');
    };
    document.addEventListener('click', interceptLinks, true);
    return () => document.removeEventListener('click', interceptLinks, true);
  }, []);

  const searchFixture = useMemo(() => buildSearchFixture(mode), [mode]);
  const searchClient = useMemo(() => createSearchFixtureClient(searchFixture), [searchFixture]);
  const actionReviewFixture = useMemo(() => buildActionReviewFixture(mode), [mode]);
  const actionReviewClient = useMemo(() => createActionReviewFixtureClient(actionReviewFixture), [actionReviewFixture]);
  const pageNode = page === 'account'
    ? <AccountDetailsApp store={store} />
    : page === 'opportunity'
      ? <OpportunityDetailsApp
          store={store}
          initialOpportunity={buildOpportunityFixture(mode)}
          initialProposals={buildProposalFixtures(mode)}
        />
      : page === 'search'
        ? <CrmSearchPageApp store={store} initialSearch={searchFixture} searchClient={searchClient} />
      : page === 'action-review'
        ? <ActionReviewApp
            store={store}
            initialReview={actionReviewFixture}
            reviewClient={actionReviewClient}
            actionsEnabled={false}
          />
      : <ContactDetailsApp store={store} />;

  return (
    <div className="lab-shell">
      <div className="lab-toolbar" role="toolbar" aria-label="Custom Pages Lab controls">
        <div className="lab-brand">
          <span className="lab-brand-mark">GB</span>
          <span><strong>Custom Pages Lab</strong><small>Real components · mock CRM data · writes disabled</small></span>
        </div>
        <label>
          <span>Page</span>
          <select value={page} onChange={(event) => setPage(event.target.value)}>
            {LAB_PAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label>
          <span>Fixture</span>
          <select value={mode} onChange={(event) => setMode(event.target.value)}>
            {LAB_MODES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>
      <main className="lab-stage" key={`${page}:${mode}`}>{pageNode}</main>
      {notice && <button className="lab-notice" onClick={() => setNotice('')}>{notice}</button>}
    </div>
  );
}

async function bootstrap() {
  const [contactModule, accountModule, opportunityModule, searchModule, actionReviewModule] = await Promise.all([
    import('../../src/content/contact-details.jsx'),
    import('../../src/content/account-details.jsx'),
    import('../../src/content/opportunity-details.jsx'),
    import('../../src/content/crm-search-page.jsx'),
    import('../../src/content/crm-action-review-page.jsx'),
  ]);
  ContactDetailsApp = contactModule.ContactDetailsApp;
  AccountDetailsApp = accountModule.AccountDetailsApp;
  OpportunityDetailsApp = opportunityModule.OpportunityDetailsApp;
  CrmSearchPageApp = searchModule.CrmSearchPageApp;
  ActionReviewApp = actionReviewModule.ActionReviewApp;
  createRoot(document.getElementById('root')).render(<Lab />);
}

bootstrap().catch((error) => {
  document.getElementById('root').textContent = `Custom Pages Lab failed to load: ${error.message}`;
});
