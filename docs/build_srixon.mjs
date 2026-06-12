import { parseTemplateBlob } from '/Users/cullenchampagne/Downloads/golfballs-payment-extension/src/lib/templateImport.js';
import fs from 'fs';

const SHOP = 'https://www.golfballs.com/Custom-Logo/Logo-Golf-Balls.html?Decoration=Custom+Logo&amp;Brand=Srixon';

/* Code bodies — NO backtick, NO ${, NO backslash. */

const DAYS_LEFT = `const end = new Date(vars.promo_end);
if (isNaN(end.getTime())) return '';
const now = new Date();
end.setHours(0, 0, 0, 0); now.setHours(0, 0, 0, 0);
const d = Math.round((end.getTime() - now.getTime()) / 86400000);
if (d < 0) return '';
if (d === 0) return 'just today';
return d === 1 ? '1 more day' : (d + ' more days');`;

const SRIXON_ITEM = `// Newest-first scan (cap 4) for the latest Srixon ball, then resolve a CLEAN
// shop URL for it (catalog product page — not the configured/personalized link).
const orders = (Array.isArray(ctx.orders) ? ctx.orders : []).slice()
  .sort((a, b) => new Date(b.date) - new Date(a.date));
let scanned = 0;
for (const o of orders) {
  if (!o || !o.href) continue;
  if (scanned++ >= 4) break;
  let items = [];
  try {
    const r = await h.parse(await h.fetchText(o.href));
    const data = r && r.data;
    items = (data && data.order && Array.isArray(data.order.items)) ? data.order.items : [];
  } catch (e) { continue; }
  const hits = items.filter(it => /srixon/i.test(it.name || '') && /golf ball/i.test(it.name || ''));
  if (hits.length) {
    let best = hits[0];
    for (const it of hits) if ((h.parseNumber(it.lineTotal) || 0) > (h.parseNumber(best.lineTotal) || 0)) best = it;
    let shopUrl = '';
    try { if (best.url) { const m = await h.catalog.byUrl(best.url); if (m && m.url) shopUrl = m.url; } } catch (e) {}
    if (!shopUrl) { try { const m = await h.catalog.find(best.name); if (m && m.url) shopUrl = m.url; } catch (e) {} }
    return { name: best.name, shopUrl: shopUrl, order: o.number, date: o.date };
  }
}
return null;`;

const LAST_ITEM = `let n = String((vars._srixon_item && vars._srixon_item.name) || '');
if (!n) return '';
n = n.split(/ [-–] /)[0];
n = n.replace(/custom logo/ig, '').replace(/double dozen/ig, '').replace(/  +/g, ' ');
return n.trim();`;

/* The purchased item, as a link to its CLEAN shop product page (the whole <a>
   is built here so no variable ever sits inside an href attribute). */
const SRIXON_LINE = `const it = vars._srixon_item;
if (!it) return '';
const name = vars.last_item || it.name;
const url = it.shopUrl || 'https://www.golfballs.com/Custom-Logo/Logo-Golf-Balls.html?Decoration=Custom+Logo&amp;Brand=Srixon';
return 'I saw the <a href="' + url + '">' + name + '</a> on your account from last time — those are included in this deal too, so it is an easy one to restock.';`;

/* One Ps line: days + logo when both apply, otherwise whichever is true. */
const PS_LINE = `const days = vars.days_left || '';
const p = (ctx.proofs && ctx.proofs[0]) || null;
const hasLogo = !!(p && p.id);
if (!days && !hasLogo) return '';
if (days && hasLogo) return 'Ps — this one only runs for ' + days + ', and we still have your logo on file, so it can be a quick reorder!';
if (days) return 'Ps — this one only runs for ' + days + '!';
return 'Ps — we still have your logo on file, so this can be a quick reorder.';`;

/* The logo-ball proof image (bigger now), left-aligned the simple way it worked
   before — a plain block <img>, no table — linked to the proof PDF. Built whole
   here so no variable sits inside an attribute (that var-in-href was the only
   thing that broke it). Drops entirely when there is no proof; CID-embedded on
   the PA send path. */
