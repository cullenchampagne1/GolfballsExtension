/* eslint-disable react/prop-types */
/* ─────────────────────────────────────────────────────────────
   Proposal Email composer

   Click a saved proposal / order → configure a customer-facing
   proposal email and preview it live. The HTML is generated here,
   client-side. Each TEMPLATE is a completely different email
   layout (structure + type + colour), not just a recolour. The
   cart "View this option" link is left as a {{CART_LINK}}
   placeholder — the coding agent injects the real cart URL
   server-side at send time.
───────────────────────────────────────────────────────────── */

import React, { useState as useStateE, useMemo as useMemoE } from 'react';
import { Btn as BtnE, IconBtn as IconBtnE, I as IE } from '../index.js';

/* ── small utils ── */
const _esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const _money = (n) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const _brandLine = (l, color) => l.brand ? `<div style="font-size: 11px; letter-spacing: .6px; text-transform: uppercase; color: ${color};">${_esc(l.brand)}</div>` : '';

/* ════════════════════════════════════════════════════════════
   SHARED EMAIL DESIGN SYSTEM
   One palette + a set of email-safe (table/inline-style) building
   blocks shared by every template, so they read as one considered
   family. The headline block is the IMPRINT PROOF — a designed
   card that shows how each item's logo / personalization is
   applied (product plate · imprint chip · spec), built from the
   per-line `imprint` data the catalog now passes through.
════════════════════════════════════════════════════════════ */
const T = {
  acc: '#339900', accDeep: '#236b00', accSoft: '#eef6e7',
  ink: '#19240f', body: '#454d41', mut: '#7c857a', faint: '#aab0a2',
  line: '#e7e9e1', plate: '#f6f7f1', card: '#ffffff',
  price: '#ff6600', priceSoft: '#fff1e6',
};
const SANS = '&quot;Helvetica Neue&quot;, Helvetica, Arial, sans-serif';
const _LIGHT_IMPRINT = { White: 1, Silver: 1, Gold: 1 };

const _msgBlock = (m, align) => (m.show.message && m.message)
  ? `<p style="color:${T.body}; font-size:14px; line-height:1.6; margin:0 0 4px;${align ? ' text-align:' + align + ';' : ''}">${_esc(m.message).replace(/\n/g, '<br/>')}</p>` : '';

const _swatch = (hex, light) => `<span style="display:inline-block; width:10px; height:10px; border-radius:3px; background:${hex};${light ? ' border:1px solid #cfcfc8;' : ''} vertical-align:middle;"></span>`;

/* the imprint, rendered as a coloured chip the way the art sits on the goods */
function _chip(imp, size, square) {
  const light = _LIGHT_IMPRINT[imp.color];
  const fg = light ? '#1f2937' : '#ffffff';
  const label = imp.text ? (imp.text.split(' · ')[0] || '') : 'LOGO';
  const fs = imp.text ? Math.max(8, Math.round(size * 0.15)) : Math.round(size * 0.17);
  return `<table border="0" cellpadding="0" cellspacing="0" width="${size}" height="${size}" style="width:${size}px; height:${size}px; background:${imp.colorHex}; border-radius:${square ? 0 : Math.round(size * 0.22)}px;${light ? ' border:1px solid #d6d6cf;' : ''}"><tbody><tr><td align="center" valign="middle" style="text-align:center; padding:4px;"><span style="font-family:${SANS}; font-size:${fs}px; font-weight:800; letter-spacing:.5px; color:${fg}; line-height:1.12;">${_esc(label).slice(0, 16)}</span></td></tr></tbody></table>`;
}

/* product photo on a soft plate */
function _photoPlate(img, plate, square) {
  return `<table border="0" cellpadding="0" cellspacing="0" width="${plate}" style="background:${T.card}; border:1px solid ${T.line}; border-radius:${square ? 0 : 10}px;"><tbody><tr><td align="center" valign="middle" height="${plate}" style="padding:6px;"><img src="${_esc(img)}" width="${plate - 16}" border="0" style="display:block; border-radius:${square ? 0 : 6}px;" /></td></tr></tbody></table>`;
}

/* the imprint PROOF card — the centrepiece these templates are built around */
function _proof(l, withPhoto, square) {
  const imp = l.imprint;
  if (!imp) return '';
  const light = _LIGHT_IMPRINT[imp.color];
  const photoCell = withPhoto ? `<td valign="middle" width="74" style="padding-right:14px;">${_photoPlate(l.img, 74, square)}</td>` : '';
  const detail = `${imp.text ? `<div style="font-size:11px; line-height:1.5; color:${T.mut}; padding-top:3px;">&ldquo;${_esc(imp.text)}&rdquo;</div>` : (imp.logo ? `<div style="font-size:11px; line-height:1.5; color:${T.mut}; padding-top:3px;">${_esc(imp.logo)}</div>` : '')}`;
  return `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ${T.line}; border-radius:${square ? 0 : 12}px; background:${T.plate}; margin-top:12px;"><tbody>
    <tr><td style="padding:10px 14px 0;"><span style="font-family:${SANS}; font-size:9px; letter-spacing:.9px; text-transform:uppercase; color:${T.acc}; font-weight:800;">Imprint proof</span></td></tr>
    <tr><td style="padding:9px 14px 13px;"><table border="0" cellpadding="0" cellspacing="0"><tbody><tr>${photoCell}<td valign="middle" width="52" style="padding-right:14px;">${_chip(imp, 52, square)}</td><td valign="middle"><div style="font-size:12px; line-height:1.4; font-weight:700; color:${T.ink};">${_esc(imp.typeLabel)}</div><div style="font-size:11px; line-height:1.5; color:${T.mut}; padding-top:5px; white-space:nowrap;">${_swatch(imp.colorHex, light)} <span style="vertical-align:middle;">${_esc(imp.color)}${imp.method ? ' &middot; ' + _esc(imp.method) : ''}</span></div>${detail}</td></tr></tbody></table></td></tr>
  </tbody></table>`;
}

