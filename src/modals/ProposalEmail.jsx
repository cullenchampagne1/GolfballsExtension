import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Btn, IconBtn, Input, Textarea, Checkbox, Spinner, useTransientFlag } from '../ui/index.js';
import { I } from '../ui/icons.jsx';
import { EmailHtmlView } from '../ui/components/EmailHtmlView.jsx';
import { GolfballViewer } from './GolfballViewer.jsx';
import { linesToShots } from '../lib/proposalSnapshots.js';

/* ─────────────────────────────────────────────────────────────
   Proposal HTML composer — generate customer-facing proposal HTML
   from a proposal draft, preview it live, and copy it. Each template
   is a fully different email layout. The cart "View this option" link
   is left as a {{CART_LINK}} placeholder. (Recipient / send removed —
   this is copy-only; the rep pastes the HTML wherever they need it.)
───────────────────────────────────────────────────────────── */

const _esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const _money = (n) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const _brandLine = (l, color) => l.brand ? `<div style="font-size: 11px; letter-spacing: .6px; text-transform: uppercase; color: ${color};">${_esc(l.brand)}</div>` : '';
const _hasPrev = (l) => !!(l && l.previews && l.previews.length);

/* ════════════════════════════════════════════════════════════
   SHARED EMAIL DESIGN SYSTEM — one palette + email-safe (table /
   inline-style) building blocks shared by every template, so they
   read as one considered family. The headline block is the IMPRINT
   PROOF: a designed card that shows how each item's personalization
   is applied — the real 3D render we snapshot when available, else
   a colour chip — alongside the spec (type · colour · method).
════════════════════════════════════════════════════════════ */
const T = {
  acc: '#339900', accDeep: '#236b00', accSoft: '#eef6e7',
  ink: '#19240f', body: '#454d41', mut: '#7c857a', faint: '#aab0a2',
  line: '#e7e9e1', plate: '#f6f7f1', card: '#ffffff',
  price: '#19240f', priceSoft: '#fff1e6',
};
const SANS = '&quot;Helvetica Neue&quot;, Helvetica, Arial, sans-serif';
const _LIGHT_IMPRINT = { White: 1, Silver: 1, Gold: 1 };

const _msgBlock = (m, align) => (m.show.message && m.message)
  ? `<p style="color:${T.body}; font-size:14px; line-height:1.6; margin:0 0 4px;${align ? ' text-align:' + align + ';' : ''}">${_esc(m.message).replace(/\n/g, '<br/>')}</p>` : '';
const _swatch = (hex, light) => `<span style="display:inline-block; width:10px; height:10px; border-radius:3px; background:${hex};${light ? ' border:1px solid #cfcfc8;' : ''} vertical-align:middle;"></span>`;
const _star = (m) => m.show.disclaimer ? '*' : '';
// Per-line pricing carries NO strikethrough or "was" price — Outlook's paste
// strips both, and the savings now read as their own line in the totals (see
// _discRow / _savingsRows). Each line shows just its current price.
const _qtyLine = (l, show) => {
  if (l.free) return `${show.cost ? `${l.qty} &times; ${_money(l.unitPrice)} &middot; ` : `Qty ${l.qty} &middot; `}<strong>FREE</strong>`;
  if (!show.cost) return `Qty ${l.qty}`;
  return `${l.qty} &times; ${_money(l.unitPrice)}`;
};
// Line-total cell: a free promo line just reads "FREE" (bold word, survives
// Outlook paste); everything else is its total.
const _ltot = (l) => l.free ? `<strong>FREE</strong>` : _money(l.lineTotal);
// Total retail savings across the quote (how far the quoted prices sit below
// retail/MSRP), shown as ONE discount line instead of per-item strikethroughs.
const _retailSavings = (m) => Math.round((m.lines || []).reduce((s, l) => s + (!l.free && l.origTotal && l.origTotal > l.lineTotal ? l.origTotal - l.lineTotal : 0), 0) * 100) / 100;
// The Subtotal / savings / Promotion rows that precede the final total — returned
// as raw <tr>s so they drop straight into a template's schedule table OR a
// standalone wrapper (see _discRow). All money is dark text (no color reliance).
const _savingsTrs = (m, span = 1) => {
  const save = _retailSavings(m);
  const coupon = m.discount > 0 ? m.discount : 0;
  if (save <= 0 && coupon <= 0) return '';
  // Plain reference row (Retail value / Subtotal).
  const row = (label, val) => `<tr><td colspan="${span}" style="padding:4px 0; font-size:13px; color:${T.ink};">${label}</td><td align="right" style="padding:4px 0; font-size:14px; font-weight:700; color:${T.ink};">${_money(val)}</td></tr>`;
  // Savings rows get a green highlight band so the discount visibly pops (the bg
  // survives Outlook where text color won't).
  const HL = '#dcf0c9';
  const save_row = (label, val) => `<tr><td colspan="${span}" bgcolor="${HL}" style="background:${HL}; padding:7px 10px; font-size:13px; font-weight:700; color:#234d12;">${label}</td><td align="right" bgcolor="${HL}" style="background:${HL}; padding:7px 10px; font-size:14px; font-weight:800; color:#234d12;">&minus;${_money(val)}</td></tr>`;
  let out = save > 0 ? row('Retail value', Math.round((m.total + save) * 100) / 100) + save_row('Volume savings', save) : row('Subtotal', m.total);
  if (coupon > 0) out += save_row(`Promotion${m.promoCode ? ` (${_esc(m.promoCode)})` : ''}`, coupon);
  return out;
};
// Standalone version (its own table) for templates that don't fold the rows into
// an existing schedule table.
const _discRow = (m) => {
  const trs = _savingsTrs(m, 1);
  return trs ? `<table border="0" cellpadding="0" cellspacing="0" width="100%"><tbody>${trs}</tbody></table>` : '';
};

// No-imprint-color default: a light brand-green wash. SOLID hex (not rgba) so
// Outlook's Word engine renders it — and a #d-range green (not near-white) so the
// in-app EmailHtmlView keeps the tint instead of normalizing it to transparent.
const _NOCOLOR_BG = '#d4edc0';
const _NOCOLOR_BD = '#b9dd9e';
/* synthetic imprint chip — fallback visual when there's no 3D render yet */
function _chip(imp, size, square) {
  const noColor = !imp.colorHex;
  const light = _LIGHT_IMPRINT[imp.color] || noColor;   // green wash reads as a light chip
  const bg = imp.colorHex || _NOCOLOR_BG;
  const fg = noColor ? '#236b00' : (_LIGHT_IMPRINT[imp.color] ? '#1f2937' : '#ffffff');
  const label = imp.text ? (imp.text.split(' · ')[0] || '') : 'LOGO';
  const fs = imp.text ? Math.max(8, Math.round(size * 0.15)) : Math.round(size * 0.17);
  const bd = light ? (noColor ? '#cfe3c0' : '#d6d6cf') : null;
  return `<table border="0" cellpadding="0" cellspacing="0" width="${size}" height="${size}" style="width:${size}px; height:${size}px; background:${bg}; border-radius:${square ? 0 : Math.round(size * 0.22)}px;${bd ? ` border:1px solid ${bd};` : ''}"><tbody><tr><td align="center" valign="middle" style="text-align:center; padding:4px;"><span style="font-family:${SANS}; font-size:${fs}px; font-weight:800; letter-spacing:.5px; color:${fg}; line-height:1.12;">${_esc(label).slice(0, 16)}</span></td></tr></tbody></table>`;
}
// Light green wash for the imprint-preview surfaces — fixed (not theme-dependent)
// so the render reads on a green tint. SOLID hex (Outlook drops rgba) + #d-range
// (so EmailHtmlView keeps it but still re-themes the text inside). Slightly
// deeper than the card so a tile reads on the card.
const _PREVIEW_BG = '#cbe8b4';
const _PREVIEW_BD = '#aed694';
/* a real 3D-render tile (transparent PNG on a green wash). bgcolor mirrors the
   style background so Outlook (which prefers the attribute) fills the cell. */
