import { readEmailConfig, sendEmail } from './emailSender.js';
import { pickFromAddress } from './sender.js';

/** Send a standalone contact email through the extension's canonical transport. */
export async function sendContactEmail(draft, deps = {}) {
  const readConfig = deps.readConfig || readEmailConfig;
  const deliver = deps.deliver || sendEmail;
  const pickSender = deps.pickSender || pickFromAddress;
  const to = String(draft?.to || '').trim();
  const subject = String(draft?.subject || '').trim();
  if (!to) return { state: 'failed', transport: 'none', error: 'No recipient email' };
  if (!subject) return { state: 'failed', transport: 'none', error: 'Enter an email subject' };

  const config = draft?.config || await readConfig();
  return deliver({
    from: pickSender(null, config.localPart),
    to,
    subject,
    htmlBody: draft?.htmlBody || '',
    replyMode: 'standalone',
    signature: config.signature,
    config,
  });
}
