import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Btn, IconBtn } from '../ui/index.js';
import { I } from '../ui/icons.jsx';

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

/* ── TEMPLATE 1 — CLASSIC ── */
function tplClassic(m) {
  const { groupName, optionName, expiration, message, lines, total, show } = m;
  const FONT = '&quot;Lato&quot;, &quot;Helvetica&quot;, &quot;Arial&quot;, sans-serif';
  const GREY = '#7f7f7f', ACC = '#339900', PRICE = '#ff6600';
  const cols = (show.images ? 1 : 0) + 1 + 1 + (show.cost ? 1 : 0) + 1;
  const th = (label, extra, align) => `<th style="font-weight: normal; color: ${GREY}; border-bottom: 2px solid ${GREY}; padding: 5px 0; ${extra || ''}" align="${align || 'left'}">${label}</th>`;
  const headerRow = `<tr>` + (show.images ? th('', 'width: 150px;') : '') + th('item', 'width: 210px;') + th('qty', 'width: 70px;') + (show.cost ? th('cost', '') : '') + th('total', 'width: 90px;', 'right') + `</tr>`;
  const rows = lines.map((l) => {
    const img = show.images ? `<td style="padding: 12px 0;" valign="top"><img src="${_esc(l.img)}" width="140" border="0" style="border-radius: 6px;" /></td>` : '';
    const sub = l.subtitle ? `<div style="font-size: 12px; color: ${GREY}; margin-top: 3px;">${_esc(l.subtitle)}</div>` : '';
    const cost = show.cost ? `<td style="padding: 12px 0; color: #333;" valign="top">${_money(l.unitPrice)}</td>` : '';
    return `<tr>${img}<td style="padding: 12px 0 12px ${show.images ? '12px' : '0'};" valign="top">${_brandLine(l, GREY)}<div style="font-size: 14px; color: #222; font-weight: bold;">${_esc(l.title)}</div>${sub}</td><td style="padding: 12px 0; color: #333;" valign="top">${l.qty}</td>${cost}<td style="color: ${PRICE}; font-weight: bold; padding: 12px 0;" align="right" valign="top">${_money(l.lineTotal)}</td></tr><tr><td colspan="${cols}" style="border-bottom: 1px solid #e6e6e6; padding: 0; font-size: 0; line-height: 0;">&nbsp;</td></tr>`;
  }).join('\n');
  const totalsRow = show.total ? `<tr style="font-weight: bold; font-size: 16.8px;"><td colspan="${cols - 1}" style="padding: 12px 0;" valign="top">Estimated total${show.disclaimer ? '*' : ''}</td><td style="color: ${PRICE}; font-weight: bold; padding: 12px 0;" align="right" valign="top">${_money(total)}</td></tr>` : '';
  const msg = (show.message && message) ? `<p style="color: #444; font-size: 14px; line-height: 1.5; margin: 0 0 1.3em;">${_esc(message).replace(/\n/g, '<br/>')}</p>` : '';
  const exp = show.expiration ? `<p style="font-weight: bold; font-size: 18px; margin: 1em 0;" align="right">This proposal expires on <span style="color: ${PRICE}">${_esc(expiration)}</span></p>` : '';
  const disc = show.disclaimer ? `<p style="font-style: italic; color: ${GREY}; font-size: 12.6px; margin: 0 0 1.4em;" align="right">*shipping and sales tax will be added in shopping cart</p>` : '';
  const cta = show.cta ? `<table cellpadding="0" cellspacing="0" border="0" style="width:100%; font-family:${FONT};"><tbody><tr><td align="center" style="padding-top:6px;"><a href="{{CART_LINK}}" style="display:inline-block; background:${ACC}; color:#fff; text-decoration:none; font-family:${FONT}; font-size:15px; font-weight:bold; padding:12px 34px; border-radius:6px;">View this option &rsaquo;</a></td></tr></tbody></table>` : '';
  return `<table cellpadding="0" cellspacing="0" border="0" style="font-family:${FONT}; width:600px;"><tbody><tr><td style="border-radius:10px; padding:22px 24px; border:2px solid #cccccc;">
    <p style="color:${ACC}; font-size:18px; font-weight:bold; margin:0;" align="center">${_esc(groupName)}</p>
    <p style="color:${GREY}; font-size:25px; margin:0 0 1em;" align="center">${_esc(optionName)}</p>
    ${msg}
    <table cellpadding="0" cellspacing="0" border="0" style="font-family:${FONT}; width:100%;"><tbody>${headerRow}${rows}${totalsRow}</tbody></table>
    ${exp}${disc}${cta}
  </td></tr></tbody></table>`;
}