function _renderTile(src, size, square) {
  // Borderless, zoom-to-fill image — BUT kept inside its own fixed-width table so
  // the deep nesting in _proof can't negotiate the image column down to nothing
  // (a bare <img> got squished there, which is why only Quote's flatter layout
  // showed the mockups).
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="${size}" style="width:${size}px;"><tbody><tr><td width="${size}" height="${size}" style="padding:0; font-size:0; line-height:0;"><img src="${_esc(src)}" width="${size}" height="${size}" border="0" alt="preview" style="display:block; width:${size}px; height:${size}px; object-fit:cover; border-radius:${square ? 0 : Math.round(size * 0.18)}px;" /></td></tr></tbody></table>`;
}
/* product photo — borderless, fills its box (zoom-to-fill via object-fit:cover),
   in a fixed-width table so it holds its size in any column. */
function _photoPlate(img, plate, square) {
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="${plate}" style="width:${plate}px;"><tbody><tr><td width="${plate}" height="${plate}" style="padding:0; font-size:0; line-height:0;"><img src="${_esc(img)}" width="${plate}" height="${plate}" border="0" style="display:block; width:${plate}px; height:${plate}px; object-fit:cover; border-radius:${square ? 0 : 8}px;" /></td></tr></tbody></table>`;
}
/* the imprint PROOF visual cell — real render(s) when we have them (Front +
   Reverse for dual-pole), else the synthetic chip. */
function _proofVisual(l, imp, size, square) {
  const imgs = (l && l.previews) || [];
  if (imgs.length >= 2) {
    const s = Math.round(size * 0.92);
    return `<td valign="middle" style="padding-right:14px;"><table border="0" cellpadding="0" cellspacing="0"><tbody><tr>${imgs.slice(0, 2).map((src, i) => `<td valign="middle" style="padding-right:${i ? 0 : 7}px;">${_renderTile(src, s, square)}</td>`).join('')}</tr></tbody></table></td>`;
  }
  if (imgs.length === 1) return `<td valign="middle" width="${size}" style="padding-right:14px;">${_renderTile(imgs[0], size, square)}</td>`;
  return imp ? `<td valign="middle" width="${size}" style="padding-right:14px;">${_chip(imp, size, square)}</td>` : '';
}
/* the imprint PROOF card — the centrepiece the templates are built around.
   `square` drops the rounded corners (for the squared Corporate letterhead). */
function _proof(l, withPhoto, square) {
  const imp = l.imprint;
  const imgs = (l && l.previews) || [];
  if (!imp && !imgs.length) return '';
  const typeLabel = (imp && imp.typeLabel) || 'Personalization';
  const light = imp && _LIGHT_IMPRINT[imp.color];
  const colorRow = (imp && imp.color)
    ? `<div style="font-size:11px; line-height:1.5; color:${T.mut}; padding-top:5px; white-space:nowrap;">${_swatch(imp.colorHex || '#98c379', light)} <span style="vertical-align:middle;">${_esc(imp.color)}</span></div>` : '';
  // Per-pole detail line(s) — never wrap (truncated upstream + ellipsis here).
  const detail = (imp && imp.detailLines && imp.detailLines.length)
    ? imp.detailLines.map((d) => `<div style="font-size:11px; line-height:1.5; color:${T.mut}; padding-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:300px;">${_esc(d)}</div>`).join('')
    : '';
  const photoCell = withPhoto ? `<td valign="middle" width="60" style="padding-right:12px;">${_photoPlate(l.img, 60, square)}</td>` : '';
  const visual = _proofVisual(l, imp, 48, square);
  // One compact row — image on the left, the spec info on the right, on the green
  // plate. No "Imprint preview" title (it just added height), and the info cell
  // flexes to fill the row width so it lines up with the schedule above it.
  return `<table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#d4edc0" style="border:1px solid #b9dd9e; border-radius:${square ? 0 : 12}px; background:#d4edc0; margin-top:10px;"><tbody>
    <tr><td style="padding:10px 14px;"><table border="0" cellpadding="0" cellspacing="0" width="100%"><tbody><tr>${photoCell}${visual}<td valign="middle" width="100%"><div style="font-size:12px; line-height:1.4; font-weight:700; color:${T.ink};">${_esc(typeLabel)}</div>${colorRow}${detail}</td></tr></tbody></table></td></tr>
  </tbody></table>`;
}

// Bulletproof buttons: the BACKGROUND lives on the <td> (with a bgcolor attr) —
// Outlook's Word engine ignores background on an inline <a>, so a button styled
// on the <a> renders as bare text. The <a> keeps only color/font + padding.
// Vertical spacer that Outlook's Word engine actually honours (it ignores
// margin between block tables, collapsing cards/sections together). font-size:0
// + mso-line-height-rule:exactly pins the exact height across clients. Use this
// in place of margin-top/margin-bottom for gaps between blocks.
const _vspace = (h) => `<div style="height:${h}px; line-height:${h}px; font-size:0; mso-line-height-rule:exactly;">&nbsp;</div>`;
// CTA = the golfballs "View This Option" button IMAGE (the same asset their own
// proposal emails use). Rounded corners are baked into the PNG, so they survive
// Outlook intact — a CSS border-radius button squares off on paste. High-
// contrast green/white, fixed 214×42, centered, with space above and below.
const _CTA_IMG = 'https://d1tp32r8b76g0z.cloudfront.net/images/gbc2/templateMailers/cta-view-this-option@2x.png';
const _cta = () => `${_vspace(24)}<table border="0" cellpadding="0" cellspacing="0" width="100%"><tbody><tr><td align="center"><a href="{{CART_LINK}}" style="text-decoration:none;"><img src="${_CTA_IMG}" width="214" height="42" alt="View This Option" style="display:inline-block; border:0; outline:none; text-decoration:none;" /></a></td></tr></tbody></table>${_vspace(20)}`;
const _ctaBtn = (_label, _pill) => _cta();
const _ctaBar = (_label) => _cta();
// Top-left logo (the GBC corporate signature mark, a public CloudFront asset so
// it loads directly in Outlook). Always left-aligned per request.
const _LOGO = 'https://d1tp32r8b76g0z.cloudfront.net/images/gbc-2021/email-signature/GBC2021Corporate_GrayDept.png';
const _logoImg = (disp) => `<img src="${_LOGO}" width="180" height="40" alt="Golfballs Corporate" style="display:${disp}; border:0; outline:none; text-decoration:none;" />`;
// align: 'center' centers the logo (text-align on a div + inline-block img, which
// Outlook honours); anything else is a left-aligned block.
const _wordmark = (align) => align === 'center' ? `<div style="text-align:center;">${_logoImg('inline-block')}</div>`
  : align === 'right' ? _logoImg('inline-block')   // parent <td align="right"> right-aligns it
  : _logoImg('block');
// Footer wordmark/tagline removed per design — proposals carry the header
// branding only, no bottom "Golfballs · Corporate Gifting" strip.
const _foot = () => '';
const _expLine = (m, align) => m.show.expiration ? `<p style="font-family:${SANS}; font-size:13px; color:${T.mut}; margin:18px 0 0;${align ? ' text-align:' + align + ';' : ''}">This proposal expires on <strong style="color:${T.ink};">${_esc(m.expiration)}</strong></p>` : '';
const _discLine = (m, align) => m.show.disclaimer ? `<p style="font-family:${SANS}; font-style:italic; font-size:12px; color:${T.faint}; margin:5px 0 0;${align ? ' text-align:' + align + ';' : ''}">*shipping &amp; sales tax are calculated in the shopping cart</p>` : '';