const LOGO_PROOF = `const p = (ctx.proofs && ctx.proofs[0]) || null;
if (!p || !p.logo_ball) return '';
const img = '<img src="' + p.logo_ball + '" width="440" alt="Your logo on a Srixon ball" style="display:block; width:440px; max-width:100%; height:auto; border:0; margin:12px 0;" />';
return p.pdf ? ('<a href="' + p.pdf + '">' + img + '</a>') : img;`;

function promoVars() {
  return {
    first_name:   { type: 'schema', path: 'contact.firstName', smart: { fallback: 'there', transform: 'titleCase' } },
    promo_end:    { type: 'literal', value: '6/22/2026' },
    days_left:    { type: 'code', body: DAYS_LEFT },
    _srixon_item: { type: 'code', body: SRIXON_ITEM, async: true },
    last_item:    { type: 'code', body: LAST_ITEM },
    srixon_line:  { type: 'code', body: SRIXON_LINE, smart: { conditional: true, conditionalScope: 'line' } },
    ps_line:      { type: 'code', body: PS_LINE, smart: { conditional: true, conditionalScope: 'line' } },
    logo_proof:   { type: 'code', body: LOGO_PROOF, smart: { conditional: true, conditionalScope: 'line' } },
  };
}
const promoOrder = ['first_name', 'promo_end', 'days_left', '_srixon_item', 'last_item', 'srixon_line', 'ps_line', 'logo_proof'];

/* Footer — two distinct deal links (no descriptor suffix), then the widened
   PDF-linked logo-ball photo embedded directly beneath. */
const FOOTER =
`<p><b>Srixon Promos — end {{promo_end}}</b><br><a href="${SHOP}">Buy 12, Get 6 Free</a><br><a href="${SHOP}">Buy 2 DZ, Get 1 Free</a></p>
<p>{{logo_proof}}</p>`;

const RULE = {
  outerJoiner: 'AND',
  groups: [{ joiner: 'AND', conditions: [
    { source: 'schema', ref: 'items[any].name', op: 'contains', value: 'srixon', not: false },
  ] }],
};

