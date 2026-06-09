import React, { useState, useEffect, createContext, useContext, useMemo, useCallback, useRef } from 'react';
import { Btn, Tag, Dot, DraggablePopup, Segmented, CompactModal, ModalHeader, ModalFooter, Slider, IconBtn, Dropdown } from '../ui/index.js';
import { motion, AnimatePresence } from 'motion/react';
import { Icon, I } from '../ui/icons.jsx';
import { GolfballViewer } from './GolfballViewer.jsx';
import { useDevSetting } from '../lib/devSettings.js';
import { PREVIEW_GRID, GlassIconBtn, DropperIcon, ResetIcon, SwapPopover, recolorImage, samplePixel } from '../ui/components/ImageColorSwap.jsx';
import { loadGiftSetOptions } from '../lib/giftSetsData.js';
import { giftSetSizeLabel } from '../lib/giftSets.js';
import { giftSetLayout } from '../lib/giftSetLayout.js';
import { giftSetPreviewUrl } from '../lib/cartSerializer.js';

/* ───────────────────────────────────────────────────────────────
   giftCustomize.jsx — the real per-product personalization UI for
   the Corporate Gifting Catalog, replacing the old "N options" count.

   Schema-driven from the live customizer inspection (gb-design/
   golfballs/option-schema.json — the authoritative source; the
   design prototype's control data was flagged wrong). Each product's
   modificationName_ss array drives which option blocks render.

   Two UX families: golf balls get a "Print Type" tile grid; every
   other corporate item gets the Custom Logo decoration block (+ any
   extras like Tee / Poker Chip Second Pole / bundle base colors).
─────────────────────────────────────────────────────────────── */

/* ── Live data (option-schema.json + colors-live.json) ───────── */
/* Imprint palette — 81 named colors scraped from the live ColorSelectorBar.
   First 8 are the "common" quick row; the rest expand on demand. Used by every
   golf-ball imprint color control (Personalized, Monogram ×2, AlignXL ×2, IDAlign ×2). */
const COMMON_COUNT = 6;
const IMPRINT_COLORS = [
  { name: 'Black', hex: '#000000' }, { name: 'Red', hex: '#d2232a' }, { name: 'Green', hex: '#1c4120' },
  { name: 'Blue', hex: '#0b48a0' }, { name: 'Pink', hex: '#ff60b2' }, { name: 'Orange', hex: '#ff6a13' },
  { name: 'Purple', hex: '#582c83' }, { name: 'Gold', hex: '#b59f65' }, { name: 'Chili Pepper Red', hex: '#b61c19' },
  { name: 'Persian Red', hex: '#d32f2e' }, { name: 'Red Orange', hex: '#f24334' }, { name: 'Dark Peach', hex: '#e57373' },
  { name: 'Mulberry', hex: '#880d52' }, { name: 'Burnt Pink', hex: '#c2175b' }, { name: 'Red Pink', hex: '#eb1d63' },
  { name: 'Rosy Pink', hex: '#f06292' }, { name: 'Purple Iris', hex: '#49148d' }, { name: 'Purple Jam', hex: '#7a1fa2' },
  { name: 'Dark Orchid', hex: '#9c28b1' }, { name: 'Rich Lilac', hex: '#b968c7' }, { name: 'Persian Indigo', hex: '#301b90' },
  { name: 'Blueberry', hex: '#512da7' }, { name: 'Dark Lavender', hex: '#653bb7' }, { name: 'Lavender', hex: '#9675ce' },
  { name: 'Denim Blue', hex: '#1c227f' }, { name: 'Cerulean Blue', hex: '#4050b5' }, { name: 'Moody Blue', hex: '#7986cc' },
  { name: 'Royal Azure', hex: '#013088' }, { name: 'Water Blue', hex: '#1976d3' }, { name: 'Azure', hex: '#2196f3' },
  { name: 'Crystal Blue', hex: '#64b5f6' }, { name: 'Venice Blue', hex: '#035697' }, { name: 'Bondi Blue', hex: '#0288d1' },
  { name: 'Bright Cerulean', hex: '#02a9f5' }, { name: 'Picton Blue', hex: '#4fc2f8' }, { name: 'Deep Aqua', hex: '#035f60' },
  { name: 'Teal Blue', hex: '#0098a7' }, { name: 'Topaz', hex: '#01bcd3' }, { name: 'Aquamarine Blue', hex: '#4dd0e2' },
  { name: 'Aqua Deep', hex: '#014b3f' }, { name: 'Pine Green', hex: '#00796a' }, { name: 'Teal', hex: '#009788' },
  { name: 'Light Sea Green', hex: '#4ab5a7' }, { name: 'Everglade', hex: '#184d33' }, { name: 'Fern Green', hex: '#3b8c40' },
  { name: 'Green Apple', hex: '#4cb050' }, { name: 'Pistachio', hex: '#80c77f' }, { name: 'Green Leaf', hex: '#33681e' },
  { name: 'Muted Green', hex: '#699d3a' }, { name: 'Mantis', hex: '#8bc24a' }, { name: 'Pale Olive', hex: '#acd683' },
  { name: 'Hazel', hex: '#817716' }, { name: 'Mustard Green', hex: '#b0b42a' }, { name: 'Pear', hex: '#cddc39' },
  { name: 'Golden Sand', hex: '#dde774' }, { name: 'Pumpkin', hex: '#f47f16' }, { name: 'Sunglow', hex: '#f9c031' },
  { name: 'Banana Yellow', hex: '#ffeb3c' }, { name: 'Sandy Yellow', hex: '#fcf274' }, { name: 'Blaze Orange', hex: '#ff6f00' },
  { name: 'Orange Peel', hex: '#ffa101' }, { name: 'Golden Yellow', hex: '#fec107' }, { name: 'Naples Yellow', hex: '#fdd450' },
  { name: 'Deep Orange', hex: '#e65101' }, { name: 'Gold Drop', hex: '#f67b00' }, { name: 'Medium Orange', hex: '#ff9700' },
  { name: 'Butterscotch', hex: '#ffb64d' }, { name: 'Rusty Red', hex: '#bf360c' }, { name: 'Reddish Orange', hex: '#e64a15' },
  { name: 'Portland Orange', hex: '#fe5722' }, { name: 'Coral', hex: '#ff8964' }, { name: 'English Walnut', hex: '#3c2623' },
  { name: 'Irish Coffee', hex: '#5d4038' }, { name: 'Ferra', hex: '#765647' }, { name: 'Pale Oyster', hex: '#a0887e' },
  { name: 'Gunmetal', hex: '#273238' }, { name: 'River Bed', hex: '#465967' }, { name: 'Slate Blue', hex: '#5f7d8a' },
  { name: 'Cadet Grey', hex: '#90a4ad' }, { name: 'Davy Grey', hex: '#525252' }, { name: 'Regent Grey', hex: '#969696' },
];
const THREAD_COLORS = [
  { name: 'Black', hex: '#1c1c1c' }, { name: 'White', hex: '#f3f3f0' }, { name: 'Red', hex: '#c0392b' },
  { name: 'Orange', hex: '#e07b2e' }, { name: 'Grey', hex: '#8b8f96' }, { name: 'Navy', hex: '#2c3e6b' },
  { name: 'Green', hex: '#2e7d44' }, { name: 'Yellow', hex: '#e1c12e' }, { name: 'Blue', hex: '#2b6fb0' },
  { name: 'Purple', hex: '#7b4ea3' }, { name: 'Pink', hex: '#d36b9a' },
];
const BASE_COLORS = [
  { name: 'Black', hex: '#1c1c1c' }, { name: 'Blue', hex: '#2b6fb0' }, { name: 'Green', hex: '#2e7d44' },
  { name: 'Orange', hex: '#e07b2e' }, { name: 'Pink', hex: '#d36b9a' }, { name: 'Purple', hex: '#7b4ea3' },
  { name: 'Red', hex: '#c0392b' }, { name: 'White', hex: '#f3f3f0' }, { name: 'Yellow', hex: '#e1c12e' },
  { name: 'Gray', hex: '#8b8f96' },
];
const FONTS = ['Kabel Dm BT', 'Calibri', 'Lucida Handwriting', 'Bradley Hand']; // live-verified
const SIZES = ['Standard', 'Large', 'Max'];
/* ── SVG art helpers — monochrome motifs (currentColor) built into the
   style thumbnails so the selector shows what each option actually looks like.
   viewBox 0 0 84 48; exact site art = the referenced cloudfront PNGs. ───── */