/* Wrap a built template (a bare 600px <table>) in a full email document that
   Outlook DESKTOP (Word engine) renders correctly. Bare table fragments paste/
   send without a width constraint or centering, and Word needs the MSO scaffold
   to size the page. This is applied ONLY to the copied / sent HTML — the in-app
   preview keeps rendering the bare fragment.
     • DOCTYPE + xmlns:v/o so Word enters the right rendering mode.
     • OfficeDocumentSettings PixelsPerInch:96 → stops Outlook upscaling the
       whole email ~120% (the classic "everything is huge / overflows" bug).
     • An [if mso] ghost table pins the body to 600px and centers it (Word
       ignores max-width / margin:auto), while non-Outlook clients use <center>.
     • A head <style> with the standard resets (collapse, no table spacing,
       image rendering) Word honours. */
function wrapEmailDocument(inner) {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<meta name="x-apple-disable-message-reformatting"/>
<title>Proposal</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<style>
  html,body{margin:0 !important;padding:0 !important;background:#ffffff;}
  *{-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;}
  img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none;}
  a{text-decoration:none;}
</style>
</head>
<body style="margin:0;padding:0;background:#ffffff;">
<!--[if mso]><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" align="left"><tr><td width="600"><![endif]-->
${inner}
<!--[if mso]></td></tr></table><![endif]-->
</body>
</html>`;
}

/* ── TEMPLATE 1 — CLASSIC ── */
function tplClassic(m) {
  const { groupName, optionName, lines, total, show } = m;
  const rows = lines.map((l, i) => {
    const photo = show.images ? `<td width="66" valign="top" style="padding-right:14px;">${_photoPlate(l.img, 66)}</td>` : '';
    const sub = l.subtitle ? `<div style="font-size:12px; color:${T.mut}; margin-top:3px;">${_esc(l.subtitle)}</div>` : '';
    const proof = show.previews ? _proof(l, false) : '';
    return `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="${i ? `border-top:1px solid ${T.line};` : ''}"><tbody><tr><td style="padding:16px 0;"><table border="0" cellpadding="0" cellspacing="0" width="100%"><tbody><tr>${photo}<td valign="top">${_brandLine(l, T.mut)}<div style="font-size:15px; color:${T.ink}; font-weight:700;">${_esc(l.title)}</div>${sub}<div style="font-size:11px; color:${T.mut}; margin-top:4px;">${_qtyLine(l, show)}</div></td><td valign="top" align="right" width="92"><span style="font-size:16px; font-weight:800; color:${T.price};">${_ltot(l)}</span></td></tr></tbody></table>${proof}</td></tr></tbody></table>`;
  }).join('\n');
  const totalRow = show.total ? `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top:2px solid ${T.ink}; margin-top:4px;"><tbody><tr><td style="padding:16px 0;"><span style="font-size:13px; font-weight:700; letter-spacing:.4px; text-transform:uppercase; color:${T.ink};">Estimated total${_star(m)}</span></td><td align="right" style="padding:16px 0;"><span style="font-size:23px; font-weight:800; color:${T.price};">${_money(total - (m.discount || 0))}</span></td></tr></tbody></table>` : '';
  return `<table border="0" cellpadding="0" cellspacing="0" style="font-family:${SANS}; width:600px;"><tbody><tr><td style="border:1px solid #e0e0d6; border-radius:14px; padding:30px 30px 26px;">
    ${_wordmark('center')}
    <div style="height:16px; line-height:16px; font-size:0;">&nbsp;</div>
    <div align="center" style="font-size:11px; letter-spacing:1.6px; text-transform:uppercase; color:${T.ink}; font-weight:700;">${_esc(groupName)}</div>
    <div align="center" style="font-size:25px; font-weight:800; color:${T.ink}; letter-spacing:-.5px; margin:6px 0 16px;">${_esc(optionName)}</div>
    ${_msgBlock(m)}
    <div style="height:6px; line-height:6px; font-size:0;">&nbsp;</div>
    ${rows}${_discRow(m)}${totalRow}${_expLine(m, 'right')}${_discLine(m, 'right')}${show.cta ? _ctaBtn('View this option &rsaquo;', false) : ''}${_foot()}
  </td></tr></tbody></table>`;
}

/* ── TEMPLATE 3 — CATALOG CARDS — header band, preview per card ── */
function tplCatalog(m) {
  const { groupName, optionName, lines, total, show } = m;
  const cards = lines.map((l) => {
    const photo = show.images ? `<td width="116" valign="top" style="padding:16px 0 16px 16px;">${_photoPlate(l.img, 100)}</td>` : '';
    const sub = l.subtitle ? `<div style="font-size:12px; color:${T.mut}; margin-top:4px;">${_esc(l.subtitle)}</div>` : '';
    const qtyLine = show.cost ? `Qty ${l.qty} &nbsp;&middot;&nbsp; ${_money(l.unitPrice)} ea` : `Qty ${l.qty}`;
    const proof = (show.previews && (l.imprint || _hasPrev(l))) ? `<tr><td colspan="${show.images ? 3 : 2}" style="padding:0 16px 16px;">${_proof(l, false)}</td></tr>` : '';
    return `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ${T.line}; border-radius:12px;"><tbody><tr>${photo}<td valign="middle" style="padding:16px ${show.images ? '14px' : '16px'};">${_brandLine(l, T.mut)}<div style="font-size:16px; color:${T.ink}; font-weight:700; margin-top:2px;">${_esc(l.title)}</div>${sub}<div style="font-size:12px; color:${T.mut}; margin-top:8px;">${qtyLine}</div></td><td width="112" valign="middle" align="right" style="padding:16px;"><span style="display:inline-block; background:${T.priceSoft}; color:${T.price}; font-size:15px; font-weight:800; padding:7px 13px; border-radius:8px;">${_ltot(l)}</span></td></tr>${proof}</tbody></table>`;
  }).join(_vspace(13));
  const totalBox = show.total ? `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:4px;"><tbody><tr><td bgcolor="${T.accSoft}" style="background:${T.accSoft}; border-left:4px solid ${T.acc}; border-radius:8px; padding:16px 18px;"><table width="100%"><tbody><tr><td valign="middle"><span style="font-size:13px; font-weight:700; color:${T.ink};">Estimated total${_star(m)}</span></td><td align="right" valign="middle"><span style="font-size:23px; font-weight:800; color:${T.price};">${_money(total - (m.discount || 0))}</span></td></tr></tbody></table></td></tr></tbody></table>` : '';
  return `<table border="0" cellpadding="0" cellspacing="0" style="font-family:${SANS}; width:600px;"><tbody>
    <tr><td bgcolor="${T.acc}" style="background:${T.acc}; border-radius:14px 14px 0 0; padding:22px 26px;"><div style="font-size:11px; letter-spacing:1.4px; text-transform:uppercase; color:#d9ecce; font-weight:700;">${_esc(groupName)}</div><div style="font-size:24px; font-weight:800; color:#fff; margin-top:4px; letter-spacing:-.4px;">${_esc(optionName)}</div></td></tr>
    <tr><td style="border:1px solid ${T.line}; border-top:none; border-radius:0 0 14px 14px; padding:20px 22px 24px;">${_msgBlock(m)}<div style="height:4px; line-height:4px; font-size:0;">&nbsp;</div>${cards}${_discRow(m)}${totalBox}${_expLine(m, 'right')}${_discLine(m, 'right')}${show.cta ? _ctaBtn('View this option &rsaquo;', true) : ''}${_foot()}</td></tr>
  </tbody></table>`;
}