/* ── TEMPLATE 2 — MINIMAL ── */
function tplMinimal(m) {
  const { groupName, optionName, expiration, message, lines, total, show } = m;
  const FONT = '&quot;Helvetica Neue&quot;, Helvetica, Arial, sans-serif';
  const INK = '#1b2a14', MUT = '#6b7280', LINE = '#e5e7eb', ACC = '#339900', PRICE = '#ff6600';
  const msg = (show.message && message) ? `<p style="color:#374151; font-size:14px; line-height:1.55; margin:0 0 20px;">${_esc(message).replace(/\n/g, '<br/>')}</p>` : '';
  const rows = lines.map((l) => {
    const img = show.images ? `<td width="68" valign="middle" style="padding:14px 14px 14px 0;"><img src="${_esc(l.img)}" width="56" border="0" style="border-radius:6px; display:block;" /></td>` : '';
    const sub = l.subtitle ? `<div style="font-size:12px; color:${MUT}; margin-top:3px;">${_esc(l.subtitle)}</div>` : '';
    const qtyLine = show.cost ? `${l.qty} &times; ${_money(l.unitPrice)}` : `Qty ${l.qty}`;
    return `<tr style="border-top:1px solid ${LINE};">${img}<td valign="middle" style="padding:14px 0;">${_brandLine(l, MUT)}<div style="font-size:15px; color:${INK}; font-weight:600;">${_esc(l.title)}</div>${sub}</td><td valign="middle" align="right" style="padding:14px 0;"><div style="font-size:11px; color:${MUT};">${qtyLine}</div><div style="font-size:16px; color:${PRICE}; font-weight:700; margin-top:3px;">${_money(l.lineTotal)}</div></td></tr>`;
  }).join('\n');
  const totalsRow = show.total ? `<tr style="border-top:2px solid ${ACC};"><td colspan="${show.images ? 2 : 1}" valign="middle" style="padding:16px 0;"><span style="font-size:11px; letter-spacing:.8px; text-transform:uppercase; color:${MUT};">Estimated total${show.disclaimer ? '*' : ''}</span></td><td align="right" valign="middle" style="padding:16px 0;"><span style="font-size:24px; font-weight:800; color:${PRICE}; letter-spacing:-.5px;">${_money(total)}</span></td></tr>` : '';
  const exp = show.expiration ? `<p style="font-size:13px; color:${MUT}; margin:18px 0 0;">Valid through <strong style="color:${INK};">${_esc(expiration)}</strong></p>` : '';
  const disc = show.disclaimer ? `<p style="font-size:12px; color:#9ca3af; margin:6px 0 0;">*shipping and sales tax are added at checkout</p>` : '';
  const cta = show.cta ? `<table cellpadding="0" cellspacing="0" border="0" style="width:100%; font-family:${FONT}; margin-top:26px;"><tbody><tr><td><a href="{{CART_LINK}}" style="display:block; text-align:center; background:${ACC}; color:#fff; text-decoration:none; font-size:15px; font-weight:600; padding:15px; border-radius:8px;">View this option</a></td></tr></tbody></table>` : '';
  return `<table cellpadding="0" cellspacing="0" border="0" style="font-family:${FONT}; width:600px;"><tbody><tr><td style="padding:8px 4px;">
    <div style="font-size:12px; letter-spacing:1.4px; text-transform:uppercase; color:${ACC}; font-weight:700;">${_esc(groupName)}</div>
    <div style="font-size:28px; font-weight:800; color:${INK}; letter-spacing:-.6px; margin:6px 0 22px;">${_esc(optionName)}</div>
    ${msg}
    <table cellpadding="0" cellspacing="0" border="0" style="font-family:${FONT}; width:100%;"><tbody>${rows}${totalsRow}</tbody></table>
    ${exp}${disc}${cta}
  </td></tr></tbody></table>`;
}