const _C = 'currentColor';
function _starPts(cx, cy, r) { let p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.4 : r; p.push((cx + rr * Math.cos(a)).toFixed(2) + ',' + (cy + rr * Math.sin(a)).toFixed(2)); } return p.join(' '); }
const _star = (cx, cy, r) => `<polygon points="${_starPts(cx, cy, r)}" fill="${_C}"/>`;
const _dot = (cx, cy, r = 3.5) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${_C}"/>`;
const _skull = (cx, cy) => `<g stroke="${_C}" stroke-width="1.5" fill="none"><line x1="${cx - 5}" y1="${cy - 5}" x2="${cx + 5}" y2="${cy + 5}"/><line x1="${cx + 5}" y1="${cy - 5}" x2="${cx - 5}" y2="${cy + 5}"/></g><circle cx="${cx}" cy="${cy}" r="4" fill="${_C}"/>`;
const _martini = (cx, cy) => `<g stroke="${_C}" stroke-width="1.5" fill="none"><path d="M${cx - 5},${cy - 7} L${cx + 5},${cy - 7} L${cx},${cy} Z"/><line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy + 7}"/><line x1="${cx - 4}" y1="${cy + 7}" x2="${cx + 4}" y2="${cy + 7}"/></g>`;
const _wine = (cx, cy) => `<g stroke="${_C}" stroke-width="1.5" fill="none"><path d="M${cx - 4},${cy - 7} a4,5 0 0,0 8,0 Z"/><line x1="${cx}" y1="${cy - 2}" x2="${cx}" y2="${cy + 7}"/><line x1="${cx - 4}" y1="${cy + 7}" x2="${cx + 4}" y2="${cy + 7}"/></g>`;
const _chev = (cx, cy, s = 6) => `<path d="M${cx - s / 2},${cy - s} L${cx + s / 2},${cy} L${cx - s / 2},${cy + s}" stroke="${_C}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
const _hline = (w) => `<line x1="8" y1="24" x2="76" y2="24" stroke="${_C}" stroke-width="${w}" stroke-linecap="round"/>`;
const _row = (fn, xs) => xs.map((x) => fn(x, 24)).join('');
const _txt = (x, y, s, str, extra = '') => `<text x="${x}" y="${y}" text-anchor="middle" font-family="Georgia,serif" font-size="${s}" fill="${_C}" ${extra}>${str}</text>`;

/* Monogram styles (7) — real icustomize vectors (icustomize.com/GBC/Monogram/r),
   traced to themeable paths (currentColor). Grouped 3 / 2 / 1 Initials. */
const MONO_STYLES = [
  { key: 'circle', group: '3 Initials', label: 'Circle', viewBox: '0 0 256 255', svg: `<path fill="${_C}" fill-rule="evenodd" d="M114.2,253.0C60.8,247.0 14.4,204.9 4.1,153.1C-7.5,95.7 20.1,40.4 73.5,14.0C135.0,-16.4 210.9,9.9 242.3,72.5C256.1,100.0 258.4,136.6 248.4,167.0C236.6,202.5 206.1,233.5 170.2,246.4C154.5,252.0 130.5,254.9 114.2,253.0ZM153.0,236.0C158.2,234.9 162.6,234.0 162.8,234.0C162.9,234.0 163.0,213.4 163.0,188.3L163.0,142.5L155.5,135.0L148.0,127.5L155.5,120.0L163.0,112.6L163.0,66.8L163.0,21.0L160.8,20.5C136.5,14.9 120.6,14.7 98.8,19.6L92.0,21.2L92.0,127.4L92.0,233.7L102.2,235.8C107.9,237.0 113.8,238.1 115.5,238.4C121.8,239.3 143.9,237.9 153.0,236.0ZM181.9,227.0C206.7,209.9 220.4,194.8 229.0,175.2C234.1,163.2 234.2,163.3 222.8,159.4L213.0,156.1L208.6,165.3C206.2,170.4 202.2,177.2 199.8,180.5L195.5,186.5L195.2,128.1C195.1,96.0 195.2,69.4 195.5,69.2C196.7,67.9 206.0,82.1 209.5,90.7C211.1,94.4 212.7,97.9 213.1,98.4C213.7,99.0 232.4,93.7 233.8,92.4C235.0,91.4 225.0,69.8 219.7,62.0C215.1,55.2 204.4,44.4 196.5,38.5C189.5,33.3 175.6,25.0 173.9,25.0C173.4,25.0 173.0,67.0 173.0,128.5C173.0,185.4 173.4,232.0 173.8,232.0C174.3,232.0 177.9,229.8 181.9,227.0ZM83.0,127.5C83.0,58.3 82.7,26.0 82.0,26.0C77.7,26.0 61.1,37.0 51.3,46.3C16.9,78.9 6.6,127.0 24.5,170.0C30.2,183.4 29.3,183.0 39.9,177.0C44.9,174.2 49.0,171.5 49.0,171.1C49.0,170.6 47.7,167.4 46.1,163.8C43.3,157.7 40.8,149.3 39.5,142.2L39.0,139.0L50.0,139.0L61.0,139.0L61.2,178.2L61.5,217.5L71.5,223.2C77.0,226.4 81.8,229.0 82.2,229.0C82.7,229.0 83.0,183.3 83.0,127.5ZM117.2,216.3L114.0,215.9L114.0,177.4L114.0,139.0L120.8,139.0L127.6,139.0L134.3,145.8L141.0,152.6L141.0,184.1L141.0,215.7L135.8,216.4C130.3,217.0 122.9,217.0 117.2,216.3ZM39.6,112.2C40.5,106.1 45.9,90.9 49.2,85.0C52.1,79.8 59.8,69.0 60.6,69.0C60.8,69.0 61.0,79.6 61.0,92.5L61.0,116.0L50.0,116.0L39.0,116.0L39.6,112.2ZM114.0,77.6L114.0,39.3L117.8,38.6C122.6,37.8 130.5,37.8 136.4,38.6L141.0,39.3L141.0,71.4L141.0,103.6L134.7,109.8L128.4,116.0L121.2,116.0L114.0,116.0L114.0,77.6Z"/>` },
  { key: 'hex', group: '3 Initials', label: 'Hexagram', viewBox: '0 0 256 256', svg: `<path fill="${_C}" fill-rule="evenodd" d="M38.2,217.7L1.0,180.5L1.0,128.0L1.0,75.5L38.3,38.2L75.5,1.0L128.0,1.0L180.5,1.0L217.7,38.2L255.0,75.5L255.0,128.0L255.0,180.5L217.7,217.8L180.5,255.0L128.0,255.0L75.5,255.0L38.2,217.7ZM207.7,207.8L241.0,174.5L241.0,128.0L241.0,81.5L207.8,48.3L174.5,15.0L128.0,15.0L81.5,15.0L48.8,47.8L16.0,80.5L16.0,128.0L15.9,175.4L48.7,208.2L81.5,241.0L128.0,241.0L174.5,241.0L207.7,207.8ZM91.0,128.0L91.0,25.0L127.5,25.0L164.0,25.0L164.0,66.7L164.0,108.5L154.8,117.8L145.5,127.1L154.8,135.8L164.0,144.5L164.0,187.8L164.0,231.0L127.5,231.0L91.0,231.0L91.0,128.0ZM171.0,128.5L171.0,27.5L200.0,56.5L229.0,85.5L229.0,96.0L229.0,106.5L207.5,85.0L186.0,63.5L186.0,128.5L186.0,193.5L207.5,172.0L229.0,150.5L229.0,161.0L229.0,171.5L200.0,200.5L171.0,229.5L171.0,128.5ZM75.2,220.8L68.0,213.5L68.0,184.2L68.0,155.0L54.5,155.0L41.0,155.0L41.0,170.5C41.0,179.0 40.8,186.0 40.6,186.0C40.4,186.0 37.0,182.7 33.1,178.8L26.0,171.5L26.0,148.8L26.0,126.1L30.1,113.3C32.3,106.3 36.6,92.6 39.7,83.0L45.2,65.5L52.0,58.6L58.8,51.7L70.9,88.7L83.0,125.8L82.8,176.9L82.5,228.1L75.2,220.8ZM149.0,183.1L149.0,150.2L140.4,142.1L131.7,134.0L118.9,134.0L106.0,134.0L106.0,175.0L106.0,216.0L127.5,216.0L149.0,216.0L149.0,183.1ZM68.0,133.7C68.0,128.7 66.7,123.5 61.5,107.5C57.9,96.6 54.8,87.5 54.6,87.3C54.4,87.1 51.3,96.1 47.6,107.3C42.4,123.4 41.0,128.9 41.0,133.8L41.0,140.0L54.5,140.0L68.0,140.0L68.0,133.7ZM140.7,111.8L149.0,103.5L149.0,71.8L149.0,40.0L127.5,40.0L106.0,40.0L106.0,80.0L106.0,120.0L119.2,120.0L132.5,120.0L140.7,111.8Z"/>` },
  { key: 'gardenia', group: '3 Initials', label: 'Gardenia', viewBox: '0 0 256 164', svg: `<path fill="${_C}" fill-rule="evenodd" d="M73.7,161.9C67.4,158.2 67.6,142.0 74.0,142.0C77.0,142.0 77.1,143.5 74.5,145.8C71.3,148.6 71.2,153.7 74.1,157.4C79.3,164.0 85.9,157.4 90.8,140.5C93.7,131.0 96.8,116.1 104.0,79.0C113.2,31.5 117.1,17.2 121.6,15.1C124.7,13.7 131.0,13.7 134.5,15.0C136.7,15.8 136.9,16.3 136.1,17.9C130.7,27.9 124.2,49.2 113.5,92.0C102.3,136.4 93.9,156.9 85.0,161.5C81.7,163.2 76.3,163.4 73.7,161.9ZM123.9,160.7C114.6,157.5 109.6,153.8 106.5,147.7C101.8,138.2 104.0,128.6 111.6,125.4C118.5,122.5 124.5,126.0 124.5,133.0C124.5,137.6 123.9,138.4 121.0,137.5C119.3,137.0 119.0,136.3 119.5,134.0C120.7,128.4 114.8,126.1 110.5,130.5C107.2,133.7 107.1,140.8 110.2,147.0C116.6,159.6 140.4,160.8 155.9,149.3C175.5,135.0 177.0,107.2 159.1,89.6L154.3,84.8L146.8,87.5C137.3,90.9 131.2,90.7 129.1,86.9C124.7,79.0 134.8,73.8 148.3,76.9L152.2,77.8L156.1,71.7C164.8,58.3 167.4,40.5 162.6,28.7C155.3,11.0 142.3,2.5 126.0,4.7C103.0,7.9 83.8,24.3 86.4,38.5C88.1,47.3 99.6,51.5 102.8,44.5C105.3,39.1 103.8,34.7 99.6,34.8C98.0,34.8 96.8,34.1 96.5,32.9C95.6,30.1 96.7,29.0 100.5,29.0C107.0,29.0 110.0,37.2 106.6,45.4C104.8,49.8 101.4,52.0 96.7,52.0C79.8,52.0 78.1,29.0 93.9,14.7C104.1,5.6 117.3,1.0 133.0,1.0C149.8,1.0 161.2,5.1 170.6,14.4C186.8,30.7 185.4,54.0 166.9,73.4L160.1,80.6L164.7,83.0C171.2,86.4 180.6,96.2 184.3,103.4C187.3,109.1 187.5,110.2 187.5,120.0C187.5,129.8 187.3,131.0 184.3,137.2C176.4,153.9 160.5,163.0 139.5,163.0C132.8,163.0 128.8,162.4 123.9,160.7ZM61.5,120.4C58.6,117.2 56.1,110.3 55.3,102.8C55.0,99.6 54.3,97.0 53.9,97.0C53.4,97.0 53.0,97.5 53.0,98.1C53.0,101.1 41.7,116.0 37.3,118.9C26.2,126.3 14.6,120.3 9.8,104.6C6.9,95.0 7.6,76.5 11.4,63.6C12.9,58.7 13.9,54.6 13.8,54.5C13.6,54.4 11.8,53.3 9.7,52.1C-0.5,45.9 -2.3,31.5 6.9,29.5C10.7,28.7 13.8,30.3 14.6,33.5C15.4,36.7 12.7,41.0 10.0,41.0C7.4,41.0 7.4,39.4 10.0,38.0C14.0,35.9 10.8,30.0 6.5,31.6C0.1,34.1 2.6,44.2 11.1,50.3L15.0,53.1L16.0,50.5C19.5,41.2 30.0,28.9 37.5,25.4C57.6,15.8 71.7,35.5 53.9,48.3C49.3,51.6 37.3,55.6 29.3,56.5L23.2,57.2L21.1,64.8C14.5,88.6 14.9,109.0 22.0,116.2C27.9,122.0 34.9,119.0 42.9,107.1C52.3,93.3 55.5,84.2 57.9,64.7C59.0,56.0 60.2,48.5 60.5,48.0C61.2,46.8 66.0,46.7 67.8,47.8C68.8,48.5 68.5,53.0 66.5,69.5C63.5,94.8 63.1,117.0 65.6,119.1C69.5,122.3 76.7,112.8 81.4,98.0C83.0,93.2 84.4,90.4 85.4,90.2C87.4,89.8 87.0,91.9 83.5,101.7C77.2,119.2 67.8,127.2 61.5,120.4ZM208.9,121.5C198.4,117.7 189.5,109.9 184.6,100.2C174.1,79.5 178.6,49.4 194.6,33.4C212.9,15.1 236.0,19.8 236.0,41.8C236.0,47.7 235.8,48.4 232.6,51.6C229.1,55.1 226.3,55.8 222.9,54.0C218.5,51.6 217.0,43.0 221.0,43.0C222.3,43.0 222.6,43.6 222.3,45.4C221.0,52.1 228.4,54.7 232.0,48.7C234.6,44.4 234.5,40.4 231.5,34.4C227.4,26.2 219.5,23.7 211.1,28.0C191.9,37.7 185.3,85.7 200.1,107.3C206.4,116.5 212.0,120.0 220.4,120.0C232.7,120.0 244.5,110.2 250.1,95.3C252.6,88.6 255.8,86.4 254.6,92.1C252.5,102.5 242.0,116.1 232.5,120.6C226.7,123.3 215.1,123.8 208.9,121.5ZM144.8,83.8C149.2,81.1 147.8,79.8 140.0,79.2C133.7,78.7 131.0,79.8 131.0,82.9C131.0,87.5 138.0,88.0 144.8,83.8ZM38.1,52.6C52.1,48.3 60.0,41.0 58.6,33.5C57.5,27.7 51.2,24.1 45.4,26.0C40.6,27.6 34.1,34.6 29.9,42.6C24.1,53.6 24.0,54.0 29.2,54.0C31.6,54.0 35.6,53.3 38.1,52.6Z"/>` },
  { key: 'vertical', group: '2 Initials', label: 'Vertical', viewBox: '0 0 256 193', svg: `<path fill="${_C}" fill-rule="evenodd" d="M124.0,190.0C122.0,188.0 122.0,186.7 122.0,96.5C122.0,6.3 122.0,5.0 124.0,3.0C125.1,1.9 126.9,1.0 128.0,1.0C129.1,1.0 130.9,1.9 132.0,3.0C134.0,5.0 134.0,6.3 134.0,96.5C134.0,186.7 134.0,188.0 132.0,190.0C130.9,191.1 129.1,192.0 128.0,192.0C126.9,192.0 125.1,191.1 124.0,190.0ZM1.8,151.5C0.9,149.4 3.0,143.5 20.1,101.9C40.8,51.6 41.0,51.3 46.5,53.8C47.9,54.5 49.5,56.2 50.1,57.7C50.6,59.1 59.2,79.8 69.0,103.6C78.9,127.3 87.0,147.9 87.0,149.2C87.0,152.3 85.2,154.0 82.0,154.0C78.3,154.0 77.1,152.2 71.5,138.8L66.6,127.0L43.9,127.0L21.3,127.0L16.5,138.8C13.8,145.2 11.0,151.3 10.2,152.2C7.9,154.9 3.2,154.5 1.8,151.5ZM181.6,151.9C180.2,149.8 180.0,144.2 180.0,103.4C180.0,60.0 180.1,57.2 181.8,55.7C183.4,54.2 186.7,54.0 207.6,54.0C233.4,54.0 236.8,54.6 242.8,60.3C252.6,69.4 251.5,89.3 240.8,97.0L236.9,99.9L240.9,101.9C250.8,107.0 255.8,116.6 254.7,128.7C254.0,136.3 251.4,141.5 246.1,146.3C238.5,153.1 237.4,153.4 208.9,153.8L183.2,154.1L181.6,151.9ZM231.8,141.4C239.7,138.2 242.6,133.1 242.2,123.2C242.0,117.0 239.3,112.9 233.6,110.1C228.9,107.7 227.7,107.6 210.6,107.6L192.5,107.5L192.2,125.2L192.0,143.0L210.0,143.0C224.1,143.0 228.9,142.7 231.8,141.4ZM57.4,105.2C54.9,99.3 51.0,90.0 48.8,84.5C46.6,79.0 44.4,74.2 44.1,73.7C43.6,73.2 31.2,101.8 26.2,115.1C26.0,115.6 33.9,116.0 43.9,116.0L61.9,116.0L57.4,105.2ZM228.8,94.6C239.1,89.3 240.5,73.6 231.3,67.4C228.9,65.7 226.2,65.5 210.2,65.2L192.0,64.8L192.0,80.4L192.0,96.0L209.0,96.0C221.7,96.0 226.8,95.6 228.8,94.6Z"/>` },
  { key: 'horizontal', group: '2 Initials', label: 'Horizontal', viewBox: '0 0 192 256', svg: `<path fill="${_C}" fill-rule="evenodd" d="M68.7,253.5C66.3,251.2 66.1,170.0 68.4,168.1C69.5,167.2 75.8,166.9 91.7,167.2C113.2,167.5 113.6,167.5 118.0,170.2C130.0,177.2 131.1,196.9 119.8,205.0C116.2,207.6 116.1,207.8 118.2,208.4C121.8,209.3 127.9,214.8 130.0,219.1C131.4,221.8 132.0,224.9 132.0,229.8C132.0,240.8 128.4,247.2 119.7,251.8C114.6,254.4 114.2,254.5 92.4,254.8C72.9,255.1 70.1,255.0 68.7,253.5ZM114.0,243.0C119.0,240.4 121.0,236.6 121.0,229.5C121.0,216.8 116.9,214.5 94.0,214.5L77.5,214.5L77.2,229.8L76.9,245.0L93.5,245.0C108.1,245.0 110.5,244.8 114.0,243.0ZM110.7,202.0C117.9,197.6 119.2,186.7 113.1,180.7L110.0,177.5L93.5,177.2L77.0,176.9L77.0,190.4L77.0,204.0L92.2,204.0C105.6,204.0 107.9,203.8 110.7,202.0ZM2.6,127.4C1.7,126.6 1.0,124.8 1.0,123.5C1.0,117.7 -4.2,118.0 96.0,118.0C196.2,118.0 191.0,117.7 191.0,123.5C191.0,129.3 196.2,129.0 96.0,129.0C13.8,129.0 4.0,128.8 2.6,127.4ZM61.8,89.3C57.8,88.3 58.8,85.0 75.6,44.2C84.8,21.8 92.7,2.9 93.3,2.2C94.4,0.8 97.9,0.6 99.8,1.8C100.5,2.3 105.3,13.0 110.5,25.6C122.8,55.1 124.9,60.2 130.5,73.4C135.2,84.7 135.4,87.2 131.9,89.1C128.3,91.0 125.8,88.0 121.1,76.6L116.7,66.0L96.7,66.2L76.6,66.5L72.0,77.3C68.1,86.7 65.8,90.2 64.0,89.9C63.7,89.8 62.7,89.6 61.8,89.3ZM111.6,54.2C109.2,47.9 96.7,18.0 96.4,18.2C96.1,18.6 81.0,55.2 81.0,55.6C81.0,55.8 88.0,56.0 96.6,56.0C111.1,56.0 112.2,55.9 111.6,54.2Z"/>` },
  { key: 'diagonal', group: '2 Initials', label: 'Diagonal', viewBox: '0 0 232 256', svg: `<path fill="${_C}" fill-rule="evenodd" d="M158.4,253.6C156.6,252.2 156.5,250.4 156.2,205.7C156.0,161.0 156.0,159.2 157.9,156.9L159.8,154.5L183.2,154.5C203.4,154.5 207.1,154.7 211.0,156.3C228.3,163.3 231.1,187.4 215.9,198.6L212.8,200.8L216.6,202.6C226.3,207.2 231.8,217.7 230.6,229.2C229.2,242.5 222.7,250.1 209.5,253.6C202.2,255.6 161.1,255.5 158.4,253.6ZM209.1,241.8C216.6,238.5 220.2,230.1 217.9,221.1C215.2,210.4 207.5,207.7 182.0,208.2L168.5,208.5L168.2,225.0C168.1,234.0 168.2,242.1 168.5,242.8C169.3,244.9 204.0,244.0 209.1,241.8ZM37.1,205.1C32.1,200.1 29.6,202.9 109.8,122.7C150.9,81.6 186.0,47.0 187.7,45.9C189.7,44.6 191.7,44.1 193.0,44.5C196.0,45.4 198.3,49.5 197.6,52.4C196.7,55.9 44.6,206.4 41.5,206.8C40.1,207.0 38.3,206.3 37.1,205.1ZM204.8,195.6C213.6,191.0 216.2,179.4 210.4,171.1C207.3,166.8 203.4,166.0 185.0,166.0L168.0,166.0L168.0,180.8C168.0,189.0 168.3,196.0 168.7,196.3C170.1,197.7 202.0,197.1 204.8,195.6ZM1.9,99.6C0.5,96.6 -1.3,101.7 20.9,47.5C30.9,23.3 39.8,2.9 40.7,2.2C42.8,0.7 45.2,0.7 47.3,2.3C49.6,3.9 87.0,93.4 87.0,97.2C87.0,99.5 84.3,102.0 81.8,102.0C78.2,102.0 76.5,99.4 71.4,87.0L66.6,75.0L43.9,75.0L21.1,75.0L17.8,83.2C11.6,98.8 9.9,101.5 6.3,101.8C3.6,102.1 2.8,101.7 1.9,99.6ZM57.4,53.2C54.9,47.3 51.0,38.0 48.8,32.5C46.5,27.0 44.4,22.1 44.0,21.7C43.5,21.1 26.0,61.6 26.0,63.5C26.0,63.8 34.1,64.0 44.0,64.0L61.9,64.0L57.4,53.2Z"/>` },
  { key: 'simple-circle', group: '1 Initial', label: 'Simple Circle', viewBox: '0 0 256 256', svg: `<path fill="${_C}" fill-rule="evenodd" d="M107.5,253.5C15.0,236.5 -28.7,133.9 23.3,56.0C29.7,46.4 47.4,28.8 57.0,22.5C80.5,7.1 105.9,0.1 133.4,1.3C167.2,2.8 193.6,14.5 217.6,38.4C241.5,62.4 253.2,88.8 254.7,122.6C256.3,159.2 243.7,191.4 217.5,217.5C199.0,236.1 179.4,246.8 153.5,252.6C143.4,254.8 117.6,255.3 107.5,253.5ZM145.5,246.5C159.1,244.3 168.5,241.4 179.5,236.1C253.7,200.0 271.1,104.0 214.1,44.6C167.8,-3.5 90.8,-4.1 43.5,43.4C-2.7,89.6 -3.6,162.6 41.3,210.6C67.2,238.3 108.5,252.6 145.5,246.5ZM85.2,184.0C81.9,182.6 82.4,177.9 87.1,166.4C89.3,161.0 92.7,152.9 94.5,148.5C96.3,144.1 103.0,127.8 109.3,112.3C124.4,75.5 123.1,77.8 128.3,78.2L132.5,78.5L141.6,100.5C177.1,186.0 175.5,181.1 169.7,183.8C165.0,186.0 163.1,183.8 157.1,169.1L151.8,156.0L127.6,156.0L103.4,156.0L98.1,169.0C95.0,176.7 91.9,182.6 90.7,183.5C88.3,185.2 88.3,185.2 85.2,184.0ZM146.0,143.1C146.0,142.3 128.1,98.9 127.5,98.2C127.2,97.9 109.0,142.4 109.0,143.4C109.0,143.7 117.3,144.0 127.5,144.0C137.7,144.0 146.0,143.6 146.0,143.1Z"/>` },
];
/* How many letters the selected monogram style renders (its max).
   Drives the placeholder/label. */
const _monoCount = (key) => _monoSpec(key).max;
const _monoPlaceholder = (n) => (n === 1 ? 'A' : n === 2 ? 'MD' : 'ABC');

/* AlignXL alignment styles (8) — cloudfront …/images/IDalign/align-xl-*.png */
const ALIGNXL_STYLES = [
  { key: 'star', label: 'Star', svg: _row((x) => _star(x, 24, 5), [12, 26.5, 41, 55.5, 70]) },
  { key: 'thin', label: 'Thin', svg: _hline(2) },
  { key: 'medium', label: 'Medium', svg: _hline(5) },
  { key: 'thick', label: 'Thick', svg: _hline(9) },
  { key: 'dot', label: 'Dot', svg: _row((x) => _dot(x, 24, 3), [12, 24, 36, 48, 60, 72]) },
  { key: 'skull', label: 'Skull', svg: _hline(2) + _skull(42, 24) },
  { key: 'martini', label: 'Martini', svg: _hline(2) + _martini(42, 23) },
  { key: 'wineglass', label: 'Wine', svg: _hline(2) + _wine(42, 23) },
];

/* IDAlign alignment styles (12) — cloudfront …/images/IDalign/*.png */
const IDALIGN_STYLES = [
  { key: 'quadArrow', label: 'Quad Arrow', svg: _row((x) => _chev(x, 24, 5), [18, 33, 48, 63]) },
  { key: 'doubleRow', label: 'Double Row', svg: `<g stroke="${_C}" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 7"><line x1="11" y1="20" x2="73" y2="20"/><line x1="11" y1="28" x2="73" y2="28"/></g>` },
  { key: 'chevron', label: 'Chevron', svg: _row((x) => _chev(x, 24, 6), [34, 46, 58]) },
  { key: 'line', label: 'Line', svg: `<line x1="10" y1="24" x2="74" y2="24" stroke="${_C}" stroke-width="2"/>` },
  { key: 'skulls', label: 'Skulls', svg: _row((x) => _skull(x, 24), [27, 42, 57]) },
  { key: 'arrowStyled', label: 'Arrow', svg: `<line x1="20" y1="24" x2="58" y2="24" stroke="${_C}" stroke-width="2.2" stroke-linecap="round"/>${_chev(60, 24, 7)}` },
  { key: 'solidArrow', label: 'Solid Arrow', svg: `<line x1="18" y1="24" x2="55" y2="24" stroke="${_C}" stroke-width="3" stroke-linecap="round"/><polygon points="53,17 68,24 53,31" fill="${_C}"/>` },
  { key: 'solidDots', label: 'Solid Dots', svg: _row((x) => _dot(x, 24, 3.5), [20, 31, 42, 53, 64]) },
  { key: 'solidLine', label: 'Solid Line', svg: `<line x1="10" y1="24" x2="74" y2="24" stroke="${_C}" stroke-width="6" stroke-linecap="round"/>` },
  { key: 'solidStars', label: 'Solid Stars', svg: _row((x) => _star(x, 24, 6), [24, 42, 60]) },
  { key: 'martiniGlasses', label: 'Martini', svg: _row((x) => _martini(x, 23), [27, 42, 57]) },
  { key: 'wine', label: 'Wine', svg: _row((x) => _wine(x, 23), [27, 42, 57]) },
];

/* Icons (30) — real site PNGs, themed; static.golfballs.com/A/icons/ */
const ICON_HOST = 'https://static.golfballs.com/A/icons/';
const ICON_THEMES = {
  'Dad / Father\'s Day': [['Dad Beer', 'dad-beer.png'], ['No. 1 Dad', 'no-1-dad.png'], ['Tie', 'tie.png'], ['Dad Crown', 'dad-crown.png'], ['Best Dad by Par', 'best-dad-by-par.png']],
  'Drinks': [['Martini', 'martini2.png'], ['Old Fashioned', 'old-fashioned.png'], ['Tom Collins', 'tom-collins.png'], ['Bloody Mary', 'bloody-mary.png'], ['Margarita', 'margarita.png'], ['Cosmopolitan', 'cosmopolitan.png'], ['Wine Glass', 'wine-glass.png'], ['Beer Mug', 'beer-mug-colored.png'], ['Cigar', 'cigar.png']],
  'USA / Patriotic': [['USA Sunglasses', 'usa-sunglasses.png'], ['USA Wordmark', 'usa-wordmark.png'], ['USA Flag', 'usa-flag.png'], ['Merica', 'merica.png']],
  'Masters': [['Masters Azalea', 'masters-azalea.png'], ['Masters Sweet Tea', 'masters-sweet-tea.png'], ['Masters Pimento Cheese', 'masters-pimento-cheese.png'], ['Masters Jumpsuit', 'masters-jumpsuit.png']],
  'Misc': [['Four-leaf Clover', 'fourleafclover-full-color.png'], ['Flamingo', 'flamingo-colored.png'], ['Sunglasses', 'sunglasses.png'], ['Skull & Crossbones', 'skullandcrossbones.png'], ['Ladybug', 'ladybug-color.png'], ['Bomb', 'bomb.png'], ['Taco', 'taco.png'], ['Dots Green', 'dots-green.png']],
};

/* Solr modificationName_ss spellings → our schema keys (live uses a space / singular). */
const MOD_ALIAS = { 'Align XL': 'AlignXL', 'Icon': 'Icons' };

/* modificationName_ss value → control schema (live-verified). Folds of Honor
   intentionally omitted (niche licensed art — excluded per product owner). */
const MODS = {
  'Custom Logo': { controls: ['imageUpload', 'secondImprint', 'commercial'] },
  'Personalized': { controls: ['personalized'], extras: 'Add Additional Personalization · $5.00/dz', preview: true },
  'Monogram': { controls: ['monoStyle', 'initials', 'color', 'color2'], preview: true },
  'Photo': { controls: ['photoUpload'], extras: 'Add Additional Personalization · $5.00/dz', preview: true },
  'Custom Player Number': { controls: ['number'], extras: 'Add Additional Personalization · $5.00/dz', preview: true },
  'AlignXL': { controls: ['alignXL', 'optText', 'textColor', 'lineColor', 'sameColor'], preview: true },
  'IDAlign': { controls: ['alignID', 'initials', 'textColor', 'lineColor'], preview: true },
  'Icons': { controls: ['iconGrid'], extras: 'Add Additional Personalization · $5.00/dz', preview: true },
  'Tee': { controls: ['line1', 'textColorSingle'], preview: true },
  'Poker Chip Second Pole': { controls: ['secondImprint'] },
  'Custom Accessory Bundle': { controls: ['bundle'] },
  'Golf Towel': { controls: [], note: 'Matching towel add-on (verify in live UI before quoting).' },
  'Golf Hat': { controls: [], note: 'Matching hat add-on (verify in live UI before quoting).' },
};
/* Canonical print-type order for the golf-ball grid (Folds removed). The grid
   shows only the intersection of this with a product's real modNames. */
const BALL_ORDER = ['Custom Logo', 'Personalized', 'Monogram', 'Photo', 'AlignXL', 'IDAlign', 'Icons', 'Custom Player Number'];

/* Normalize a product's raw modificationName_ss → our supported keys,
   aliasing Solr spellings and dropping Folds of Honor + anything unknown. */