/* ── TEMPLATE 4 — QUOTE — total panel + lined schedule + inline proof ── */
function tplQuote(m) {
  const { groupName, optionName, expiration, lines, total, show } = m;
  const units = lines.reduce((a, l) => a + l.qty, 0);
  const subParts = [`${units} units`, `${lines.length} item${lines.length === 1 ? '' : 's'}`];
  if (show.expiration) subParts.push(`valid until ${_esc(expiration)}`);
  const totalCell = show.total ? `<td align="right" valign="middle" width="190"><div style="font-size:11px; letter-spacing:.8px; text-transform:uppercase; color:#d9ecce;">Estimated total${_star(m)}</div><div style="font-size:32px; font-weight:800; color:#fff; letter-spacing:-.6px; margin-top:2px;">${_money(total - (m.discount || 0))}</div></td>` : '';
  const panel = `<table border="0" cellpadding="0" cellspacing="0" width="100%"><tbody><tr><td bgcolor="${T.acc}" style="background:${T.acc}; padding:24px 26px;"><table width="100%"><tbody><tr><td valign="middle"><div style="font-size:11px; letter-spacing:1.2px; text-transform:uppercase; color:#d9ecce; font-weight:700;">${_esc(groupName)}</div><div style="font-size:23px; font-weight:800; color:#fff; margin:5px 0 7px; letter-spacing:-.4px;">${_esc(optionName)}</div><div style="font-size:12px; color:#e7f3df;">${subParts.join(' &nbsp;&middot;&nbsp; ')}</div></td>${totalCell}</tr></tbody></table></td></tr></tbody></table>`;
  const rows = lines.map((l, i) => {
    const sub = l.subtitle ? `<div style="font-size:12px; color:${T.mut}; margin-top:3px;">${_esc(l.subtitle)}</div>` : '';
    const cost = show.cost ? `<td valign="top" align="right" width="86" style="padding:15px 0; font-size:13px; color:${T.body};">${_money(l.unitPrice)}</td>` : '';
    const imp = l.imprint;
    const imgs = l.previews || [];
    // Quote stays a tight one-liner: show BOTH pole photos (front + reverse) but
    // only the FIRST personalization's spec.
    const tiles = imgs.length >= 2
      ? `<table border="0" cellpadding="0" cellspacing="0"><tbody><tr>${imgs.slice(0, 2).map((src, k) => `<td valign="middle" style="padding-right:${k ? 0 : 6}px;">${_renderTile(src, 34, true)}</td>`).join('')}</tr></tbody></table>`
      : (imgs.length === 1 ? _renderTile(imgs[0], 34, true) : (imp ? _chip(imp, 34, true) : ''));
    const tileW = imgs.length >= 2 ? 74 : 34;
    const chipSpec = imp ? (_esc(imp.frontLabel || imp.typeLabel) + (imp.color ? ' &middot; ' + _esc(imp.color) : '')) : 'Personalization';
    const chip = (show.previews && (imp || imgs.length))
      ? `<table border="0" cellpadding="0" cellspacing="0" style="margin-top:9px;"><tbody><tr><td valign="middle" width="${tileW}" style="padding-right:10px;">${tiles}</td><td valign="middle"><span style="font-size:11px; color:${T.mut}; white-space:nowrap;">${imp && imp.color ? _swatch(imp.colorHex, _LIGHT_IMPRINT[imp.color]) + ' ' : ''}<span style="vertical-align:middle;">${chipSpec}</span></span></td></tr></tbody></table>` : '';
    return `<tr style="${i ? `border-top:1px solid ${T.line};` : ''}"><td valign="top" style="padding:15px 0;">${_brandLine(l, T.mut)}<div style="font-size:14px; color:${T.ink}; font-weight:700;">${_esc(l.title)}</div>${sub}${chip}</td><td valign="top" width="54" style="padding:15px 0; font-size:13px; color:${T.body};">${l.qty}</td>${cost}<td valign="top" align="right" width="92" style="padding:15px 0; font-size:14px; font-weight:800; color:${T.price};">${_ltot(l)}</td></tr>`;
  }).join('\n');
  const th = (label, w, align) => `<th style="font-family:${SANS}; font-weight:700; font-size:10px; letter-spacing:.6px; text-transform:uppercase; color:${T.mut}; border-bottom:2px solid ${T.acc}; padding:0 0 9px;${w ? ' width:' + w + 'px;' : ''}" align="${align || 'left'}">${label}</th>`;
  const head = `<tr>${th('Item')}${th('Qty', 54)}${show.cost ? th('Unit', 86, 'right') : ''}${th('Total', 92, 'right')}</tr>`;
  // Framed like a proposal: a border around the whole thing, the green panel
  // full-bleed at the top, the schedule + totals padded inside.
  return `<table border="0" cellpadding="0" cellspacing="0" style="font-family:${SANS}; width:600px;"><tbody><tr><td style="border:1px solid ${T.line};">
    ${panel}
    <table border="0" cellpadding="0" cellspacing="0" width="100%"><tbody><tr><td style="padding:22px 26px 26px;">
      ${_msgBlock(m) ? _msgBlock(m) + '<div style="height:18px; line-height:18px; font-size:0;">&nbsp;</div>' : ''}
      <table border="0" cellpadding="0" cellspacing="0" width="100%"><tbody>${head}${rows}</tbody></table>
      ${_discRow(m)}${_discLine(m)}${show.cta ? _ctaBar('Approve &amp; view in cart &rsaquo;') : ''}${_foot()}
    </td></tr></tbody></table>
  </td></tr></tbody></table>`;
}

/* ── TEMPLATE 6 — SEPARATED — detached option cards, per-price ──
   Each option is a fully self-contained card (its own "Option A" header strip,
   photo, imprint preview, bold price) — for pitching a menu of independent
   options rather than one itemised order. Total is optional (for bundling). */