/* ── TEMPLATE 3 — CATALOG CARDS ── */
function tplCatalog(m) {
  const { groupName, optionName, expiration, message, lines, total, show } = m;
  const FONT = '&quot;Lato&quot;, Helvetica, Arial, sans-serif';
  const ACC = '#339900', ACC_BG = '#e9f4e2', INK = '#1f2937', MUT = '#6b7280', PRICE = '#ff6600', PRICE_BG = '#fff1e6';
  const msg = (show.message && message) ? `<p style="color:#374151; font-size:14px; line-height:1.55; margin:0 0 16px;">${_esc(message).replace(/\n/g, '<br/>')}</p>` : '';
  const cards = lines.map((l) => {
    const img = show.images ? `<td width="120" valign="top" style="padding:14px;"><img src="${_esc(l.img)}" width="104" border="0" style="border-radius:8px; display:block;" /></td>` : '';
    const sub = l.subtitle ? `<div style="font-size:12px; color:${MUT}; margin-top:4px;">${_esc(l.subtitle)}</div>` : '';
    const qtyLine = show.cost ? `Qty ${l.qty} &nbsp;·&nbsp; ${_money(l.unitPrice)} ea` : `Qty ${l.qty}`;
    return `<table cellpadding="0" cellspacing="0" border="0" style="width:100%; font-family:${FONT}; border:1px solid #e5e7eb; border-radius:10px; margin-bottom:12px;"><tbody><tr>${img}<td valign="middle" style="padding:14px ${show.images ? '0' : '16px'};">${_brandLine(l, ACC)}<div style="font-size:16px; color:${INK}; font-weight:700; margin-top:2px;">${_esc(l.title)}</div>${sub}<div style="font-size:12px; color:${MUT}; margin-top:7px;">${qtyLine}</div></td><td width="118" valign="middle" align="right" style="padding:14px 16px;"><span style="display:inline-block; background:${PRICE_BG}; color:${PRICE}; font-size:15px; font-weight:800; padding:7px 12px; border-radius:7px;">${_money(l.lineTotal)}</span></td></tr></tbody></table>`;
  }).join('\n');
  const totalBox = show.total ? `<table cellpadding="0" cellspacing="0" border="0" style="width:100%; font-family:${FONT}; margin-top:4px;"><tbody><tr><td style="background:${ACC_BG}; border-left:4px solid ${ACC}; border-radius:6px; padding:14px 16px;"><table width="100%"><tbody><tr><td valign="middle"><span style="font-size:13px; font-weight:700; color:${INK};">Estimated total${show.disclaimer ? '*' : ''}</span></td><td align="right" valign="middle"><span style="font-size:22px; font-weight:800; color:${PRICE};">${_money(total)}</span></td></tr></tbody></table></td></tr></tbody></table>` : '';
  const exp = show.expiration ? `<p style="font-size:13px; color:${MUT}; margin:16px 0 0;" align="right">This proposal expires on <strong style="color:${INK};">${_esc(expiration)}</strong></p>` : '';
  const disc = show.disclaimer ? `<p style="font-style:italic; color:#9ca3af; font-size:12px; margin:5px 0 0;" align="right">*shipping and sales tax added in cart</p>` : '';
  const cta = show.cta ? `<table cellpadding="0" cellspacing="0" border="0" style="width:100%; font-family:${FONT}; margin-top:22px;"><tbody><tr><td align="center"><a href="{{CART_LINK}}" style="display:inline-block; background:${ACC}; color:#fff; text-decoration:none; font-size:15px; font-weight:700; padding:13px 40px; border-radius:30px;">View this option &rsaquo;</a></td></tr></tbody></table>` : '';
  return `<table cellpadding="0" cellspacing="0" border="0" style="font-family:${FONT}; width:600px;"><tbody>
    <tr><td style="background:${ACC}; border-radius:10px 10px 0 0; padding:20px 24px;"><div style="font-size:12px; letter-spacing:1px; text-transform:uppercase; color:rgba(255,255,255,.78); font-weight:700;">${_esc(groupName)}</div><div style="font-size:23px; font-weight:800; color:#fff; margin-top:4px;">${_esc(optionName)}</div></td></tr>
    <tr><td style="padding:18px 24px 24px;">${msg}${cards}${totalBox}${exp}${disc}${cta}</td></tr>
  </tbody></table>`;
}