function supportedMods(p) {
  const raw = Array.isArray(p.modNames) ? p.modNames : [];
  return [...new Set(raw.map((m) => MOD_ALIAS[m] || m).filter((m) => MODS[m] && m !== 'Folds of Honor'))];
}

/* Which modifications + which UX layout a product gets. Golf balls → the
   print-type grid, gated to the product's REAL modNames (so e.g. Custom Player
   Number shows only on Pro V1/Pro V1x, and zero-customization balls show none).
   Everything else → its feed mods, Custom Logo guaranteed when decoration exists. */
export function modsForProduct(p) {
  const norm = supportedMods(p);
  if (p.cat === 'Logo Golf Balls') {
    return { ux: 'grid', mods: BALL_ORDER.filter((m) => norm.includes(m)) };
  }
  const mods = norm.length ? (norm.includes('Custom Logo') ? norm : ['Custom Logo', ...norm]) : ['Custom Logo'];
  return { ux: 'inline', mods };
}

/* A poker-chip ball marker (e.g. "6-Stripe Poker Chip Ball Marker") — gets a
   live 3D chip preview (logo on the white center, dual-pole shows both sides)
   instead of just a flat product photo. Detected by the second-pole mod or a
   poker-chip product name/url. */
export function isPokerChipProduct(p) {
  if (!p) return false;
  if ((p.modNames || []).includes('Poker Chip Second Pole')) return true;
  return /poker\s*chip/i.test(`${p.title || ''} ${p.url || ''}`);
}

/* The Venture Golf "Lever Divot Tool with Logo Ball Marker" specifically — that's
   the one model we built. Other divot tools have different silhouettes, so match
   the LEVER divot model (lever + divot together), not every divot tool. */
export function isDivotProduct(p) {
  if (!p) return false;
  const hay = `${p.title || ''} ${p.url || ''}`.toLowerCase();
  return hay.includes('divot') && hay.includes('lever');
}

/* The Bartender Divot Tool (divot tool with a bottle opener up top) — its own
   3D model. Matches when the label has both "bartender" and "divot tool". */
export function isBartenderProduct(p) {
  if (!p) return false;
  const hay = `${p.title || ''} ${p.url || ''}`.toLowerCase();
  return hay.includes('bartender') && hay.includes('divot tool');
}

/* The standalone Custom Logo Ball Marker (a chrome disc with a personalization
   center) — SKUs M3466 / M4509. Match those SKUs, or a "ball marker" title that
   ISN'T a poker chip / divot tool / gift set (all of which also carry markers). */
export function isBallMarkerProduct(p) {
  if (!p) return false;
  const hay = `${p.title || ''} ${p.url || ''}`.toLowerCase();
  if (/\bm3466\b|\bm4509\b/.test(hay)) return true;
  return /ball\s*marker/.test(hay) && !/divot|tool|gift\s*set|poker/.test(hay);
}

/* The buyer's base-color pick (stored in the __base slot as a color name, e.g.
   "Green") → hex for the 3D chip's clay. The model's white pattern/center is
   left untouched; only the clay recolors. Falls back to black. */
function chipClayHex(data) {
  const base = (data && data.__base) || {};
  for (const v of Object.values(base)) {
    const m = BASE_COLORS.find((b) => b.name === v);
    if (m) return m.hex;
  }
  return '#1c1c1c';
}

/* Optic golf-ball colorways — vivid, not the muted base-product swatches.
   A "Pro V1 Yellow Golf Balls" tints the whole ball neon yellow in the preview.
   White/black balls stay default (undefined → off-white). */
const BALL_TINTS = [
  ['yellow', '#e8ff1a'], ['orange', '#ff6a16'], ['red', '#ec2a2a'],
  ['green', '#5fe04a'], ['pink', '#ff5fa6'], ['blue', '#2f7fd6'],
];
function ballTitleTint(title) {
  if (!title) return undefined;
  const t = title.toLowerCase();
  for (const [name, hex] of BALL_TINTS) {
    if (new RegExp(`\\b${name}\\b`).test(t)) return hex;
  }
  return undefined;
}


const UploadI = (props) => <Icon {...props}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></Icon>;
const SparkI = (props) => <Icon {...props}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></Icon>;
const money = (n) => '$' + (n || 0).toFixed(2);

/* ── primitives ──────────────────────────────────────────────── */
function Field({ label, required, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-text-muted)' }}>{label}{required && <span style={{ color: 'var(--gb-danger, #e5484d)' }}> *</span>}</div>}
      {children}
    </div>
  );
}
function TextInput({ value, onChange, placeholder, maxLength }) {
  const [f, setF] = useState(false);
  return (
    <div style={{ height: 32, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', background: 'var(--gb-fill-inverse-medium)', borderRadius: 'var(--gb-r-md)', border: '1px solid ' + (f ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'), boxShadow: f ? 'var(--gb-focus-ring)' : 'none', transition: 'all var(--gb-anim)' }}>
      <input value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} onFocus={() => setF(true)} onBlur={() => setF(false)} placeholder={placeholder}
        style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-sans)', fontSize: 12.5, fontWeight: 500 }} />
      {maxLength && <span style={{ fontSize: 9.5, color: 'var(--gb-text-ghost)', fontFamily: 'var(--gb-font-mono)', flexShrink: 0 }}>{(value || '').length}/{maxLength}</span>}
    </div>
  );
}
/* Font dropdown is the live customizer's four imprint fonts. The id is the full
   font name (what the renderer needs); the label is just the first word so the
   four buttons fit one row — full names ("Lucida Handwriting") would wrap. */