function tplSeparated(m) {
  const { groupName, optionName, lines, total, show } = m;
  // Group buy-X-get-Y giveaways INTO the option card of the line that earned
  // them: a free row whose parentLineId resolves to a paid row renders as a
  // green "included" strip inside that card instead of its own card. Free rows
  // with no resolvable parent (older saved proposals) keep their own card.
  const paidIds = new Set(lines.filter((l) => !l.free).map((l) => l.lineId));
  const isGrouped = (l) => !!(l.free && l.parentLineId && paidIds.has(l.parentLineId));
  const mains = lines.filter((l) => !isGrouped(l));
  const freeFor = (lineId) => lines.filter((l) => isGrouped(l) && l.parentLineId === lineId);
  const _freeStrip = (f) => `<table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#e1f5d1" style="background:#e1f5d1; border:1px solid #b9dd9e; border-radius:10px; margin-top:12px;"><tbody><tr>
      <td style="padding:10px 14px;"><span style="font-size:12px; font-weight:700; color:#2c4a10; vertical-align:middle;">Qty ${f.qty} &middot; ${_esc(f.title)}</span>${f.subtitle ? `<div style="font-size:11px; color:#46781b; margin-top:3px;">${_esc(f.subtitle)}</div>` : ''}</td>
      <td align="right" valign="middle" style="padding:10px 14px; white-space:nowrap;"><span style="font-size:12px; font-weight:800; color:#2c4a10;">included</span></td>
    </tr></tbody></table>`;
  const cards = mains.map((l, i) => {
    const photo = show.images ? `<td width="92" valign="top" style="padding-right:16px;">${_photoPlate(l.img, 92)}</td>` : '';
    const sub = l.subtitle ? `<div style="font-size:12px; color:${T.mut}; margin-top:4px;">${_esc(l.subtitle)}</div>` : '';
    const qtyLine = show.cost ? `Qty ${l.qty} &nbsp;&middot;&nbsp; ${_money(l.unitPrice)} ea` : `Qty ${l.qty}`;
    const proof = show.previews ? _proof(l, false) : '';
    const freeStrips = freeFor(l.lineId).map(_freeStrip).join('');
    return `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ${T.line}; border-radius:14px;"><tbody>
      <tr><td bgcolor="${T.plate}" style="background:${T.plate}; border-bottom:1px solid ${T.line}; border-radius:14px 14px 0 0; padding:11px 18px;"><table width="100%"><tbody><tr><td valign="middle"><span style="font-size:10px; letter-spacing:1.2px; text-transform:uppercase; color:${T.ink}; font-weight:800;">Option ${String.fromCharCode(65 + i)}</span></td><td align="right" valign="middle"><span style="font-size:11px; color:${T.mut}; font-weight:600;">${qtyLine}</span></td></tr></tbody></table></td></tr>
      <tr><td style="padding:18px;"><table width="100%"><tbody><tr>${photo}<td valign="middle">${_brandLine(l, T.mut)}<div style="font-size:18px; color:${T.ink}; font-weight:800; letter-spacing:-.3px;">${_esc(l.title)}</div>${sub}</td><td valign="middle" align="right" width="118"><div style="font-size:10px; letter-spacing:.6px; text-transform:uppercase; color:${T.mut}; font-weight:700;">Price</div><div style="font-size:23px; font-weight:800; color:${T.price}; letter-spacing:-.6px; margin-top:2px;">${_ltot(l)}</div></td></tr></tbody></table>${freeStrips}${proof}</td></tr>
    </tbody></table>`;
  }).join(_vspace(16));
  const totalBox = show.total ? `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:2px;"><tbody><tr><td bgcolor="${T.accSoft}" style="background:${T.accSoft}; border:1px solid #d6e8c9; border-radius:12px; padding:16px 20px;"><table width="100%"><tbody><tr><td valign="middle"><span style="font-size:12px; font-weight:700; letter-spacing:.4px; text-transform:uppercase; color:${T.ink};">Estimated total${_star(m)}</span><div style="font-size:11px; color:${T.mut}; margin-top:2px;">All options combined</div></td><td align="right" valign="middle"><span style="font-size:24px; font-weight:800; color:${T.price};">${_money(total - (m.discount || 0))}</span></td></tr></tbody></table></td></tr></tbody></table>` : '';
  return `<table border="0" cellpadding="0" cellspacing="0" style="font-family:${SANS}; width:600px;"><tbody><tr><td style="padding:8px 6px;">
    <table width="100%" border="0" cellpadding="0" cellspacing="0"><tbody><tr>
      <td valign="middle"><div style="font-size:12px; letter-spacing:1.6px; text-transform:uppercase; color:${T.ink}; font-weight:700;">${_esc(groupName)}</div><div style="font-size:28px; font-weight:800; color:${T.ink}; letter-spacing:-.6px; margin:5px 0 0;">${_esc(optionName)}</div></td>
      <td valign="middle" align="right" width="190">${_wordmark('right')}</td>
    </tr></tbody></table>
    <div style="font-size:13px; color:${T.mut}; margin:6px 0 22px;">${mains.length} option${mains.length === 1 ? '' : 's'} &middot; priced individually</div>
    ${_msgBlock(m) ? _msgBlock(m) + '<div style="height:18px; line-height:18px; font-size:0;">&nbsp;</div>' : ''}
    ${cards}${_discRow(m)}${totalBox}${_expLine(m)}${_discLine(m)}${show.cta ? _ctaBar('View these options') : ''}${_foot()}
  </td></tr></tbody></table>`;
}

/* ── TEMPLATE — CORPORATE — squared letterhead, ruled schedule ── */
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
    const proof = show.previews ? `<tr><td colspan="${cols}" style="padding:0 0 15px 0;">${_proof(l, false, true)}</td></tr>` : '';
    return `<tr>${photo}<td valign="top" style="padding:15px 14px 15px 0;">${_brandLine(l, MUT)}<div style="font-size:14px; color:${INK}; font-weight:700;">${_esc(l.title)}</div>${sub}</td><td valign="top" align="right" style="padding:15px 0; font-size:13px; color:${INK};">${l.qty}</td>${unit}<td valign="top" align="right" style="padding:15px 0; font-size:14px; font-weight:800; color:${INK};">${_ltot(l)}</td></tr><tr><td colspan="${cols}" style="border-bottom:1px solid ${LINE}; font-size:0; line-height:0;">&nbsp;</td></tr>${proof}`;
  }).join('');
  const totalsBlock = show.total ? `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:18px;"><tbody><tr><td></td><td width="240"><table width="100%" border="0" cellpadding="0" cellspacing="0"><tbody><tr><td style="border-top:2px solid ${RULE}; padding:12px 0 0; font-size:11px; letter-spacing:1px; text-transform:uppercase; color:${MUT}; font-weight:700;">Estimated total${_star(m)}</td><td align="right" style="border-top:2px solid ${RULE}; padding:12px 0 0; font-size:22px; font-weight:800; color:${INK};">${_money(total - (m.discount || 0))}</td></tr></tbody></table></td></tr></tbody></table>` : '';
  const cta = show.cta ? _cta() : '';
  return `<table border="0" cellpadding="0" cellspacing="0" style="font-family:${SANS}; width:600px;"><tbody><tr><td style="border:1px solid ${LINE}; border-top:3px solid ${T.acc};">
    <table width="100%" border="0" cellpadding="0" cellspacing="0"><tbody>
    <tr><td style="padding:26px 30px 0;">
      <table width="100%"><tbody><tr><td valign="middle">${_wordmark()}</td><td valign="middle" align="right"><div style="font-size:11px; letter-spacing:2px; text-transform:uppercase; color:${MUT}; font-weight:700;">Proposal</div>${show.expiration ? `<div style="font-size:11px; color:${MUT}; margin-top:3px;">Valid until ${_esc(expiration)}</div>` : ''}</td></tr></tbody></table>
      <div style="border-top:1px solid ${LINE}; margin-top:18px;"></div>
      <div style="font-size:11px; letter-spacing:1.4px; text-transform:uppercase; color:${T.ink}; font-weight:700; margin-top:20px;">${_esc(groupName)}</div>
      <div style="font-size:24px; font-weight:800; color:${INK}; letter-spacing:-.4px; margin:6px 0 18px;">${_esc(optionName)}</div>
      ${_msgBlock(m) ? _msgBlock(m) + '<div style="height:14px; line-height:14px; font-size:0;">&nbsp;</div>' : ''}
      <table width="100%" border="0" cellpadding="0" cellspacing="0"><tbody>${head}${rows}</tbody></table>
      ${_discRow(m)}${totalsBlock}${_discLine(m, 'right')}${cta}
      <div style="height:8px; line-height:8px; font-size:0;">&nbsp;</div>
    </td></tr>
    </tbody></table>
  </td></tr></tbody></table>`;
}

export const PROPOSAL_TEMPLATES = [
  { id: 'corporate', name: 'Corporate', sub: 'Squared letterhead · ruled', accent: '#339900', build: tplCorporate },
  { id: 'classic', name: 'Classic', sub: 'Formal letter · imprint previews', accent: '#339900', build: tplClassic },
  { id: 'quote', name: 'Quote', sub: 'Total panel · imprint previews', accent: '#339900', build: tplQuote },
  { id: 'separated', name: 'Separated', sub: 'Detached option cards · per-price', accent: '#339900', build: tplSeparated },
];
const tplById = (id) => PROPOSAL_TEMPLATES.find((t) => t.id === id) || PROPOSAL_TEMPLATES[0];

