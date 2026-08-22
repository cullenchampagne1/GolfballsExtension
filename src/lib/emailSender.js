import { pickFromAddress, DEFAULT_LOCAL_PART } from './sender.js';
import { loadCredentials } from './credentials.js';
import { sanitizeHtml } from './sanitizeHtml.js';
import { normalizeEmailHtml } from './emailHtml.js';
import {
  filterLocalEmailTemplates,
  resolveEmailTemplateCapabilities,
} from './emailTemplateCapabilities.js';

/* ───────────────────────────────────────────────────────────────
   emailSender.js — one place that builds, classifies, and dispatches
   an outbound email. Collapses the duplicated send logic that lived
   inline in email-preview (reply) and EmailRunner (bulk blast).

   Transport rule (see memory "email-pa-off-fallback"):
     • PA READY (powerAutomateEnabled === true AND a non-empty URL)
         → send through Power Automate: full HTML body + signature +
           replyMode. Dispatches the background `paAutomate` action
           (which owns the CID image inlining + the fetch).
     • PA OFF
         → hand the email to the user's mail client instead: a mailto
           window with formatting STRIPPED to plain text and NO
           signature (mailto can't carry HTML). One window per send —
           so a bulk run opens one Outlook window per contact.

   This module BUILDS + CLASSIFIES + DISPATCHES a background action; it
   never fetches itself (PA plumbing stays in background.js). The toolbar
   popup reaches this module through the ESM bridge installed by
   actions-shelf, so popup and bulk delivery share the same result contract.
─────────────────────────────────────────────────────────────── */

/* Read the four email-related storage keys in one shot → a frozen config.
   Replaces the three scattered `chrome.storage.local.get` reads. */
export function readEmailConfig() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(['emailSignature', 'devSettings', 'featureFlags', 'templates'], (cfg) => {
        loadCredentials()
          .then((credentials) => resolve(freezeConfig(cfg || {}, credentials)))
          .catch(() => resolve(freezeConfig(cfg || {}, {})));
      });
    } catch { resolve(freezeConfig({}, {})); }
  });
}

function freezeConfig(cfg, credentials) {
  const flags = cfg.featureFlags || {};
  const capabilities = resolveEmailTemplateCapabilities(cfg.devSettings);
  const paOn  = flags.powerAutomateEnabled === true;
  const paUrl = (typeof credentials.powerAutomateUrl === 'string' && credentials.powerAutomateUrl.trim().length > 0)
    ? credentials.powerAutomateUrl
    : '';
  return Object.freeze({
    signature: cfg.emailSignature || '',
    localPart: String((cfg.devSettings && cfg.devSettings['email.localPart']) || DEFAULT_LOCAL_PART).trim(),
    templates: filterLocalEmailTemplates(cfg.templates, cfg.devSettings),
    ...capabilities,
    powerAutomateEnabled: paOn,
    paReady: paOn && !!paUrl,
  });
}

/* Canonical signature glue — byte-identical to every legacy send site
   (`body + '<br><div>' + sig + '</div>'`, only when a signature exists). */
export function withSignature(html, signature) {
  return signature ? `${html}<br><div>${signature}</div>` : (html || '');
}

/* HTML → Outlook-friendly plain text for the mailto fallback. Links need
   their destinations written out because mailto bodies cannot carry HTML;
   otherwise a rendered proposal/action link becomes only "View proposal" in
   the compose window. Outlook also expects CRLF line endings, with paragraph
   boundaries represented by one blank line. */