const _ctaBtn = (label, pill) => `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:24px;"><tbody><tr><td align="center"><a href="{{CART_LINK}}" style="display:inline-block; background:${T.acc}; color:#fff; text-decoration:none; font-family:${SANS}; font-size:15px; font-weight:700; padding:14px 42px; border-radius:${pill ? '30px' : '8px'};">${label}</a></td></tr></tbody></table>`;
const _ctaBar = (label) => `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:24px;"><tbody><tr><td><a href="{{CART_LINK}}" style="display:block; text-align:center; background:${T.acc}; color:#fff; text-decoration:none; font-family:${SANS}; font-size:15px; font-weight:700; padding:16px; border-radius:8px;">${label}</a></td></tr></tbody></table>`;
const _wordmark = (align) => `<table border="0" cellpadding="0" cellspacing="0"${align === 'center' ? ' align="center"' : ''}><tbody><tr><td valign="middle"><span style="display:inline-block; width:9px; height:9px; border-radius:9px; background:${T.acc}; margin-right:7px; vertical-align:middle;"></span></td><td valign="middle"><span style="font-family:${SANS}; font-size:13px; font-weight:800; letter-spacing:2.5px; text-transform:uppercase; color:${T.ink};">Golfballs</span></td></tr></tbody></table>`;
const _foot = () => `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:22px; border-top:1px solid ${T.line};"><tbody><tr><td align="center" style="padding-top:14px;"><span style="font-family:${SANS}; font-size:10px; letter-spacing:1.6px; text-transform:uppercase; color:${T.faint}; font-weight:700;">Golfballs &middot; Corporate Gifting &middot; golfballs.com</span></td></tr></tbody></table>`;
const _expLine = (m, align) => m.show.expiration ? `<p style="font-family:${SANS}; font-size:13px; color:${T.mut}; margin:18px 0 0;${align ? ' text-align:' + align + ';' : ''}">This proposal expires on <strong style="color:${T.ink};">${_esc(m.expiration)}</strong></p>` : '';
const _discLine = (m, align) => m.show.disclaimer ? `<p style="font-family:${SANS}; font-style:italic; font-size:12px; color:${T.faint}; margin:5px 0 0;${align ? ' text-align:' + align + ';' : ''}">*shipping &amp; sales tax are calculated in the shopping cart</p>` : '';
const _star = (m) => m.show.disclaimer ? '*' : '';
const _qtyLine = (l, show) => show.cost ? `${l.qty} &times; ${_money(l.unitPrice)}` : `Qty ${l.qty}`;

/* ════════════════════════════════════════════════════════════
   TEMPLATE 1 — CLASSIC
   A formal letter: centred Golfballs wordmark, group/option title
   under a green rule, then itemised rows each carrying their own
   imprint proof, a bold estimated total, expiry, CTA, footer.
════════════════════════════════════════════════════════════ */
function tplClassic(m) {
  const { groupName, optionName, lines, total, show } = m;
  const rows = lines.map((l, i) => {
    const photo = show.images ? `<td width="66" valign="top" style="padding-right:14px;">${_photoPlate(l.img, 66)}</td>` : '';
    const sub = l.subtitle ? `<div style="font-size:12px; color:${T.mut}; margin-top:3px;">${_esc(l.subtitle)}</div>` : '';
    const proof = show.previews ? _proof(l, false) : '';
    return `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="${i ? `border-top:1px solid ${T.line};` : ''}"><tbody><tr><td style="padding:16px 0;"><table border="0" cellpadding="0" cellspacing="0" width="100%"><tbody><tr>${photo}<td valign="top">${_brandLine(l, T.mut)}<div style="font-size:15px; color:${T.ink}; font-weight:700;">${_esc(l.title)}</div>${sub}<div style="font-size:11px; color:${T.mut}; margin-top:4px;">${_qtyLine(l, show)}</div></td><td valign="top" align="right" width="92"><span style="font-size:16px; font-weight:800; color:${T.price};">${_money(l.lineTotal)}</span></td></tr></tbody></table>${proof}</td></tr></tbody></table>`;
  }).join('\n');
  const totalRow = show.total ? `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top:2px solid ${T.ink}; margin-top:4px;"><tbody><tr><td style="padding:16px 0;"><span style="font-size:13px; font-weight:700; letter-spacing:.4px; text-transform:uppercase; color:${T.ink};">Estimated total${_star(m)}</span></td><td align="right" style="padding:16px 0;"><span style="font-size:23px; font-weight:800; color:${T.price};">${_money(total)}</span></td></tr></tbody></table>` : '';
  return `<table border="0" cellpadding="0" cellspacing="0" style="font-family:${SANS}; width:600px;"><tbody><tr><td style="border:1px solid #e0e0d6; border-radius:14px; padding:30px 30px 26px;">
    ${_wordmark('center')}
    <div style="height:16px; line-height:16px; font-size:0;">&nbsp;</div>
    <div align="center" style="font-size:11px; letter-spacing:1.6px; text-transform:uppercase; color:${T.acc}; font-weight:700;">${_esc(groupName)}</div>
    <div align="center" style="font-size:25px; font-weight:800; color:${T.ink}; letter-spacing:-.5px; margin:6px 0 16px;">${_esc(optionName)}</div>
    ${_msgBlock(m)}
    <div style="height:6px; line-height:6px; font-size:0;">&nbsp;</div>
    ${rows}${totalRow}${_expLine(m, 'right')}${_discLine(m, 'right')}${show.cta ? _ctaBtn('View this option &rsaquo;', false) : ''}${_foot()}
  </td></tr></tbody></table>`;
}

/* ════════════════════════════════════════════════════════════
   TEMPLATE 2 — MINIMAL
   Editorial & borderless. Eyebrow + oversized option name, a thin
   rule, item rows with right-aligned pricing and an imprint proof
   beneath each, one bold total, full-width ink CTA.
════════════════════════════════════════════════════════════ */
function tplMinimal(m) {
  const { groupName, optionName, lines, total, show } = m;
  const rows = lines.map((l, i) => {
    const photo = show.images ? `<td width="60" valign="top" style="padding:18px 14px 0 0;"><img src="${_esc(l.img)}" width="52" border="0" style="border-radius:7px; display:block;" /></td>` : '';
    const sub = l.subtitle ? `<div style="font-size:12px; color:${T.mut}; margin-top:3px;">${_esc(l.subtitle)}</div>` : '';
    const proof = show.previews ? _proof(l, false) : '';
    return `<tr style="border-top:1px solid ${T.line};">${photo}<td valign="top" style="padding:18px 0;">${_brandLine(l, T.mut)}<div style="font-size:16px; color:${T.ink}; font-weight:700;">${_esc(l.title)}</div>${sub}${proof}</td><td valign="top" align="right" style="padding:18px 0;"><div style="font-size:11px; color:${T.mut};">${_qtyLine(l, show)}</div><div style="font-size:17px; color:${T.price}; font-weight:800; margin-top:4px;">${_money(l.lineTotal)}</div></td></tr>`;
  }).join('\n');
  const totalsRow = show.total ? `<tr style="border-top:2px solid ${T.ink};"><td colspan="${show.images ? 2 : 1}" valign="middle" style="padding:18px 0;"><span style="font-size:11px; letter-spacing:.8px; text-transform:uppercase; color:${T.mut}; font-weight:700;">Estimated total${_star(m)}</span></td><td align="right" valign="middle" style="padding:18px 0;"><span style="font-size:26px; font-weight:800; color:${T.price}; letter-spacing:-.6px;">${_money(total)}</span></td></tr>` : '';
  return `<table border="0" cellpadding="0" cellspacing="0" style="font-family:${SANS}; width:600px;"><tbody><tr><td style="padding:8px 6px;">
    ${_wordmark()}
    <div style="font-size:12px; letter-spacing:1.6px; text-transform:uppercase; color:${T.acc}; font-weight:700; margin-top:18px;">${_esc(groupName)}</div>
    <div style="font-size:30px; font-weight:800; color:${T.ink}; letter-spacing:-.8px; margin:7px 0 20px;">${_esc(optionName)}</div>
    ${_msgBlock(m)}
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:8px;"><tbody>${rows}${totalsRow}</tbody></table>
    ${_expLine(m)}${_discLine(m)}${show.cta ? _ctaBar('View this option') : ''}${_foot()}
  </td></tr></tbody></table>`;
}

