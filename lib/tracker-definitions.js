/** Trackers — the shipped definitions.
 *
 * Everything here is DATA for lib/tracker-registry.js: what to watch, how to
 * read one record out of a CRM response, and when a record stops being worth
 * re-asking about. The registry, the store, and the scheduler know nothing
 * about opportunities or orders, so a fourth tracker is a fourth object in
 * this file and no change anywhere else.
 *
 * The CRM's own convention is `<origin>/golfballs/crm/Admin/<Entity>/<Action>.ajax?<query>`
 * with cookie auth (see src/lib/crm-detail-shared.jsx), which is what both the
 * capture regexes and the refresh requests below are written against.
 */
(function installTrackerDefinitions(root) {
  'use strict';

  const registry = root.GBTrackerRegistry;
  if (!registry) throw new Error('tracker definitions require GBTrackerRegistry');
  if (root.GBTrackerDefinitions) return;

  const CRM_ORIGIN = 'https://api.golfballs.com';
  const CRM_ADMIN = `${CRM_ORIGIN}/golfballs/crm/Admin`;

  /* The CRM answers .ajax endpoints with JSON in assorted envelopes ({d:"…"},
     a bare object, or a JSON string). Extractors should read fields, not
     unwrap transports, so that happens once here. */
  function payloadObject(value) {
    let current = value;
    // `{"d":"{\"d\":…}"}` is real: ASMX wraps, and some handlers wrap again.
    // Four unwraps covers every envelope the CRM has been seen to send.
    for (let depth = 0; depth < 4; depth += 1) {
      if (current == null) return null;
      if (typeof current === 'string') {
        try { current = JSON.parse(current); } catch { return null; }
        continue;
      }
      if (typeof current !== 'object') return null;
      if (typeof current.d === 'string' || (current.d && typeof current.d === 'object')) {
        current = current.d;
        continue;
      }
      return Array.isArray(current) ? (current[0] || null) : current;
    }
    return current && typeof current === 'object' && !Array.isArray(current)
      ? current
      : null;
  }

  /** First present key from a list of CRM spellings (they vary by endpoint). */
  function pick(source, keys) {
    if (!source || typeof source !== 'object') return undefined;
    for (const key of keys) {
      if (source[key] != null && source[key] !== '') return source[key];
    }
    return undefined;
  }

  /** A CRM request's query string is often the payload itself, JSON or scalar. */
  function queryPayload(url) {
    const raw = String(url || '').split('?').slice(1).join('?');
    if (!raw) return null;
    let decoded = raw;
    try { decoded = decodeURIComponent(raw); } catch { /* already plain */ }
    try { return JSON.parse(decoded); } catch { return { value: decoded }; }
  }

  /* ── opportunities ────────────────────────────────────────────────
     The rep creates these by hand, so the CRM's own Create/Update call is the
     capture. Their whole value is what happens NEXT — an opportunity we opened
     is closed by someone else, or quietly ages — which is exactly what no
     request of ours will ever mention. Hence the hourly per-record refresh and
     a `settled` rule that stops asking once the stage is terminal. */

  const CLOSED_STAGES = new Set(['4', '5', 'closed won', 'closed lost', 'won', 'lost']);

  const isClosedStage = (stage) => CLOSED_STAGES.has(
    String(stage == null ? '' : stage).trim().toLowerCase(),
  );

  function opportunityRecord(payload, response, at) {
    const body = payloadObject(response) || {};
    const sent = payload || {};
    const externalId = String(
      pick(body, ['opportunityId', 'OpportunityID', 'opportunityID', 'id', 'ID'])
      ?? pick(sent, ['opportunityId', 'OpportunityID', 'opportunityID'])
      ?? '',
    ).trim();
    if (!externalId) return null;
    const stage = pick(body, ['OpportunityStageId', 'opportunityStageId', 'StageId'])
      ?? pick(sent, ['OpportunityStageId', 'opportunityStageId']);
    return {
      externalId,
      at,
      title: pick(body, ['Subject', 'subject']) ?? pick(sent, ['Subject', 'subject']) ?? '',
      status: isClosedStage(stage) ? 'closed' : 'open',
      value: Number(
        pick(body, ['EstimatedValue', 'estimatedValue'])
        ?? pick(sent, ['EstimatedValue', 'estimatedValue'])
        ?? 0,
      ) || null,
      data: {
        stage: stage == null ? '' : String(stage),
        contactId: String(pick(body, ['contactId', 'ContactID']) ?? pick(sent, ['contactId']) ?? ''),
        estimatedClose: String(
          pick(body, ['EstimatedClosedDate', 'estimatedClosedDate'])
          ?? pick(sent, ['EstimatedClosedDate']) ?? '',
        ),
        assignedTo: String(pick(body, ['empAssignedId']) ?? pick(sent, ['empAssignedId']) ?? ''),
      },
    };
  }

  const opportunities = {
    id: 'opportunities',
    label: 'Opportunities',
    kind: 'intercept',
    recordKind: 'opportunity',
    identify: (raw) => raw.externalId,
    captures: [
      {
        id: 'created',
        match: /\/crm\/Admin\/Opportunity\/Create\.ajax/i,
        extract: ({ url, responseBody, at }) => (
          opportunityRecord(queryPayload(url), responseBody, at)
        ),
      },
      {
        // An update is not a new opportunity, but it is the freshest word on
        // one we already track — and it is how a stage change reaches us
        // without waiting for the refresh clock.
        id: 'updated',
        match: /\/crm\/Admin\/Opportunity\/Update\.ajax/i,
        extract: ({ url, responseBody, at }) => (
          opportunityRecord(queryPayload(url), responseBody, at)
        ),
      },
    ],
    refresh: {
      everyMinutes: 60,
      batchSize: 10,
      request: (record) => ({
        url: `${CRM_ADMIN}/Opportunity/Get.ajax?${encodeURIComponent(record.externalId)}`,
        method: 'GET',
      }),
      apply: (record, response) => {
        const body = payloadObject(response);
        if (!body) return null;
        const stage = pick(body, ['OpportunityStageId', 'opportunityStageId', 'StageId']);
        return {
          title: pick(body, ['Subject', 'subject']) || record.title,
          status: isClosedStage(stage) ? 'closed' : 'open',
          value: Number(pick(body, ['EstimatedValue', 'estimatedValue']) ?? 0) || record.value,
          data: {
            stage: stage == null ? '' : String(stage),
            estimatedClose: String(pick(body, ['EstimatedClosedDate']) ?? ''),
          },
        };
      },
      // Closed is closed: no later answer can differ, so the row stays in the
      // table and stops costing a request.
      settled: (record) => record.status === 'closed',
    },
    retention: { maxRecords: 500, maxAgeDays: 180 },
  };

  /* ── proposals ────────────────────────────────────────────────────
     Captured from the website's own save call and the CRM's proposal-email
     endpoints (the same requests src/vanilla/proposal-net-hook.js already
     proved are visible from the page's main world). A proposal is a document,
     not a lifecycle, so it has no refresh clock — nothing about it changes
     behind our back. */

  const proposals = {
    id: 'proposals',
    label: 'Proposals',
    kind: 'intercept',
    recordKind: 'proposal',
    identify: (raw) => raw.externalId,
    captures: [
      {
        id: 'saved',
        match: /\/user\/saveProposal\b/i,
        extract: ({ requestBody, responseBody, at }) => {
          const sent = payloadObject(requestBody) || {};
          const body = payloadObject(responseBody) || {};
          const externalId = String(
            pick(body, ['cartId', 'CartID', 'cartID', 'id'])
            ?? pick(sent, ['cartId', 'CartID', 'cartID']) ?? '',
          ).trim();
          if (!externalId) return null;
          return {
            externalId,
            at,
            title: String(pick(sent, ['name', 'proposalName', 'Name']) ?? '') || `Proposal ${externalId}`,
            status: 'saved',
            value: Number(pick(body, ['total', 'Total']) ?? pick(sent, ['total']) ?? 0) || null,
            data: {
              opportunityId: String(pick(sent, ['opportunityID', 'opportunityId']) ?? ''),
              expiration: String(pick(sent, ['expiration', 'Expiration']) ?? ''),
            },
          };
        },
      },
      {
        id: 'emailed',
        match: /CreateProposalEmail|TrackProposal/i,
        extract: ({ url, requestBody, at }) => {
          const sent = payloadObject(requestBody) || queryPayload(url) || {};
          const externalId = String(pick(sent, ['cartId', 'CartID', 'cartID', 'proposalId']) ?? '').trim();
          if (!externalId) return null;
          return {
            externalId,
            at,
            status: 'emailed',
            data: { opportunityId: String(pick(sent, ['opportunityID', 'opportunityId']) ?? '') },
          };
        },
      },
    ],
    retention: { maxRecords: 500, maxAgeDays: 180 },
  };

  /* ── recent orders ────────────────────────────────────────────────
     Nobody's request announces an order — a customer buys something — and the
     CRM has no "orders since X" endpoint to ask either. What it has is the CRM
     Search index, where a contact's `lastOrderDate_dt` moves when that contact
     orders. So the sweep is the SAME search the "Scan for recent orders" quick
     action runs (src/lib/recentOrdersScan.js): the signed-in rep's contacts
     whose last order landed after the previous sweep. Each contact that comes
     back carries the order we extract.

     WHERE IT RUNS. Not here. The index is cookie-authenticated and the worker's
     own fetch is cross-site, so it carries no CRM session (the same reason
     lib/crm-index-store.js resolves contacts locally); the signed-in employee
     id the audience is keyed by is likewise only readable on a CRM page (the
     rep clause is `salesRepID_s`, never the name — see
     src/lib/recentOrdersScan.js). So `collect` is handed
     `crmContacts` by the runtime — a search performed by an open CRM tab — and
     the sweep waits for such a tab instead of guessing an audience.

     WHAT AN ORDER IS HERE. The index knows a contact's last order DATE and
     their lifetime order count; it carries no order id, total, or status. So a
     record is "this contact ordered on this day", keyed by contact + day: the
     same contact re-listed by a later sweep is the same row until they order
     again, and nothing is fabricated to fill a column. That is also why there
     is no refresh clock — the row is final when written, and the next order
     arrives as a new row from the next sweep. */

  const CONTACT_ID_RE = /^contact_(.+)$/i;

  /** The CRM contact id behind a search row (`contact_12345`). */
  function contactIdFromDoc(doc) {
    const id = String(pick(doc, ['id']) ?? '').trim();
    const match = id.match(CONTACT_ID_RE);
    return String(match ? match[1] : (pick(doc, ['importContactID_s', 'customerID_s']) ?? '')).trim();
  }

  /**
   * One CRM Search contact row → the order it tells us that contact placed, or
   * the reason it told us nothing.
   *
   * The reason is not decoration. "The search returned forty contacts and the
   * tracker stored none" has exactly four possible explanations, and they are
   * these; without them the only visible symptom is an empty table.
   */
  function readContactDoc(doc, { now = Date.now() } = {}) {
    if (!doc || typeof doc !== 'object') return { skip: 'not-a-row' };
    // Accounts share the index and carry the same date field, but an account's
    // last order is one of its contacts' orders — counting both double-counts.
    if (String(pick(doc, ['recordType_s']) ?? '').toLowerCase() !== 'contact') {
      return { skip: 'not-a-contact' };
    }
    const contactId = contactIdFromDoc(doc);
    if (!contactId) return { skip: 'no-contact-id' };
    const orderedAt = Date.parse(String(pick(doc, ['lastOrderDate_dt']) ?? ''));
    if (!Number.isFinite(orderedAt)) return { skip: 'no-last-order-date' };
    const orderDate = new Date(orderedAt).toISOString().slice(0, 10);
    const contactName = String(pick(doc, ['contactName_t']) ?? '');
    const accountName = String(pick(doc, ['accountName_t']) ?? '');
    return { row: {
      externalId: `${contactId}@${orderDate}`,
      at: orderedAt,
      title: [contactName, accountName].filter(Boolean).join(' · ') || `Contact ${contactId}`,
      // The index says an order happened, never where it got to. Inventing
      // 'open' would make the dashboard claim a lifecycle we cannot see.
      status: 'ordered',
      // Nor does it carry this order's total — only lifetime revenue, which is
      // a different number. A guessed figure on a sales dashboard is worse
      // than an empty one.
      value: null,
      data: {
        contactId,
        contactName,
        accountId: String(pick(doc, ['accountID_s']) ?? ''),
        accountName,
        salesRep: String(pick(doc, ['salesRep_s']) ?? ''),
        orderDate,
        orderCount: Number(pick(doc, ['orderCount_i']) ?? 0) || null,
      },
    } };
  }

  /** The same read, for callers that only want the order or nothing. */
  function orderFromContactDoc(doc, options) {
    return readContactDoc(doc, options).row || null;
  }

  const recentOrders = {
    id: 'recent-orders',
    label: 'Recent orders',
    kind: 'poll',
    recordKind: 'order',
    identify: (raw) => raw.externalId,
    poll: {
      everyMinutes: 15,
      /**
       * Answers with the rows AND what it saw, because the runtime's cursor
       * rule turns on the difference: a window that came back empty may be
       * stepped over, one whose rows we failed to read may not.
       */
      collect: async ({ crmContacts, since, now, log = () => {} }) => {
        if (typeof crmContacts !== 'function') {
          throw new Error('recent orders need a CRM page to search from');
        }
        const answer = await crmContacts({ since, now });
        // An older runtime hands back the bare docs; a current one hands back
        // what the page read, which is the shape the cursor rule needs.
        const docs = Array.isArray(answer) ? answer : (answer?.docs || []);
        const rows = [];
        const skipped = new Map();
        for (const doc of docs) {
          const read = readContactDoc(doc, { now });
          if (read.row) { rows.push(read.row); continue; }
          skipped.set(read.skip, (skipped.get(read.skip) || 0) + 1);
          log(`recent-orders: skipped ${String(pick(doc, ['id']) ?? '?')} — ${read.skip}`);
        }
        if (skipped.size) {
          log('recent-orders: skipped rows by reason —', JSON.stringify(Object.fromEntries(skipped)));
        }
        return {
          rows,
          seen: docs.length,
          numFound: Array.isArray(answer) ? docs.length : answer?.numFound,
          complete: Array.isArray(answer) ? true : answer?.complete !== false,
        };
      },
    },
    retention: { maxRecords: 300, maxAgeDays: 90 },
  };

  const DEFINITIONS = [opportunities, proposals, recentOrders];
  for (const definition of DEFINITIONS) registry.define(definition);

  root.GBTrackerDefinitions = Object.freeze({
    CRM_ORIGIN,
    CRM_ADMIN,
    DEFINITIONS: Object.freeze(DEFINITIONS.map((d) => d.id)),
    payloadObject,
    queryPayload,
    isClosedStage,
    // Exposed so the CRM page that performs the search and the tests that
    // exercise it read a contact row exactly as the sweep does — including
    // WHY a row was passed over, which is what a debugging session needs.
    contactIdFromDoc,
    orderFromContactDoc,
    readContactDoc,
  });
})(globalThis);