/* ── TEMPLATE 4 — QUOTE ── */
function tplQuote(m) {
  const { groupName, optionName, expiration, message, lines, total, show } = m;
  const FONT = '&quot;Lato&quot;, Helvetica, Arial, sans-serif';
  const ACC = '#339900', INK = '#1f2937', MUT = '#6b7280', PRICE = '#ff6600', LINE = '#e5e7eb';
  const units = lines.reduce((a, l) => a + l.qty, 0);
  const subParts = [`${units} units`, `${lines.length} item${lines.length === 1 ? '' : 's'}`];
  if (show.expiration) subParts.push(`valid until ${_esc(expiration)}`);
  const totalCell = show.total ? `<td align="right" valign="middle" width="190"><div style="font-size:11px; letter-spacing:.8px; text-transform:uppercase; color:rgba(255,255,255,.82);">Estimated total${show.disclaimer ? '*' : ''}</div><div style="font-size:31px; font-weight:800; color:#fff; letter-spacing:-.6px; margin-top:2px;">${_money(total)}</div></td>` : '';
  const panel = `<table cellpadding="0" cellspacing="0" border="0" style="width:100%; font-family:${FONT};"><tbody><tr><td style="background:${ACC}; border-radius:12px; padding:22px 24px;"><table width="100%"><tbody><tr><td valign="middle"><div style="font-size:12px; letter-spacing:1.2px; text-transform:uppercase; color:rgba(255,255,255,.82); font-weight:700;">${_esc(groupName)}</div><div style="font-size:23px; font-weight:800; color:#fff; margin:4px 0 6px;">${_esc(optionName)}</div><div style="font-size:12px; color:rgba(255,255,255,.85);">${subParts.join(' &nbsp;·&nbsp; ')}</div></td>${totalCell}</tr></tbody></table></td></tr></tbody></table>`;
  const msg = (show.message && message) ? `<p style="color:#374151; font-size:14px; line-height:1.55; margin:18px 0 0;">${_esc(message).replace(/\n/g, '<br/>')}</p>` : '';
  const cols = 1 + 1 + (show.cost ? 1 : 0) + 1;
  const th = (label, extra, align) => `<th style="font-weight:700; font-size:11px; letter-spacing:.5px; text-transform:uppercase; color:${MUT}; border-bottom:2px solid ${ACC}; padding:0 0 8px;" align="${align || 'left'}">${label}</th>`;
  const head = `<tr>${th('Item')}${th('Qty', 'width:60px;')}${show.cost ? th('Unit', 'width:80px;', 'right') : ''}${th('Total', 'width:90px;', 'right')}</tr>`;
  const rows = lines.map((l) => {
    const sub = l.subtitle ? `<div style="font-size:12px; color:${MUT}; margin-top:3px;">${_esc(l.subtitle)}</div>` : '';
    const cost = show.cost ? `<td valign="middle" align="right" style="padding:13px 0; font-size:13px; color:${INK};">${_money(l.unitPrice)}</td>` : '';
    return `<tr><td valign="middle" style="padding:13px 0;">${_brandLine(l, MUT)}<div style="font-size:14px; color:${INK}; font-weight:700;">${_esc(l.title)}</div>${sub}</td><td valign="middle" style="padding:13px 0; font-size:13px; color:${INK};">${l.qty}</td>${cost}<td valign="middle" align="right" style="padding:13px 0; font-size:14px; font-weight:800; color:${PRICE};">${_money(l.lineTotal)}</td></tr><tr><td colspan="${cols}" style="border-bottom:1px solid ${LINE}; font-size:0; line-height:0;">&nbsp;</td></tr>`;
  }).join('\n');
  const disc = show.disclaimer ? `<p style="font-style:italic; color:#9ca3af; font-size:12px; margin:14px 0 0;">*shipping and sales tax are calculated in the shopping cart</p>` : '';
  const cta = show.cta ? `<table cellpadding="0" cellspacing="0" border="0" style="width:100%; font-family:${FONT}; margin-top:22px;"><tbody><tr><td><a href="{{CART_LINK}}" style="display:block; text-align:center; background:${ACC}; color:#fff; text-decoration:none; font-size:15px; font-weight:700; padding:15px; border-radius:8px;">Approve &amp; view in cart &rsaquo;</a></td></tr></tbody></table>` : '';
  return `<table cellpadding="0" cellspacing="0" border="0" style="font-family:${FONT}; width:600px;"><tbody><tr><td>
    ${panel}${msg}
    <table cellpadding="0" cellspacing="0" border="0" style="width:100%; font-family:${FONT}; margin-top:20px;"><tbody>${head}${rows}</tbody></table>
    ${disc}${cta}
  </td></tr></tbody></table>`;
}

