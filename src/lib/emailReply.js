/* Pure reply-routing helpers shared by the Email Preview host and tests. */

import { pickFromAddress } from './sender.js';
import { sendEmail } from './emailSender.js';

const OUR_DOMAINS = /(?:^|@)(?:[^@.]+\.)*(golfballs\.com|loyaltylogo\.com|gbcadmin)(?:$|\b)/i;

export function bareEmail(value) {
  const text = String(value || '').trim();
  const bracketed = text.match(/<([^>]+)>/);
  const candidate = (bracketed ? bracketed[1] : text).trim();
  const direct = candidate.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return direct ? direct[0] : '';
}

function addresses(email, meta) {
  return [email?.from, email?.to, meta?.from, meta?.to].map(bareEmail).filter(Boolean);
}

export function replyRecipient(email, meta) {
  const list = addresses(email, meta);
  return list.find((address) => !OUR_DOMAINS.test(address)) || '';
}

export function replySenderAccount(email, meta) {
  const internal = addresses(email, meta).find((address) => OUR_DOMAINS.test(address)) || '';
  return /@(?:[^@.]+\.)*loyaltylogo\.com$/i.test(internal) ? 'loyaltylogo' : 'golfballs';
}

export function replySubject(value) {
  const base = String(value || '').replace(/^\s*(?:RE\s*:\s*)+/i, '').trim();
  return `RE: ${base || '(no subject)'}`;
}

export async function sendThreadReply({ email, meta, to, subject, htmlBody, config }, options = {}) {
  if (!config?.paReady) return { state: 'failed', transport: 'none', error: 'Power Automate is not enabled' };
  const recipient = bareEmail(to) || replyRecipient(email, meta);
  if (!recipient) return { state: 'failed', transport: 'none', error: 'No customer email to reply to' };
  const from = pickFromAddress({ senderAccount: replySenderAccount(email, meta) }, config.localPart);
  return sendEmail({
    from,
    to: recipient,
    subject: replySubject(subject),
    htmlBody,
    replyMode: 'reply',
    signature: config.signature,
    config,
  }, options);
}
