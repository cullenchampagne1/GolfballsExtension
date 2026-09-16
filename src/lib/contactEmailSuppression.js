const DIRECT_DNC = /\b(?:do\s*not|don['’]?t)\s+(?:contact|email)\b|\bdnc\b/i;

const CONTEXT_REASONS = Object.freeze([
  ['Undeliverable', /\b(?:undeliverable|undelivered|invalid\s+email|email\s+bounc(?:e|ed)|bounced\s+email)\b/i],
  ['Inactive', /\binactive\b/i],
  ['Retired', /\bretired\b/i],
  ['Out of business', /\bout[-\s]+of[-\s]+business\b|\bpermanently\s+closed\b/i],
  ['Do not contact', DIRECT_DNC],
  ['No longer employed', /\b(?:no\s+longer|not)\s+(?:with|employed\s+(?:at|by))\b/i],
]);

/** Return the bounded CRM status that makes a contact unsafe to email. */
export function contactEmailSuppressionReason({ name = '', email = '', context = '' } = {}) {
  if (DIRECT_DNC.test(String(name)) || DIRECT_DNC.test(String(email))) return 'Do not contact';
  const notes = String(context || '');
  for (const [reason, pattern] of CONTEXT_REASONS) {
    if (pattern.test(notes)) return reason;
  }
  return null;
}

export function shouldSuppressContactEmail(contact) {
  return contactEmailSuppressionReason(contact) !== null;
}