/* ════════════════════════════════════════════════════════════
   TEMPLATE 3 — CATALOG CARDS
   Green header band; every item is its own bordered card with a
   photo, details, price chip and a full-width imprint proof; the
   total sits in an accent-edged box.
════════════════════════════════════════════════════════════ */
function tplCatalog(m) {
  const { groupName, optionName, lines, total, show } = m;
  const cards = lines.map((l) => {
    const photo = show.images ? `<td width="116" valign="top" style="padding:16px 0 16px 16px;">${_photoPlate(l.img, 100)}</td>` : '';
    const sub = l.subtitle ? `<div style="font-size:12px; color:${T.mut}; margin-top:4px;">${_esc(l.subtitle)}</div>` : '';
    const qtyLine = show.cost ? `Qty ${l.qty} &nbsp;&middot;&nbsp; ${_money(l.unitPrice)} ea` : `Qty ${l.qty}`;
    const proof = show.previews && l.imprint ? `<tr><td colspan="${show.images ? 3 : 2}" style="padding:0 16px 16px;">${_proof(l, false)}</td></tr>` : '';
    return `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ${T.line}; border-radius:12px; margin-bottom:13px;"><tbody><tr>${photo}<td valign="middle" style="padding:16px ${show.images ? '14px' : '16px'};">${_brandLine(l, T.acc)}<div style="font-size:16px; color:${T.ink}; font-weight:700; margin-top:2px;">${_esc(l.title)}</div>${sub}<div style="font-size:12px; color:${T.mut}; margin-top:8px;">${qtyLine}</div></td><td width="112" valign="middle" align="right" style="padding:16px;"><span style="display:inline-block; background:${T.priceSoft}; color:${T.price}; font-size:15px; font-weight:800; padding:7px 13px; border-radius:8px;">${_money(l.lineTotal)}</span></td></tr>${proof}</tbody></table>`;
  }).join('\n');
  const totalBox = show.total ? `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:4px;"><tbody><tr><td style="background:${T.accSoft}; border-left:4px solid ${T.acc}; border-radius:8px; padding:16px 18px;"><table width="100%"><tbody><tr><td valign="middle"><span style="font-size:13px; font-weight:700; color:${T.ink};">Estimated total${_star(m)}</span></td><td align="right" valign="middle"><span style="font-size:23px; font-weight:800; color:${T.price};">${_money(total)}</span></td></tr></tbody></table></td></tr></tbody></table>` : '';
  return `<table border="0" cellpadding="0" cellspacing="0" style="font-family:${SANS}; width:600px;"><tbody>
    <tr><td style="background:${T.acc}; border-radius:14px 14px 0 0; padding:22px 26px;"><div style="font-size:11px; letter-spacing:1.4px; text-transform:uppercase; color:rgba(255,255,255,.82); font-weight:700;">${_esc(groupName)}</div><div style="font-size:24px; font-weight:800; color:#fff; margin-top:4px; letter-spacing:-.4px;">${_esc(optionName)}</div></td></tr>
    <tr><td style="border:1px solid ${T.line}; border-top:none; border-radius:0 0 14px 14px; padding:20px 22px 24px;">${_msgBlock(m)}<div style="height:4px; line-height:4px; font-size:0;">&nbsp;</div>${cards}${totalBox}${_expLine(m, 'right')}${_discLine(m, 'right')}${show.cta ? _ctaBtn('View this option &rsaquo;', true) : ''}${_foot()}</td></tr>
  </tbody></table>`;
}

/* ════════════════════════════════════════════════════════════
   TEMPLATE 4 — QUOTE
   Bottom-line first: a green summary panel with the total up top,
   then a clean lined schedule where each item carries a compact
   inline imprint chip + spec (no photo). For decisive buyers.
════════════════════════════════════════════════════════════ */
function tplQuote(m) {
  const { groupName, optionName, expiration, lines, total, show } = m;
  const units = lines.reduce((a, l) => a + l.qty, 0);
  const subParts = [`${units} units`, `${lines.length} item${lines.length === 1 ? '' : 's'}`];
  if (show.expiration) subParts.push(`valid until ${_esc(expiration)}`);
  const totalCell = show.total ? `<td align="right" valign="middle" width="190"><div style="font-size:11px; letter-spacing:.8px; text-transform:uppercase; color:rgba(255,255,255,.82);">Estimated total${_star(m)}</div><div style="font-size:32px; font-weight:800; color:#fff; letter-spacing:-.6px; margin-top:2px;">${_money(total)}</div></td>` : '';
  const panel = `<table border="0" cellpadding="0" cellspacing="0" width="100%"><tbody><tr><td style="background:${T.acc}; border-radius:14px; padding:24px 26px;"><table width="100%"><tbody><tr><td valign="middle"><div style="font-size:11px; letter-spacing:1.2px; text-transform:uppercase; color:rgba(255,255,255,.82); font-weight:700;">${_esc(groupName)}</div><div style="font-size:23px; font-weight:800; color:#fff; margin:5px 0 7px; letter-spacing:-.4px;">${_esc(optionName)}</div><div style="font-size:12px; color:rgba(255,255,255,.88);">${subParts.join(' &nbsp;&middot;&nbsp; ')}</div></td>${totalCell}</tr></tbody></table></td></tr></tbody></table>`;
  const rows = lines.map((l, i) => {
    const sub = l.subtitle ? `<div style="font-size:12px; color:${T.mut}; margin-top:3px;">${_esc(l.subtitle)}</div>` : '';
    const cost = show.cost ? `<td valign="top" align="right" width="86" style="padding:15px 0; font-size:13px; color:${T.body};">${_money(l.unitPrice)}</td>` : '';
    const imp = l.imprint;
    const chip = (show.previews && imp) ? `<table border="0" cellpadding="0" cellspacing="0" style="margin-top:9px;"><tbody><tr><td valign="middle" width="34" style="padding-right:10px;">${_chip(imp, 34)}</td><td valign="middle"><span style="font-size:11px; color:${T.mut};">${_swatch(imp.colorHex, _LIGHT_IMPRINT[imp.color])} <span style="vertical-align:middle;">${_esc(imp.typeLabel)} &middot; ${_esc(imp.color)}${imp.method ? ' &middot; ' + _esc(imp.method) : ''}</span></span></td></tr></tbody></table>` : '';
    return `<tr style="${i ? `border-top:1px solid ${T.line};` : ''}"><td valign="top" style="padding:15px 0;">${_brandLine(l, T.mut)}<div style="font-size:14px; color:${T.ink}; font-weight:700;">${_esc(l.title)}</div>${sub}${chip}</td><td valign="top" width="54" style="padding:15px 0; font-size:13px; color:${T.body};">${l.qty}</td>${cost}<td valign="top" align="right" width="92" style="padding:15px 0; font-size:14px; font-weight:800; color:${T.price};">${_money(l.lineTotal)}</td></tr>`;
  }).join('\n');
  const th = (label, w, align) => `<th style="font-family:${SANS}; font-weight:700; font-size:10px; letter-spacing:.6px; text-transform:uppercase; color:${T.mut}; border-bottom:2px solid ${T.acc}; padding:0 0 9px;${w ? ' width:' + w + 'px;' : ''}" align="${align || 'left'}">${label}</th>`;
  const head = `<tr>${th('Item')}${th('Qty', 54)}${show.cost ? th('Unit', 86, 'right') : ''}${th('Total', 92, 'right')}</tr>`;
  return `<table border="0" cellpadding="0" cellspacing="0" style="font-family:${SANS}; width:600px;"><tbody><tr><td>
    ${panel}${_msgBlock(m) ? '<div style="height:18px; line-height:18px; font-size:0;">&nbsp;</div>' + _msgBlock(m) : ''}
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:22px;"><tbody>${head}${rows}</tbody></table>
    ${_discLine(m)}${show.cta ? _ctaBar('Approve &amp; view in cart &rsaquo;') : ''}${_foot()}
  </td></tr></tbody></table>`;
}

