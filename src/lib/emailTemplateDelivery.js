/* One canonical delivery boundary for template emails. Follow-ups run only
   after the transport reports a confirmed PA send or a successful Outlook
   handoff. Their failure is reported separately and never rewrites a sent
   email into a failed email. */

import { sendEmail, readEmailConfig } from './emailSender.js';
import { pickFromAddress } from './sender.js';
import { runEmailTemplateFollowUps } from './emailTemplateFollowUps.js';

export function emailDeliverySucceeded(result) {
  return result?.state === 'sent' || result?.state === 'opened';
}

export async function sendEmailTemplateWithFollowUps(input = {}, deps = {}) {
  const send = deps.send || sendEmail;
  let delivery;
  try {
    delivery = await send(input.email || {});
  } catch (error) {
    delivery = {
      state: 'failed',
      transport: 'none',
      error: String(error?.message || error || 'Email send failed'),
    };
  }

  if (!emailDeliverySucceeded(delivery)) {
    return { ...delivery, followUps: null };
  }

  let followUps;
  try {
    followUps = await (deps.runFollowUps || runEmailTemplateFollowUps)({
      ...(input.followUpContext || {}),
      template: input.template || {},
    });
  } catch (error) {
    followUps = {
      ok: false,
      task: null,
      action: null,
      errors: [String(error?.message || error || 'Follow-up automation failed')],
    };
  }
  return { ...delivery, followUps };
}

/** Content-page bridge used by the toolbar popup. It shares the exact sender,
 * transport classification, and follow-up pipeline used by bulk email. */
export async function sendEmailTemplateFromPage(input = {}, deps = {}) {
  const readConfig = deps.readConfig || readEmailConfig;
  const config = await readConfig();
  const template = input.template || {};
  const pickSender = deps.pickSender || pickFromAddress;
  const from = pickSender(template, config?.localPart);
  const dispatch = deps.dispatch;

  return sendEmailTemplateWithFollowUps({
    email: {
      from,
      to: input.to || '',
      subject: input.subject || '',
      htmlBody: input.htmlBody || '',
      replyMode: input.replyMode || template.replyMode || 'standalone',
      signature: config?.signature || '',
      config,
      templateId: template.id || '',
      templateName: template.name || '',
      variationId: input.variationId || '__original',
      trackingContext: input.context || {},
      usageSource: input.usageSource || 'other',
    },
    template,
    followUpContext: {
      context: input.context || {},
      document: input.document,
    },
  }, {
    send: deps.send || ((message) => sendEmail(message, dispatch ? { dispatch } : undefined)),
    runFollowUps: deps.runFollowUps,
  });
}
