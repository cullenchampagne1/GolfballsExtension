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
     Nobody's request announces an order: a customer buys something. So this is
     the poll kind — a list sweep on a schedule, whose rows the extension has
     no other way to learn about. `collect` receives the runtime's fetch helper
     rather than calling fetch itself, so the sweep is testable without a
     network. */

  const recentOrders = {
    id: 'recent-orders',
    label: 'Recent orders',
    kind: 'poll',
    recordKind: 'order',
    identify: (raw) => raw.externalId,
    poll: {
      everyMinutes: 15,
      collect: async ({ fetchJson, since, now }) => {
        const sinceDay = new Date(since || (now - 7 * 86_400_000))
          .toISOString().slice(0, 10);
        const payload = await fetchJson(
          `${CRM_ADMIN}/Order/Recent.ajax?${encodeURIComponent(JSON.stringify({ since: sinceDay }))}`,
        );
        const body = payloadObject(payload);
        const rows = Array.isArray(body) ? body : (body && Array.isArray(body.orders) ? body.orders : []);
        return rows.map((row) => {
          const externalId = String(pick(row, ['orderId', 'OrderID', 'orderID', 'id']) ?? '').trim();
          if (!externalId) return null;
          return {
            externalId,
            at: Date.parse(String(pick(row, ['orderDate', 'OrderDate']) ?? '')) || now,
            title: String(pick(row, ['customerName', 'CustomerName', 'accountName']) ?? `Order ${externalId}`),
            status: String(pick(row, ['status', 'Status', 'orderStatus']) ?? 'open').toLowerCase(),
            value: Number(pick(row, ['total', 'Total', 'orderTotal']) ?? 0) || null,
            data: {
              contactId: String(pick(row, ['customerID', 'customerId']) ?? ''),
              salesRep: String(pick(row, ['salesRep', 'SalesRep']) ?? ''),
            },
          };
        }).filter(Boolean);
      },
    },
    refresh: {
      // An order's status moves through production for days after it lands, so
      // it is worth re-asking about — less often than an opportunity, and only
      // until it reaches a terminal state.
      everyMinutes: 240,
      batchSize: 8,
      maxAgeDays: 90,
      request: (record) => ({
        url: `${CRM_ADMIN}/Order/Get.ajax?${encodeURIComponent(record.externalId)}`,
        method: 'GET',
      }),
      apply: (record, response) => {
        const body = payloadObject(response);
        if (!body) return null;
        return {
          status: String(pick(body, ['status', 'Status', 'orderStatus']) ?? record.status).toLowerCase(),
          value: Number(pick(body, ['total', 'Total']) ?? 0) || record.value,
          data: { shipDate: String(pick(body, ['shipDate', 'ShipDate']) ?? '') },
        };
      },
      settled: (record) => ['shipped', 'cancelled', 'canceled', 'complete', 'completed']
        .includes(String(record.status || '').toLowerCase()),
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
  });
})(globalThis);
