/* ───────────────────────────────────────────────────────────────
   crmOpportunities — canonical Opportunity/Get → merge → write path.

   Opportunity/Update replaces a full editable record, so partial writes are
   unsafe. Every update here first GETs the latest opportunity, overlays only
   the action-engine allowlist, and sends the complete native payload. The
   same adapter hydrates page.opportunities before code inspects or edits it.
─────────────────────────────────────────────────────────────── */

import { API } from './constants.js';
import {
  mapOpportunityEditFields,
  isClosedOpportunityStage,
  normalizeOpportunityRecord,
  normalizeOpportunityStageId,
  toOpportunityDate,
} from './opportunityFields.js';

function crmOrigin() {
  try {
    if (/(^|\.)golfballs\.com$/i.test(globalThis.location?.hostname || '')) {
      return globalThis.location.origin;
    }
  } catch { /* use canonical API host */ }
  return API.CRM;
}

function unwrap(value) {
  let current = value;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current === 'string') {
      try { current = JSON.parse(current); } catch { return current; }
      continue;
    }
    if (current && typeof current === 'object' && Object.hasOwn(current, 'd')) {
      current = current.d;
      continue;
    }
    break;
  }
  return current;
}

async function responseValue(response, fallbackMessage) {
  if (!response || response.ok === false) {
    throw new Error(`${fallbackMessage}${response?.status ? ` (HTTP ${response.status})` : ''}`);
  }
  const text = typeof response.text === 'function' ? await response.text() : '';
  if (!text) return {};
  try { return unwrap(JSON.parse(text)); } catch { return unwrap(text); }
}

function endpoint(action, query, origin = crmOrigin()) {
  return `${origin}/golfballs/crm/Admin/Opportunity/${action}.ajax?${encodeURIComponent(String(query))}`;
}