/* ════════════════════════════════════════════════════════════
   TEMPLATE 5 — LOOKBOOK
   The visual option: centred header, big image-on-top product
   cards, the imprint proof shown right under each gift, then a
   ruled total. Best when the goods sell themselves.
════════════════════════════════════════════════════════════ */
function tplLookbook(m) {
  const { groupName, optionName, lines, total, show } = m;
  const cards = lines.map((l) => {
    const imgRow = show.images ? `<tr><td align="center" style="padding:20px 20px 6px;"><img src="${_esc(l.img)}" width="220" border="0" style="border-radius:10px; display:block; margin:0 auto;" /></td></tr>` : '';
    const sub = l.subtitle ? `<div style="font-size:12px; color:${T.mut}; margin-top:4px;">${_esc(l.subtitle)}</div>` : '';
    const qtyLine = show.cost ? `Qty ${l.qty} &nbsp;&middot;&nbsp; ${_money(l.unitPrice)} ea` : `Qty ${l.qty}`;
    const proof = show.previews ? _proof(l, false) : '';
    return `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ${T.line}; border-radius:14px; margin-bottom:15px;"><tbody>${imgRow}<tr><td style="padding:${show.images ? '8px' : '18px'} 20px 18px;"><table width="100%"><tbody><tr><td valign="middle">${_brandLine(l, T.acc)}<div style="font-size:18px; color:${T.ink}; font-weight:700; margin-top:2px;">${_esc(l.title)}</div>${sub}<div style="font-size:12px; color:${T.mut}; margin-top:6px;">${qtyLine}</div></td><td valign="middle" align="right" width="96"><span style="font-size:20px; font-weight:800; color:${T.price};">${_money(l.lineTotal)}</span></td></tr></tbody></table>${proof}</td></tr></tbody></table>`;
  }).join('\n');
  const totalBox = show.total ? `<table border="0" cellpadding="0" cellspacing="0" width="100%"><tbody><tr><td style="border-top:2px solid ${T.acc}; padding:18px 2px 0;"><table width="100%"><tbody><tr><td valign="middle"><span style="font-size:12px; letter-spacing:.6px; text-transform:uppercase; color:${T.mut}; font-weight:700;">Estimated total${_star(m)}</span></td><td align="right" valign="middle"><span style="font-size:26px; font-weight:800; color:${T.price};">${_money(total)}</span></td></tr></tbody></table></td></tr></tbody></table>` : '';
  return `<table border="0" cellpadding="0" cellspacing="0" style="font-family:${SANS}; width:600px;"><tbody><tr><td style="padding:6px 6px 8px;">
    <div align="center">${_wordmark('center')}</div>
    <div align="center" style="font-size:12px; letter-spacing:1.6px; text-transform:uppercase; color:${T.acc}; font-weight:800; margin-top:16px;">${_esc(groupName)}</div>
    <div align="center" style="font-size:27px; font-weight:800; color:${T.ink}; margin:7px 0 0; letter-spacing:-.5px;">${_esc(optionName)}</div>
    <div style="width:46px; height:4px; background:${T.acc}; border-radius:2px; margin:14px auto 0;"></div>
    ${_msgBlock(m, 'center')}
    <div style="height:22px; line-height:22px; font-size:0;">&nbsp;</div>
    ${cards}${totalBox}${_expLine(m, 'center')}${_discLine(m, 'center')}${show.cta ? _ctaBtn('View this option &rsaquo;', true) : ''}${_foot()}
  </td></tr></tbody></table>`;
}