function TemplateThumb({ id, accent }) {
  const bar = (w, c, h) => ({ width: w, height: h || 3, background: c, borderRadius: 1 });
  // Themed tokens so the picker thumbs read correctly in light AND dark (they're
  // UI swatches, not photos). Brand green/orange stay as-is in both.
  const G = 'var(--gb-border-default)';     // borders / dividers
  const LT = 'var(--gb-fill-strong)';       // light "text" bars
  const DK = 'var(--gb-text-primary)';      // strong/header bars
  const PR = '#ff6600';                     // price (brand)
  const PANEL = 'var(--gb-fill-subtle)';    // option/header strip
  const wrap = { width: 46, height: 36, flexShrink: 0, borderRadius: 4, background: 'var(--gb-surface-1)', border: `1px solid ${G}`, padding: 4, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' };
  if (id === 'corporate') return <div style={{ ...wrap, borderRadius: 0, borderTop: `2px solid ${accent}`, gap: 2 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ ...bar(15, DK, 3), borderRadius: 0 }} /><div style={{ ...bar(7, G, 2), borderRadius: 0 }} /></div>
    <div style={{ borderTop: `1px solid ${G}`, marginTop: 1 }} />
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${G}`, paddingBottom: 1, marginTop: 1 }}><div style={{ ...bar(16, LT, 2), borderRadius: 0 }} /><div style={{ ...bar(9, DK, 2), borderRadius: 0 }} /></div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ ...bar(13, LT, 2), borderRadius: 0 }} /><div style={{ ...bar(9, DK, 2), borderRadius: 0 }} /></div>
  </div>;
  if (id === 'classic') return <div style={{ ...wrap, border: `1.5px solid ${G}`, alignItems: 'center' }}><div style={{ ...bar(20, accent), marginTop: 1 }} /><div style={bar(26, LT, 2)} /><div style={{ display: 'flex', gap: 2, width: '100%', marginTop: 1 }}><div style={bar(10, G, 8)} /><div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><div style={bar('100%', LT, 2)} /><div style={bar('70%', LT, 2)} /></div></div></div>;
  if (id === 'quote') return <div style={{ ...wrap, padding: 0, gap: 0 }}>
    <div style={{ width: '100%', height: 13, background: accent, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 3, boxSizing: 'border-box', flexShrink: 0 }}><div style={bar(11, 'rgba(255,255,255,.85)', 5)} /></div>
    <div style={{ padding: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={bar(18, LT, 2)} /><div style={bar(7, PR, 2)} /></div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={bar(16, LT, 2)} /><div style={bar(7, PR, 2)} /></div>
    </div>
  </div>;
  if (id === 'lookbook') return <div style={{ ...wrap, alignItems: 'center', gap: 2 }}><div style={{ width: 9, height: 2, background: accent, borderRadius: 1, marginTop: 1 }} /><div style={{ width: '100%', border: `1px solid ${G}`, borderRadius: 2, padding: 2, display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center', boxSizing: 'border-box' }}><div style={bar(16, G, 9)} /><div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}><div style={bar(12, LT, 2)} /><div style={bar(6, PR, 2)} /></div></div><div style={{ ...bar('100%', accent, 3), marginTop: 'auto' }} /></div>;
  if (id === 'separated') return <div style={{ ...wrap, gap: 3, justifyContent: 'center' }}>
    <div style={{ width: '100%', border: `1px solid ${G}`, borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: PANEL, padding: '1px 2px' }}><div style={bar(6, accent, 2)} /><div style={bar(4, G, 2)} /></div>
      <div style={{ display: 'flex', gap: 2, alignItems: 'center', padding: 2 }}><div style={bar(7, G, 7)} /><div style={bar(12, LT, 2)} /><div style={{ ...bar(7, PR, 4), marginLeft: 'auto' }} /></div>
    </div>
    <div style={{ width: '100%', border: `1px solid ${G}`, borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: PANEL, padding: '1px 2px' }}><div style={bar(6, accent, 2)} /><div style={bar(4, G, 2)} /></div>
      <div style={{ display: 'flex', gap: 2, alignItems: 'center', padding: 2 }}><div style={bar(7, G, 7)} /><div style={bar(12, LT, 2)} /><div style={{ ...bar(7, PR, 4), marginLeft: 'auto' }} /></div>
    </div>
  </div>;
  return <div style={{ ...wrap, gap: 3 }}><div style={bar(8, accent, 2)} /><div style={bar(24, DK, 4)} /><div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}><div style={bar(20, LT, 2)} /><div style={bar(8, accent, 2)} /></div><div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={bar(18, LT, 2)} /><div style={bar(8, LT, 2)} /></div><div style={{ ...bar('100%', DK, 5), marginTop: 'auto' }} /></div>;
}

function TemplateCard({ tpl, on, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: 'var(--gb-r-md)', cursor: 'pointer', background: on ? 'var(--gb-brand-tint-medium)' : hover ? 'var(--gb-fill-subtle)' : 'var(--gb-fill-inverse-medium)', border: '1px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'), transition: 'all var(--gb-anim)' }}>
      <TemplateThumb id={tpl.id} accent={tpl.accent} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{tpl.name}</div>
        <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tpl.sub}</div>
      </div>
      {on && <I.check size={14} style={{ color: 'var(--gb-brand-label)', flexShrink: 0 }} />}
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

function EmailField({ label, value, onChange, placeholder, mono, area, half }) {
  return (
    <div style={{ flex: half ? 1 : 'none', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-text-muted)' }}>{label}</label>
      {area
        ? <Textarea rows={3} value={value} placeholder={placeholder} onChange={onChange} resize="vertical" />
        : <Input value={value} placeholder={placeholder} mono={mono} onChange={onChange} />}
    </div>
  );
}

function OptionToggle({ checked, label, hint, onClick, disabled }) {
  const [hover, setHover] = useState(false);
  const on = checked && !disabled;
  return (
    <div onClick={disabled ? undefined : onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 'var(--gb-r-md)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .45 : 1, background: on ? 'var(--gb-brand-tint-soft)' : (hover && !disabled) ? 'var(--gb-fill-subtle)' : 'transparent', border: '1px solid ' + (on ? 'var(--gb-brand-tint-border)' : 'transparent'), transition: 'all var(--gb-anim)' }}>
      {/* Shared checkbox as the visual indicator — the row is the click target,
          so the box has no onChange (clicks bubble up to the row's onClick). */}
      <Checkbox checked={on} style={{ marginTop: 1, pointerEvents: 'none' }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gb-text-primary)' }}>{label}</div>
        {hint && <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1, lineHeight: 1.4 }}>{hint}</div>}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   THE COMPOSER MODAL — settings · live preview · copy
════════════════════════════════════════════════════════════ */
/* Off-screen snapshot harness — renders each shot's 3D model in a hidden viewer,
   one at a time (sequential → only one WebGL context alive), and snapshots it on
   ready. The viewer's own framing is irrelevant: snapshot() uses the fixed
   per-model dev pose + scene-3 HDRI. Calls onProgress as it goes and onDone with
   [{...shot, image}] when finished. */
function SnapshotRenderer({ shots, size = 640, onProgress, onDone }) {
  const [i, setI] = useState(0);
  const viewerRef = useRef(null);
  const results = useRef([]);
  const finished = useRef(false);
  const lockRef = useRef(-1);   // index already being captured → ignore duplicate signals
  const shot = shots[i];
  // Capture the current shot then advance. Guarded so onReady + onError + the
  // watchdog can all point here without double-advancing.
  const advance = () => {
    if (lockRef.current >= i) return;
    lockRef.current = i;
    setTimeout(() => {
      let image = null;
      try { image = viewerRef.current?.snapshot?.(size) || null; } catch (e) { /* */ }
      results.current.push({ ...shots[i], image });
      onProgress && onProgress(results.current.length, shots.length);
      if (i + 1 < shots.length) setI(i + 1);
      else if (!finished.current) { finished.current = true; onDone(results.current); }
    }, 90);
  };
  // Watchdog: a viewer that never signals (model hang / lost WebGL context)
  // would stall the whole batch — skip the shot after a grace period so it
  // can't get stuck on "loading" forever.
  useEffect(() => {
    if (!shot) return undefined;
    const t = setTimeout(advance, 12000);
    return () => clearTimeout(t);
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!shot) return null;
  return (
    <div aria-hidden style={{ position: 'fixed', left: -99999, top: 0, width: 560, height: 560, opacity: 0, pointerEvents: 'none', zIndex: -1 }}>
      <div style={{ position: 'relative', width: 560, height: 560 }}>
        <GolfballViewer key={shot.key} ref={viewerRef} minimal
          shape={shot.shape} tint={shot.tint} chipTint={shot.chipTint} giftSet={shot.giftSet}
          decalDataUrl={shot.decalDataUrl} secondDecalDataUrl={shot.secondDecalDataUrl}
          onReady={advance} onError={advance} />
      </div>
    </div>
  );
}

/* The embeddable composer — settings rail | live preview + a copy footer. Fills
   its parent (no modal shell / header of its own) so it drops straight into the
   saved-proposal breakdown panel in place of the margin view, or sits inside the
   ProposalEmailModal wrapper below. `onBack` (optional) renders a back button in
   the footer for the inline use. */
export function ProposalEmailComposer({ source, onBack, backLabel }) {
  const [groupName, setGroupName] = useState(source.groupName || 'Your Custom Order');
  const [optionName, setOptionName] = useState(source.optionName || 'Option 1');
  const [message, setMessage] = useState('');
  const [expiration, setExpiration] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 14); return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`; });
  const [templateId, setTemplateId] = useState('classic');
  const [show, setShow] = useState({ images: true, previews: false, cost: true, total: true, expiration: true, disclaimer: true, cta: true, message: false });
  const [copied, flash] = useTransientFlag(1800);
  const [submitted, setSubmitted] = useState(false);   // current-proposal: Submit → Copy once generated
  const [submitting, setSubmitting] = useState(false);  // server track in flight

  // ── 3D personalization previews ──────────────────────────────────────────
  // When the toggle turns on we (1) resolve each line's decoration into shot
  // specs, (2) render them off-screen via SnapshotRenderer, (3) cache the images
  // per line. Cached after the first run so re-toggling is instant.
  const [shots, setShots] = useState(null);                 // specs queued for the renderer
  const [previewsByLine, setPreviewsByLine] = useState(null); // lineId → [dataUrl]; null until rendered
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState({ n: 0, t: 0 });
  // `startedRef` (not `busy`) guards re-entry — keeping `busy` out of the dep
  // list is essential: depending on it made setBusy(true) re-run this effect,
  // whose cleanup cancelled the in-flight linesToShots() before it could
  // setShots → the renderer never mounted and it hung at "loading".
  const startedRef = useRef(false);
  useEffect(() => {
    if (!show.previews || startedRef.current || previewsByLine) return;
    startedRef.current = true;
    let cancelled = false;
    setBusy(true); setProg({ n: 0, t: 0 });
    linesToShots(source.rawLines || []).then((s) => {
      if (cancelled) return;
      if (!s.length) { setPreviewsByLine({}); setBusy(false); return; }
      setProg({ n: 0, t: s.length });
      setShots(s);   // mounts SnapshotRenderer
    }).catch(() => { if (!cancelled) { setPreviewsByLine({}); setBusy(false); } });
    // Cleanup UNLATCHES the guard: if a dep change (e.g. the source object was
    // rebuilt by the parent) cancels this run before it finished, the next
    // effect pass may re-enter and restart. Without this, a single identity
    // churn left startedRef latched true with previewsByLine still null — the
    // generate flow never ran and the toggle appeared dead.
    return () => { cancelled = true; if (!previewsByLine) startedRef.current = false; };
  }, [show.previews, previewsByLine, source.rawLines]);
  // Turning previews OFF resets the run state so re-enabling retries from
  // scratch. Without this, a first pass that produced nothing (a transient
  // render hiccup, or a cart that momentarily had no decorated lines) latched
  // previewsByLine={} and the guard above then blocked every later attempt — the
  // toggle looked permanently dead, stuck on logo placeholders.
  useEffect(() => {
    if (!show.previews) { startedRef.current = false; setShots(null); setBusy(false); setPreviewsByLine(null); }
  }, [show.previews]);
  const onShotsDone = (res) => {
    const byLine = {};
    for (const r of res) { if (!r.image) continue; (byLine[r.lineId] = byLine[r.lineId] || []).push(r.image); }
    setPreviewsByLine(byLine);
    setShots(null);   // unmount renderer
    setBusy(false);
  };
  const previewsReady = show.previews && !busy && !!previewsByLine;

  const toggle = (k) => setShow((s) => ({ ...s, [k]: !s[k] }));
  const tpl = tplById(templateId);
  // Attach rendered previews to the display rows (matched by lineId) so the
  // templates can render them; null when previews are off / still rendering.
  const modelLines = useMemo(
    () => source.lines.map((r) => ({ ...r, previews: previewsReady ? (previewsByLine[r.lineId] || []) : null })),
    [source.lines, previewsReady, previewsByLine],
  );
  // The "View this option" cart link is ONLY valid for a real proposal saved to
  // the account (Current Proposals carry a cartLink). Saved drafts / the unsaved
  // working set can't link, so the CTA is forced off + disabled there.
  const hasLink = !!source.cartLink;
  useEffect(() => { setSubmitted(false); }, [source.cartLink]);   // reset Submit→Copy when the proposal changes
  const effShow = useMemo(() => ({ ...show, cta: show.cta && hasLink }), [show, hasLink]);
  const model = useMemo(() => ({ groupName, optionName, expiration, message, lines: modelLines, total: source.total, discount: source.discount || 0, savings: source.savings || 0, freePromo: !!source.freePromo, promoCode: source.promoCode || '', show: effShow }), [groupName, optionName, expiration, message, modelLines, source.total, source.discount, source.savings, source.freePromo, source.promoCode, effShow]);
  const builtHtml = useMemo(() => tpl.build(model), [tpl, model]);
  // Substitute the real cart link (only present when valid); otherwise the CTA
  // isn't rendered, so no {{CART_LINK}} leaks into the copy.
  const emailHtml = useMemo(() => (hasLink ? builtHtml.split('{{CART_LINK}}').join(source.cartLink) : builtHtml), [builtHtml, hasLink, source.cartLink]);
  // What we actually COPY / SEND: the bare template wrapped in a full Outlook-
  // desktop-safe email document (MSO scaffold, 600px ghost table, centering).
  // The preview below stays on the bare fragment (it renders in a browser).
  const outboundHtml = useMemo(() => wrapEmailDocument(emailHtml), [emailHtml]);
  // Preview is wrapped so the 600px email centers in the (wider) pane. It's a
  // VIEW-only wrapper — the copied HTML stays the untouched `emailHtml`.
  const previewHtml = useMemo(() => `<div style="text-align:center;"><div style="display:inline-block; text-align:left;">${emailHtml}</div></div>`, [emailHtml]);

  // Copy RICH — write the HTML to the clipboard as `text/html` so pasting into a
  // mail client / doc renders the FORMATTING (writeText only copies the raw markup
  // string, which is what pasted as literal HTML before). text/plain carries the
  // source as a fallback for plain-text fields.
  const copyRich = async () => {
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new window.ClipboardItem({
          'text/html': new Blob([outboundHtml], { type: 'text/html' }),
          'text/plain': new Blob([outboundHtml], { type: 'text/plain' }),
        })]);
      } else {
        await navigator.clipboard.writeText(outboundHtml);
      }
    } catch (e) {
      try { await navigator.clipboard.writeText(outboundHtml); } catch (e2) { /* no-op */ }
    }
    flash();
  };
  // Copy the raw HTML source (for pasting into an HTML editor / code field).
  const copySource = async () => { try { await navigator.clipboard.writeText(outboundHtml); } catch (e) { /* */ } };
  // Current Proposals: "Submit" tracks the proposal server-side (just like
  // creating it on the web) via source.onSubmit, then copies. If tracking fails
  // it stays on "Submit" (the caller surfaces the error) and does NOT copy.
  const submit = async () => {
    if (submitting) return;
    if (source.onSubmit) {
      setSubmitting(true);
      try { await source.onSubmit({ html: outboundHtml, message, expiration }); }
      catch (e) { setSubmitting(false); return; }
      setSubmitting(false);
    }
    setSubmitted(true);
    await copyRich();
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {/* body: settings | preview */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div className="gb-thin-scroll" style={{ width: 340, flexShrink: 0, borderRight: '1px solid var(--gb-border-subtle)', overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <ConfigGroup title="Template">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {PROPOSAL_TEMPLATES.map((t) => <TemplateCard key={t.id} tpl={t} on={templateId === t.id} onClick={() => setTemplateId(t.id)} />)}
              </div>
            </ConfigGroup>

            <ConfigGroup title="Proposal">
              <EmailField label="Header (group name)" value={groupName} onChange={setGroupName} placeholder="Your Custom Order" />
              <div style={{ display: 'flex', gap: 8 }}>
                <EmailField half label="Option name" value={optionName} onChange={setOptionName} placeholder="Mint Containers" />
                <EmailField half label="Expires" value={expiration} onChange={setExpiration} placeholder="7/20/2026" mono />
              </div>
              <EmailField label="Personal message" value={message} onChange={setMessage} placeholder="Add a short note above the items…" area />
            </ConfigGroup>

            <ConfigGroup title="Display options">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <OptionToggle checked={show.images} label="Product images" hint="Show a photo for each line item" onClick={() => toggle('images')} />
                <OptionToggle checked={show.previews} label="Imprint previews" hint={busy ? `Rendering 3D previews ${prog.n}/${prog.t || '…'}` : 'Show how each logo / personalization is applied'} onClick={() => toggle('previews')} />
                <OptionToggle checked={show.cost} label="Unit cost / qty detail" hint="Show per-unit price beside each line" onClick={() => toggle('cost')} />
                <OptionToggle checked={show.total} label="Estimated total" hint="Uncheck to hide the subtotal" onClick={() => toggle('total')} />
                <OptionToggle checked={show.expiration} label="Expiration date" hint="Date the proposal is valid through" onClick={() => toggle('expiration')} />
                <OptionToggle checked={show.disclaimer} label="Shipping &amp; tax disclaimer" hint="Note that shipping &amp; tax are added in cart" onClick={() => toggle('disclaimer')} />
                <OptionToggle checked={effShow.cta} disabled={!hasLink} label="“View this option” button" hint={hasLink ? 'Links the customer to this proposal’s cart' : 'Only on a proposal saved to the account'} onClick={() => toggle('cta')} />
                <OptionToggle checked={show.message} label="Show personal message" hint="Include your note above the items" onClick={() => toggle('message')} />
              </div>
            </ConfigGroup>
          </div>

          {/* preview column */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--gb-surface-deep)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
              <I.eye size={13} style={{ color: 'var(--gb-text-muted)' }} />
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>Live preview</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 999, background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: tpl.accent }} />
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--gb-text-secondary)' }}>{tpl.name}</span>
              </span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>600px · HTML</span>
            </div>
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              {/* Render via EmailHtmlView so the preview re-themes to the user's
                  light/dark surface (white→transparent, dark text→light, brand
                  colors kept) — the VIEW adapts, the copied HTML stays fixed. */}
              <EmailHtmlView html={previewHtml} style={{ height: '100%', border: 'none', borderRadius: 0 }} />
              {/* Blocking render-progress overlay — wait for the full batch before
                  revealing the email so the proofs land with real renders, not a
                  half-rendered/synthetic state. */}
              {busy && show.previews && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .18 }}
                  style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'color-mix(in srgb, var(--gb-surface-deep) 82%, transparent)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)' }}>
                  <motion.div initial={{ opacity: 0, scale: .96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                    style={{ width: 320, maxWidth: '88%', padding: '24px 24px 20px', borderRadius: 'var(--gb-r-xl)', background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-border-default)', boxShadow: 'var(--gb-shadow-modal)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                    <div style={{ position: 'relative', width: 48, height: 48, flexShrink: 0 }}>
                      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid var(--gb-brand-tint-soft)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin .85s linear infinite' }} />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gb-brand-label)' }}><I.card size={19} /></div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -.1 }}>Rendering imprint previews</div>
                      <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', marginTop: 3 }}>{prog.t ? 'Snapshotting each personalization on its model' : 'Preparing personalizations…'}</div>
                    </div>
                    {prog.t > 0 && prog.t <= 24 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: 252 }}>
                        {Array.from({ length: prog.t }).map((_, idx) => {
                          const done = idx < prog.n, active = idx === prog.n;
                          return <div key={idx} style={{ width: 24, height: 24, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', transition: 'background .3s, border-color .3s', background: done ? 'var(--gb-brand-label)' : 'var(--gb-fill-subtle)', border: '1px solid ' + (done ? 'var(--gb-brand-label)' : active ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'), animation: (!done && active) ? 'gb-pulse 1s ease-in-out infinite' : 'none' }}>{done && <I.check size={13} strokeWidth={3} />}</div>;
                        })}
                      </div>
                    )}
                    <div style={{ width: '100%', height: 7, borderRadius: 4, background: 'var(--gb-fill-subtle)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 4, background: 'var(--gb-brand-label)', width: prog.t ? `${Math.max(4, Math.round((prog.n / prog.t) * 100))}%` : '24%', animation: prog.t ? 'none' : 'gb-pulse 1s ease-in-out infinite', transition: 'width .35s cubic-bezier(.4,0,.2,1)' }} />
                    </div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-secondary)' }}>{prog.t ? `${prog.n} of ${prog.t}` : 'Loading…'}</div>
                  </motion.div>
                </motion.div>
              )}
            </div>
          </div>
        </div>
        {/* Hidden 3D snapshot renderer — only mounted while a batch is in flight. */}
        {shots && shots.length > 0 && (
          <SnapshotRenderer shots={shots} onProgress={(n, t) => setProg({ n, t })} onDone={onShotsDone} />
        )}

        {/* footer */}
        <div style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gb-fill-inverse-strong)', borderTop: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
          {onBack && <Btn variant="ghost" size="md" icon={<I.chevr style={{ transform: 'rotate(180deg)' }} />} onClick={onBack}>{backLabel || 'Back'}</Btn>}
          <div style={{ flex: 1 }} />
          <Btn variant="ghost" size="md" icon={<I.copy />} onClick={copySource}>Copy source</Btn>
          {hasLink && !submitted
            ? <Btn variant="primary" size="md" icon={submitting ? <Spinner size={13} thickness={1.5} /> : <I.send />} onClick={submit}>{submitting ? 'Submitting…' : 'Submit'}</Btn>
            : <Btn variant="primary" size="md" icon={copied ? <I.check /> : <I.copy />} onClick={copyRich}>{copied ? 'Copied' : 'Copy'}</Btn>}
        </div>
    </div>
  );
}