function finiteMoney(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

/** Build the exact native Create/Update payload from a current record + edits. */
export function buildOpportunityPayload(current = {}, fields = {}, context = {}) {
  const source = current && typeof current === 'object' ? current : {};
  const edits = mapOpportunityEditFields(fields);
  const currentStage = source.OpportunityStageId ?? source.opportunityStageId ?? source.stageId ?? source.stage;
  const currentCloseDate = source.EstimatedClosedDate ?? source.EstimatedCloseDate ?? source.estimatedCloseDate ?? '';
  const currentAssigned = source.empAssignedId ?? source.EmpAssignedId ?? source.assignedToId ?? '0';
  const currentContact = source.contactId ?? source.ContactID ?? context.contactId ?? 0;
  const currentValue = source.EstimatedValue ?? source.estimatedValue ?? 0;

  return {
    opportunityId: String(source.opportunityId ?? source.OpportunityID ?? source.id ?? context.opportunityId ?? ''),
    Subject: edits.subject ?? String(source.Subject ?? source.subject ?? ''),
    Description: edits.description ?? String(source.Description ?? source.description ?? ''),
    EstimatedClosedDate: edits.estimatedCloseDate
      ?? toOpportunityDate(currentCloseDate),
    EstimatedValue: edits.estimatedValue ?? finiteMoney(currentValue),
    OpportunityStageId: edits.stageId
      || normalizeOpportunityStageId(currentStage, '1'),
    empAssignedId: edits.assignedToId
      ?? String(currentAssigned || '0'),
    contactId: Number(currentContact) || 0,
    LeadID: source.LeadID ?? source.leadId ?? null,
  };
}

export async function getOpportunityById(id, options = {}) {
  const opportunityId = String(id ?? '').trim();
  if (!opportunityId) throw new Error('opportunity id is required');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('opportunity reading is unavailable');
  const response = await fetchImpl(endpoint('Get', opportunityId, options.origin), {
    credentials: 'include',
  });
  const value = await responseValue(response, `Could not get opportunity ${opportunityId}`);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Opportunity ${opportunityId} returned an invalid record`);
  }
  return value;
}

export async function updateOpportunityById(id, fields = {}, options = {}) {
  const opportunityId = String(id ?? '').trim();
  if (!opportunityId) throw new Error('opportunity id is required');
  const get = options.getOpportunity || ((value) => getOpportunityById(value, options));
  const current = await get(opportunityId);
  const payload = buildOpportunityPayload(
    { ...current, opportunityId },
    fields,
    { contactId: options.contactId, opportunityId },
  );
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('opportunity editing is unavailable');
  const response = await fetchImpl(endpoint('Update', JSON.stringify(payload), options.origin), {
    credentials: 'include',
  });
  const result = await responseValue(response, `Could not update opportunity ${opportunityId}`);
  return { ok: true, opportunityId, payload, response: result };
}

export async function createOpportunity(fields = {}, options = {}) {
  const contactId = Number(fields.contactId ?? options.contactId) || 0;
  if (!contactId) throw new Error('no valid contact id — open a contact/account page or pass createOpportunity({ contactId })');
  const payload = buildOpportunityPayload({}, fields, { contactId });
  payload.opportunityId = '';
  payload.contactId = contactId;
  if (!payload.Subject.trim()) throw new Error('createOpportunity needs a subject');

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('opportunity creation is unavailable');
  const response = await fetchImpl(endpoint('Create', JSON.stringify(payload), options.origin), {
    credentials: 'include',
  });
  const result = await responseValue(response, 'Could not create opportunity');
  const responseId = result && typeof result === 'object'
    ? (result.opportunityId ?? result.OpportunityID ?? result.id)
    : result;
  return {
    ok: true,
    opportunityId: responseId == null ? '' : String(responseId),
    payload,
    response: result,
  };
}

/** First active opportunity in the CRM table's order. A closed boolean rejects
 * immediately; stage remains the defensive check for compact or stale rows. */
export function findOpenOpportunity(opportunities = []) {
  return (Array.isArray(opportunities) ? opportunities : []).find((opportunity) => {
    const id = String(opportunity?.id ?? opportunity?.opportunityId ?? '').trim();
    if (!id || opportunity?.isClosed === true) return false;
    return !isClosedOpportunityStage(opportunity?.stageId ?? opportunity?.stage);
  }) || null;
}

/** Reuse an existing open opportunity or create one for the current contact. */
export async function ensureOpenOpportunity(fields = {}, options = {}) {
  const existing = findOpenOpportunity(options.opportunities);
  if (existing) {
    const opportunityId = String(existing.id ?? existing.opportunityId).trim();
    return {
      ok: true,
      created: false,
      opportunityId,
      subject: String(existing.subject || ''),
      opportunity: existing,
    };
  }
  const create = options.createOpportunity || ((input, createOptions) => createOpportunity(input, createOptions));
  const created = await create(fields, options);
  const opportunityId = String(created?.opportunityId || '').trim();
  if (!opportunityId) throw new Error('The CRM did not return an id for the created opportunity');
  return {
    ...created,
    ok: true,
    created: true,
    opportunityId,
    subject: String(fields.subject || ''),
  };
}

/** Run a bounded fan-out while preserving table order. */
async function mapLimit(items, limit, fn) {
  const source = Array.isArray(items) ? items : [];
  const output = new Array(source.length);
  let next = 0;
  const worker = async () => {
    while (next < source.length) {
      const index = next;
      next += 1;
      output[index] = await fn(source[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), source.length) }, worker));
  return output;
}

/** Fetch every table opportunity and expose the full normalized record. */
export async function hydrateOpportunityRows(rows = [], options = {}) {
  const get = options.getOpportunity || ((id) => getOpportunityById(id, options));
  return mapLimit(rows, Number(options.concurrency) || 4, async (row) => {
    const id = String(row?.id ?? row?.opportunityId ?? '').trim();
    if (!id) throw new Error('An opportunity row has no id');
    const full = await get(id);
    return normalizeOpportunityRecord(full, row);
  });
}

/** Avoid an Opportunity/Get fan-out for scripts that never inspect rows. */
export function sourceUsesOpportunityRecords(source) {
  const text = String(source || '');
  return /\bpage\s*(?:\.\s*opportunities\b|\[\s*['"]opportunities['"]\s*\])/m.test(text)
    || /\bactions\s*\.\s*ensureOpenOpportunity\s*\(/m.test(text);
}