/* ════════════════════════════════════════════════════════════
   TEMPLATE 6 — SEPARATED
   Each option is a fully self-contained, visually detached card —
   its own header strip ("Option A"), photo, imprint proof and a
   bold price. Built for pitching a menu of independent options
   rather than one itemised order. The estimated total is optional
   (most useful only when the options are meant to be bundled).
════════════════════════════════════════════════════════════ */
function tplSeparated(m) {
  const { groupName, optionName, lines, total, show } = m;
  const cards = lines.map((l, i) => {
    const photo = show.images ? `<td width="92" valign="top" style="padding-right:16px;">${_photoPlate(l.img, 92)}</td>` : '';
    const sub = l.subtitle ? `<div style="font-size:12px; color:${T.mut}; margin-top:4px;">${_esc(l.subtitle)}</div>` : '';
    const qtyLine = show.cost ? `Qty ${l.qty} &nbsp;&middot;&nbsp; ${_money(l.unitPrice)} ea` : `Qty ${l.qty}`;
    const proof = show.previews ? _proof(l, false) : '';
    return `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ${T.line}; border-radius:14px; margin-bottom:16px;"><tbody>
      <tr><td style="background:${T.plate}; border-bottom:1px solid ${T.line}; border-radius:14px 14px 0 0; padding:11px 18px;"><table width="100%"><tbody><tr><td valign="middle"><span style="font-size:10px; letter-spacing:1.2px; text-transform:uppercase; color:${T.acc}; font-weight:800;">Option ${String.fromCharCode(65 + i)}</span></td><td align="right" valign="middle"><span style="font-size:11px; color:${T.mut}; font-weight:600;">${qtyLine}</span></td></tr></tbody></table></td></tr>
      <tr><td style="padding:18px;"><table width="100%"><tbody><tr>${photo}<td valign="middle">${_brandLine(l, T.mut)}<div style="font-size:18px; color:${T.ink}; font-weight:800; letter-spacing:-.3px;">${_esc(l.title)}</div>${sub}</td><td valign="middle" align="right" width="118"><div style="font-size:10px; letter-spacing:.6px; text-transform:uppercase; color:${T.mut}; font-weight:700;">Price</div><div style="font-size:23px; font-weight:800; color:${T.price}; letter-spacing:-.6px; margin-top:2px;">${_money(l.lineTotal)}</div></td></tr></tbody></table>${proof}</td></tr>
    </tbody></table>`;
  }).join('\n');
  const totalBox = show.total ? `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:2px;"><tbody><tr><td style="background:${T.accSoft}; border:1px solid #d6e8c9; border-radius:12px; padding:16px 20px;"><table width="100%"><tbody><tr><td valign="middle"><span style="font-size:12px; font-weight:700; letter-spacing:.4px; text-transform:uppercase; color:${T.ink};">Estimated total${_star(m)}</span><div style="font-size:11px; color:${T.mut}; margin-top:2px;">All options combined</div></td><td align="right" valign="middle"><span style="font-size:24px; font-weight:800; color:${T.price};">${_money(total)}</span></td></tr></tbody></table></td></tr></tbody></table>` : '';
  return `<table border="0" cellpadding="0" cellspacing="0" style="font-family:${SANS}; width:600px;"><tbody><tr><td style="padding:8px 6px;">
    ${_wordmark()}
    <div style="font-size:12px; letter-spacing:1.6px; text-transform:uppercase; color:${T.acc}; font-weight:700; margin-top:18px;">${_esc(groupName)}</div>
    <div style="font-size:28px; font-weight:800; color:${T.ink}; letter-spacing:-.6px; margin:7px 0 4px;">${_esc(optionName)}</div>
    <div style="font-size:13px; color:${T.mut}; margin:0 0 22px;">${lines.length} option${lines.length === 1 ? '' : 's'} &middot; priced individually</div>
    ${_msgBlock(m) ? _msgBlock(m) + '<div style="height:18px; line-height:18px; font-size:0;">&nbsp;</div>' : ''}
    ${cards}${totalBox}${_expLine(m)}${_discLine(m)}${show.cta ? _ctaBar('View these options') : ''}${_foot()}
  </td></tr></tbody></table>`;
}

/* ════════════════════════════════════════════════════════════
   TEMPLATE 7 — CORPORATE
   A formal, squared-off letterhead document for corporate orders:
   sharp 90° corners throughout, a thin accent rule across the top,
   a ruled schedule of line items with ink figures (orange held
   back), a right-aligned total block, and a restrained letterhead
   footer. Reads like a statement / quotation, not a marketing card.
════════════════════════════════════════════════════════════ */
function tplCorporate(m) {
  const { groupName, optionName, expiration, lines, total, show } = m;
  const INK = T.ink, MUT = T.mut, LINE = '#d7dace', RULE = '#19240f';
  const cols = (show.images ? 1 : 0) + 1 + 1 + (show.cost ? 1 : 0) + 1;
  const th = (label, w, align) => `<td style="font-family:${SANS}; font-size:10px; letter-spacing:1px; text-transform:uppercase; color:${MUT}; font-weight:700; border-bottom:2px solid ${RULE}; padding:0 0 10px;${w ? ' width:' + w + 'px;' : ''}" align="${align || 'left'}">${label}</td>`;
  const head = `<tr>${show.images ? th('', 62) : ''}${th('Item')}${th('Qty', 50, 'right')}${show.cost ? th('Unit', 78, 'right') : ''}${th('Amount', 92, 'right')}</tr>`;
  const rows = lines.map((l) => {
    const photo = show.images ? `<td valign="top" width="62" style="padding:15px 14px 15px 0;">${_photoPlate(l.img, 54, true)}</td>` : '';
    const sub = l.subtitle ? `<div style="font-size:11px; color:${MUT}; margin-top:3px;">${_esc(l.subtitle)}</div>` : '';
    const unit = show.cost ? `<td valign="top" align="right" style="padding:15px 0; font-size:13px; color:${INK};">${_money(l.unitPrice)}</td>` : '';
    const proof = (show.previews && l.imprint) ? `<tr><td colspan="${cols}" style="padding:0 0 15px ${show.images ? '76px' : '0'};">${_proof(l, false, true)}</td></tr>` : '';
    return `<tr>${photo}<td valign="top" style="padding:15px 14px 15px 0;">${_brandLine(l, MUT)}<div style="font-size:14px; color:${INK}; font-weight:700;">${_esc(l.title)}</div>${sub}</td><td valign="top" align="right" style="padding:15px 0; font-size:13px; color:${INK};">${l.qty}</td>${unit}<td valign="top" align="right" style="padding:15px 0; font-size:14px; font-weight:800; color:${INK};">${_money(l.lineTotal)}</td></tr><tr><td colspan="${cols}" style="border-bottom:1px solid ${LINE}; font-size:0; line-height:0;">&nbsp;</td></tr>${proof}`;
  }).join('');
  const totalsBlock = show.total ? `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:18px;"><tbody><tr><td></td><td width="240"><table width="100%" border="0" cellpadding="0" cellspacing="0"><tbody><tr><td style="border-top:2px solid ${RULE}; padding:12px 0 0; font-size:11px; letter-spacing:1px; text-transform:uppercase; color:${MUT}; font-weight:700;">Estimated total${_star(m)}</td><td align="right" style="border-top:2px solid ${RULE}; padding:12px 0 0; font-size:22px; font-weight:800; color:${INK};">${_money(total)}</td></tr></tbody></table></td></tr></tbody></table>` : '';
  const cta = show.cta ? `<table border="0" cellpadding="0" cellspacing="0" style="margin-top:26px;"><tbody><tr><td style="background:${T.acc};"><a href="{{CART_LINK}}" style="display:inline-block; color:#fff; text-decoration:none; font-family:${SANS}; font-size:14px; font-weight:700; letter-spacing:.4px; padding:14px 38px;">Review this proposal &rsaquo;</a></td></tr></tbody></table>` : '';
  return `<table border="0" cellpadding="0" cellspacing="0" style="font-family:${SANS}; width:600px;"><tbody><tr><td style="border:1px solid ${LINE}; border-top:3px solid ${T.acc};">
    <table width="100%" border="0" cellpadding="0" cellspacing="0"><tbody>
    <tr><td style="padding:26px 30px 0;">
      <table width="100%"><tbody><tr><td valign="middle">${_wordmark()}</td><td valign="middle" align="right"><div style="font-size:11px; letter-spacing:2px; text-transform:uppercase; color:${MUT}; font-weight:700;">Proposal</div>${show.expiration ? `<div style="font-size:11px; color:${MUT}; margin-top:3px;">Valid until ${_esc(expiration)}</div>` : ''}</td></tr></tbody></table>
      <div style="border-top:1px solid ${LINE}; margin-top:18px;"></div>
      <div style="font-size:11px; letter-spacing:1.4px; text-transform:uppercase; color:${T.acc}; font-weight:700; margin-top:20px;">${_esc(groupName)}</div>
      <div style="font-size:24px; font-weight:800; color:${INK}; letter-spacing:-.4px; margin:6px 0 18px;">${_esc(optionName)}</div>
      ${_msgBlock(m) ? _msgBlock(m) + '<div style="height:14px; line-height:14px; font-size:0;">&nbsp;</div>' : ''}
      <table width="100%" border="0" cellpadding="0" cellspacing="0"><tbody>${head}${rows}</tbody></table>
      ${totalsBlock}${_discLine(m, 'right')}${cta}
    </td></tr>
    <tr><td style="padding:24px 30px 22px;"><div style="border-top:1px solid ${LINE}; padding-top:14px;"><span style="font-family:${SANS}; font-size:10px; letter-spacing:1.4px; text-transform:uppercase; color:${T.faint}; font-weight:700;">Golfballs &middot; Corporate Gifting &middot; golfballs.com</span></div></td></tr>
    </tbody></table>
  </td></tr></tbody></table>`;
}