export function htmlToPlainText(html) {
  const source = String(html || '');
  if (!source) return '';

  let text = typeof document === 'undefined' ? source : sanitizeHtml(source);
  if (typeof document !== 'undefined') {
    const template = document.createElement('template');
    template.innerHTML = text;
    for (const anchor of template.content.querySelectorAll('a[href]')) {
      const href = String(anchor.getAttribute('href') || '').trim();
      if (!href) continue;
      const label = String(anchor.textContent || '').replace(/\s+/g, ' ').trim();
      anchor.replaceWith(document.createTextNode(
        label && label !== href ? `${label}: ${href}` : href,
      ));
    }
    text = template.innerHTML;
  }

  return text
    .replace(/\r\n?/g, '\n')
    .replace(/<br\b[^>]*>\s*<\/p>/gi, '</p>')
    .replace(/<br\b[^>]*>/gi, '\n')
    .replace(/<hr\b[^>]*>/gi, '\n\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/(div|address|blockquote|pre|h[1-6]|li|tr|table|ul|ol)>/gi, '\n')
    .replace(/<\/(td|th)>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .replace(/\n/g, '\r\n');
}

export function buildMailtoUrl(to, subject, plainBody) {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(plainBody)}`;
}

/* The canonical Power Automate payload for ONE email. When `signature` is
   provided it's glued onto htmlBody here, so callers pass the rendered body
   raw — keeps the resulting payload identical to the inline builders. */
function trackingFields(message = {}) {
  if (!message.templateId) return {};
  return {
    templateId: String(message.templateId),
    templateName: String(message.templateName || ''),
    templateVariationId: String(message.variationId || message.templateVariationId || '__original'),
    trackingContext: message.trackingContext && typeof message.trackingContext === 'object'
      ? message.trackingContext : {},
  };
}

export function buildPaPayload({ from, to, subject, htmlBody, signature, replyMode, templateId, templateName, variationId, templateVariationId, trackingContext }) {
  return {
    emails: [{
      from,
      to,
      subject,
      htmlBody: normalizeEmailHtml(signature != null ? withSignature(htmlBody, signature) : htmlBody),
      replyMode,
      ...trackingFields({ templateId, templateName, variationId, templateVariationId, trackingContext }),
    }],
  };
}

/* Default dispatcher — a Promise-wrapped chrome.runtime.sendMessage. Callers
   (EmailRunner) can inject their own to route through a mock or to keep their
   cancel handling. */
function defaultDispatch(msg) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (r) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(r);
      });
    } catch (e) { resolve({ ok: false, error: String(e?.message || e) }); }
  });
}

/* Normalize the background paAutomate reply (which carries both `ok` and a
   `results[0].status`) to one shape. */
function classifyPaResult(r) {
  const ok = r?.ok === true || r?.results?.[0]?.status === 'sent';
  if (ok) return { state: 'sent', transport: 'pa', error: null };
  return { state: 'failed', transport: 'pa', error: r?.results?.[0]?.error || r?.error || 'Power Automate error' };
}

/**
 * Send ONE email through the active transport.
 *
 * @param {object} msg
 * @param {string} msg.from        resolved From: address (use pickFromAddress)
 * @param {string} msg.to          recipient
 * @param {string} msg.subject
 * @param {string} msg.htmlBody    rendered body, WITHOUT signature
 * @param {string} [msg.replyMode] 'reply' | 'standalone'
 * @param {string} [msg.signature] appended on the PA path, dropped on mailto
 * @param {object} [msg.config]    a readEmailConfig() result; pass it to skip
 *                                 a storage read and/or to force the transport
 *                                 (EmailRunner also carries the live local-
 *                                 template capability into its mock config).
 * @param {object} [opts]
 * @param {Function} [opts.dispatch]  custom dispatcher (mock / cancel-aware)
 * @returns {{ state:'sent'|'opened'|'failed', transport:'pa'|'mailto'|'none', error:?string }}
 */
export async function sendEmail({ from, to, subject, htmlBody, replyMode = 'standalone', signature = '', config, templateId, templateName, variationId, templateVariationId, trackingContext }, opts = {}) {
  const dispatch = opts.dispatch || defaultDispatch;
  if (!to) return { state: 'failed', transport: 'none', error: 'No recipient email' };
  const cfg = config || await readEmailConfig();
  if (templateId && Array.isArray(cfg.templates)
      && !cfg.templates.some((template) => String(template?.id || '') === String(templateId))) {
    return {
      state: 'failed',
      transport: 'none',
      error: 'This email template is not available to this installation',
    };
  }

  if (cfg.paReady) {
    if (!from) {
      return { state: 'failed', transport: 'pa', error: 'Configure Email account host in Settings before sending' };
    }
    const payload = buildPaPayload({
      from, to, subject, htmlBody, signature, replyMode,
      templateId, templateName, variationId, templateVariationId, trackingContext,
    });
    const r = await dispatch({ action: 'paAutomate', payload });
    return classifyPaResult(r);
  }

  // PA OFF → open the mail client, stripped to plain text + no signature.
  const url = buildMailtoUrl(to, subject, htmlToPlainText(htmlBody));
  const r = await dispatch({
    action: 'openMailto',
    url,
    email: {
      to,
      subject,
      ...trackingFields({ templateId, templateName, variationId, templateVariationId, trackingContext }),
    },
  });
  if (r && r.ok === false) return { state: 'failed', transport: 'mailto', error: r.error || 'Could not open mail window' };
  return { state: 'opened', transport: 'mailto', error: null };
}