const FONT_OPTS = FONTS.map((f) => ({ id: f, label: f.split(' ')[0] }));
const SIZE_OPTS = SIZES.map((s) => ({ id: s, label: s }));
/* hex → HSL, used to order the palette by hue then shade */
function hexToHsl(hex) {
  if (!hex || hex === 'transparent') return { h: 999, s: 0, l: 2 };
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16) / 255, g = parseInt(m.slice(2, 4), 16) / 255, b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0, s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}
/* group by hue family (near-grays last), shades adjacent (light → dark) within each */
function sortByHueShade(colors) {
  return colors.map((c) => ({ c, hsl: hexToHsl(c.hex) })).sort((a, b) => {
    const ag = a.hsl.s < 0.12, bg = b.hsl.s < 0.12;
    if (ag !== bg) return ag ? 1 : -1;
    if (ag && bg) return b.hsl.l - a.hsl.l;
    const ah = Math.floor(a.hsl.h / 30), bh = Math.floor(b.hsl.h / 30);
    if (ah !== bh) return ah - bh;
    return b.hsl.l - a.hsl.l;
  }).map((x) => x.c);
}
function Swatch({ color, on, onClick, size = 22 }) {
  const trans = color.name === 'Transparent' || color.hex === 'transparent';
  return (
    <button onClick={onClick} title={color.name} style={{ width: size, height: size, borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', padding: 0, position: 'relative', flexShrink: 0, background: trans ? 'var(--gb-fill-subtle)' : color.hex, border: '1.5px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'), boxShadow: on ? '0 0 0 1.5px var(--gb-surface-modal), 0 0 0 3px var(--gb-brand-label)' : 'none', transition: 'all var(--gb-anim)' }}>
      {trans && <span style={{ position: 'absolute', inset: 3, borderTop: '1.5px solid var(--gb-danger, #e5484d)', transform: 'rotate(45deg)' }} />}
    </button>
  );
}
/* Imprint-color picker — 6 quick swatches + rainbow "more" button that opens a
   draggable, searchable popover with the full palette (hue→shade sorted).
   Thread/base palettes (≤24 colors) skip the popover and just render inline. */
function ColorRow({ swatches, transparent, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [q, setQ] = useState('');
  const transOpt = transparent ? [{ name: 'Transparent', hex: 'transparent' }] : [];
  const fullList = [...transOpt, ...sortByHueShade(swatches)];
  const compact = swatches.length <= 24;
  const common = compact ? fullList : [...transOpt, ...swatches.slice(0, COMMON_COUNT)];
  const selColor = fullList.find((c) => c.name === value);
  const selIsCommon = common.some((c) => c.name === value);
  const filtered = q ? fullList.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())) : fullList;
  const openAt = (e) => { setCursor({ x: e.clientX, y: e.clientY }); setOpen(true); };
  const close = () => { setOpen(false); setQ(''); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {value && <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gb-text-tertiary)' }}>{value}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {common.map((c) => <Swatch key={c.name} color={c} on={value === c.name} onClick={() => onChange(c.name)} />)}
        {!compact && (
          <button onClick={openAt} title={`All ${fullList.length} colors`} style={{
            width: 22, height: 22, borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', padding: 0, flexShrink: 0, position: 'relative',
            background: 'conic-gradient(from 90deg, #d2232a, #ff6a13, #fec107, #4cb050, #2196f3, #582c83, #ff60b2, #d2232a)',
            border: '1.5px solid ' + ((open || !selIsCommon) ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'),
            boxShadow: (open || !selIsCommon) ? '0 0 0 1.5px var(--gb-surface-modal), 0 0 0 3px var(--gb-brand-label)' : 'none',
            transition: 'all var(--gb-anim)',
          }}>
            {!selIsCommon && selColor && (
              <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: selColor.hex, border: '1px solid rgba(255,255,255,.7)' }} />
              </span>
            )}
          </button>
        )}
      </div>
      {!compact && (
        <DraggablePopup
          open={open}
          onClose={close}
          cursorAnchor={cursor}
          width={208}
          maxHeight={252}
          icon={<I.eye size={11} />}
          title="Imprint colors"
          subtitle={value ? `Selected · ${value}` : `${fullList.length} total`}
          closeOnOutside
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 9 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 24, padding: '0 8px', background: 'var(--gb-fill-inverse-medium)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-sm)' }}>
              <I.search size={10} style={{ color: 'var(--gb-text-muted)', flexShrink: 0 }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${fullList.length} colors…`} autoFocus
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-sans)', fontSize: 10.5 }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, maxHeight: 156, overflowY: 'auto', paddingRight: 3 }}>
              {filtered.map((c) => <Swatch key={c.name} color={c} on={value === c.name} size={20} onClick={() => { onChange(c.name); close(); }} />)}
              {filtered.length === 0 && <div style={{ gridColumn: '1 / -1', fontSize: 10.5, color: 'var(--gb-text-muted)', textAlign: 'center', padding: '10px 0' }}>No match</div>}
            </div>
          </div>
        </DraggablePopup>
      )}
    </div>
  );
}
function Checkbox({ checked, onClick, label, note }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
      <span style={{ width: 17, height: 17, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: checked ? 'var(--gb-brand-label)' : 'var(--gb-fill-inverse-medium)', border: '1px solid ' + (checked ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'), color: 'var(--gb-surface-deep)' }}>
        {checked && <I.check size={11} strokeWidth={3} />}
      </span>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-secondary)' }}>{label}{note && <span style={{ color: 'var(--gb-text-muted)', fontWeight: 500 }}> · {note}</span>}</span>
    </div>
  );
}

/* renders an SVG-string thumbnail (currentColor) at tile size */
function SvgArt({ inner, viewBox = '0 0 84 48', w = 56, h = 32 }) {
  return <svg viewBox={viewBox} width={w} height={h} preserveAspectRatio="xMidYMid meet" dangerouslySetInnerHTML={{ __html: inner }} />;
}
/* selectable grid of SVG-art style tiles (alignment graphics) */
function GraphicGrid({ items, value, onChange, cols = 4, tileH = 50, artW = 56, artH = 32 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 7 }}>
      {items.map((it) => {
        const on = value === it.key;
        return (
          <button key={it.key} onClick={() => onChange(it.key)} title={it.label || it.key} style={{ height: tileH, borderRadius: 'var(--gb-r-md)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, background: on ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-inverse-medium)', border: '1px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'), color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)' }}>
            <SvgArt inner={it.svg} viewBox={it.viewBox} w={artW} h={artH} />
          </button>
        );
      })}
    </div>
  );
}
/* monogram style picker — single flat gallery, 4 across, compact thumbnails */
function MonoGrid({ value, onChange }) {
  return <GraphicGrid items={MONO_STYLES} value={value} onChange={onChange} cols={4} tileH={48} artW={40} artH={28} />;
}
/* themed icon grid — the real site PNGs, flat gallery (5 across, scrolls). */
function IconGrid({ value, onChange }) {
  const items = Object.values(ICON_THEMES).flat();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, maxHeight: 250, overflowY: 'auto', paddingRight: 4 }}>
      {items.map(([name, file]) => {
        const on = value === name;
        return (
          <button key={name} onClick={() => onChange(name)} title={name} style={{ height: 40, borderRadius: 'var(--gb-r-md)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, background: on ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-inverse-medium)', border: '1px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-default)') }}>
            <img src={ICON_HOST + file} alt={name} loading="lazy" style={{ maxWidth: 26, maxHeight: 26 }} />
          </button>
        );
      })}
    </div>
  );
}

/* ── Alignment popup — a faithful copy of the Image Viewer's align window ──
   Same zoom/pan/rotate mechanics, the same frosted ring + rotation slider +
   zoom chips + dashed Save/Cancel strip — just without the Image Viewer's 3D /
   back / color-swap chrome (not used here). Apply crops to a CIRCLE so the
   decal matches the round ball print area. Helpers below are copied verbatim
   from ImagePreview so the look is identical. */
const ALIGN_OUT = 1024;       // output decal resolution
const ALIGN_STAGE = 320;      // on-screen stage size (square)
const A_ZOOM_MIN = 0.5, A_ZOOM_MAX = 8, A_ZOOM_STEP_BTN = 0.12, A_ZOOM_STEP_WHEEL = 0.05;
const AG_BG     = 'color-mix(in srgb, var(--gb-surface-canvas) 62%, transparent)';
const AG_BG_HVR = 'color-mix(in srgb, var(--gb-surface-canvas) 78%, transparent)';
const AG_BORDER = 'color-mix(in srgb, var(--gb-text-primary) 12%, transparent)';
const AG_FILTER = 'blur(18px) saturate(160%)';
const AG_SHADOW = '0 4px 14px -6px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.05) inset';
const AG_RADIUS = 9;

/* Centered ring + crosshair (copied from ImagePreview.AlignmentOverlay). */
function AlignRing() {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{ height: '70%', aspectRatio: '1 / 1', maxWidth: 240, maxHeight: 240, borderRadius: '50%', border: '2px solid var(--gb-brand-label)', boxShadow: '0 0 0 9999px rgba(0,0,0,.55)' }} />
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'var(--gb-brand-label)', opacity: 0.4 }} />
      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--gb-brand-label)', opacity: 0.4 }} />
    </div>
  );
}
/* Frosted zoom chip (copied from ImagePreview.ZoomChipBtn). */
function AZoomChip({ children, onClick, title }) {
  const [h, setH] = useState(false);
  return (
    <button type="button" onClick={onClick} title={title} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ minWidth: 22, height: 22, padding: '0 7px', fontSize: 11, fontWeight: 700, letterSpacing: 0.4, fontFamily: 'var(--gb-font-mono)', color: h ? 'var(--gb-text-primary)' : 'var(--gb-text-secondary)', background: h ? AG_BG_HVR : AG_BG, backdropFilter: AG_FILTER, WebkitBackdropFilter: AG_FILTER, border: `1px solid ${AG_BORDER}`, borderRadius: AG_RADIUS, boxShadow: AG_SHADOW, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, outline: 'none' }}>
      {children}
    </button>
  );
}
/* Vertical rotation slider (copied from ImagePreview.RotationSlider). */
function ARotationSlider({ value, onChange }) {
  const trackRef = useRef(null);
  const dragRef = useRef(false);
  const valueFromY = (clientY) => {
    const el = trackRef.current; if (!el) return value;
    const r = el.getBoundingClientRect();
    const ratio = 1 - Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    return Math.round(ratio * 360 - 180);
  };
  const down = (e) => { e.stopPropagation(); dragRef.current = true; try { e.currentTarget.setPointerCapture(e.pointerId); } catch {} onChange(valueFromY(e.clientY)); };
  const move = (e) => { if (dragRef.current) onChange(valueFromY(e.clientY)); };
  const up = (e) => { dragRef.current = false; try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {} };
  const pct = (180 - value) / 360;
  const TRACK_H = 130;
  return (
    <div style={{ position: 'absolute', top: '50%', right: 10, marginTop: -((TRACK_H + 30) / 2), zIndex: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 6px', background: AG_BG, backdropFilter: AG_FILTER, WebkitBackdropFilter: AG_FILTER, border: `1px solid ${AG_BORDER}`, borderRadius: AG_RADIUS, boxShadow: AG_SHADOW, userSelect: 'none' }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: 'var(--gb-text-secondary)', fontFamily: 'var(--gb-font-mono)' }}>{value > 0 ? '+' : ''}{value}°</span>
      <div ref={trackRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDoubleClick={(e) => { e.stopPropagation(); onChange(0); }}
        style={{ position: 'relative', width: 4, height: TRACK_H, borderRadius: 2, background: 'color-mix(in srgb, var(--gb-text-primary) 18%, transparent)', cursor: 'ns-resize' }}>
        <div style={{ position: 'absolute', left: -3, right: -3, top: '50%', height: 1, background: 'color-mix(in srgb, var(--gb-text-primary) 30%, transparent)', transform: 'translateY(-0.5px)' }} />
        <div style={{ position: 'absolute', left: '50%', top: `${pct * 100}%`, width: 12, height: 12, borderRadius: '50%', background: '#fff', border: '1px solid color-mix(in srgb, var(--gb-text-primary) 25%, transparent)', boxShadow: '0 0 0 1px rgba(255,255,255,0.22) inset, 0 2px 6px -1px rgba(0,0,0,0.4)', transform: 'translate(-50%, -50%)' }} />
      </div>
    </div>
  );
}

function ImageAlignModal({ image, initial, onCancel, onApply }) {
  const [nat, setNat] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(Math.round((initial?.scale ?? 1) * 100));
  const [rotation, setRotation] = useState(initial?.rot ?? 0);
  // Transform tracked in refs (no re-render per wheel/drag) — mirrors ImagePreview.
  const scaleRef = useRef(initial?.scale ?? 1);
  const txRef = useRef(initial?.x ?? 0);
  const tyRef = useRef(initial?.y ?? 0);
  const rotationRef = useRef(initial?.rot ?? 0);
  const wrapRef = useRef(null);
  const vpRef = useRef(null);
  // Color-swap (eyedropper) state — same model as the Image Viewer.
  const [eyedropping, setEyedropping] = useState(false);
  const [pendingPick, setPendingPick] = useState(null);   // { color:{r,g,b}, x, y }
  const [editedDataUrl, setEditedDataUrl] = useState(null);
  const [previewDataUrl, setPreviewDataUrl] = useState(null);
  const [colorSwaps, setColorSwaps] = useState([]);
  // Painted in the stage: live preview > committed swaps > original image.
  const shownSrc = previewDataUrl || editedDataUrl || image;
  // The committed base every new swap recolors from (never the live preview).
  const swapBase = () => editedDataUrl || image;

  useEffect(() => { _loadImage(image).then((im) => setNat({ w: im.naturalWidth || im.width, h: im.naturalHeight || im.height })).catch(() => {}); }, [image]);

  // Image fits the stage at scale 1 (contain) — same fit used by the capture
  // canvas so display and output stay in lockstep.
  const fit = nat ? Math.min(0.85 * ALIGN_STAGE / nat.w, 0.85 * ALIGN_STAGE / nat.h) : 1;

  // Eyedropper: read the {r,g,b} under a stage point, mapped through the live
  // pan/zoom back to the image's natural pixels (shared helper).
  const samplePixelAt = (cssX, cssY) => {
    const c = wrapRef.current; const img = c && c.querySelector('img');
    if (!c || !img || !nat) return null;
    return samplePixel(img, { natW: nat.w, natH: nat.h, wrapperW: c.clientWidth, wrapperH: c.clientHeight, fit, scale: scaleRef.current, tx: txRef.current, ty: tyRef.current, cssX, cssY });
  };
  // Live preview while the popover tunes color/tolerance; recolors the committed
  // base, never the preview, so swaps don't compound.
  const previewSwap = async (toRgb, tol) => { try { setPreviewDataUrl(await recolorImage(swapBase(), pendingPick.color, toRgb, tol)); } catch { /* CORS */ } };
  const applySwap = async (toRgb, tol) => {
    let url = previewDataUrl;
    if (!url) { try { url = await recolorImage(swapBase(), pendingPick.color, toRgb, tol); } catch { url = null; } }
    if (url) { setEditedDataUrl(url); setColorSwaps((p) => [...p, { from: pendingPick.color, to: toRgb, tolerance: tol }]); }
    setPreviewDataUrl(null); setPendingPick(null);
  };
  const cancelSwap = () => { setPreviewDataUrl(null); setPendingPick(null); };
  const resetSwaps = () => { setEditedDataUrl(null); setColorSwaps([]); setPreviewDataUrl(null); setPendingPick(null); setEyedropping(false); };

  const applyTransform = (animate) => {
    const el = vpRef.current; if (!el) return;
    el.style.transition = animate ? 'transform .18s cubic-bezier(.25,.8,.25,1)' : 'none';
    el.style.transform = `translate(${txRef.current}px, ${tyRef.current}px) rotate(${rotationRef.current}deg) scale(${scaleRef.current})`;
  };
  useEffect(() => { if (nat) applyTransform(false); /* eslint-disable-next-line */ }, [nat]);
  useEffect(() => { rotationRef.current = rotation; applyTransform(false); /* eslint-disable-next-line */ }, [rotation]);

  const clampPan = () => {
    const c = wrapRef.current; if (!c) return;
    const cw = c.clientWidth, ch = c.clientHeight;
    const img = c.querySelector('img');
    const iw = img?.clientWidth || cw, ih = img?.clientHeight || ch, s = scaleRef.current;
    const KEEP = 24;   // keep a sliver on-screen so the image can't be lost
    const mx = Math.max(0, (cw + iw * s) / 2 - KEEP), my = Math.max(0, (ch + ih * s) / 2 - KEEP);
    txRef.current = Math.max(-mx, Math.min(mx, txRef.current));
    tyRef.current = Math.max(-my, Math.min(my, tyRef.current));
  };
  const zoom = (delta, ox, oy) => {
    const prev = scaleRef.current;
    const next = Math.max(A_ZOOM_MIN, Math.min(A_ZOOM_MAX, prev * (1 + delta)));
    if (next === prev) return;
    const c = wrapRef.current;
    if (c && ox != null) {   // pivot around the cursor so its focal point stays put
      const r = next / prev - 1;
      txRef.current -= (ox - c.clientWidth / 2 - txRef.current) * r;
      tyRef.current -= (oy - c.clientHeight / 2 - tyRef.current) * r;
    }
    scaleRef.current = next; clampPan(); applyTransform(false); setZoomLevel(Math.round(next * 100));
  };
  const resetZoom = () => { scaleRef.current = 1; txRef.current = 0; tyRef.current = 0; applyTransform(true); setZoomLevel(100); };

  // Wheel zoom (passive:false so we can preventDefault the page scroll).
  useEffect(() => {
    const c = wrapRef.current; if (!c) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      zoom(e.deltaY < 0 ? A_ZOOM_STEP_WHEEL : -A_ZOOM_STEP_WHEEL, e.clientX - r.left, e.clientY - r.top);
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line
  }, [nat]);

  const onPointerDown = (e) => {
    if (e.button !== 0 || e.target?.closest?.('button, [data-viewer-ui="true"]')) return;
    // Eyedropper armed → clicking the image samples a pixel + opens the swap popover.
    if (eyedropping) {
      const c = wrapRef.current; if (!c) return;
      const r = c.getBoundingClientRect();
      const cssX = e.clientX - r.left, cssY = e.clientY - r.top;
      const sample = samplePixelAt(cssX, cssY);
      if (sample) { setPendingPick({ color: sample, x: cssX, y: cssY }); setEyedropping(false); }
      return;
    }
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, px = txRef.current, py = tyRef.current;
    const move = (ev) => { txRef.current = px + (ev.clientX - sx); tyRef.current = py + (ev.clientY - sy); clampPan(); applyTransform(false); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  // Apply — same transform→canvas pipeline as ImagePreview.captureAlignment,
  // clipped to a CIRCLE so the decal is round (the ball print area).
  const apply = () => {
    const wrap = wrapRef.current; if (!wrap || !nat) return;
    const ringD = Math.min(wrap.clientHeight * 0.70, 240);   // matches AlignRing
    const c = document.createElement('canvas'); c.width = ALIGN_OUT; c.height = ALIGN_OUT;
    const ctx = c.getContext('2d');
    const k = ALIGN_OUT / ringD;        // wrapper px → canvas px (ring → full canvas)
    ctx.save();
    ctx.beginPath(); ctx.arc(ALIGN_OUT / 2, ALIGN_OUT / 2, ALIGN_OUT / 2, 0, Math.PI * 2); ctx.clip();
    ctx.translate(ALIGN_OUT / 2, ALIGN_OUT / 2);
    ctx.scale(k, k);
    ctx.translate(txRef.current, tyRef.current);
    ctx.rotate((rotationRef.current * Math.PI) / 180);
    ctx.scale(scaleRef.current, scaleRef.current);
    const im = wrap.querySelector('img');   // already showing the recolored bytes
    ctx.drawImage(im, -(nat.w * fit) / 2, -(nat.h * fit) / 2, nat.w * fit, nat.h * fit);
    ctx.restore();
    // Pass back the recolored full-res source so a later re-align keeps the swaps.
    onApply(c.toDataURL('image/png'), { scale: scaleRef.current, x: txRef.current, y: tyRef.current, rot: rotationRef.current }, editedDataUrl || image);
  };

  return (
    <CompactModal size="compact" stacked onClose={onCancel}>
      <ModalHeader icon={<I.eye />} title="Align Image" subtitle="Drag to move · scroll to zoom · slider to rotate · eyedrop to recolor" onClose={onCancel} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div
          ref={wrapRef}
          onPointerDown={onPointerDown}
          style={{
            position: 'relative', width: '100%', height: ALIGN_STAGE,
            borderRadius: 'var(--gb-r-md)', overflow: 'hidden', cursor: eyedropping ? 'crosshair' : 'grab', touchAction: 'none',
            ...PREVIEW_GRID, border: '1px solid var(--gb-border-default)', userSelect: 'none',
          }}
        >
          {/* transform layer — centered img sized to fit (shows live recolor) */}
          <div ref={vpRef} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            {nat && <img src={shownSrc} alt="" draggable={false} style={{ width: nat.w * fit, height: nat.h * fit, display: 'block' }} />}
          </div>
          <AlignRing />
          {/* Eyedropper + reset cluster (top-left) — same tools as the Image Viewer. */}
          <div data-viewer-ui="true" style={{ position: 'absolute', top: 8, left: 10, display: 'flex', alignItems: 'center', gap: 4, zIndex: 6 }}>
            <GlassIconBtn icon={<DropperIcon />} active={eyedropping} title="Swap a color" onClick={() => { setEyedropping((v) => !v); setPendingPick(null); }} />
            {colorSwaps.length > 0 && <GlassIconBtn icon={<ResetIcon />} title="Reset colors" onClick={resetSwaps} />}
          </div>
          <ARotationSlider value={rotation} onChange={setRotation} />
          {/* zoom readout (bottom-left) + chips (bottom-right) — exactly the viewer's layout */}
          <div style={{ position: 'absolute', bottom: 8, left: 10, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, color: 'var(--gb-text-secondary)', background: AG_BG, backdropFilter: AG_FILTER, WebkitBackdropFilter: AG_FILTER, border: `1px solid ${AG_BORDER}`, borderRadius: AG_RADIUS, boxShadow: AG_SHADOW, padding: '2px 7px', pointerEvents: 'none', fontFamily: 'var(--gb-font-mono)' }}>{zoomLevel}%</div>
          <div style={{ position: 'absolute', bottom: 8, right: 8, display: 'flex', gap: 4 }}>
            <AZoomChip title="Zoom out" onClick={() => { const c = wrapRef.current; zoom(-A_ZOOM_STEP_BTN, c ? c.clientWidth / 2 : 0, c ? c.clientHeight / 2 : 0); }}>−</AZoomChip>
            <AZoomChip title="Reset zoom" onClick={resetZoom}>1:1</AZoomChip>
            <AZoomChip title="Zoom in" onClick={() => { const c = wrapRef.current; zoom(A_ZOOM_STEP_BTN, c ? c.clientWidth / 2 : 0, c ? c.clientHeight / 2 : 0); }}>+</AZoomChip>
          </div>
        </div>
        {/* Sampled-color → replacement-color popover (anchored at the click). */}
        {pendingPick && (
          <SwapPopover pick={pendingPick} wrapRef={wrapRef} swapCount={colorSwaps.length}
            onPreview={previewSwap} onCancel={cancelSwap} onApply={applySwap} />
        )}
        {/* dashed action strip — matches the Image Viewer's alignment strip */}
        <div style={{ padding: 8, background: 'var(--gb-surface-2)', border: '1px dashed var(--gb-brand-tint-border)', borderRadius: 'var(--gb-r-md)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.2, color: 'var(--gb-text-tertiary)' }}>Position image inside the alignment ring</span>
          <Btn size="sm" variant="secondary" onClick={onCancel}>Cancel</Btn>
          <Btn size="sm" variant="tinted" status="brand" icon={<I.check />} onClick={apply}>Save</Btn>
        </div>
      </div>
    </CompactModal>
  );
}

/* Drag-drop / click-to-browse image picker. Reads the picked file, opens the
   alignment popup, and writes the ALIGNED data URL into the matching
   PrintTypeContext slot (Custom Logo vs Photo) so LivePreview3D can decal it.
   The raw image + transform are kept (rawDataUrl / align) so the buyer can
   re-align without recompositing an already-composited image. */
function ImageUpload({ ai, label = 'Upload Your Company Logo', slot = 'Custom Logo', alignable = true }) {
  const [hover, setHover] = useState(false);
  const [dataUrl, setDataUrl] = usePTField(slot, 'imageDataUrl');
  const [fileName, setFileName] = usePTField(slot, 'fileName');
  const [rawUrl, setRawUrl] = usePTField(slot, 'rawDataUrl');
  const [align, setAlign] = usePTField(slot, 'align');
  const [pending, setPending] = useState(null);   // { url, name, initial } → show modal
  const inputRef = useRef(null);
  const ingest = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const r = new FileReader();
    // Balls open the alignment ring (the logo is decaled onto a sphere); flat
    // products (towels, shirts, …) have no pole to align to — the logo just gets
    // attached as-is, so skip the modal and store the image directly.
    r.onload = () => {
      if (alignable) setPending({ url: r.result, name: file.name, initial: null });
      else { setRawUrl(r.result); setFileName(file.name); setDataUrl(r.result); setAlign(null); }
    };
    r.readAsDataURL(file);
  };
  const onDrop = (e) => {
    e.preventDefault();
    setHover(false);
    ingest(e.dataTransfer.files && e.dataTransfer.files[0]);
  };
  const onChange = (e) => ingest(e.target.files && e.target.files[0]);
  const clear = (e) => {
    e.stopPropagation();
    setDataUrl(null); setFileName(null); setRawUrl(null); setAlign(null);
    if (inputRef.current) inputRef.current.value = '';
  };
  const reAlign = (e) => { e.stopPropagation(); if (alignable && rawUrl) setPending({ url: rawUrl, name: fileName, initial: align }); };
  const applyAlign = (composited, transform, workingSrc) => {
    // workingSrc = the recolored full-res source (or original) → store as the raw
    // so a later re-align starts from the swapped colors, not the untouched file.
    if (pending) { setRawUrl(workingSrc || pending.url); setFileName(pending.name); }
    setDataUrl(composited);
    setAlign(transform);
    setPending(null);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <AnimatePresence>
        {pending && (
          <ImageAlignModal
            image={pending.url}
            initial={pending.initial}
            onCancel={() => setPending(null)}
            onApply={applyAlign}
          />
        )}
      </AnimatePresence>
      <div
        onClick={() => inputRef.current && inputRef.current.click()}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onDragOver={(e) => { e.preventDefault(); setHover(true); }}
        onDragLeave={() => setHover(false)}
        onDrop={onDrop}
        style={{ padding: dataUrl ? '8px 10px' : '20px 16px', borderRadius: 'var(--gb-r-lg)', textAlign: 'center', cursor: 'pointer', background: hover ? 'var(--gb-brand-tint-soft)' : 'var(--gb-fill-inverse-medium)', border: '1.5px dashed ' + (hover ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'), transition: 'all var(--gb-anim)' }}
      >
        <input ref={inputRef} type="file" accept="image/*" onChange={onChange} style={{ display: 'none' }} />
        {dataUrl ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, justifyContent: 'flex-start' }}>
            <img src={dataUrl} alt="" style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 'var(--gb-r-sm)', background: 'var(--gb-surface-modal)', flexShrink: 0 }} />
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gb-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0, textAlign: 'left' }}>{fileName || 'Uploaded image'}</div>
            {alignable && rawUrl && <IconBtn size="xs" variant="ghost" icon={<I.edit />} onClick={reAlign} title="Align image" />}
            <IconBtn size="xs" variant="ghost" danger icon={<I.trash />} onClick={clear} title="Remove / replace" />
          </div>
        ) : (
          <>
            <div style={{ width: 36, height: 36, borderRadius: '50%', margin: '0 auto 9px', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><UploadI size={17} /></div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{label}</div>
            <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 3 }}>Drag files here or <span style={{ color: 'var(--gb-brand-label)', fontWeight: 600 }}>click to browse</span></div>
          </>
        )}
      </div>
      {ai && <Btn variant="secondary" size="sm" icon={<SparkI />} style={{ alignSelf: 'flex-start' }}>AI Image Generator</Btn>}
      <div style={{ fontSize: 10.5, color: 'var(--gb-text-tertiary)', lineHeight: 1.5 }}>
        <b style={{ color: 'var(--gb-text-secondary)' }}>OR</b> email your logo to <span style={{ color: 'var(--gb-brand-label)', fontFamily: 'var(--gb-font-mono)' }}>art@golfballs.com</span> — we’ll contact you after you order.
        <span style={{ display: 'block', color: 'var(--gb-brand-label)', fontWeight: 600, marginTop: 3 }}>Need design help? Free consultation →</span>
      </div>
    </div>
  );
}
/* ── Print-type personalization state ─────────────────────────────
   Single source of truth for everything the live ball preview needs to
   render. Each Control + composite reads/writes through context instead
   of owning its own useState, so PrintTypeGrid can hand the snapshot to
   <LivePreview3D /> without prop-drilling through every wrapper.
   Slots are scoped per print-type so switching between types doesn't
   wipe the buyer's other work in progress. */
const PrintTypeContext = createContext(null);
const usePT = () => useContext(PrintTypeContext) || { sel: null, setSel: () => {}, data: {}, update: () => {} };
const DEFAULT_PT_DATA = {
  Monogram:      { style: 'circle',     initials: '', c1: 'Black', c2: 'Transparent' },
  Personalized:  { l1: '', l2: '', l3: '', color: 'Black', font: 'Kabel Dm BT', size: 'Standard' },
  Icons:         { icon: '' },
  'Custom Logo': { imageDataUrl: null, fileName: null },
  Photo:         { imageDataUrl: null, fileName: null },
  Tee:           { text: '', color: 'Black' },
  // Which accessory decoration tab is active (Custom Logo / Tee / Personalized /
  // Monogram) so AccessoryDecorationEmitter serializes the right decoration.
  __accessory:   { kind: '' },
  // Gift-set packaging for a custom-logo ball — { id, option } of the chosen
  // bundle (sleeve / 6-ball / wooden), or {} for standard packaging. Rides on the
  // ball decoration as `giftSet` so the line prices + serializes as a gift set.
  __giftSet:     {},
  // Dual-pole second imprint — its own slot so it never collides with the
  // front print's fields. Holds whichever sub-type the buyer picks.
  __second:      { enabled: false, choice: 'Same as Front',
                   l1: '', l2: '', l3: '', color: 'Black', font: 'Kabel Dm BT', size: 'Standard',
                   style: 'circle', initials: '', c1: 'Black', c2: 'Transparent',
                   imageDataUrl: null, fileName: null },
};
/* Read a single field for the given print-type slot, with a fallback.
   Returns [value, setValue] so consumers feel like useState. */
function usePTField(type, key) {
  const ctx = usePT();
  const slot = ctx.data[type] || DEFAULT_PT_DATA[type] || {};
  const value = slot[key] !== undefined ? slot[key] : (DEFAULT_PT_DATA[type] && DEFAULT_PT_DATA[type][key]);
  const setValue = useCallback((v) => ctx.update(type, { [key]: typeof v === 'function' ? v(value) : v }), [ctx, type, key, value]);
  return [value, setValue];
}

/* Build a decal URL the GolfballViewer can load, given the current snapshot
   for one print type. Returns null when the type isn't supported yet or the
   buyer hasn't filled the minimum required input. Callers must memoize on
   the snapshot fields they care about. */
const _hexOf = (name) => {
  if (!name || name === 'Transparent') return '#000000';
  const m = IMPRINT_COLORS.find((c) => c.name === name);
  return (m && m.hex) || '#000000';
};
/* For optional/stroke roles: 'Transparent' → 'none' so SVG paints nothing
   instead of treating it as black. */
const _hexOrNone = (name) => {
  if (!name || name === 'Transparent') return 'none';
  const m = IMPRINT_COLORS.find((c) => c.name === name);
  return (m && m.hex) || 'none';
};
/* ── Live monogram decal — REAL icustomize art ──────────────────────
   The live ball decal renders the buyer's ACTUAL initials by fetching
   the real monogram from icustomize's flat endpoint, then recoloring it
   client-side. The trick (verified against the server):

     • icustomize.com/GBC/Monogram/r is a TWO-color renderer keyed by
       `C` and `C2` (NOT Color1/Color2 — those are silently ignored).
       The two regions differ per view (circle: C=ring, C2=letters;
       vertical: C=letters, C2=divider) — we just mirror the server's
       own C/C2 onto our Color / Color 2.
     • We request it ONCE with two SENTINEL colors we can pull apart:
       C=#FF0000 (red) and C2=#00FF00 (green). (White can't be a sentinel
       — the server renders a white region as transparent, so the layer
       vanishes.) Splitting red-vs-green gives the two recolorable layers
       we own. Re-fetch only when the LETTERS or STYLE change.
     • On every COLOR change we just re-tint those two cached layers —
       C layer → Color, C2 layer → Color 2 — with zero network. A
       `Transparent` Color 2 simply omits that layer (e.g. a ring with the
       initials knocked out so the ball shows through — the classic look).

   Padding in the raw render varies a lot per view (a vertical monogram
   only fills ~38% of the frame height, a circle ~63%), so we trim to the
   art's bbox and re-center it into a fixed square at a consistent scale —
   that's what keeps every style the same on-ball size as the thumbnail. */

const MONOGRAM_ENDPOINT = 'https://www.icustomize.com/GBC/Monogram/r';
/* Fraction of the decal print-area square the trimmed monogram fills. Tuned
   so the monogram sits at ~0.35 of the ball diameter, matching the real
   icustomize preview (it otherwise renders ~1.7× too large vs image/logo
   decals, which fill the print area directly). */
const MONO_DECAL_FILL = 0.52;
/* Per-style letter-count range + how icustomize's `view` name is built from the
   ACTUAL number of letters. The ring/badge styles carry a count suffix —
   circle2/circle3, hex2/hex3 — so passing 2 letters to a 3-slot ring (which
   leaves an empty wedge) is the "cuts off" bug. The rest are fixed-count. */
/* `knockout`: when Color 2 is Transparent, what becomes of the C2 region?
   - circle2/circle3 have C2 = the disc-fill BEHIND the letters, so dropping it
     leaves the clean ring + knocked-out letters (the classic look) → knockout.
   - every other style has C2 = essential structure (ring/border, divider line,
     gardenia's middle letter), so it must paint in Color 1 instead of vanishing
     → NOT knockout. (Dropping it was the "missing border / middle letter / line"
     bug.) An explicit Color 2 always paints that region regardless. */
const _MONO_SPEC = {
  'circle':        { min: 2, max: 3, view: (n) => 'circle' + n, knockout: true },  // circle2 / circle3
  'hex':           { min: 2, max: 3, view: (n) => 'hex' + n },      // hex2 / hex3
  'gardenia':      { min: 3, max: 3, view: () => 'gardenia' },
  'vertical':      { min: 2, max: 2, view: () => 'vertical' },
  'horizontal':    { min: 2, max: 2, view: () => 'horizontal' },
  'diagonal':      { min: 2, max: 2, view: () => 'diagonal' },
  'simple-circle': { min: 1, max: 1, view: () => 'circle' },        // single initial + ring
};
const _monoSpec = (styleKey) => _MONO_SPEC[styleKey] || _MONO_SPEC['circle'];
/* Largest letter count any style takes — the Initials input caps to this, so a
   switch between styles never loses letters (each style just renders its
   first N). */
const GLOBAL_MONO_MAX = 3;
/* Letters a style actually renders: the typed initials (A–Z only) capped to the
   style's max. The full typed value stays in state untouched on a style switch
   — we only take the first N here. */
const _monoLetters = (initials, styleKey) =>
  String(initials || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, _monoSpec(styleKey).max);

/* Cache of split black/white layers, keyed by `view|letters` — survives
   color changes so re-tinting is instant. */
const _monoMaskCache = new Map();
const _monoMaskKey = (view, letters) => view + '|' + letters;
const peekMonoMasks = (view, letters) => _monoMaskCache.get(_monoMaskKey(view, letters)) || null;

/* Ask the background SW to fetch the (cross-origin) render and hand back a
   same-origin data: URL we can safely draw + read on a canvas. */
function proxyImageDataUrl(url) {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      reject(new Error('no extension context')); return;
    }
    chrome.runtime.sendMessage({ action: 'proxyFetchImage', url }, (resp) => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      if (resp && resp.ok && resp.dataUrl) resolve(resp.dataUrl);
      else reject(new Error((resp && resp.error) || 'fetch failed'));
    });
  });
}
const _loadImage = (src) => new Promise((res, rej) => {
  const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src;
});

/* Split a red/green-sentinel render into two masks (each a white silhouette
   so it can be tinted via source-in), trimmed to the combined content bbox.
   Returns { mC, mC2, w, h } where mC = the C region (red sentinel) and
   mC2 = the C2 region (green sentinel), or { empty:true } if no ink.
   Classification is nearest-sentinel (red channel ≥ green channel); the thin
   anti-aliased seam where the two regions meet splits cleanly down it. */
async function splitMonoMasks(dataUrl) {
  const img = await _loadImage(dataUrl);
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const src = document.createElement('canvas'); src.width = W; src.height = H;
  const sctx = src.getContext('2d'); sctx.drawImage(img, 0, 0);
  const d = sctx.getImageData(0, 0, W, H).data;
  // content bbox over alpha
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (d[(y * W + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < x0) return { empty: true };
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const cC = document.createElement('canvas'); cC.width = w; cC.height = h;
  const cC2 = document.createElement('canvas'); cC2.width = w; cC2.height = h;
  const xC = cC.getContext('2d'), xC2 = cC2.getContext('2d');
  const iC = xC.createImageData(w, h), iC2 = xC2.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = (((y + y0) * W) + (x + x0)) * 4, di = (y * w + x) * 4;
    const a = d[si + 3]; if (!a) continue;
    const dst = d[si] >= d[si + 1] ? iC.data : iC2.data;  // red→C, green→C2
    dst[di] = 255; dst[di + 1] = 255; dst[di + 2] = 255; dst[di + 3] = a;
  }
  xC.putImageData(iC, 0, 0); xC2.putImageData(iC2, 0, 0);
  return { mC: cC, mC2: cC2, w, h };
}

async function getMonoMasks(view, letters) {
  const key = _monoMaskKey(view, letters);
  if (_monoMaskCache.has(key)) return _monoMaskCache.get(key);
  const overlay = letters.split('').join(',');                    // "ABC" → "A,B,C"
  const cfg = JSON.stringify({ C: '#FF0000', C2: '#00FF00' });    // separable sentinels
  const url = `${MONOGRAM_ENDPOINT}?userOverlay=${encodeURIComponent(overlay)}`
    + `&configOverrides=${encodeURIComponent(cfg)}&view=${encodeURIComponent(view)}`;
  const masks = await splitMonoMasks(await proxyImageDataUrl(url));
  _monoMaskCache.set(key, masks);
  return masks;
}

/* Tint a white mask to a solid hex, preserving its alpha (anti-aliasing). */
function _tintMask(mask, hex) {
  const t = document.createElement('canvas'); t.width = mask.width; t.height = mask.height;
  const c = t.getContext('2d');
  c.drawImage(mask, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = hex; c.fillRect(0, 0, t.width, t.height);
  return t;
}
/* Compose the final decal: C layer (Color) as the base, C2 layer (Color 2)
   on top, trimmed art re-centered into a fixed square at a consistent scale.
   Returns a PNG data URL (or null for empty art). c2 = null (Transparent)
   omits the C2 layer entirely — e.g. a ring with the initials knocked out. */
function composeMonoDecal(masks, c1, c2) {
  if (!masks || masks.empty) return null;
  const { mC, mC2, w, h } = masks;
  // Monogram-specific on-ball scale. Image/logo/photo decals fill the viewer's
  // print area (printAreaScale) and look right; the monogram reads ~1.7× too
  // big at that size, so it gets its own smaller fill. Measured against the
  // real icustomize preview (monogram ≈ 0.35 of the ball diameter) the right
  // fraction of the print-area square is ~0.52. Bump this up to enlarge.
  const SIZE = 1024, FILL = MONO_DECAL_FILL;
  const s = (SIZE * FILL) / Math.max(w, h);
  const dw = w * s, dh = h * s, dx = (SIZE - dw) / 2, dy = (SIZE - dh) / 2;
  const out = document.createElement('canvas'); out.width = SIZE; out.height = SIZE;
  const oc = out.getContext('2d');
  oc.drawImage(_tintMask(mC, c1), dx, dy, dw, dh);              // Color (base)
  if (c2) oc.drawImage(_tintMask(mC2, c2), dx, dy, dw, dh);     // Color 2 (on top)
  return out.toDataURL('image/png');
}
/* Resolve an icon's raw host URL. We CANNOT wrap this in an <svg><image href>
   data URL: an SVG loaded as a texture is sandboxed and can't fetch an external
   href, so the decal rendered the browser's broken-image glyph. Instead the
   raw URL is fetched through the background proxy → same-origin data URL (see
   useDecalUrl), which the viewer can load directly. */
const ICON_DECAL_FILL = 0.75;   // icons read large on the ball — shrink to 0.75
const _iconCache = new Map();   // host URL → processed (downscaled) data URL
function iconSrc(iconName) {
  if (!iconName) return null;
  for (const items of Object.values(ICON_THEMES)) {
    const hit = items.find(([n]) => n === iconName);
    if (hit) return ICON_HOST + hit[1];
  }
  return null;
}
/* Redraw an image centered at `fill` of its own size on a transparent canvas,
   so the decal projector lands it smaller on the ball. Used to shrink icons. */
async function padImageDecal(dataUrl, fill) {
  const img = await _loadImage(dataUrl);
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const dw = W * fill, dh = H * fill;
  c.getContext('2d').drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  return c.toDataURL('image/png');
}
/* XML-escape user text before it lands inside an SVG <text>. Just the chars
   that would otherwise break the document. */
const _escXml = (s) => String(s || '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]
));
/* The four named customizer fonts aren't shipped from any S3 bucket we can
   reach (confirmed by the earlier mapping), so the SVG can only ask for them
   by name and let the browser fall back. (Kept only as a reference of the four
   live-verified families; the live decal now uses the real server render.) */

/* ── Personalized text — REAL icustomize render, masked off the ball ─────────
   There is NO flat transparent text endpoint (unlike monograms): the server
   only renders Personalized text composited onto the ball via Item/GolfBall/r,
   which is exactly what golfballs.com itself shows (confirmed in the network
   capture). To get the buyer's actual letters in the REAL font/scale onto our
   3D ball, we:
     1. Render the ball WITH the text (Item/GolfBall/r, Print=Personalized).
     2. Render the SAME ball with NO text (cached once — it never changes).
     3. Diff the two: identical ball / dimples / "preview" watermark cancel,
        leaving exactly the text pixels (any color, even black or white).
     4. Tint that mask to the chosen color, trim + scale → a flat decal we
        project onto the 3D ball like the monogram.
   MFS (icustomize's font-size knob) is held high+constant for a crisp source;
   the on-ball size comes from our own per-Size fill. */
const PERSONALIZED_ENDPOINT = 'https://www.icustomize.com/Item/GolfBall/r';
/* Size → MFS (icustomize's font-size knob). These are the real values the site
   uses; the renderer auto-CAPS them to fit (e.g. 3 lines render identically at
   279 vs 372 — which is why "Large" and "Max" look the same with 3 lines). So
   we just pass MFS through and let the server size the text exactly as the
   customer's order will. */
const SIZE_TO_MFS = { Standard: 201, Large: 279, Max: 372 };
/* Source render is 564px wide and the ball fills that width, so 1 source pixel
   ≈ 1/564 of the ball diameter. To land the text on our 3D ball at the SAME
   proportion the website shows, map source px → decal-texture px by a fixed
   factor (NOT fit-to-fill, which would erase the size differences). Calibrated
   off the known-good monogram mapping (0.52 of the 1024 texture ≈ 0.35 of the
   ball): texture_px = source_px · 1024 / (0.673 · 564) ≈ source_px · 2.70.
   Tune this one number if text reads big/small vs the live order preview. */
const PERSONALIZED_SRC_SCALE = 2.70;
/* Build the composited Item/GolfBall/r render URL. The Print value is itself a
   query string, so userText/configOverrides get encoded twice (matches the
   site's own URLs). */
function personalizedRenderUrl(lines, font, color, mfs) {
  const m = String(mfs || 372);
  const ut = encodeURIComponent(JSON.stringify([{ lines, font, color }]));
  const icfg = encodeURIComponent(JSON.stringify({ MFS: m, SecondMFS: m }));
  const print = encodeURIComponent(`Personalized?userText=${ut}&configOverrides=${icfg}`);
  const outer = encodeURIComponent(JSON.stringify({ BC: '#FFFFFF', MFS: m, SecondMFS: m }));
  return `${PERSONALIZED_ENDPOINT}?configOverrides=${outer}&view=&Print=${print}`;
}
/* Draw a render URL onto a canvas and return its raw pixel data. */
async function _renderPixels(url) {
  const img = await _loadImage(await proxyImageDataUrl(url));
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const cx = c.getContext('2d'); cx.drawImage(img, 0, 0);
  return { data: cx.getImageData(0, 0, W, H).data, W, H };
}
/* The blank ball (empty text) is identical for every render — MFS only sizes
   the (absent) text, the ball itself never changes — so fetch it once. */
let _blankBallPromise = null;
const getBlankBall = () => (_blankBallPromise ||= _renderPixels(personalizedRenderUrl([], 'Kabel Dm BT', '#000000', 372)));

const _personalizedCache = new Map();
/* Render the text on the ball (at `mfs`), diff vs the blank ball, tint to
   `color`, then place it into the 1024 decal texture at the SAME proportion it
   has on the source ball (fixed source→texture scale — NOT fit-to-fill, so the
   Size/MFS differences survive). Returns a flat decal data URL (or null). */
async function extractTextDecal(lines, font, color, mfs) {
  const [blank, txt] = await Promise.all([getBlankBall(), _renderPixels(personalizedRenderUrl(lines, font, color, mfs))]);
  const { W, H } = blank; const bd = blank.data, td = txt.data;
  if (txt.W !== W || txt.H !== H) return null;
  const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
  const alpha = new Uint8ClampedArray(W * H);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let p = 0, i = 0; p < W * H; p++, i += 4) {
    const d = Math.abs(td[i] - bd[i]) + Math.abs(td[i + 1] - bd[i + 1]) + Math.abs(td[i + 2] - bd[i + 2]);
    const a = Math.max(0, Math.min(255, (d - 20) * 2));   // threshold tuned to skip dimple noise
    alpha[p] = a;
    if (a > 40) { const x = p % W, y = (p / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < x0) return null;
  const tw = x1 - x0 + 1, th = y1 - y0 + 1;
  const crop = document.createElement('canvas'); crop.width = tw; crop.height = th;
  const cctx = crop.getContext('2d'); const id = cctx.createImageData(tw, th);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const di = (y * tw + x) * 4;
    id.data[di] = r; id.data[di + 1] = g; id.data[di + 2] = b; id.data[di + 3] = alpha[(y + y0) * W + (x + x0)];
  }
  cctx.putImageData(id, 0, 0);
  // Fixed scale preserves the source proportions; clamp so very large text can't
  // overrun the texture.
  const SIZE = 1024;
  const s = Math.min(PERSONALIZED_SRC_SCALE, (SIZE * 0.95) / Math.max(tw, th));
  const dw = tw * s, dh = th * s;
  const out = document.createElement('canvas'); out.width = SIZE; out.height = SIZE;
  out.getContext('2d').drawImage(crop, (SIZE - dw) / 2, (SIZE - dh) / 2, dw, dh);
  return out.toDataURL('image/png');
}
/* ── Non-hook resolvers (for off-screen proposal snapshots) ──────────────────
   The proposal-email "generate previews" feature renders each line's 3D model
   off-screen and snapshots it. These mirror what LivePreview3D + useDecalUrl do,
   but as plain async functions driven by a stored proposal line (product +
   decoration) instead of the live editor context. */

/* Which 3D model a product uses. */
export function shapeForProduct(p) {
  if (isPokerChipProduct(p)) return 'chip';
  if (isBartenderProduct(p)) return 'bartender';
  if (isDivotProduct(p)) return 'divot';
  if (isBallMarkerProduct(p)) return 'marker';
  return 'ball';
}
/* Body tint for the model (ball colorway; metal tools + chip have none here). */
export function tintForProduct(p, shape) {
  if (shape === 'ball') return ballTitleTint(p && p.title);
  return undefined;
}
const _toHex = (c) => (typeof c === 'string' && c.startsWith('#')) ? c : _hexOf(c);
/* Resolve one imprint chip (from giftImprints.decoImprints) → a decal data URL,
   reusing the same renderers the live editor uses. Returns null when there's
   nothing to draw yet. */
export async function imprintToDecalUrl(chip) {
  if (!chip) return null;
  try {
    if (chip.kind === 'logo') return chip.image || chip._localImageDataUrl || (chip.logo && (chip.logo.dataUrl || chip.logo.preview)) || null;
    if (chip.kind === 'text') {
      const lines = (chip.lines || []).map((l) => String(l || '').trim()).filter(Boolean);
      if (!lines.length) return null;
      return await extractTextDecal(lines, chip.font || 'Kabel Dm BT', _toHex(chip.color), SIZE_TO_MFS.Standard);
    }
    if (chip.kind === 'monogram') {
      const letters = String(chip.text || '').toUpperCase().replace(/[^A-Z]/g, '').split('');
      if (!letters.length || !chip.view) return null;
      const masks = await getMonoMasks(chip.view, letters);
      const c1 = _toHex(chip.color);
      const c2 = (chip.color2 && chip.color2 !== 'Transparent') ? _toHex(chip.color2) : null;
      return composeMonoDecal(masks, c1, c2);
    }
  } catch (e) { return null; }
  return null;
}

/* Hook: given the active print-type snapshot, return the decal URL the viewer
   should render. Personalized / uploads are local and resolve synchronously.
   Monogram + Icons are fetched cross-origin (via the background proxy):
   - Monogram art is fetched once per (view, letters) and cached, so a COLOR
     change just re-tints the layers in place — only a TEXT/STYLE change hits
     the network (debounced). The icustomize `view` is built from the actual
     letter count (circle2 vs circle3) so 2 letters don't land in a 3-slot ring.
   - Icons are fetched to a same-origin data URL and cached by name.
   Returns null while a first fetch is in flight. */
function useDecalUrl() {
  const ctx = usePT();
  const sel = ctx.sel;
  const data = ctx.data || {};

  // Non-network decal types — computed directly.
  const syncUrl = useMemo(() => {
    if (sel === 'Custom Logo') return (data['Custom Logo'] && data['Custom Logo'].imageDataUrl) || null;
    if (sel === 'Photo') return (data.Photo && data.Photo.imageDataUrl) || null;
    return null;
  }, [sel, data]);

  const mono = sel === 'Monogram' ? (data.Monogram || {}) : null;
  const mStyle = mono && mono.style, mInit = mono && mono.initials;
  const mC1 = mono && mono.c1, mC2 = mono && mono.c2;
  const iconName = sel === 'Icons' ? (data.Icons || {}).icon : null;
  const pers = sel === 'Personalized' ? (data.Personalized || {}) : null;
  const pL1 = pers && pers.l1, pL2 = pers && pers.l2, pL3 = pers && pers.l3;
  const pFont = pers && pers.font, pColor = pers && pers.color, pSize = pers && pers.size;

  const [url, setUrl] = useState(null);
  useEffect(() => {
    // ── Personalized — render the real text on the ball, mask it off. ──
    if (sel === 'Personalized') {
      const lines = [pL1, pL2, pL3].map((l) => String(l || '').trim()).filter(Boolean);
      if (!lines.length) { setUrl(null); return; }
      const font = pFont || 'Kabel Dm BT';
      const color = _hexOf(pColor);
      const mfs = SIZE_TO_MFS[pSize] || SIZE_TO_MFS.Standard;
      const key = JSON.stringify([lines, font, color, mfs]);
      if (_personalizedCache.has(key)) { setUrl(_personalizedCache.get(key)); return; }
      let cancelled = false;
      const timer = setTimeout(() => {
        extractTextDecal(lines, font, color, mfs)
          .then((u) => { if (u) _personalizedCache.set(key, u); if (!cancelled) setUrl(u); })
          .catch(() => { if (!cancelled) setUrl(null); });
      }, 300);
      return () => { cancelled = true; clearTimeout(timer); };
    }
    // ── Icons — fetch the real PNG to a data URL (cached). ──
    if (sel === 'Icons') {
      const src = iconSrc(iconName);
      if (!src) { setUrl(null); return; }
      if (_iconCache.has(src)) { setUrl(_iconCache.get(src)); return; }
      let cancelled = false;
      proxyImageDataUrl(src)
        .then((du) => padImageDecal(du, ICON_DECAL_FILL))
        .then((du) => { _iconCache.set(src, du); if (!cancelled) setUrl(du); })
        .catch(() => { if (!cancelled) setUrl(null); });
      return () => { cancelled = true; };
    }
    // ── Monogram — fetch real letter art, split + recolor. ──
    if (sel === 'Monogram') {
      const letters = _monoLetters(mInit, mStyle);
      const spec = _monoSpec(mStyle);
      if (letters.length < spec.min) { setUrl(null); return; }   // not enough initials yet
      const view = spec.view(letters.length);                    // circle2 / circle3 / …
      const c1 = _hexOf(mC1);
      // Color 2 painting: explicit color → use it; Transparent → omit the C2
      // layer ONLY for knockout styles (circle), else paint it in Color 1 so the
      // border / divider / middle letter still shows.
      const c2 = (mC2 && mC2 !== 'Transparent') ? _hexOf(mC2) : (spec.knockout ? null : c1);
      // Layers already cached (e.g. a color-only change) → re-tint instantly.
      const cached = peekMonoMasks(view, letters);
      if (cached) { setUrl(composeMonoDecal(cached, c1, c2)); return; }
      // First time for these letters → debounce the network fetch.
      let cancelled = false;
      const timer = setTimeout(() => {
        getMonoMasks(view, letters)
          .then((masks) => { if (!cancelled) setUrl(composeMonoDecal(masks, c1, c2)); })
          .catch(() => { if (!cancelled) setUrl(null); });
      }, 240);
      return () => { cancelled = true; clearTimeout(timer); };
    }
    // ── Everything else — synchronous. ──
    setUrl(syncUrl);
  }, [sel, syncUrl, iconName, mStyle, mInit, mC1, mC2, pL1, pL2, pL3, pFont, pColor, pSize]);

  return url;
}

/* Dual-pole: resolve the SECOND imprint (opposite pole) to a decal URL. Reads
   the __second context slot and reuses the same renderers as the front
   (Personalized text / Monogram / uploaded image). `frontUrl` is handed in for
   the "Same as Front" choice. Returns null when no second imprint is active. */
function useSecondDecalUrl(frontUrl) {
  const ctx = usePT();
  const s = ctx.data.__second || {};
  const { enabled, choice } = s;
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!enabled) { setUrl(null); return; }
    if (choice === 'Same as Front') { setUrl(frontUrl || null); return; }
    if (choice === 'Upload Image' || choice === 'Custom' || choice === 'Logo Library') {
      setUrl(s.imageDataUrl || null); return;
    }
    if (choice === 'Personalized') {
      const lines = [s.l1, s.l2, s.l3].map((l) => String(l || '').trim()).filter(Boolean);
      if (!lines.length) { setUrl(null); return; }
      const font = s.font || 'Kabel Dm BT';
      const color = _hexOf(s.color);
      const mfs = SIZE_TO_MFS[s.size] || SIZE_TO_MFS.Standard;
      const key = JSON.stringify([lines, font, color, mfs]);
      if (_personalizedCache.has(key)) { setUrl(_personalizedCache.get(key)); return; }
      let cancelled = false;
      const t = setTimeout(() => {
        extractTextDecal(lines, font, color, mfs)
          .then((u) => { if (u) _personalizedCache.set(key, u); if (!cancelled) setUrl(u); })
          .catch(() => { if (!cancelled) setUrl(null); });
      }, 300);
      return () => { cancelled = true; clearTimeout(t); };
    }
    if (choice === 'Monogram') {
      const letters = _monoLetters(s.initials, s.style);
      const spec = _monoSpec(s.style);
      if (letters.length < spec.min) { setUrl(null); return; }
      const view = spec.view(letters.length);
      const c1 = _hexOf(s.c1);
      const c2 = (s.c2 && s.c2 !== 'Transparent') ? _hexOf(s.c2) : (spec.knockout ? null : c1);
      const cached = peekMonoMasks(view, letters);
      if (cached) { setUrl(composeMonoDecal(cached, c1, c2)); return; }
      let cancelled = false;
      const t = setTimeout(() => {
        getMonoMasks(view, letters)
          .then((masks) => { if (!cancelled) setUrl(composeMonoDecal(masks, c1, c2)); })
          .catch(() => { if (!cancelled) setUrl(null); });
      }, 240);
      return () => { cancelled = true; clearTimeout(t); };
    }
    setUrl(null);
  }, [enabled, choice, frontUrl, s.l1, s.l2, s.l3, s.color, s.font, s.size, s.style, s.initials, s.c1, s.c2, s.imageDataUrl]);
  return url;
}

/* Second-pole imprint — the live reveal: a choice row, then the matching control. */
// A custom-logo ball's opposite pole: mirror the front, personalize (text), or
// upload a custom logo. No monogram / no separate library picker.
const SECOND_IMPRINT_CHOICES = ['Same as Front', 'Personalized', 'Custom'];
/* full personalized imprint — 3 wired text lines + imprint color, font, size.
   Shared by the Personalized print type and the second-pole Personalized choice. */
function PersonalizedImprint({ slot = 'Personalized' }) {
  const [l1, setL1] = usePTField(slot, 'l1');
  const [l2, setL2] = usePTField(slot, 'l2');
  const [l3, setL3] = usePTField(slot, 'l3');
  const [color, setColor] = usePTField(slot, 'color');
  const [font, setFont] = usePTField(slot, 'font');
  const [size, setSize] = usePTField(slot, 'size');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <Field label="Line 1" required><TextInput value={l1} onChange={setL1} placeholder="Your text" maxLength={17} /></Field>
      <Field label="Optional Line 2"><TextInput value={l2} onChange={setL2} placeholder="Optional" maxLength={17} /></Field>
      <Field label="Optional Line 3"><TextInput value={l3} onChange={setL3} placeholder="Optional" maxLength={17} /></Field>
      <Field label="Color"><ColorRow swatches={IMPRINT_COLORS} value={color} onChange={setColor} /></Field>
      <Field label="Font"><Segmented options={FONT_OPTS} value={font} onChange={setFont} size="sm" full /></Field>
      <Field label="Size"><Segmented options={SIZE_OPTS} value={size} onChange={setSize} size="sm" full /></Field>
    </div>
  );
}

/* Second-pole monogram sub-control — writes into the __second slot so it's
   independent of the front Monogram print. Same style/initials/2-color inputs
   as MonogramFlow; the decal is rendered by useSecondDecalUrl. */
function SecondMonogram() {
  const [style, setStyle] = usePTField('__second', 'style');
  const [v, setV] = usePTField('__second', 'initials');
  const [c1, setC1] = usePTField('__second', 'c1');
  const [c2, setC2] = usePTField('__second', 'c2');
  const n = _monoCount(style);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Field label="Monogram Style"><MonoGrid value={style} onChange={setStyle} /></Field>
      <Field label={n === 1 ? 'Initial' : 'Initials'}>
        <TextInput value={v} onChange={(s) => setV(s.toUpperCase().replace(/[^A-Z]/g, '').slice(0, GLOBAL_MONO_MAX))} placeholder={_monoPlaceholder(n)} maxLength={GLOBAL_MONO_MAX} />
      </Field>
      <Field label="Color"><ColorRow swatches={IMPRINT_COLORS} value={c1} onChange={setC1} /></Field>
      <Field label="Color 2"><ColorRow swatches={IMPRINT_COLORS} transparent value={c2} onChange={setC2} /></Field>
    </div>
  );
}

/* Dual-pole second imprint. The buyer's front print goes on the camera-facing
   pole; this puts a second, independent imprint on the opposite pole (e.g. a
   Custom Logo on one side + Personalization/Monogram on the other). All state
   lives in the __second context slot so it survives + drives the back decal. */
function SecondImprint({ alignable = true }) {
  const [on, setOn] = usePTField('__second', 'enabled');
  const [choice, setChoice] = usePTField('__second', 'choice');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <Checkbox checked={!!on} onClick={() => setOn(!on)} label="Add Second Imprint (opposite pole)" />
      <AnimatePresence initial={false}>
      {on && (
        <motion.div
          initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
          transition={{ duration: .22, ease: [0.32, 0.72, 0, 1] }}
          style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SECOND_IMPRINT_CHOICES.map((vv) => {
              const sel = choice === vv;
              return <button key={vv} onClick={() => setChoice(vv)} style={{ padding: '7px 11px', borderRadius: 'var(--gb-r-md)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, background: sel ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-inverse-medium)', border: '1px solid ' + (sel ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'), color: sel ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)' }}>{vv}</button>;
            })}
          </div>
          {choice === 'Personalized' && <PersonalizedImprint slot="__second" />}
          {(choice === 'Upload Image' || choice === 'Custom' || choice === 'Logo Library') && <ImageUpload slot="__second" label="Upload Second Imprint" alignable={alignable} />}
          {choice === 'Same as Front' && <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', fontStyle: 'italic' }}>Reuses your front imprint on the opposite pole — rotate the ball to see it.</div>}
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
function Commercial({ p, config, serviceLevel }) {
  const ladder = (p.breaks && p.breaks.length ? p.breaks : [{ q: p.minQty || 12, p: p.price || 0 }]);
  // setup fee + service options come from the live config; balls (no config) keep the legacy defaults.
  const serviceOpts = (config
    ? (config.serviceLevel && config.serviceLevel.length ? config.serviceLevel : config.shipping)
    : (serviceLevel ? ['8 Business Day Standard', '3-Day', '2-Day', 'Overnight'] : []))
    // Drop the internal "{Override}" service levels — not buyer-facing.
    .filter((s) => !/\{[^}]*override[^}]*\}/i.test(String(s)));
  const [svc, setSvc] = useState(null);
  const selSvc = svc ?? serviceOpts[0];
  const prodTime = p.productionTime;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, padding: '9px 12px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)' }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-text-muted)' }}>Min qty</div>
          <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-primary)' }}>{p.minQty || 12}</div>
        </div>
        {prodTime != null && prodTime > 0 && (
          <div style={{ flex: 1, padding: '9px 12px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-text-muted)' }}>Production</div>
            <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-primary)' }}>{prodTime}<span style={{ fontSize: 10, fontWeight: 600 }}> day{prodTime === 1 ? '' : 's'}</span></div>
          </div>
        )}
      </div>
      {serviceOpts.length > 0 && (
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-text-muted)', marginBottom: 4 }}>Service level</div>
          <Dropdown
            size="sm"
            value={selSvc}
            options={serviceOpts.map((s) => ({ id: s, label: s }))}
            onChange={setSvc}
            style={{ width: '100%' }}
          />
        </div>
      )}
      <div>
        <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-text-muted)', marginBottom: 6 }}>Volume price ladder · per unit</div>
        <div style={{ border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-md)', overflow: 'hidden' }}>
          {ladder.map((b, i) => {
            const best = i === ladder.length - 1;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '6px 11px', background: best ? 'var(--gb-brand-tint-soft)' : i % 2 ? 'var(--gb-fill-faint)' : 'transparent', borderTop: i ? '1px solid var(--gb-border-subtle)' : 'none' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--gb-text-secondary)', fontFamily: 'var(--gb-font-mono)', flexShrink: 0 }}>{b.q}+ qty</span>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: best ? 'var(--gb-brand-label)' : 'var(--gb-text-primary)' }}>{money(b.p)}</span>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 9.5, color: 'var(--gb-text-muted)', marginTop: 5 }}>Unit price includes application of your custom logo.</div>
      </div>
    </div>
  );
}

/* ── config-driven accessory customizer ──────────────────────────────────────
   The real per-product options come from the product page's ProductModification
   + ProductChild (fetched via background.js fetchProductConfig). */
function useProductConfig(p) {
  const [state, setState] = useState({ loading: !!(p && p.url), config: null });
  useEffect(() => {
    const canMsg = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;
    if (!p || !p.url || !canMsg) { setState({ loading: false, config: null }); return undefined; }
    let alive = true;
    setState({ loading: true, config: null });
    try {
      chrome.runtime.sendMessage({ action: 'fetchProductConfig', url: p.url }, (resp) => {
        if (!alive) return;
        setState({ loading: false, config: resp && resp.ok ? resp.config : null });
      });
    } catch (e) { setState({ loading: false, config: null }); }
    return () => { alive = false; };
  }, [p && p.url]);
  return state;
}

/* base product color — labelled buttons, exactly like the live site */
function BaseColorPicker({ label = 'Color', colors, value, onChange }) {
  if (!colors || colors.length < 1) return null;
  return (
    <Field label={label}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {colors.map((c) => {
          const on = value === c;
          return <button key={c} onClick={() => onChange(c)} style={{ padding: '6px 11px', borderRadius: 'var(--gb-r-md)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, background: on ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-inverse-medium)', border: '1px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'), color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)' }}>{c}</button>;
        })}
      </div>
    </Field>
  );
}

/* Custom Logo decoration — logo upload + (second imprint only where the product
   actually has a second pole) + commercial block. */
function CustomLogoFlow({ p, config, dualPole }) {
  // Round markers (poker chips) align the logo onto the face like a ball; flat
  // products (towels, shirts, …) just attach the logo as-is (no place to align).
  const alignable = isPokerChipProduct(p) || isDivotProduct(p) || isBartenderProduct(p);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ImageUpload alignable={alignable} />
      {dualPole && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-text-muted)', marginBottom: 7 }}>Second Pole Imprint</div>
          <SecondImprint alignable={alignable} />
        </div>
      )}
      <Commercial p={p} config={config} />
    </div>
  );
}

/* embroidery decoration: text (2 lines) + thread color. Writes through the
   `Personalized` context slot so AccessoryDecorationEmitter serializes it. */
function PersonalizedDecoration() {
  const [l1, setL1] = usePTField('Personalized', 'l1');
  const [l2, setL2] = usePTField('Personalized', 'l2');
  const [c, setC] = usePTField('Personalized', 'color');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label="Line 1"><TextInput value={l1} onChange={setL1} placeholder="Your text" maxLength={17} /></Field>
      <Field label="Optional Line 2"><TextInput value={l2} onChange={setL2} placeholder="Optional" maxLength={17} /></Field>
      <Field label="Thread Color"><ColorRow swatches={THREAD_COLORS} value={c} onChange={setC} /></Field>
    </div>
  );
}

/* embroidery decoration: monogram style + initials + two imprint colors.
   The Initials field rescales (label, placeholder, maxLength) to match the
   chosen style — switching to a 1-initial style after typing 3 letters
   truncates the value so the user never has leftover letters that can't fit. */
function MonogramDecoration() {
  const [style, setStyle] = usePTField('Monogram', 'style');
  const [v, setV] = usePTField('Monogram', 'initials');
  const [c1, setC1] = usePTField('Monogram', 'c1');
  const [c2, setC2] = usePTField('Monogram', 'c2');
  const n = _monoCount(style);
  const pickStyle = (k) => { setStyle(k); const m = _monoCount(k); if ((v || '').length > m) setV((v || '').slice(0, m)); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label="Monogram Style"><MonoGrid value={style} onChange={pickStyle} /></Field>
      <Field label={n === 1 ? 'Initial' : 'Initials'}>
        <TextInput value={v} onChange={(s) => setV(s.slice(0, n))} placeholder={_monoPlaceholder(n)} maxLength={n} />
      </Field>
      <Field label="Color 1"><ColorRow swatches={IMPRINT_COLORS} value={c1} onChange={setC1} /></Field>
      <Field label="Color 2"><ColorRow swatches={IMPRINT_COLORS} transparent value={c2} onChange={setC2} /></Field>
    </div>
  );
}

/* Golf-ball Monogram print type — composite that owns style + initials together
   so the Initials field can rescale to match the chosen style (1 / 2 / 3 letters).
   Renders in place of the default control loop in ModControls. */
function MonogramFlow() {
  const [style, setStyle] = usePTField('Monogram', 'style');
  const [v, setV] = usePTField('Monogram', 'initials');
  const [c1, setC1] = usePTField('Monogram', 'c1');
  const [c2, setC2] = usePTField('Monogram', 'c2');
  const n = _monoCount(style);
  // Switching styles must NOT clobber the typed text — each style just renders
  // its first N letters. So pickStyle only changes the style; the stored
  // initials (up to the global max) are left intact.
  const pickStyle = (k) => setStyle(k);
  const typed = String(v || '').toUpperCase().replace(/[^A-Z]/g, '');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="Monogram Style"><MonoGrid value={style} onChange={pickStyle} /></Field>
      <Field label={n === 1 ? 'Initial' : 'Initials'}>
        <TextInput
          value={v}
          onChange={(s) => setV(s.toUpperCase().replace(/[^A-Z]/g, '').slice(0, GLOBAL_MONO_MAX))}
          placeholder={_monoPlaceholder(n)}
          maxLength={GLOBAL_MONO_MAX}
        />
      </Field>
      {typed.length > n && (
        <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: -8 }}>
          This style uses the first {n} letter{n === 1 ? '' : 's'} — “{typed.slice(0, n)}”.
        </div>
      )}
      <Field label="Color"><ColorRow swatches={IMPRINT_COLORS} value={c1} onChange={setC1} /></Field>
      <Field label="Color 2"><ColorRow swatches={IMPRINT_COLORS} transparent value={c2} onChange={setC2} /></Field>
    </div>
  );
}

/* one base-product input (Color, Size, Metal Finish, Imprint side, …) — from data */
function PropertyInput({ label, options }) {
  // Local state drives the UI so it's always clickable (accessories aren't
  // wrapped in a PrintTypeProvider, so the __base context setter is a no-op
  // there — using it for the value made towels/shirts unselectable). We ALSO
  // mirror the pick into the __base slot when a context exists (balls) so the
  // cart's widgetSelections reflect it.
  const ctx = usePT();
  const [v, setV] = useState(options[0]);
  const onChange = (val) => { setV(val); try { ctx.update && ctx.update('__base', { [label]: val }); } catch { /* no ctx */ } };
  const clean = (label || 'Option').replace(/^(Accessories|Apparel|Product)\s+/i, '');
  return <BaseColorPicker label={clean} colors={options} value={v} onChange={onChange} />;
}

/* all of a product's base-product inputs (PropertyProduct / property_*_ss) —
   shared by the golf-ball and accessory paths so e.g. Ball Color always shows. */
function BaseProperties({ p, config }) {
  // The product page (PropertyProduct) is authoritative; the catalog facet is an
  // incomplete fallback (some products, e.g. Devant towels, have no facet at all).
  const all = (config && config.properties && config.properties.length) ? config.properties : (p.properties || []);
  const isChip = isPokerChipProduct(p);
  // Skip single-value properties (e.g. "Colors in Logo: [1 Color]") — not a real picker.
  const properties = all
    .filter((prop) => (prop.options || []).length > 1)
    .map((prop) => {
      // The 3D chip preview defaults to black clay; default its color picker to
      // Black too (move it first) so the swatch selection and the live preview
      // agree the moment customization opens.
      if (isChip && /colou?r/i.test(prop.label || '')) {
        const black = (prop.options || []).find((o) => /^black$/i.test(o));
        if (black) return { ...prop, options: [black, ...prop.options.filter((o) => o !== black)] };
      }
      return prop;
    });
  return <>{properties.map((prop, i) => <PropertyInput key={(prop.label || '') + i} label={prop.label} options={prop.options} />)}</>;
}

/* a tee imprint — text (up to 23 chars) + text color. Writes through context
   (the `Tee` slot) so AccessoryDecorationEmitter can serialize it to the cart. */
function TeeDecoration() {
  const [v, setV] = usePTField('Tee', 'text');
  const [c, setC] = usePTField('Tee', 'color');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label="Imprint Text"><TextInput value={v} onChange={setV} placeholder="Up to 23 characters" maxLength={23} /></Field>
      <Field label="Text Color"><ColorRow swatches={IMPRINT_COLORS} value={c} onChange={setC} /></Field>
    </div>
  );
}

/* The translation from modificationName_ss → decoration tabs (the "connection"):
   Custom Logo → Custom; a Golf Towel/Hat embroidery mod → Personalized; Tee → Tee;
   Photo → Photo; Monogram/Personalized map to themselves. Live-verified against the
   Tri-Fold towel (["Golf Towel","Custom Logo"] → Stock / Personalized / Custom). */
function decorationsFor(mods) {
  const norm = [...new Set((mods || []).map((m) => MOD_ALIAS[m] || m))];
  const decos = [];
  const add = (tab, kind) => { if (!decos.some((d) => d.tab === tab)) decos.push({ tab, kind }); };
  norm.forEach((m) => {
    if (m === 'Custom Logo') add('Custom', 'custom');
    // Towel / hat embroidery carries BOTH a Personalized text imprint AND a
    // Monogram (verified in the live cart) — offer both, not just Personalized.
    else if (/^Golf (Towel|Hat)/i.test(m)) { add('Personalized', 'personalized'); add('Monogram', 'monogram'); }
    else if (m === 'Personalized') add('Personalized', 'personalized');
    else if (m === 'Ball Marker') add('Personalized', 'personalized'); // personalized ball-marker text (e.g. hat clips)
    else if (m === 'Monogram') add('Monogram', 'monogram');
    else if (m === 'Tee') add('Tee', 'tee');
    else if (m === 'Photo') add('Photo', 'photo');
  });
  return decos;
}
const DECO_ORDER = ['Stock', 'Personalized', 'Monogram', 'Tee', 'Photo', 'Custom'];
function renderDeco(kind, p, config, dualPole) {
  switch (kind) {
    case 'custom': return <CustomLogoFlow p={p} config={config} dualPole={dualPole} />;
    case 'personalized': return <PersonalizedDecoration />;
    case 'monogram': return <MonogramDecoration />;
    case 'tee': return <TeeDecoration />;
    case 'photo': return <ImageUpload ai label="Upload Image" alignable={false} />;
    case 'stock': return <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', padding: '8px 0' }}>Buy as-is — no decoration.</div>;
    default: return null;
  }
}

/* the decoration area: one inline block, or Stock / … / Custom tabs when the
   product supports more than one decoration type (driven by modificationName_ss). */
function DecorationArea({ p, config, mods, dualPole }) {
  const decos = decorationsFor(mods);
  const single = decos.length <= 1;
  const [active, setActive] = useState('Custom');
  const [, setAccKind] = usePTField('__accessory', 'kind');
  const tabs = single ? null : [{ tab: 'Stock', kind: 'stock' }, ...decos].sort((a, b) => DECO_ORDER.indexOf(a.tab) - DECO_ORDER.indexOf(b.tab));
  const curKind = single ? (decos[0] ? decos[0].kind : 'custom') : (tabs.find((t) => t.tab === active) || tabs[tabs.length - 1]).kind;
  // Publish the active accessory decoration kind so AccessoryDecorationEmitter
  // serializes the right decoration (custom logo vs tee text vs embroidery).
  useEffect(() => { setAccKind(curKind); }, [curKind, setAccKind]);
  if (single) return renderDeco(curKind, p, config, dualPole);
  const cur = tabs.find((t) => t.tab === active) || tabs[tabs.length - 1];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--gb-border-subtle)', flexWrap: 'wrap' }}>
        {tabs.map((t) => {
          const on = cur.tab === t.tab;
          return <button key={t.tab} onClick={() => setActive(t.tab)} style={{ padding: '8px 13px', background: 'transparent', border: 'none', borderBottom: '2px solid ' + (on ? 'var(--gb-brand-label)' : 'transparent'), marginBottom: -1, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)' }}>{t.tab}</button>;
        })}
      </div>
      {/* Animate the swap between decoration types (Stock / Custom / …). */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={cur.tab}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
          transition={{ duration: .18, ease: [0.32, 0.72, 0, 1] }}>
          {renderDeco(cur.kind, p, config, dualPole)}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* a bundle (customData.bundleItems) — one decoration section per component */
function BundleSections({ items, p, config, dualPole }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {items.map((item, i) => {
        const isTee = /tee/i.test(item);
        // bundleItems carry raw mod names like "Generic Inhouse Custom" — label them sensibly
        const label = isTee ? 'Tee' : (/custom|logo/i.test(item) ? 'Custom Logo' : item);
        return (
          <div key={i} style={{ border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', overflow: 'hidden' }}>
            <div style={{ padding: '9px 12px', background: 'var(--gb-fill-subtle)', fontSize: 11.5, fontWeight: 700, color: 'var(--gb-text-secondary)', textTransform: 'capitalize' }}>{label}</div>
            <div style={{ padding: 14 }}>
              {isTee ? <TeeDecoration /> : <CustomLogoFlow p={p} config={config} dualPole={dualPole} />}
            </div>
          </div>
        );
      })}
      <Commercial p={p} config={config} />
    </div>
  );
}

/* the accessory customizer: every base-product input (from PropertyProduct /
   property_*_ss), then the decoration blocks from modificationName_ss. */
function AccessoryCustomizer({ p, config, loading }) {
  // Modifications / second pole / bundle: the catalog doc's customData_s is the
  // authoritative source (richer than the product page), so prefer p.* here.
  const mods = (p.modNames && p.modNames.length) ? p.modNames : ((config && config.modifications) || []);
  const excludeDualPole = (p && p.excludeDualPole) || (config && config.excludeDualPole) || false;
  // Poker chips carry their dual-pole capability via the "Poker Chip Second
  // Pole" mod rather than the customData dualPole variant — honor either.
  const isChip = isPokerChipProduct(p);
  const isDivot = isDivotProduct(p);
  const isBartender = isBartenderProduct(p);
  const isMarker = isBallMarkerProduct(p);
  const dualPole = (p.dualPole || (config && config.dualPole) || isChip || false) && !excludeDualPole;
  const bundleItems = (p.bundleItems && p.bundleItems.length) ? p.bundleItems : ((config && config.bundleItems) || null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {loading && <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', fontStyle: 'italic' }}>Loading live options…</div>}
      {isChip && !bundleItems && <LivePreview3D shape="chip" p={p} />}
      {isDivot && !bundleItems && <LivePreview3D shape="divot" p={p} />}
      {isBartender && !bundleItems && <LivePreview3D shape="bartender" p={p} />}
      {isMarker && !bundleItems && <LivePreview3D shape="marker" p={p} />}
      <BaseProperties p={p} config={config} />
      {bundleItems && bundleItems.length
        ? <BundleSections items={bundleItems} p={p} config={config} dualPole={dualPole} />
        : <DecorationArea mods={mods} p={p} config={config} dualPole={dualPole} />}
    </div>
  );
}

/* one control unit, keyed by the schema's control id */
function Control({ k, p, config, serviceLevel }) {
  const [v, setV] = useState('');
  const [c1, setC1] = useState('Black'); const [c2, setC2] = useState('Transparent');
  const [font, setFont] = useState(FONTS[0]); const [size, setSize] = useState(SIZES[0]);
  const [style, setStyle] = useState(MONO_STYLES[0].key);
  // Icon picker reads/writes through context so <LivePreview3D /> sees it live.
  const [icon, setIcon] = usePTField('Icons', 'icon');
  const [align, setAlign] = useState(ALIGNXL_STYLES[0].key);
  const [alignID, setAlignID] = useState(IDALIGN_STYLES[0].key);
  const [num, setNum] = useState(73); const [same, setSame] = useState(false);
  switch (k) {
    case 'imageUpload': return <ImageUpload slot="Custom Logo" />;
    case 'photoUpload': return <ImageUpload ai label="Upload Image" slot="Photo" />;
    case 'secondImprint': return <SecondImprint />;
    case 'commercial': return <Commercial p={p} config={config} serviceLevel={serviceLevel} />;
    case 'personalized': return <PersonalizedImprint />;
    case 'lines3': return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <Field label="Line 1" required><TextInput value={v} onChange={setV} placeholder="Your text" maxLength={17} /></Field>
        <Field label="Optional Line 2"><TextInput value="" onChange={() => {}} placeholder="Optional" maxLength={17} /></Field>
        <Field label="Optional Line 3"><TextInput value="" onChange={() => {}} placeholder="Optional" maxLength={17} /></Field>
      </div>
    );
    case 'line1': return <Field label="Line 1"><TextInput value={v} onChange={setV} placeholder="Imprint text" /></Field>;
    case 'initials': return <Field label="Initials"><TextInput value={v} onChange={setV} placeholder="ABC" maxLength={3} /></Field>;
    case 'optText': return <Field label="Enter Text (Optional)"><TextInput value={v} onChange={setV} maxLength={17} /></Field>;
    case 'color': return <Field label="Color"><ColorRow swatches={IMPRINT_COLORS} value={c1} onChange={setC1} /></Field>;
    case 'color2': return <Field label="Color 2"><ColorRow swatches={IMPRINT_COLORS} transparent value={c2} onChange={setC2} /></Field>;
    case 'textColor': return <Field label="Text Color"><ColorRow swatches={IMPRINT_COLORS} value={c1} onChange={setC1} /></Field>;
    case 'textColorSingle': return <Field label="Text Color"><ColorRow swatches={IMPRINT_COLORS} value={c1} onChange={setC1} /></Field>;
    case 'lineColor': return <Field label="Line Color"><ColorRow swatches={IMPRINT_COLORS} value={c2} onChange={setC2} /></Field>;
    case 'sameColor': return <Checkbox checked={same} onClick={() => setSame(!same)} label="Use same Color" note="line = text color" />;
    case 'thread': return <Field label="Thread Color"><ColorRow swatches={THREAD_COLORS} value={c1} onChange={setC1} /></Field>;
    case 'font': return <Field label="Font"><Segmented options={FONT_OPTS} value={font} onChange={setFont} size="sm" full /></Field>;
    case 'size': return <Field label="Size"><Segmented options={SIZE_OPTS} value={size} onChange={setSize} size="sm" full /></Field>;
    case 'number': return (
      <Field label="Number">
        <div style={{ display: 'inline-flex', alignItems: 'center', height: 32, background: 'var(--gb-fill-inverse-medium)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', overflow: 'hidden' }}>
          <button onClick={() => setNum((n) => Math.max(0, n - 1))} style={{ width: 30, height: 32, border: 'none', background: 'transparent', color: 'var(--gb-text-tertiary)', cursor: 'pointer' }}>−</button>
          <div style={{ width: 50, textAlign: 'center', fontFamily: 'var(--gb-font-mono)', fontSize: 14, fontWeight: 800, color: 'var(--gb-text-primary)', borderLeft: '1px solid var(--gb-border-subtle)', borderRight: '1px solid var(--gb-border-subtle)', lineHeight: '32px' }}>{num}</div>
          <button onClick={() => setNum((n) => Math.min(99, n + 1))} style={{ width: 30, height: 32, border: 'none', background: 'transparent', color: 'var(--gb-text-tertiary)', cursor: 'pointer' }}>+</button>
        </div>
      </Field>
    );
    case 'monoStyle': return <Field label="Monogram Style"><MonoGrid value={style} onChange={setStyle} /></Field>;
    case 'alignXL': return <Field label="Alignment Style"><GraphicGrid items={ALIGNXL_STYLES} value={align} onChange={setAlign} /></Field>;
    case 'alignID': return <Field label="Alignment"><GraphicGrid items={IDALIGN_STYLES} value={alignID} onChange={setAlignID} /></Field>;
    case 'iconGrid': return <Field label="Icon"><IconGrid value={icon} onChange={setIcon} /></Field>;
    case 'bundle': return (
      <Field label="Base product color"><ColorRow swatches={BASE_COLORS} value={c1} onChange={setC1} /></Field>
    );
    default: return null;
  }
}

/* the assembled controls for one modification */
function ModControls({ name, p, config, serviceLevel }) {
  const meta = MODS[name];
  if (!meta) return null;
  // Monogram needs style ↔ initials to share state so the input can rescale
  // to the chosen layout's letter count — route through the composite.
  if (name === 'Monogram') return <MonogramFlow />;
  // Second-pole imprint is offered by default but suppressed by the
  // ExcludeDualPolePrinting tag (e.g. Triple Track lines) — drop it then.
  const excludeDualPole = (p && p.excludeDualPole) || (config && config.excludeDualPole) || false;
  const controls = excludeDualPole ? meta.controls.filter((c) => c !== 'secondImprint') : meta.controls;
  if (!controls.length) {
    return <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', fontStyle: 'italic', padding: '4px 0' }}>{meta.note || 'Preset — no buyer-facing controls.'}</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {controls.map((k, i) => <Control key={i} k={k} p={p} config={config} serviceLevel={serviceLevel} />)}
      {meta.extras && (
        <div style={{ fontSize: 10.5, color: 'var(--gb-text-tertiary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <I.bolt size={11} style={{ color: 'var(--gb-brand-label)' }} /> {meta.extras}
        </div>
      )}
    </div>
  );
}

/* Per-mod glyphs rendered inside the selector circle. 24x24 viewBox, currentColor. */
const PRINT_TYPE_ICON = {
  'Custom Logo':          (p) => <Icon {...p}><rect x="3.2" y="5.2" width="17.6" height="13.6" rx="2"/><circle cx="8.5" cy="10" r="1.4"/><path d="M20 17l-5-5-8.5 8.5"/></Icon>,
  'Personalized':         (p) => <Icon {...p} strokeWidth={2.2}><path d="M4 20h16"/><path d="M7.5 17L12 6l4.5 11"/><path d="M9 13.5h6"/></Icon>,
  'Monogram':             (p) => <Icon {...p} strokeWidth={2.2}><path d="M5 18V6l3.5 7L12 6"/><path d="M12 18V6l3.5 7L19 6v12"/></Icon>,
  'Photo':                (p) => <Icon {...p}><path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1z"/><circle cx="12" cy="13" r="3.4"/></Icon>,
  'AlignXL':              (p) => <Icon {...p} strokeWidth={2}><line x1="3.5" y1="12" x2="20.5" y2="12"/><circle cx="6.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="17.5" cy="12" r="1.3" fill="currentColor" stroke="none"/></Icon>,
  'IDAlign':              (p) => <Icon {...p} strokeWidth={2.2}><path d="M5 8l3 4-3 4"/><path d="M11 8l3 4-3 4"/><path d="M17 8l3 4-3 4"/></Icon>,
  'Icons':                (p) => <Icon {...p}><polygon points="12 3.5 14.3 9.2 20.5 9.7 15.8 13.8 17.3 19.8 12 16.6 6.7 19.8 8.2 13.8 3.5 9.7 9.7 9.2" fill="currentColor" stroke="none"/></Icon>,
  'Custom Player Number': (p) => <Icon {...p} strokeWidth={2.2}><path d="M4 9.5h16M4 14.5h16M10 4.5l-2 15M16 4.5l-2 15"/></Icon>,
};

/* Split N tiles into rows of up to 3, with the remainder (1 or 2) on the last row.
   The last row renders wide (icon left of text) whenever it has ≤2 items, so a
   leftover singleton becomes a thin full-width button at the bottom.
   4→[3,1] 5→[3,2] 6→[3,3] 7→[3,3,1] 8→[3,3,2]. */
function splitTileRows(n) {
  const rows = [];
  let r = n;
  while (r > 3) { rows.push(3); r -= 3; }
  if (r > 0) rows.push(r);
  return rows;
}

/* Inner grid + control area. Reads `sel` from PrintTypeContext so the parent
   provider owns the snapshot the LivePreview3D also reads from. */
function PrintTypeGridInner({ p, mods, config }) {
  const ctx = usePT();
  const sel = ctx.sel;
  const setSel = ctx.setSel;
  const rows = splitTileRows(mods.length);
  let cursor = 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {rows.map((cols, ri) => {
          const items = mods.slice(cursor, cursor + cols);
          cursor += cols;
          const wide = cols <= 2;
          return (
            <div key={ri} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 7 }}>
              {items.map((t) => {
                const on = sel === t;
                const IconC = PRINT_TYPE_ICON[t];
                return (
                  <button
                    key={t}
                    onClick={() => setSel(t)}
                    style={{
                      position: 'relative',
                      minHeight: wide ? 40 : 58,
                      borderRadius: 'var(--gb-r-md)',
                      cursor: 'pointer',
                      padding: wide ? '6px 12px' : '8px 6px',
                      display: 'flex',
                      flexDirection: wide ? 'row' : 'column',
                      alignItems: 'center',
                      justifyContent: wide ? 'center' : 'center',
                      gap: wide ? 10 : 6,
                      background: on ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-inverse-medium)',
                      border: '1px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'),
                      color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)',
                      fontFamily: 'inherit',
                      transition: 'background var(--gb-anim), border-color var(--gb-anim), color var(--gb-anim)',
                    }}
                  >
                    <span
                      style={{
                        width: wide ? 22 : 26,
                        height: wide ? 22 : 26,
                        borderRadius: '50%',
                        background: on ? 'var(--gb-surface-modal, var(--gb-fill-strong))' : 'var(--gb-fill-strong)',
                        border: '1px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: 'inherit',
                      }}
                    >
                      {IconC && <IconC size={wide ? 12 : 14} />}
                    </span>
                    <span style={{ fontSize: wide ? 11 : 9, fontWeight: 700, textAlign: wide ? 'left' : 'center', lineHeight: 1.15 }}>{t}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <div style={{ borderTop: '1px solid var(--gb-border-subtle)', paddingTop: 14 }}>
        <div key={sel} style={{ animation: 'gb-fade-slide var(--gb-anim) both' }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-brand-label)', marginBottom: 12 }}>{sel}</div>
          <ModControls name={sel} p={p} config={config} serviceLevel />
        </div>
      </div>
    </div>
  );
}

/* Provider that owns the personalization snapshot the print-type controls
   read/write through, plus the selected print-type itself. Wraps the inner
   grid AND any sibling preview pane the parent (CustomizeBlock) renders. */
function PrintTypeProvider({ mods, children }) {
  const [sel, setSel] = useState(mods[0]);
  const [data, setData] = useState(DEFAULT_PT_DATA);
  const update = useCallback((type, partial) => {
    setData((d) => ({ ...d, [type]: { ...(d[type] || {}), ...partial } }));
  }, []);
  const value = useMemo(() => ({ sel, setSel, data, update }), [sel, data, update]);
  return <PrintTypeContext.Provider value={value}>{children}</PrintTypeContext.Provider>;
}

/* Public PrintTypeGrid — kept for backward compatibility with any caller
   that hasn't been migrated to the side-by-side layout. CustomizeBlock uses
   PrintTypeProvider + PrintTypeGridInner directly so it can also mount the
   preview pane as a sibling that sees the same context. */
function PrintTypeGrid({ p, mods, config }) {
  return (
    <PrintTypeProvider mods={mods}>
      <PrintTypeGridInner p={p} mods={mods} config={config} />
    </PrintTypeProvider>
  );
}

/* Live 3D ball preview pane. Mounts the minimal GolfballViewer (no gravity,
   no scene picker, no light chip) and feeds it whatever decal the current
   print-type snapshot resolves to. When the user has nothing to preview yet
   (unsupported type, or an upload-based type with no image) we show a soft
   empty-state on a placeholder card the same shape as the canvas. */
function LivePreview3D({ shape = 'ball', p }) {
  const ctx = usePT();
  const isChip = shape === 'chip';
  const isDivot = shape === 'divot';
  const isBartender = shape === 'bartender';
  const isMarker = shape === 'marker';
  const isMetalTool = isDivot || isBartender || isMarker;   // steel rim + white-disc print
  const flat = isChip || isMetalTool;   // flat face-on items (chip + tools + marker)
  // Body tint: chip clay from the buyer's color pick; divot tools are fixed
  // steel; ball from the product's colorway in its title ("Pro V1 Yellow").
  const tint = isChip ? chipClayHex(ctx.data) : (isMetalTool ? undefined : ballTitleTint(p && p.title));
  const decalUrl = useDecalUrl();
  const secondUrl = useSecondDecalUrl(decalUrl);
  // Ball uses the catalog preview scale; chip + each divot tool have their own
  // (smaller) scale — all dev-tunable.
  const chipScale = Number(useDevSetting('giftCatalog.chipPreviewScale') ?? 1.58) || 1.58;
  const divotScale = Number(useDevSetting('giftCatalog.divotPreviewScale') ?? 1.0) || 1.0;
  const bartenderScale = Number(useDevSetting('giftCatalog.bartenderPreviewScale') ?? 1.1) || 1.1;
  const markerScale = Number(useDevSetting('giftCatalog.markerPreviewScale') ?? 1.35) || 1.35;
  const catalogScale = Number(useDevSetting('giftCatalog.previewScale') ?? 2) || 2;
  const previewScale = isChip ? chipScale : isDivot ? divotScale : isBartender ? bartenderScale : isMarker ? markerScale : catalogScale;
  // Gift set: when a set is picked on the ball AND there's a logo to print, upgrade
  // the ball preview to the assembled box (balls + chips + tees in their slots).
  // The ball `tint` (product colorway) recolors the balls; the chip clay recolors
  // the chips; tees stay white. Falls back to the plain ball when no set / no logo.
  const giftSetScale = Number(useDevSetting('giftCatalog.giftSetPreviewScale') ?? 1.0) || 1.0;
  const giftSetOpt = (ctx.data.__giftSet && ctx.data.__giftSet.option) || null;
  const giftLayout = (shape === 'ball' && giftSetOpt) ? giftSetLayout(giftSetOpt) : null;
  const isGiftSet = !!giftLayout && !!decalUrl;
  const effShape = isGiftSet ? 'giftset' : shape;
  // Slow auto-spin so both poles/sides (dual-pole imprints) are visible hands-free.
  const [spin, setSpin] = useState(false);
  // Chip + divot are products worth seeing blank, so they always mount; the ball
  // is only useful once there's a print to show.
  const showViewer = isGiftSet ? true : flat ? true : !!(decalUrl || secondUrl);
  const supported = ['Monogram', 'Personalized', 'Icons', 'Custom Logo', 'Photo'].includes(ctx.sel);
  // Monogram fetches its art — distinguish "needs more initials" from "fetching".
  const monoStyle = (ctx.data.Monogram || {}).style;
  const monoMin = ctx.sel === 'Monogram' ? _monoSpec(monoStyle).min : 0;
  const monoEnough = ctx.sel === 'Monogram'
    && _monoLetters((ctx.data.Monogram || {}).initials, monoStyle).length >= monoMin;
  const emptyMsg = !supported
    ? 'Preview not yet available for this print type'
    : ctx.sel === 'Personalized'
      ? 'Type your text to preview'
      : (ctx.sel === 'Custom Logo' || ctx.sel === 'Photo')
        ? 'Upload an image to preview'
        : ctx.sel === 'Icons'
          ? 'Pick an icon to preview'
          : ctx.sel === 'Monogram'
            ? (monoEnough ? 'Rendering monogram…' : `Type ${monoMin} initial${monoMin === 1 ? '' : 's'} to preview`)
            : 'Pick a style to preview';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-text-muted)' }}>Live preview</div>
      <div style={{ position: 'relative', width: '100%', height: 200, borderRadius: 'var(--gb-r-md)', overflow: 'hidden', background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-border-default)' }}>
        {showViewer ? (
          <GolfballViewer minimal shape={effShape} tint={tint}
            chipTint={isGiftSet ? chipClayHex(ctx.data) : undefined}
            giftSet={isGiftSet ? giftLayout : undefined}
            initialScale={isGiftSet ? giftSetScale : previewScale}
            autoRotate={spin} decalDataUrl={decalUrl} secondDecalDataUrl={isGiftSet ? undefined : secondUrl} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-tertiary)', lineHeight: 1.4 }}>{emptyMsg}</div>
          </div>
        )}
        {showViewer && (
          <button
            type="button"
            onClick={() => setSpin((s) => !s)}
            title={spin ? 'Stop rotating' : (isMetalTool ? 'Auto-rotate' : `Auto-rotate to see both ${isChip ? 'sides' : 'poles'}`)}
            style={{
              position: 'absolute', right: 8, bottom: 8, width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '50%', cursor: 'pointer', fontFamily: 'inherit',
              // Opaque in both states; active = primary outline + icon (not a fill).
              background: 'var(--gb-surface-float)',
              color: spin ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)',
              border: '1px solid ' + (spin ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'),
            }}
          >
            <I.refresh size={11} />
          </button>
        )}
      </div>
      <div style={{ fontSize: 9.5, color: 'var(--gb-text-ghost)', textAlign: 'center', lineHeight: 1.3 }}>
        Drag to rotate · scroll to zoom{(secondUrl || isChip) ? ` · ↻ spins to show both ${isChip ? 'sides' : 'poles'}` : ''}
      </div>
    </div>
  );
}

/* ── exported: the Customization accordion for the DetailPanel ── */
/* ── Base-product options + variant pricing ───────────────────────────────────
   Some base options change the PRICE (e.g. golf-tee "Tee Count", apparel size
   bundles) — and those options often live ONLY on the product page (not the
   Solr facet), so they never showed in the catalog. This renders the real
   purchasable option set from config.variants and reports the selected variant
   (values + price + sku) up via onChange, so the detail panel can price it.
   Shows only options that actually vary; renders nothing otherwise. */
export function ProductOptions({ p, onChange }) {
  const { config, loading } = useProductConfig(p);
  const variants = (config && config.variants) || [];
  // Labels that represent a real choice (more than one distinct value).
  const propLabels = useMemo(() => {
    const labels = [];
    for (const v of variants) for (const k of Object.keys(v.values || {})) if (!labels.includes(k)) labels.push(k);
    return labels.filter((lbl) => new Set(variants.map((v) => v.values[lbl])).size > 1);
  }, [variants]);
  const optionsFor = (lbl) => {
    const seen = [];
    for (const v of variants) { const val = v.values[lbl]; if (val != null && !seen.includes(val)) seen.push(val); }
    return seen;
  };
  // Default to the cheapest in-stock variant — matches the catalog "from" price.
  const cheapest = useMemo(
    () => variants.filter((v) => v.available && v.price != null).sort((a, b) => a.price - b.price)[0] || variants[0] || null,
    [variants],
  );
  const [sel, setSel] = useState(null);
  useEffect(() => { setSel(cheapest ? { ...cheapest.values } : null); }, [cheapest]);
  const match = useMemo(
    () => (sel && variants.find((v) => Object.keys(sel).every((k) => v.values[k] === sel[k]))) || cheapest,
    [variants, sel, cheapest],
  );
  useEffect(() => { if (match && onChange) onChange({ values: match.values, price: match.price, sku: match.sku }); }, [match, onChange]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', color: 'var(--gb-text-muted)', fontSize: 11.5 }}>
      <span style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid var(--gb-border-default)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin .8s linear infinite' }} /> Loading options…
    </div>
  );
  if (!propLabels.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
      {propLabels.map((lbl) => (
        <Field label={lbl} key={lbl}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {optionsFor(lbl).map((val) => {
              const on = sel && sel[lbl] === val;
              return (
                <button key={val} onClick={() => setSel((s) => ({ ...(s || {}), [lbl]: val }))}
                  style={{
                    padding: '5px 11px', borderRadius: 'var(--gb-r-md)', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
                    background: on ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-inverse-medium)',
                    border: '1px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'),
                    color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', transition: 'all var(--gb-anim)',
                  }}>{val}</button>
              );
            })}
          </div>
        </Field>
      ))}
    </div>
  );
}

/* ── Decoration capture ───────────────────────────────────────────────────────
   Turn the live customizer state into the engine-agnostic decoration descriptor
   the cart serializer consumes (cartSerializer.buildDecoration). Personalized
   text + Monogram are captured fully; Custom Logo / Photo capture the engine +
   the local image but leave filePath empty until a server upload step exists
   (a structurally-valid not-yet-uploaded-logo line, same as the real site). */
/* A monogram pole2 descriptor from a __second-style slot, or null. */
function monoPole(s) {
  const letters = _monoLetters(s.initials, s.style);
  if (!letters) return null;
  return { kind: 'monogram', text: letters, view: _monoSpec(s.style).view(letters.length),
    color: _hexOf(s.c1), color2: (s.c2 && s.c2 !== 'Transparent') ? _hexOf(s.c2) : '#FFFFFF' };
}
/* The opposite-pole imprint (dual pole), as a kind-tagged descriptor the cart
   serializer understands (text | monogram | logo), or null. */
function derivePole2(data, frontSel) {
  const s = data.__second || {};
  if (!s.enabled) return null;
  const textPole = (x) => ({ kind: 'text', lines: [x.l1 || null, x.l2 || null, x.l3 || null], font: x.font || 'Kabel Dm BT', color: _hexOf(x.color) });
  if (s.choice === 'Same as Front') {
    if (frontSel === 'Personalized') return textPole(data.Personalized || {});
    if (frontSel === 'Monogram') return monoPole(data.Monogram || {});
    if (frontSel === 'Custom Logo' || frontSel === 'Photo') {
      const f = data[frontSel] || {};
      return f.imageDataUrl ? { kind: 'logo', _localImageDataUrl: f.imageDataUrl, fileName: f.fileName } : null;
    }
    return null;
  }
  if (s.choice === 'Personalized') return textPole(s);
  if (s.choice === 'Monogram') return monoPole(s);
  if ((s.choice === 'Upload Image' || s.choice === 'Custom' || s.choice === 'Logo Library') && s.imageDataUrl) {
    return { kind: 'logo', _localImageDataUrl: s.imageDataUrl, fileName: s.fileName };
  }
  return null;
}

function deriveBallDecoration(p, sel, data) {
  const baseColor = '#FFFFFF';                 // most custom balls are white; base-color capture is a refinement
  const finish = { MFS: '279', SecondMFS: '279' };
  // Shared across engines: the buyer's base-option picks + the 2nd-pole imprint.
  const baseSelection = (data.__base && Object.keys(data.__base).length) ? { ...data.__base } : null;
  const dualPole = !!(data.__second && data.__second.enabled);
  // Gift-set packaging rides along on any engine; the serializer/pricing wrap the
  // ball's ladder into the per-set gift-set ladder when `giftSet` is present.
  const giftSet = (data.__giftSet && data.__giftSet.option) || null;
  const extra = { baseSelection, dualPole, pole2: derivePole2(data, sel), ...(giftSet ? { giftSet } : {}) };
  // A gift set implies a custom-logo ball even before a print type is chosen, so a
  // set picked on its own still prices (engine 'none' would have no ladder).
  if (!sel) return giftSet
    ? { engine: 'ballLogo', baseColor, finish, logo: null, _localImageDataUrl: null, ...extra }
    : { engine: 'none', ...extra };

  if (sel === 'Personalized') {
    const s = data.Personalized || {};
    const pole1 = { lines: [s.l1 || null, s.l2 || null, s.l3 || null], font: s.font || 'Kabel Dm BT', color: _hexOf(s.color) };
    return { engine: 'ballText', baseColor, finish, pole1, ...extra };
  }
  if (sel === 'Monogram') {
    const s = data.Monogram || {};
    const letters = _monoLetters(s.initials, s.style);
    if (!letters) return { engine: 'none', ...extra };   // no initials entered yet
    return {
      engine: 'monogram', baseColor, finish,
      monogram: {
        baseColor, text: letters, view: _monoSpec(s.style).view(letters.length),
        color: _hexOf(s.c1), color2: (s.c2 && s.c2 !== 'Transparent') ? _hexOf(s.c2) : '#FFFFFF',
        overlay: s.style === 'circle' ? 'circle' : s.style,
      },
      ...extra,
    };
  }
  if (sel === 'Custom Logo' || sel === 'Photo') {
    const s = data[sel] || {};
    return {
      engine: 'ballLogo', baseColor, finish,
      logo: s.fileName ? { filePath: '', fileName: s.fileName, cropFilePath: '' } : null,
      _localImageDataUrl: s.imageDataUrl || null, // uploaded at save time
      ...extra,
    };
  }
  if (sel === 'Icons') {
    const iconName = (data.Icons || {}).icon || null;   // capture WHICH icon (+ its art) so the proposal can show it
    return { engine: 'ballLogo', baseColor, finish, logo: null, icon: iconName, iconImage: iconSrc(iconName), ...extra };
  }
  return { engine: 'none', ...extra };
}

/* Lives inside PrintTypeProvider; emits the current ball decoration whenever the
   buyer's selection/state changes. Renders nothing. */
function DecorationEmitter({ p, onChange }) {
  const { sel, data } = usePT();
  useEffect(() => { if (onChange) onChange(deriveBallDecoration(p, sel, data)); }, [sel, data, p, onChange]);
  return null;
}

/* Accessory counterpart to DecorationEmitter — lives inside the non-ball
   PrintTypeProvider and re-emits the logo-overlay decoration whenever the buyer
   attaches a logo (or picks a 2nd-pole imprint). The attached image rides along
   as _localImageDataUrl and is uploaded at save time (cartSerializer leaves
   filePath empty until then). Without this, the accessory upload had no backing
   store and never reached the cart. */
function AccessoryDecorationEmitter({ p, onChange }) {
  const { data } = usePT();
  useEffect(() => {
    if (!onChange) return;
    const kind = (data.__accessory && data.__accessory.kind) || '';
    if (kind === 'stock') { onChange({ engine: 'none' }); return; }
    // Tee text → its own engine (so it shows a "Personalized" tag, not a logo,
    // and can't be dragged onto balls). Empty text → no decoration yet.
    if (kind === 'tee') {
      const tee = data.Tee || {};
      const text = String(tee.text || '').trim();
      onChange(text
        ? { engine: 'accessoryText', dualPole: false, pole2: null, pole1: { lines: [tee.text, null, null], font: 'Kabel Dm BT', color: _hexOf(tee.color) } }
        : { engine: 'none' });
      return;
    }
    // Towel / hat embroidery — Monogram or Personalized text (gated to embroidery
    // products so a logo-only accessory keeps the overlay path).
    const embroidery = (p.modNames || []).some((m) => /^Golf (Towel|Hat)/i.test(m));
    if (embroidery && kind === 'monogram') {
      const mg = data.Monogram || {};
      const initials = String(mg.initials || '').toUpperCase().replace(/[^A-Z]/g, '');
      onChange(initials
        ? { engine: 'towelMonogram', dualPole: false, pole2: null, monogram: { text: initials, color: _hexOf(mg.c1) } }
        : { engine: 'none' });
      return;
    }
    if (embroidery && kind === 'personalized') {
      const ps = data.Personalized || {};
      const l1 = String(ps.l1 || '').trim();
      onChange(l1
        ? { engine: 'towelText', dualPole: false, pole2: null, pole1: { l1: ps.l1, l2: ps.l2 || '', color: _hexOf(ps.color) } }
        : { engine: 'none' });
      return;
    }
    // Custom Logo (default) — the printed/embroidered logo overlay.
    const cl = data['Custom Logo'] || {};
    onChange({
      engine: 'logoOverlay',
      logo: cl.fileName ? { filePath: '', fileName: cl.fileName, cropFilePath: '' } : null,
      _localImageDataUrl: cl.imageDataUrl || cl.rawDataUrl || null,
      dualPole: !!(data.__second && data.__second.enabled),
      pole2: derivePole2(data, 'Custom Logo'),
    });
  }, [data, p, onChange]);
  return null;
}

/* Gift-set packaging picker for a custom-logo ball. Lives inside the ball
   PrintTypeProvider and writes the chosen bundle to the __giftSet context slot,
   which deriveBallDecoration folds into the decoration as `giftSet`. Options come
   from getPackageUpsellData (live, cached, seed-backed). Selecting a set turns the
   line into a "<set> with <Brand> <ball>" gift-set line priced per set. */
function GiftSetPicker({ p }) {
  const ctx = usePT();
  const [opts, setOpts] = useState([]);
  useEffect(() => { let on = true; loadGiftSetOptions().then((o) => { if (on) setOpts(o || []); }).catch(() => {}); return () => { on = false; }; }, []);
  const selId = (ctx.data.__giftSet && ctx.data.__giftSet.id) || '';
  const pick = (id) => {
    const option = opts.find((o) => o.id === id) || null;
    // update() MERGES, so clearing must set explicit nulls (not {}) or the prior
    // pick would linger — picking "Standard packaging" sets option:null to clear.
    ctx.update('__giftSet', { id: option ? id : '', option });
  };
  if (!opts.length) return null;
  const ddOptions = [
    { id: '', label: 'Standard packaging (no gift set)' },
    ...opts.map((o) => ({ id: o.id, label: o.name, group: o.friendly, trailing: <Tag tone="neutral" size="sm">{giftSetSizeLabel(o)}</Tag> })),
  ];
  const sel = opts.find((o) => o.id === selId) || null;
  const incl = (sel && sel.descriptions && sel.descriptions[0] && sel.descriptions[0].subtext) || [];
  // The boxed preview render (sleeve overlay for sleeve sets, product photo for box/wooden).
  const preview = sel ? giftSetPreviewUrl(sel, { sleeveImage: p && p.giftSetSleeveImage, brand: p && p.brand }) : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <I.sparkle size={13} style={{ color: 'var(--gb-brand-label)' }} />
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gb-text-secondary)' }}>Gift-set packaging</span>
        {sel && <Tag tone="brand" size="sm">{giftSetSizeLabel(sel)}</Tag>}
      </div>
      <Dropdown value={selId} onChange={pick} options={ddOptions} placeholder="Standard packaging (no gift set)" />
      {sel ? (
        <div style={{ display: 'flex', gap: 10 }}>
          {preview && (
            <div style={{ width: 64, height: 64, flexShrink: 0, borderRadius: 'var(--gb-r-md)', overflow: 'hidden', background: '#fff', border: '1px solid var(--gb-border-subtle)' }}>
              <img src={preview} alt={sel.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, color: 'var(--gb-text-muted)', minWidth: 0 }}>
            {incl.map((t, i) => (
              <span key={i} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                <span style={{ color: 'var(--gb-brand-label)' }}>•</span>{t}
              </span>
            ))}
            <span style={{ marginTop: 2, color: 'var(--gb-text-tertiary)' }}>Priced per gift set — the ball is customized inside.</span>
          </div>
        </div>
      ) : (
        <span style={{ fontSize: 10.5, color: 'var(--gb-text-tertiary)' }}>Box this ball into a corporate gift set for an upcharge.</span>
      )}
    </div>
  );
}

export function CustomizeBlock({ p, onChange }) {
  // A "Custom Accessory Bundle" (e.g. a Sleeve/Chip/Tee Kit) is a bundle, not a
  // plain ball — route it to the bundle path even though it's filed under Golf Balls.
  const isBundle = (p.modNames || []).includes('Custom Accessory Bundle');
  const isBall = p.cat === 'Logo Golf Balls' && !isBundle;
  const { mods } = modsForProduct(p);
  const { config, loading } = useProductConfig(p);
  const [open, setOpen] = useState(false);
  // Accessory emission is fully owned by <AccessoryDecorationEmitter> (it picks
  // logo / tee text / embroidery from the live print state); balls emit through
  // <DecorationEmitter>. (A blanket logoOverlay emit here would run after the
  // child emitter on mount and clobber tee/embroidery decorations.)
  // golf ball with no supported print types (USA / pre-decorated editions) → ships as-is
  if (isBall && !mods.length) {
    return (
      <div style={{ marginTop: 16, padding: '11px 12px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', fontSize: 11.5, color: 'var(--gb-text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <I.alert size={13} style={{ color: 'var(--gb-text-tertiary)' }} /> No customization available — this product ships as-is.
      </div>
    );
  }
  const subtitle = isBall ? `${mods.length} print ${mods.length === 1 ? 'type' : 'types'}` : 'Color & imprint options';
  return (
    <div style={{ marginTop: 16 }}>
      <div onClick={() => setOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 12px', cursor: 'pointer', background: open ? 'var(--gb-brand-tint-soft)' : 'var(--gb-fill-subtle)', borderRadius: open ? 'var(--gb-r-md) var(--gb-r-md) 0 0' : 'var(--gb-r-md)', border: '1px solid ' + (open ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)') }}>
        <div style={{ width: 24, height: 24, borderRadius: 'var(--gb-r-sm)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><I.edit size={12} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Customization</div>
          <div style={{ fontSize: 10, color: 'var(--gb-text-muted)' }}>{subtitle}</div>
        </div>
        <I.chevd size={13} style={{ color: 'var(--gb-text-tertiary)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--gb-anim)' }} />
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: .22, ease: [0.32, 0.72, 0, 1] }}
            style={{ overflow: 'hidden', border: '1px solid var(--gb-brand-tint-border)', borderTop: 'none', borderRadius: '0 0 var(--gb-r-md) var(--gb-r-md)' }}>
            <div style={{ padding: 14 }}>
              {isBall ? (
                <PrintTypeProvider mods={mods}>
                  <DecorationEmitter p={p} onChange={onChange} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <LivePreview3D p={p} />
                    <BaseProperties p={p} config={config} />
                    {p.customLogo && <GiftSetPicker p={p} />}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gb-text-secondary)' }}>Select a print type</span>
                      <Tag tone="neutral" size="sm">corporate: Custom Logo</Tag>
                    </div>
                    <PrintTypeGridInner p={p} mods={mods} config={config} />
                  </div>
                </PrintTypeProvider>
              ) : (
                <PrintTypeProvider mods={mods}>
                  {/* Captures the attached logo (+ base picks) into the decoration —
                      accessories otherwise had no context to store the upload. */}
                  <AccessoryDecorationEmitter p={p} onChange={onChange} />
                  <AccessoryCustomizer p={p} config={config} loading={loading} />
                </PrintTypeProvider>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