const PROPOSAL_TEMPLATES = [
  { id: 'corporate', name: 'Corporate',     sub: 'Squared letterhead · ruled',      accent: '#339900', build: tplCorporate },
  { id: 'classic',   name: 'Classic',       sub: 'Formal letter · imprint proofs',   accent: '#339900', build: tplClassic },
  { id: 'minimal',   name: 'Minimal',       sub: 'Editorial · borderless',           accent: '#339900', build: tplMinimal },
  { id: 'catalog',   name: 'Catalog cards', sub: 'Header band · proof per card',     accent: '#339900', build: tplCatalog },
  { id: 'separated', name: 'Separated',     sub: 'Detached option cards · per-price', accent: '#339900', build: tplSeparated },
  { id: 'quote',     name: 'Quote',         sub: 'Total panel · imprint chips',      accent: '#339900', build: tplQuote },
  { id: 'lookbook',  name: 'Lookbook',      sub: 'Image-top · proof under each',     accent: '#339900', build: tplLookbook },
];
const tplById = (id) => PROPOSAL_TEMPLATES.find(t => t.id === id) || PROPOSAL_TEMPLATES[0];

/* Full standalone document for the isolated <iframe> preview */
function previewDocument(emailHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
      body { margin: 0; background: #eef0f2; padding: 26px 18px; }
      .page { display: flex; justify-content: center; }
      .sheet { background: #ffffff; padding: 26px; border-radius: 8px; box-shadow: 0 8px 30px rgba(20,20,30,.12); }
    </style></head>
    <body><div class="page"><div class="sheet">${emailHtml}</div></div></body></html>`;
}

/* ════════════════════════════════════════════════════════════
   TEMPLATE THUMBNAIL — a tiny wireframe of each layout
════════════════════════════════════════════════════════════ */
function TemplateThumb({ id, accent }) {
  const bar = (w, c, h) => ({ width: w, height: h || 3, background: c, borderRadius: 1 });
  const G = '#cfd3d8';
  const wrap = { width: 46, height: 36, flexShrink: 0, borderRadius: 4, background: '#fff', border: '1px solid #e1e4e8', padding: 4, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' };
  if (id === 'classic') {
    return <div style={{ ...wrap, border: `1.5px solid ${G}`, alignItems: 'center' }}>
      <div style={{ ...bar(20, accent), marginTop: 1 }} /><div style={bar(26, '#e3e6ea', 2)} />
      <div style={{ display: 'flex', gap: 2, width: '100%', marginTop: 1 }}><div style={bar(10, G, 8)} /><div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><div style={bar('100%', '#e3e6ea', 2)} /><div style={bar('70%', '#eceef1', 2)} /></div></div>
    </div>;
  }
  if (id === 'minimal') {
    return <div style={{ ...wrap, gap: 3 }}>
      <div style={bar(8, accent, 2)} /><div style={bar(24, '#2b2f36', 4)} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}><div style={bar(20, '#e3e6ea', 2)} /><div style={bar(8, accent, 2)} /></div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={bar(18, '#e3e6ea', 2)} /><div style={bar(8, '#e3e6ea', 2)} /></div>
      <div style={{ ...bar('100%', '#2b2f36', 5), marginTop: 'auto' }} />
    </div>;
  }
  if (id === 'catalog') {
    return <div style={{ ...wrap, padding: 0 }}>
      <div style={{ ...bar('100%', accent, 9), borderRadius: '3px 3px 0 0' }} />
      <div style={{ padding: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', gap: 2, alignItems: 'center', border: `1px solid ${G}`, borderRadius: 2, padding: 1 }}><div style={bar(7, G, 7)} /><div style={bar(14, '#e3e6ea', 2)} /><div style={{ ...bar(6, accent, 4), marginLeft: 'auto' }} /></div>
        <div style={{ display: 'flex', gap: 2, alignItems: 'center', border: `1px solid ${G}`, borderRadius: 2, padding: 1 }}><div style={bar(7, G, 7)} /><div style={bar(14, '#e3e6ea', 2)} /><div style={{ ...bar(6, accent, 4), marginLeft: 'auto' }} /></div>
      </div>
    </div>;
  }
  if (id === 'quote') {
    return <div style={{ ...wrap, gap: 3 }}>
      <div style={{ ...bar('100%', accent, 14), borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 2, boxSizing: 'border-box' }}><div style={bar(11, 'rgba(255,255,255,.8)', 6)} /></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 1 }}><div style={bar(18, '#e3e6ea', 2)} /><div style={bar(7, '#ff6600', 2)} /></div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={bar(16, '#e3e6ea', 2)} /><div style={bar(7, '#ff6600', 2)} /></div>
    </div>;
  }
  if (id === 'lookbook') {
    return <div style={{ ...wrap, alignItems: 'center', gap: 2 }}>
      <div style={{ width: 9, height: 2, background: accent, borderRadius: 1, marginTop: 1 }} />
      <div style={{ width: '100%', border: `1px solid ${G}`, borderRadius: 2, padding: 2, display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center', boxSizing: 'border-box' }}>
        <div style={bar(16, G, 9)} />
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}><div style={bar(12, '#e3e6ea', 2)} /><div style={bar(6, '#ff6600', 2)} /></div>
      </div>
      <div style={{ ...bar('100%', accent, 3), marginTop: 'auto' }} />
    </div>;
  }
  if (id === 'separated') {
    return <div style={{ ...wrap, gap: 3, justifyContent: 'center' }}>
      <div style={{ width: '100%', border: `1px solid ${G}`, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eef3ea', padding: '1px 2px' }}><div style={bar(6, accent, 2)} /><div style={bar(4, G, 2)} /></div>
        <div style={{ display: 'flex', gap: 2, alignItems: 'center', padding: 2 }}><div style={bar(7, G, 7)} /><div style={bar(12, '#e3e6ea', 2)} /><div style={{ ...bar(7, '#ff6600', 4), marginLeft: 'auto' }} /></div>
      </div>
      <div style={{ width: '100%', border: `1px solid ${G}`, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eef3ea', padding: '1px 2px' }}><div style={bar(6, accent, 2)} /><div style={bar(4, G, 2)} /></div>
        <div style={{ display: 'flex', gap: 2, alignItems: 'center', padding: 2 }}><div style={bar(7, G, 7)} /><div style={bar(12, '#e3e6ea', 2)} /><div style={{ ...bar(7, '#ff6600', 4), marginLeft: 'auto' }} /></div>
      </div>
    </div>;
  }
  if (id === 'corporate') {
    return <div style={{ ...wrap, borderRadius: 0, border: `1px solid ${G}`, borderTop: `2px solid ${accent}`, gap: 2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ ...bar(15, '#2b2f36', 3), borderRadius: 0 }} /><div style={{ ...bar(7, G, 2), borderRadius: 0 }} /></div>
      <div style={{ borderTop: `1px solid ${G}`, marginTop: 1 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${G}`, paddingBottom: 1, marginTop: 1 }}><div style={{ ...bar(16, '#e3e6ea', 2), borderRadius: 0 }} /><div style={{ ...bar(9, '#2b2f36', 2), borderRadius: 0 }} /></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ ...bar(13, '#e3e6ea', 2), borderRadius: 0 }} /><div style={{ ...bar(9, '#2b2f36', 2), borderRadius: 0 }} /></div>
    </div>;
  }
  // minimal (fallback)
  return <div style={{ ...wrap, gap: 3 }}>
    <div style={bar(8, accent, 2)} /><div style={bar(24, '#2b2f36', 4)} />
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}><div style={bar(20, '#e3e6ea', 2)} /><div style={bar(8, accent, 2)} /></div>
    <div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={bar(18, '#e3e6ea', 2)} /><div style={bar(8, '#e3e6ea', 2)} /></div>
    <div style={{ ...bar('100%', accent, 5), marginTop: 'auto' }} />
  </div>;
}

