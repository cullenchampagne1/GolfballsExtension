/* ───────────────────────────────────────────────────────────────
   codeEngine/runtime — the evaluated "outbound" object.

   page.evaluate(ref) turns a saved-template REFERENCE into an outbound
   object you then hand to actions.sendEmail / createTask / logCall.
   Evaluation is where variables render (and on a real run it can take a
   few seconds — so it's its own step). The outbound is a mutable object
   with helpers:
       outbound.subject          read / assign to override
       outbound.body
       outbound.append(text)     append to the body   (chainable)
       outbound.appendSubject(t) append to the subject (chainable)
       outbound.attachProposal(result, label?) append a generated proposal link

   A custom email/task is just an object of the same shape you build
   yourself: { subject, body } (email) or { subject, priority, daysOut }.

   Pure: reference in, outbound out. (The sandbox mirrors this inline —
   keep the two in sync.)
─────────────────────────────────────────────────────────────── */

export function hydrateOutbound(value) {
  const o = { ...(value || {}) };
  o.append = function append(text) { this.body = (this.body || '') + String(text == null ? '' : text); return this; };
  o.appendSubject = function appendSubject(text) { this.subject = (this.subject || '') + String(text == null ? '' : text); return this; };
  o.attachProposal = function attachProposal(proposal, label = 'View your proposal') {
    const url = String(proposal && (proposal.proposalUrl || proposal.url) || '');
    const allowed = /^https:\/\/(?:www\.)?golfballs\.com\/cart\?/i.test(url)
      || /^__gb_action_result__:n\d+_\d+:proposalUrl$/.test(url);
    if (!allowed) throw new Error('attachProposal needs a result from actions.createProposalFromOrder or actions.createProposal');
    const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const htmlUrl = String(proposal && proposal.proposalUrlHtml || '');
    const htmlRef = /^__gb_action_result__:n\d+_\d+:proposalUrlHtml$/.test(htmlUrl);
    const href = htmlRef || htmlUrl === esc(url) ? htmlUrl : esc(url);
    this.body = (this.body || '') + `<p><a href="${href}">${esc(label || 'View your proposal')}</a></p>`;
    return this;
  };
  return o;
}

export function makeOutbound(ref) {
  const r = ref || {};
  const v = (Array.isArray(r.versions) && r.versions[0]) || r;
  const o = {
    kind: r.kind || 'email',
    name: r.name || null,
    templateId: r.id || null,
    variationId: v.variationId || '__original',
    subject: v.subject || '',
    body: v.body || '',
  };
  for (const key of [
    'vars',
    'toField',
    'replyMode',
    'senderAccount',
    'senderRandomize',
    'priority',
    'daysOut',
    'categoryId',
    'callDirection',
    'callCategory',
    'callVoicemail',
  ]) {
    if (v[key] !== undefined) o[key] = v[key];
    else if (r[key] !== undefined) o[key] = r[key];
  }
  return hydrateOutbound(o);
}
