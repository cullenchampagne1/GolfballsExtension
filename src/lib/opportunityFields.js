/* ───────────────────────────────────────────────────────────────
   opportunityFields — pure opportunity shape, aliases, and coercion.

   The CRM wire format uses PascalCase names and numeric stage ids. Action
   code uses a stable camelCase record instead. This module is the one source
   of truth shared by contract validation, sandbox proxies, and the real CRM
   read/merge/write adapter.
─────────────────────────────────────────────────────────────── */

export const OPPORTUNITY_STAGES = Object.freeze([
  Object.freeze({ id: '1', label: 'Open' }),
  Object.freeze({ id: '2', label: 'Proposed' }),
  Object.freeze({ id: '3', label: 'Ordered' }),
  Object.freeze({ id: '4', label: 'Closed - Won' }),
  Object.freeze({ id: '5', label: 'Closed - Lost' }),
  Object.freeze({ id: '6', label: 'Automation' }),
  Object.freeze({ id: '7', label: 'Prospect' }),
  Object.freeze({ id: '8', label: 'Qualified' }),
]);

const byId = new Map(OPPORTUNITY_STAGES.map((stage) => [stage.id, stage]));
const stageKey = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');
const byLabel = new Map(OPPORTUNITY_STAGES.map((stage) => [stageKey(stage.label), stage]));

/** User-facing opportunity field aliases → canonical action field names. */
export const APPROVED_OPPORTUNITY_FIELDS = Object.freeze({
  subject: 'subject',
  description: 'description',
  estimatedValue: 'estimatedValue',
  estimated_value: 'estimatedValue',
  estimatedCloseDate: 'estimatedCloseDate',
  estimated_close_date: 'estimatedCloseDate',
  closeDate: 'estimatedCloseDate',
  close_date: 'estimatedCloseDate',
  stage: 'stageId',
  stageId: 'stageId',
  stage_id: 'stageId',
  assignedToId: 'assignedToId',
  assigned_to_id: 'assignedToId',
  ownerId: 'assignedToId',
  owner_id: 'assignedToId',
});

export function normalizeOpportunityStageId(value, fallback = '') {
  const raw = String(value ?? '').trim();
  if (byId.has(raw)) return raw;
  return byLabel.get(stageKey(raw))?.id || String(fallback ?? '').trim();
}

export function opportunityStageLabel(value, fallback = '') {
  const id = normalizeOpportunityStageId(value);
  return byId.get(id)?.label || String(fallback || value || '').trim();
}

export function isClosedOpportunityStage(value) {
  const id = normalizeOpportunityStageId(value);
  return id === '4' || id === '5';
}

/** ISO/MM-DD/MM/DD input → the CRM's MM-DD-YYYY opportunity date. */
export function toOpportunityDate(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return [
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0'),
      value.getFullYear(),
    ].join('-');
  }
  const text = String(value ?? '').trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(text);
  if (match) return `${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}-${match[1]}`;
  match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (match) return `${String(match[1]).padStart(2, '0')}-${String(match[2]).padStart(2, '0')}-${match[3]}`;
  return text;
}

/** Approved action fields → canonical fields, dropping everything else. */
export function mapOpportunityEditFields(fields = {}) {
  const out = {};
  for (const [key, raw] of Object.entries(fields || {})) {
    const canonical = APPROVED_OPPORTUNITY_FIELDS[key];
    if (!canonical) continue;
    let value = raw;
    if (canonical === 'stageId') value = normalizeOpportunityStageId(raw);
    else if (canonical === 'estimatedCloseDate') value = toOpportunityDate(raw);
    else if (canonical === 'estimatedValue') value = Number(raw);
    else if (canonical === 'assignedToId') value = String(raw ?? '').trim();
    else value = String(raw ?? '');
    out[canonical] = value;
  }
  return out;
}

function first(source, names, fallback = '') {
  for (const name of names) {
    if (source?.[name] != null && source[name] !== '') return source[name];
  }
  return fallback;
}

/** Full Opportunity/Get response + table-row fallback → action page record. */
export function normalizeOpportunityRecord(raw = {}, fallback = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const row = fallback && typeof fallback === 'object' ? fallback : {};
  const id = String(first(source, ['opportunityId', 'OpportunityID', 'id'], first(row, ['id', 'opportunityId'])) || '').trim();
  const stageInput = first(source, ['OpportunityStageId', 'opportunityStageId', 'StageId'], first(row, ['stageId', 'stage']));
  const stageId = normalizeOpportunityStageId(stageInput);
  const stage = opportunityStageLabel(stageId, first(row, ['stage']));
  const estimatedValue = Number(first(source, ['EstimatedValue', 'estimatedValue'], first(row, ['estimatedValue'], 0)));
  const actualValue = Number(first(source, ['ActualValue', 'actualValue'], first(row, ['actualValue'], 0)));
  const closedProbabilityRaw = first(source, ['ClosedProbability', 'closedProbability'], first(row, ['closedProbability'], ''));
  const closedProbability = closedProbabilityRaw === '' ? null : Number(closedProbabilityRaw);

  return {
    ...row,
    id,
    opportunityId: id,
    subject: String(first(source, ['Subject', 'subject'], first(row, ['subject'])) || ''),
    description: String(first(source, ['Description', 'description'], first(row, ['description'])) || ''),
    estimatedValue: Number.isFinite(estimatedValue) ? estimatedValue : 0,
    estimatedCloseDate: String(first(source, ['EstimatedClosedDate', 'EstimatedCloseDate', 'estimatedClosedDate'], first(row, ['estimatedCloseDate'])) || ''),
    stageId,
    stage,
    assignedToId: String(first(source, ['empAssignedId', 'EmpAssignedId'], first(row, ['assignedToId'])) || '0'),
    contactId: String(first(source, ['contactId', 'ContactID'], first(row, ['contactId'])) || ''),
    leadId: first(source, ['LeadID', 'leadId'], first(row, ['leadId'], null)),
    sourceId: String(first(source, ['sourceID', 'SourceID'], first(row, ['sourceId'])) || ''),
    createdById: String(first(source, ['empCreatedId', 'EmpCreatedId'], first(row, ['createdById'])) || ''),
    closedProbability: Number.isFinite(closedProbability) ? closedProbability : null,
    actualValue: Number.isFinite(actualValue) ? actualValue : 0,
    actualClosedDate: String(first(source, ['ActualCloseDate', 'actualClosedDate'], first(row, ['actualClosedDate'])) || ''),
    isClosed: isClosedOpportunityStage(stageId),
    isWon: stageId === '4',
    isLost: stageId === '5',
  };
}