/* ════════════════════════════════════════════════════════════
   CONFIG CONTROLS
════════════════════════════════════════════════════════════ */
function EmailField({ label, value, onChange, placeholder, mono, area, half }) {
  const [focus, setFocus] = useStateE(false);
  const common = {
    width: '100%', boxSizing: 'border-box', padding: area ? '8px 10px' : '0 10px', height: area ? 'auto' : 32,
    background: 'var(--gb-fill-inverse-medium)', borderRadius: 'var(--gb-r-sm)',
    border: '1px solid ' + (focus ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'),
    boxShadow: focus ? 'var(--gb-focus-ring)' : 'none', outline: 'none',
    color: 'var(--gb-text-primary)', fontFamily: mono ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)',
    fontSize: 12.5, fontWeight: 500, transition: 'all var(--gb-anim)', resize: 'vertical',
  };
  return (
    <div style={{ flex: half ? 1 : 'none', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-text-muted)' }}>{label}</label>
      {area
        ? <textarea rows={3} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} style={common} />
        : <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} style={common} />}
    </div>
  );
}

function OptionToggle({ checked, label, hint, onClick }) {
  const [hover, setHover] = useStateE(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 'var(--gb-r-md)', cursor: 'pointer',
        background: checked ? 'var(--gb-brand-tint-soft)' : hover ? 'var(--gb-fill-subtle)' : 'transparent',
        border: '1px solid ' + (checked ? 'var(--gb-brand-tint-border)' : 'transparent'),
        transition: 'all var(--gb-anim)',
      }}>
      <div style={{
        width: 17, height: 17, flexShrink: 0, marginTop: 1, borderRadius: 5,
        background: checked ? 'var(--gb-brand-label)' : 'var(--gb-fill-inverse-strong)',
        border: '1px solid ' + (checked ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'),
        color: 'var(--gb-surface-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all var(--gb-anim)',
      }}>{checked && <IE.check size={11} strokeWidth={3} />}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-text-primary)' }}>{label}</div>
        {hint && <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1, lineHeight: 1.4 }}>{hint}</div>}
      </div>
    </div>
  );
}

function TemplateCard({ tpl, on, onClick }) {
  const [hover, setHover] = useStateE(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: 'var(--gb-r-md)', cursor: 'pointer',
        background: on ? 'var(--gb-brand-tint-medium)' : hover ? 'var(--gb-fill-subtle)' : 'var(--gb-fill-inverse-medium)',
        border: '1px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'),
        transition: 'all var(--gb-anim)',
      }}>
      <TemplateThumb id={tpl.id} accent={tpl.accent} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{tpl.name}</div>
        <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tpl.sub}</div>
      </div>
      {on && <IE.check size={14} style={{ color: 'var(--gb-brand-label)', flexShrink: 0 }} />}
    </div>
  );
}