const templates = [
  {
    type: 'account',
    name: 'Srixon Promotion Campaign',
    subject: 'Time to restock your Srixon, {{first_name}}?',
    accountConditions: RULE,
    toField: { type: 'literal', value: 'cullenchampagne@icloud.com' },
    senderAccount: 'loyaltylogo',
    body:
`<p>Hey {{first_name}},</p>
<p>Time for another round of Srixon golf balls? They are running their <b>BUY 12, GET 6 FREE</b> promo on every golf ball model right now — and it will not be around long.</p>
<p>{{srixon_line}}</p>
<p>Whether it is the Z-Star line or a value option like the Soft Feel, this is genuinely one of the best deals Srixon runs all year. Want me to put pricing together while it is live?</p>
<p><i>{{ps_line}}</i></p>
${FOOTER}
<p>Best,</p>`,
    vars: promoVars(),
    varOrder: promoOrder,
    variations: [
      {
        label: 'Events / tournaments',
        subject: 'A heads-up on Srixon before it ends, {{first_name}}',
        body:
`<p>Hey {{first_name}},</p>
<p>Wanted to make sure you saw this — Srixon is offering <b>BUY 12, GET 6 FREE</b> on every golf ball model right now, for a limited time.</p>
<p>{{srixon_line}}</p>
<p>If you have tournaments, events, or client gifts coming up, this is the time to restock. Want me to send pricing or rough out an order?</p>
<p><i>{{ps_line}}</i></p>
${FOOTER}
<p>Best,</p>`,
      },
      {
        label: 'Past buyer',
        subject: 'Your Srixon deal is live, {{first_name}}',
        body:
`<p>Hey {{first_name}},</p>
<p>Time for another order of Srixon? They are running their popular <b>BUY 12, GET 6 FREE</b> promo across all golf ball models for a limited time.</p>
<p>{{srixon_line}}</p>
<p>Since you have ordered from us before, I wanted to make sure you had a chance to take advantage before the window closes. Want me to send pricing or help put an order together?</p>
<p><i>{{ps_line}}</i></p>
${FOOTER}
<p>Best,</p>`,
      },
    ],
  },

  {
    type: 'account',
    name: '#1 Srixon Promotion Campaign Follow Up',
    subject: 'Still time on the Srixon deal, {{first_name}}',
    accountConditions: RULE,
    toField: { type: 'literal', value: 'cullenchampagne@icloud.com' },
    senderAccount: 'loyaltylogo',
    body:
`<p>Hi {{first_name}},</p>
<p>Just following up on my last note — the Srixon <b>BUY 12, GET 6 FREE</b> promo is still active, but it is time-sensitive.</p>
<p>{{srixon_line}}</p>
<p>It covers every model, so whether you lean toward the Z-Star line or a value option like the Soft Feel, it is a great window to lock in pricing. Want me to run numbers on your preferred model?</p>
<p><i>{{ps_line}}</i></p>
${FOOTER}
<p>Best,</p>`,
    vars: promoVars(),
    varOrder: promoOrder,
    variations: [
      {
        label: 'Planning ahead',
        subject: 'Before the Srixon promo closes, {{first_name}}',
        body:
`<p>Hey {{first_name}},</p>
<p>Wanted to circle back — the Srixon promo is still running, but it will not last much longer.</p>
<p>{{srixon_line}}</p>
<p>The BUY 12, GET 6 FREE deal on all models is a strong offer, especially if you are planning ahead for events, gifts, or an inventory restock. Happy to send options or run pricing — just say the word.</p>
<p><i>{{ps_line}}</i></p>
${FOOTER}
<p>Best,</p>`,
      },
      {
        label: 'Model-specific',
        subject: 'Want me to price your Srixon, {{first_name}}?',
        body:
`<p>Hi {{first_name}},</p>
<p>Just checking back in on the Srixon promotion — the BUY 12, GET 6 FREE offer across all models is still available, but limited.</p>
<p>{{srixon_line}}</p>
<p>With the Z-Star line and Q-Star Tour all included, it is a great time to lock in pricing before the deal ends. Let me know if you want me to run some numbers or narrow down the best options for you.</p>
<p><i>{{ps_line}}</i></p>
${FOOTER}
<p>Best,</p>`,
      },
    ],
  },

  {
    type: 'account',
    name: '#2 Srixon Promotion Campaign Follow Up',
    subject: 'Staying on your radar, {{first_name}}',
    accountConditions: RULE,
    toField: { type: 'literal', value: 'cullenchampagne@icloud.com' },
    senderAccount: 'loyaltylogo',
    body:
`<p>Hi {{first_name}},</p>
<p>Circling back one more time! I wanted to stay on your radar — we regularly get access to brand deals and seasonal promos from the top golf brands like Srixon.</p>
<p>If you are planning ahead, these can be game-changers for client gifting, corporate events, or building out tournament kits. I would love to help with any custom golf ball or logo projects you have coming up.</p>
<p><i>{{ps_line}}</i></p>
<p>{{logo_proof}}</p>
<p>Hope to reconnect soon!</p>
<p>Best,</p>`,
    vars: {
      first_name: { type: 'schema', path: 'contact.firstName', smart: { fallback: 'there', transform: 'titleCase' } },
      ps_line:    { type: 'code', body: PS_LINE, smart: { conditional: true, conditionalScope: 'line' } },
      logo_proof: { type: 'code', body: LOGO_PROOF, smart: { conditional: true, conditionalScope: 'line' } },
    },
    varOrder: ['first_name', 'ps_line', 'logo_proof'],
  },
];

const json = JSON.stringify({ templates }, null, 2);
const parsed = parseTemplateBlob(json);
console.log('VALID — ' + parsed.length + ' templates:');
for (const t of parsed) {
  console.log('  ' + t.name + ' · ' + Object.keys(t.vars || {}).length + ' vars' + (t.variations ? ' · ' + t.variations.length + ' variations' : ''));
}
// Sanity: no {{var}} left inside an href/src attribute in any body or variation.
const bad = [];
for (const t of parsed) {
  const bodies = [t.body, ...((t.variations || []).map(v => v.body))];
  for (const b of bodies) if (/(href|src)\s*=\s*"[^"]*\{\{/.test(b)) bad.push(t.name);
}
console.log(bad.length ? ('ATTRIBUTE-VAR LEAK in: ' + bad.join(', ')) : 'OK — no variables inside attributes');
fs.writeFileSync('/Users/cullenchampagne/Downloads/golfballs-payment-extension/docs/srixon-templates.json', json);
console.log('written: docs/srixon-templates.json');