/* Modal wrapper — full-screen overlay used by the working-proposal "Generate
   email" entry point. Scales to match the catalog it animates in over. The
   saved-proposal flow uses ProposalEmailComposer inline instead (no modal). */
export function ProposalEmailModal({ source, onClose, scale = 1.8 }) {
  return (
    <motion.div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .2 }}
      style={{ position: 'fixed', inset: 0, zIndex: 999995, padding: 24, background: 'var(--gb-backdrop)', backdropFilter: 'var(--gb-backdrop-blur)', WebkitBackdropFilter: 'var(--gb-backdrop-blur)', display: 'flex', overflow: 'auto' }}>
      {/* Transform-scaled container (NOT viewport units) so the modal — and its
          text — render at the same on-screen size as the scaled catalog. */}
      <div style={{ margin: 'auto', flexShrink: 0, transform: `scale(${scale})`, transformOrigin: 'center center' }}>
      <motion.div initial={{ opacity: 0, scale: .96, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .97, y: 10 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        style={{ width: 1180, height: 760, display: 'flex', flexDirection: 'column', background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-xl)', overflow: 'hidden', boxShadow: 'var(--gb-shadow-modal)' }}>
        {/* header */}
        <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 11, background: 'var(--gb-fill-inverse-strong)', borderBottom: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: 'var(--gb-r-md)', flexShrink: 0, background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <I.card size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -.1 }}>Proposal HTML</div>
            <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 1 }}>{source.lines.length} items · {_money(source.total)} · built locally, cart link added on send</div>
          </div>
          <IconBtn size="sm" icon={<I.close />} onClick={onClose} />
        </div>
        <ProposalEmailComposer source={source} />
      </motion.div>
      </div>
    </motion.div>
  );
}