function ConfigGroup({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-muted)', marginBottom: 9 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>{children}</div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   THE COMPOSER — embeddable body + footer (fills its parent).
   Used both inline (inside the saved-detail view, replacing the
   margin breakdown) and wrapped in a modal shell elsewhere.
════════════════════════════════════════════════════════════ */
function ProposalEmailComposer({ source, onBack, backLabel }) {
  const [groupName, setGroupName] = useStateE(source.groupName || 'Your Custom Order');
  const [optionName, setOptionName] = useStateE(source.optionName || 'Option 1');
  const [contactName, setContactName] = useStateE(source.contactName || '');
  const [contactEmail, setContactEmail] = useStateE(source.contactEmail || '');
  const [emailCC, setEmailCC] = useStateE('');
  const [message, setMessage] = useStateE('');
  const [expiration, setExpiration] = useStateE(() => {
    const d = new Date(); d.setDate(d.getDate() + 14);
    return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
  });
  const [templateId, setTemplateId] = useStateE('classic');
  const [show, setShow] = useStateE({ images: true, previews: true, cost: true, total: true, expiration: true, disclaimer: true, cta: true, message: false });
  const [copied, setCopied] = useStateE(false);
  const [sent, setSent] = useStateE(false);
  const [showPayload, setShowPayload] = useStateE(false);

  const toggle = (k) => setShow((s) => ({ ...s, [k]: !s[k] }));
  const tpl = tplById(templateId);

  const model = useMemoE(() => ({
    groupName, optionName, expiration, message, lines: source.lines, total: source.total, show,
  }), [groupName, optionName, expiration, message, source.lines, source.total, show]);

  const emailHtml = useMemoE(() => tpl.build(model), [tpl, model]);
  const doc = useMemoE(() => previewDocument(emailHtml), [emailHtml]);

  const payload = useMemoE(() => ({
    ProposalGroupName: groupName,
    ContactName: contactName, ContactEmail: contactEmail, EmailCC: emailCC,
    ProposalMessage: show.message ? message : '',
    ProposalNames: [optionName], ProposalExpirations: [expiration],
    Template: templateId, Display: Object.keys(show).filter(k => show[k]),
  }), [groupName, contactName, contactEmail, emailCC, message, optionName, expiration, show, templateId]);

  const copyHtml = async () => {
    try { await navigator.clipboard.writeText(emailHtml); } catch (e) { /* no-op */ }
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  };
  const doSend = () => { setSent(true); setTimeout(() => setSent(false), 2600); };
  const recipientReady = contactEmail.trim().length > 3;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', animation: 'cm-fade .22s ease' }}>
      {/* body: config | preview */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div className="gl-rail" style={{ width: 340, flexShrink: 0, borderRight: '1px solid var(--gb-border-subtle)', overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <ConfigGroup title="Template">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {PROPOSAL_TEMPLATES.map((t) => <TemplateCard key={t.id} tpl={t} on={templateId === t.id} onClick={() => setTemplateId(t.id)} />)}
            </div>
          </ConfigGroup>

          <ConfigGroup title="Recipient">
            <div style={{ display: 'flex', gap: 8 }}>
              <EmailField half label="Contact name" value={contactName} onChange={setContactName} placeholder="Jane Buyer" />
              <EmailField half label="Contact email" value={contactEmail} onChange={setContactEmail} placeholder="jane@acme.com" mono />
            </div>
            <EmailField label="CC (optional)" value={emailCC} onChange={setEmailCC} placeholder="rep@golfballs.com" mono />
            <EmailField label="Personal message" value={message} onChange={setMessage} placeholder="Add a short note above the items…" area />
          </ConfigGroup>

          <ConfigGroup title="Proposal">
            <EmailField label="Header (group name)" value={groupName} onChange={setGroupName} placeholder="Your Custom Order" />
            <div style={{ display: 'flex', gap: 8 }}>
              <EmailField half label="Option name" value={optionName} onChange={setOptionName} placeholder="Mint Containers" />
              <EmailField half label="Expires" value={expiration} onChange={setExpiration} placeholder="7/20/2026" mono />
            </div>
          </ConfigGroup>

          <ConfigGroup title="Display options">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <OptionToggle checked={show.images} label="Product images" onClick={() => toggle('images')} />
              <OptionToggle checked={show.previews} label="Imprint proofs" hint="Show how each logo / personalization is applied" onClick={() => toggle('previews')} />
              <OptionToggle checked={show.cost} label="Unit cost / qty detail" onClick={() => toggle('cost')} />
              <OptionToggle checked={show.total} label="Estimated total" hint="Uncheck to hide the subtotal" onClick={() => toggle('total')} />
              <OptionToggle checked={show.expiration} label="Expiration date" onClick={() => toggle('expiration')} />
              <OptionToggle checked={show.disclaimer} label="Shipping &amp; tax disclaimer" onClick={() => toggle('disclaimer')} />
              <OptionToggle checked={show.cta} label="“View this option” button" hint="Links to the cart — added server-side" onClick={() => toggle('cta')} />
              <OptionToggle checked={show.message} label="Show personal message" onClick={() => toggle('message')} />
            </div>
          </ConfigGroup>

          <div>
            <div onClick={() => setShowPayload((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', padding: '4px 0' }}>
              <IE.chevr size={12} style={{ color: 'var(--gb-text-muted)', transform: showPayload ? 'rotate(90deg)' : 'none', transition: 'transform var(--gb-anim)' }} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Request payload</span>
            </div>
            {showPayload && (
              <pre style={{ margin: '8px 0 0', padding: 11, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-surface-deep)', border: '1px solid var(--gb-border-subtle)', color: 'var(--gb-text-tertiary)', fontFamily: 'var(--gb-font-mono)', fontSize: 10.5, lineHeight: 1.5, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(payload, null, 2)}</pre>
            )}
          </div>
        </div>

        {/* preview column */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--gb-surface-deep)' }}>
          <div className="gl-subbar" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
            <IE.eye size={13} style={{ color: 'var(--gb-text-muted)' }} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>Live email preview</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 999, background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: tpl.accent }} />
              <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--gb-text-secondary)' }}>{tpl.name}</span>
            </span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>600px · HTML</span>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <iframe title="proposal-preview" srcDoc={doc} style={{ width: '100%', height: '100%', border: 'none', background: '#eef0f2' }} />
          </div>
        </div>
      </div>

      {/* footer */}
      <div className="gl-chrome" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gb-fill-inverse-strong)', borderTop: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
        {onBack && <BtnE variant="ghost" size="md" icon={<IE.chevr style={{ transform: 'rotate(180deg)' }} />} onClick={onBack}>{backLabel || 'Back'}</BtnE>}
        <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <IE.alert size={12} /> Cart link <code style={{ fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-tertiary)' }}>{'{{CART_LINK}}'}</code> added server-side at send.
        </span>
        <div style={{ flex: 1 }} />
        <BtnE variant="ghost" size="md" icon={copied ? <IE.check /> : <IE.copy />} onClick={copyHtml}>{copied ? 'Copied' : 'Copy HTML'}</BtnE>
        <BtnE variant="primary" size="md" icon={sent ? <IE.check /> : <IE.send />} disabled={!recipientReady && !sent} onClick={doSend}>
          {sent ? 'Queued to send' : recipientReady ? 'Generate & send' : 'Add recipient to send'}
        </BtnE>
      </div>
    </div>
  );
}

/* Modal wrapper — used by the Apply-proposal entry point */
function ProposalEmailModal({ source, onClose }) {
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="gl-backdrop"
      style={{ position: 'fixed', inset: 0, zIndex: 999995, padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(20,16,8,.34)' }}>
      <div className="gl-shell" style={{
        width: 'min(1060px, 96vw)', height: 'min(760px, 94vh)', display: 'flex', flexDirection: 'column',
        background: 'var(--gb-surface-canvas)', border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-xl)', overflow: 'hidden', boxShadow: 'var(--gb-shadow-modal)',
        animation: 'cm-slide .26s cubic-bezier(.34,1.4,.64,1)',
      }}>
        <div className="gl-chrome" style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 11, background: 'var(--gb-fill-inverse-strong)', borderBottom: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: 'var(--gb-r-md)', flexShrink: 0, background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IE.mail size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -.1 }}>Generate proposal email</div>
            <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 1 }}>{source.lines.length} items · {_money(source.total)} · HTML built locally, cart link added on send</div>
          </div>
          <IconBtnE size="sm" icon={<IE.close />} onClick={onClose} />
        </div>
        <ProposalEmailComposer source={source} />
      </div>
    </div>
  );
}

export { ProposalEmailComposer, ProposalEmailModal };