/* ── TEMPLATE 5 — LOOKBOOK ── */
function tplLookbook(m) {
  const { groupName, optionName, expiration, message, lines, total, show } = m;
  const FONT = '&quot;Lato&quot;, Helvetica, Arial, sans-serif';
  const ACC = '#339900', INK = '#1f2937', MUT = '#6b7280', PRICE = '#ff6600';
  const head = `<div style="text-align:center;"><div style="font-size:12px; letter-spacing:1.4px; text-transform:uppercase; color:${ACC}; font-weight:800;">${_esc(groupName)}</div><div style="font-size:26px; font-weight:800; color:${INK}; margin:7px 0 0;">${_esc(optionName)}</div><div style="width:46px; height:4px; background:${ACC}; border-radius:2px; margin:14px auto 0;"></div></div>`;
  const msg = (show.message && message) ? `<p style="color:#374151; font-size:14px; line-height:1.55; margin:18px 0 0; text-align:center;">${_esc(message).replace(/\n/g, '<br/>')}</p>` : '';
  const cards = lines.map((l) => {
    const imgRow = show.images ? `<tr><td align="center" style="padding:18px 18px 4px;"><img src="${_esc(l.img)}" width="220" border="0" style="border-radius:8px; display:block; margin:0 auto;" /></td></tr>` : '';
    const sub = l.subtitle ? `<div style="font-size:12px; color:${MUT}; margin-top:4px;">${_esc(l.subtitle)}</div>` : '';
    const qtyLine = show.cost ? `Qty ${l.qty} &nbsp;·&nbsp; ${_money(l.unitPrice)} ea` : `Qty ${l.qty}`;
    return `<table cellpadding="0" cellspacing="0" border="0" style="width:100%; font-family:${FONT}; border:1px solid #e5e7eb; border-radius:12px; margin-bottom:14px;"><tbody>${imgRow}<tr><td style="padding:${show.images ? '6px' : '16px'} 18px 16px;"><table width="100%"><tbody><tr><td valign="middle">${_brandLine(l, ACC)}<div style="font-size:17px; color:${INK}; font-weight:700; margin-top:2px;">${_esc(l.title)}</div>${sub}<div style="font-size:12px; color:${MUT}; margin-top:6px;">${qtyLine}</div></td><td valign="middle" align="right" width="96"><span style="font-size:19px; font-weight:800; color:${PRICE};">${_money(l.lineTotal)}</span></td></tr></tbody></table></td></tr></tbody></table>`;
  }).join('\n');
  const totalBox = show.total ? `<table cellpadding="0" cellspacing="0" border="0" style="width:100%; font-family:${FONT};"><tbody><tr><td style="border-top:2px solid ${ACC}; padding:16px 2px 0;"><table width="100%"><tbody><tr><td valign="middle"><span style="font-size:12px; letter-spacing:.6px; text-transform:uppercase; color:${MUT}; font-weight:700;">Estimated total${show.disclaimer ? '*' : ''}</span></td><td align="right" valign="middle"><span style="font-size:25px; font-weight:800; color:${PRICE};">${_money(total)}</span></td></tr></tbody></table></td></tr></tbody></table>` : '';
  const exp = show.expiration ? `<p style="font-size:13px; color:${MUT}; margin:14px 0 0; text-align:center;">This proposal expires on <strong style="color:${INK};">${_esc(expiration)}</strong></p>` : '';
  const disc = show.disclaimer ? `<p style="font-style:italic; color:#9ca3af; font-size:12px; margin:5px 0 0; text-align:center;">*shipping and sales tax added in cart</p>` : '';
  const cta = show.cta ? `<table cellpadding="0" cellspacing="0" border="0" style="width:100%; font-family:${FONT}; margin-top:22px;"><tbody><tr><td align="center"><a href="{{CART_LINK}}" style="display:inline-block; background:${ACC}; color:#fff; text-decoration:none; font-size:15px; font-weight:700; padding:14px 44px; border-radius:30px;">View this option &rsaquo;</a></td></tr></tbody></table>` : '';
  return `<table cellpadding="0" cellspacing="0" border="0" style="font-family:${FONT}; width:600px;"><tbody><tr><td style="padding:4px 4px 6px;">
    ${head}${msg}
    <div style="height:20px; line-height:20px; font-size:0;">&nbsp;</div>
    ${cards}${totalBox}${exp}${disc}${cta}
  </td></tr></tbody></table>`;
}

export const PROPOSAL_TEMPLATES = [
  { id: 'classic', name: 'Classic', sub: 'Bordered card · Golfballs original', accent: '#339900', build: tplClassic },
  { id: 'minimal', name: 'Minimal', sub: 'Borderless · left-aligned', accent: '#339900', build: tplMinimal },
  { id: 'catalog', name: 'Catalog cards', sub: 'Item cards · header band', accent: '#339900', build: tplCatalog },
  { id: 'quote', name: 'Quote', sub: 'Total-summary panel · lined table', accent: '#339900', build: tplQuote },
  { id: 'lookbook', name: 'Lookbook', sub: 'Image-top cards · centered', accent: '#339900', build: tplLookbook },
];
const tplById = (id) => PROPOSAL_TEMPLATES.find((t) => t.id === id) || PROPOSAL_TEMPLATES[0];

function previewDocument(emailHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;background:#eef0f2;padding:26px 18px;}.page{display:flex;justify-content:center;}.sheet{background:#fff;padding:26px;border-radius:8px;box-shadow:0 8px 30px rgba(20,20,30,.12);}</style></head><body><div class="page"><div class="sheet">${emailHtml}</div></div></body></html>`;
}

function TemplateThumb({ id, accent }) {
  const bar = (w, c, h) => ({ width: w, height: h || 3, background: c, borderRadius: 1 });
  const G = '#cfd3d8';
  const wrap = { width: 46, height: 36, flexShrink: 0, borderRadius: 4, background: '#fff', border: '1px solid #e1e4e8', padding: 4, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' };
  if (id === 'classic') return <div style={{ ...wrap, border: `1.5px solid ${G}`, alignItems: 'center' }}><div style={{ ...bar(20, accent), marginTop: 1 }} /><div style={bar(26, '#e3e6ea', 2)} /><div style={{ display: 'flex', gap: 2, width: '100%', marginTop: 1 }}><div style={bar(10, G, 8)} /><div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><div style={bar('100%', '#e3e6ea', 2)} /><div style={bar('70%', '#eceef1', 2)} /></div></div></div>;
  if (id === 'catalog') return <div style={{ ...wrap, padding: 0 }}><div style={{ ...bar('100%', accent, 9), borderRadius: '3px 3px 0 0' }} /><div style={{ padding: 4, display: 'flex', flexDirection: 'column', gap: 3 }}><div style={{ display: 'flex', gap: 2, alignItems: 'center', border: `1px solid ${G}`, borderRadius: 2, padding: 1 }}><div style={bar(7, G, 7)} /><div style={bar(14, '#e3e6ea', 2)} /><div style={{ ...bar(6, accent, 4), marginLeft: 'auto' }} /></div><div style={{ display: 'flex', gap: 2, alignItems: 'center', border: `1px solid ${G}`, borderRadius: 2, padding: 1 }}><div style={bar(7, G, 7)} /><div style={bar(14, '#e3e6ea', 2)} /><div style={{ ...bar(6, accent, 4), marginLeft: 'auto' }} /></div></div></div>;
  if (id === 'quote') return <div style={{ ...wrap, gap: 3 }}><div style={{ ...bar('100%', accent, 14), borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 2, boxSizing: 'border-box' }}><div style={bar(11, 'rgba(255,255,255,.8)', 6)} /></div><div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 1 }}><div style={bar(18, '#e3e6ea', 2)} /><div style={bar(7, '#ff6600', 2)} /></div><div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={bar(16, '#e3e6ea', 2)} /><div style={bar(7, '#ff6600', 2)} /></div></div>;
  if (id === 'lookbook') return <div style={{ ...wrap, alignItems: 'center', gap: 2 }}><div style={{ width: 9, height: 2, background: accent, borderRadius: 1, marginTop: 1 }} /><div style={{ width: '100%', border: `1px solid ${G}`, borderRadius: 2, padding: 2, display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center', boxSizing: 'border-box' }}><div style={bar(16, G, 9)} /><div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}><div style={bar(12, '#e3e6ea', 2)} /><div style={bar(6, '#ff6600', 2)} /></div></div><div style={{ ...bar('100%', accent, 3), marginTop: 'auto' }} /></div>;
  return <div style={{ ...wrap, gap: 3 }}><div style={bar(8, accent, 2)} /><div style={bar(24, '#2b2f36', 4)} /><div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}><div style={bar(20, '#e3e6ea', 2)} /><div style={bar(8, accent, 2)} /></div><div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={bar(18, '#e3e6ea', 2)} /><div style={bar(8, '#e3e6ea', 2)} /></div><div style={{ ...bar('100%', '#2b2f36', 5), marginTop: 'auto' }} /></div>;
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
  const [focus, setFocus] = useState(false);
  const common = {
    width: '100%', boxSizing: 'border-box', padding: area ? '8px 10px' : '0 10px', height: area ? 'auto' : 32,
    background: 'var(--gb-fill-inverse-medium)', borderRadius: 'var(--gb-r-sm)',
    border: '1px solid ' + (focus ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'),
    outline: 'none', color: 'var(--gb-text-primary)', fontFamily: mono ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)',
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
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 'var(--gb-r-md)', cursor: 'pointer', background: checked ? 'var(--gb-brand-tint-soft)' : hover ? 'var(--gb-fill-subtle)' : 'transparent', border: '1px solid ' + (checked ? 'var(--gb-brand-tint-border)' : 'transparent'), transition: 'all var(--gb-anim)' }}>
      <div style={{ width: 17, height: 17, flexShrink: 0, marginTop: 1, borderRadius: 5, background: checked ? 'var(--gb-brand-label)' : 'var(--gb-fill-inverse-strong)', border: '1px solid ' + (checked ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'), color: 'var(--gb-surface-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all var(--gb-anim)' }}>{checked && <I.check size={11} strokeWidth={3} />}</div>
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
export function ProposalEmailModal({ source, onClose }) {
  const [groupName, setGroupName] = useState(source.groupName || 'Your Custom Order');
  const [optionName, setOptionName] = useState(source.optionName || 'Option 1');
  const [message, setMessage] = useState('');
  const [expiration, setExpiration] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 14); return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`; });
  const [templateId, setTemplateId] = useState('classic');
  const [show, setShow] = useState({ images: true, cost: true, total: true, expiration: true, disclaimer: true, cta: true, message: false });
  const [copied, setCopied] = useState(false);

  const toggle = (k) => setShow((s) => ({ ...s, [k]: !s[k] }));
  const tpl = tplById(templateId);
  const model = useMemo(() => ({ groupName, optionName, expiration, message, lines: source.lines, total: source.total, show }), [groupName, optionName, expiration, message, source.lines, source.total, show]);
  const emailHtml = useMemo(() => tpl.build(model), [tpl, model]);
  const doc = useMemo(() => previewDocument(emailHtml), [emailHtml]);

  const flash = () => { setCopied(true); setTimeout(() => setCopied(false), 1800); };
  // Copy RICH — write the HTML to the clipboard as `text/html` so pasting into a
  // mail client / doc renders the FORMATTING (writeText only copies the raw markup
  // string, which is what pasted as literal HTML before). text/plain carries the
  // source as a fallback for plain-text fields.
  const copyRich = async () => {
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new window.ClipboardItem({
          'text/html': new Blob([emailHtml], { type: 'text/html' }),
          'text/plain': new Blob([emailHtml], { type: 'text/plain' }),
        })]);
      } else {
        await navigator.clipboard.writeText(emailHtml);
      }
    } catch (e) {
      try { await navigator.clipboard.writeText(emailHtml); } catch (e2) { /* no-op */ }
    }
    flash();
  };
  // Copy the raw HTML source (for pasting into an HTML editor / code field).
  const copySource = async () => { try { await navigator.clipboard.writeText(emailHtml); } catch (e) { /* */ } };

  return (
    <motion.div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .2 }}
      style={{ position: 'fixed', inset: 0, zIndex: 999995, padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gb-surface-canvas)' }}>
      <motion.div initial={{ opacity: 0, scale: .96, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .97, y: 10 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        style={{ width: 'min(1320px, 97vw)', height: 'min(900px, 95vh)', display: 'flex', flexDirection: 'column', background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-xl)', overflow: 'hidden', boxShadow: 'var(--gb-shadow-modal)' }}>
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
                <OptionToggle checked={show.images} label="Product images" onClick={() => toggle('images')} />
                <OptionToggle checked={show.cost} label="Unit cost / qty detail" onClick={() => toggle('cost')} />
                <OptionToggle checked={show.total} label="Estimated total" hint="Uncheck to hide the subtotal" onClick={() => toggle('total')} />
                <OptionToggle checked={show.expiration} label="Expiration date" onClick={() => toggle('expiration')} />
                <OptionToggle checked={show.disclaimer} label="Shipping &amp; tax disclaimer" onClick={() => toggle('disclaimer')} />
                <OptionToggle checked={show.cta} label="“View this option” button" hint="Links to the cart — added server-side" onClick={() => toggle('cta')} />
                <OptionToggle checked={show.message} label="Show personal message" onClick={() => toggle('message')} />
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
            <div style={{ flex: 1, minHeight: 0 }}>
              <iframe title="proposal-preview" srcDoc={doc} style={{ width: '100%', height: '100%', border: 'none', background: '#eef0f2' }} />
            </div>
          </div>
        </div>

        {/* footer */}
        <div style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gb-fill-inverse-strong)', borderTop: '1px solid var(--gb-border-subtle)', flexShrink: 0 }}>
          <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <I.alert size={12} /> Cart link <code style={{ fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-tertiary)' }}>{'{{CART_LINK}}'}</code> is injected server-side.
          </span>
          <div style={{ flex: 1 }} />
          <Btn variant="ghost" size="md" icon={<I.copy />} onClick={copySource}>Copy source</Btn>
          <Btn variant="primary" size="md" icon={copied ? <I.check /> : <I.copy />} onClick={copyRich}>{copied ? 'Copied' : 'Copy'}</Btn>
        </div>
      </motion.div>
    </motion.div>
  );
}
