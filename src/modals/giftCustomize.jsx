import React, { useState } from 'react';
import { Btn, Tag, Dot } from '../ui/index.js';
import { Icon, I } from '../ui/icons.jsx';

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
const COMMON_COLORS = [
  { name: 'Black', hex: '#000000' }, { name: 'Red', hex: '#d2232a' }, { name: 'Green', hex: '#1c4120' },
  { name: 'Blue', hex: '#0b48a0' }, { name: 'Pink', hex: '#ff60b2' }, { name: 'Orange', hex: '#ff6a13' },
  { name: 'Purple', hex: '#582c83' }, { name: 'Gold', hex: '#b59f65' },
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
const MONO_GROUPS = [
  { label: '3 Initials', items: ['ABC', 'A B C', 'A·B·C'] },
  { label: '2 Initials', items: ['A|B', 'A/B', 'A╱B'] },
  { label: '1 Initial', items: ['Ⓐ'] },
];
const ALIGN_GRAPHICS = ['★', '↕', '⊕', '◎', '⌖', '✛']; // sample art (live: AlignXL 'star', IDAlign 'quadArrow')
const ICON_THEMES = {
  'Dad / Father\'s Day': ['Dad Beer', 'No. 1 Dad', 'Tie', 'Dad Crown', 'Best Dad by Par'],
  'Drinks': ['Martini', 'Old Fashioned', 'Tom Collins', 'Bloody Mary', 'Margarita', 'Cosmopolitan', 'Wine Glass', 'Beer Mug', 'Cigar'],
  'USA / Patriotic': ['USA Sunglasses', 'USA Wordmark', 'USA Flag', 'Merica'],
  'Masters': ['Masters Azalea', 'Masters Sweet Tea', 'Masters Pimento', 'Masters Jumpsuit'],
  'Misc': ['Four-leaf Clover', 'Flamingo', 'Sunglasses', 'Skull & Crossbones', 'Ladybug', 'Bomb', 'Taco', 'Dots Green'],
};

/* modificationName_ss value → control schema (live-verified) */
const MODS = {
  'Custom Logo': { controls: ['imageUpload', 'secondImprint', 'commercial'] },
  'Personalized': { controls: ['lines3', 'color', 'font', 'size'], extras: 'Add Additional Personalization · $5.00/dz', preview: true },
  'Monogram': { controls: ['monoStyle', 'initials', 'color', 'color2'], preview: true },
  'Photo': { controls: ['photoUpload'], extras: 'Add Additional Personalization · $5.00/dz', preview: true },
  'Custom Player Number': { controls: ['number'], extras: 'Add Additional Personalization · $5.00/dz', preview: true },
  'AlignXL': { controls: ['alignGraphic', 'optText', 'textColor', 'lineColor', 'sameColor'], preview: true },
  'IDAlign': { controls: ['alignGraphic', 'initials', 'textColor', 'lineColor'], preview: true },
  'Icons': { controls: ['iconGrid'], extras: 'Add Additional Personalization · $5.00/dz', preview: true },
  'Folds of Honor': { controls: [], note: 'One-click — applies the licensed Folds of Honor flag artwork.' },
  'Tee': { controls: ['line1', 'textColorSingle'], preview: true },
  'Poker Chip Second Pole': { controls: ['secondImprint'] },
  'Custom Accessory Bundle': { controls: ['bundle'] },
  'Golf Towel': { controls: [], note: 'Matching towel add-on (verify in live UI before quoting).' },
  'Golf Hat': { controls: [], note: 'Matching hat add-on (verify in live UI before quoting).' },
};
const BALL_PRINT_TYPES = ['Custom Logo', 'Personalized', 'Monogram', 'Photo', 'Custom Player Number', 'AlignXL', 'IDAlign', 'Icons', 'Folds of Honor'];

/* Which modifications + which UX layout a product gets. Golf balls →
   the full print-type grid; everything else → its feed mods (Custom
   Logo + any extras), Custom Logo guaranteed. */
export function modsForProduct(p) {
  if (p.cat === 'Logo Golf Balls') return { ux: 'grid', mods: BALL_PRINT_TYPES };
  const feed = Array.isArray(p.modNames) && p.modNames.length ? p.modNames.filter((m) => MODS[m]) : ['Custom Logo'];
  const mods = feed.includes('Custom Logo') ? feed : ['Custom Logo', ...feed];
  return { ux: 'inline', mods };
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
function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', padding: 3, gap: 2, background: 'var(--gb-fill-inverse-medium)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)' }}>
      {options.map((o) => {
        const on = o === value;
        return (
          <button key={o} onClick={() => onChange(o)} style={{ padding: '5px 12px', borderRadius: 'var(--gb-r-sm)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, transition: 'all var(--gb-anim)', background: on ? 'var(--gb-brand-tint-medium)' : 'transparent', color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)', boxShadow: on ? 'inset 0 0 0 1px var(--gb-brand-tint-border)' : 'none' }}>{o}</button>
        );
      })}
    </div>
  );
}
function Swatch({ color, on, onClick, size = 24 }) {
  const trans = color.name === 'Transparent';
  return (
    <button onClick={onClick} title={color.name} style={{ width: size, height: size, borderRadius: '50%', cursor: 'pointer', padding: 0, position: 'relative', background: trans ? 'var(--gb-fill-subtle)' : color.hex, border: '2px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'), boxShadow: on ? '0 0 0 2px var(--gb-surface-modal), 0 0 0 3px var(--gb-brand-label)' : 'none', transition: 'all var(--gb-anim)' }}>
      {trans && <span style={{ position: 'absolute', inset: 3, borderTop: '1.5px solid var(--gb-danger, #e5484d)', transform: 'rotate(45deg)' }} />}
    </button>
  );
}
function ColorRow({ swatches, transparent, value, onChange }) {
  const list = transparent ? [...swatches, { name: 'Transparent', hex: 'transparent' }] : swatches;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {list.map((c) => <Swatch key={c.name} color={c} on={value === c.name} onClick={() => onChange(c.name)} />)}
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
function TileGrid({ items, value, onChange, cols = 6, big }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 7 }}>
      {items.map((it) => {
        const on = value === it;
        return (
          <button key={it} onClick={() => onChange(it)} title={it} style={{ height: big ? 52 : 44, borderRadius: 'var(--gb-r-md)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 4, background: on ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-inverse-medium)', border: '1px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'), color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', fontFamily: 'inherit', fontSize: big ? 18 : 8.5, fontWeight: 700, lineHeight: 1.1, overflow: 'hidden' }}>{it}</button>
        );
      })}
    </div>
  );
}

function ImageUpload({ ai, label = 'Upload Your Company Logo' }) {
  const [hover, setHover] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ padding: '20px 16px', borderRadius: 'var(--gb-r-lg)', textAlign: 'center', cursor: 'pointer', background: hover ? 'var(--gb-brand-tint-soft)' : 'var(--gb-fill-inverse-medium)', border: '1.5px dashed ' + (hover ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'), transition: 'all var(--gb-anim)' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', margin: '0 auto 9px', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><UploadI size={17} /></div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 3 }}>Drag files here or <span style={{ color: 'var(--gb-brand-label)', fontWeight: 600 }}>click to browse</span></div>
      </div>
      {ai && <Btn variant="secondary" size="sm" icon={<SparkI />} style={{ alignSelf: 'flex-start' }}>AI Image Generator</Btn>}
      <div style={{ fontSize: 10.5, color: 'var(--gb-text-tertiary)', lineHeight: 1.5 }}>
        <b style={{ color: 'var(--gb-text-secondary)' }}>OR</b> email your logo to <span style={{ color: 'var(--gb-brand-label)', fontFamily: 'var(--gb-font-mono)' }}>art@golfballs.com</span> — we’ll contact you after you order.
        <span style={{ display: 'block', color: 'var(--gb-brand-label)', fontWeight: 600, marginTop: 3 }}>Need design help? Free consultation →</span>
      </div>
    </div>
  );
}
function SecondImprint() {
  const [on, setOn] = useState(false);
  const [choice, setChoice] = useState('logo');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <Checkbox checked={on} onClick={() => setOn(!on)} label="Add Second Imprint (Optional)" />
      {on && (
        <div style={{ paddingLeft: 26, display: 'flex', gap: 8 }}>
          {[['logo', 'Add a Second Logo', <UploadI size={13} key="u" />], ['text', 'Add Personalization', <I.edit size={13} key="e" />]].map(([v, label, ic]) => {
            const sel = choice === v;
            return (
              <button key={v} onClick={() => setChoice(v)} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 7, padding: '8px 10px', borderRadius: 'var(--gb-r-md)', cursor: 'pointer', background: sel ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-inverse-medium)', border: '1px solid ' + (sel ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'), color: sel ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', fontFamily: 'inherit', fontSize: 11, fontWeight: 600 }}>{ic}{label}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}
function Commercial({ p, serviceLevel }) {
  const ladder = (p.breaks && p.breaks.length ? p.breaks : [{ q: p.minQty || 12, p: p.price || 0 }]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, padding: '9px 12px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-subtle)' }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-text-muted)' }}>Min qty</div>
          <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-primary)' }}>{p.minQty || 12}</div>
        </div>
        {serviceLevel ? (
          <div style={{ flex: 1.4 }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-text-muted)', marginBottom: 4 }}>Service level</div>
            <div style={{ height: 30, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', background: 'var(--gb-fill-inverse-medium)', borderRadius: 'var(--gb-r-sm)', border: '1px solid var(--gb-border-default)' }}>
              <span style={{ flex: 1, fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-primary)' }}>8 Business Day Standard</span>
              <I.chevd size={11} style={{ color: 'var(--gb-text-muted)' }} />
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, padding: '9px 12px', borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-brand-label)' }}>Setup fee</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontSize: 17, fontWeight: 800, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-brand-label)' }}>$50</span>
              <span style={{ fontSize: 9.5, color: 'var(--gb-text-muted)' }}>one-time</span>
            </div>
          </div>
        )}
      </div>
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

/* one control unit, keyed by the schema's control id */
function Control({ k, p, serviceLevel }) {
  const [v, setV] = useState('');
  const [c1, setC1] = useState('Black'); const [c2, setC2] = useState('Transparent');
  const [font, setFont] = useState(FONTS[0]); const [size, setSize] = useState(SIZES[0]);
  const [style, setStyle] = useState(MONO_GROUPS[0].items[0]);
  const [icon, setIcon] = useState(''); const [align, setAlign] = useState(ALIGN_GRAPHICS[0]);
  const [num, setNum] = useState(73); const [same, setSame] = useState(false);
  switch (k) {
    case 'imageUpload': return <ImageUpload />;
    case 'photoUpload': return <ImageUpload ai label="Upload Image" />;
    case 'secondImprint': return <SecondImprint />;
    case 'commercial': return <Commercial p={p} serviceLevel={serviceLevel} />;
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
    case 'color': return <Field label="Color"><ColorRow swatches={COMMON_COLORS} value={c1} onChange={setC1} /></Field>;
    case 'color2': return <Field label="Color 2"><ColorRow swatches={COMMON_COLORS} transparent value={c2} onChange={setC2} /></Field>;
    case 'textColor': return <Field label="Text Color"><ColorRow swatches={COMMON_COLORS} value={c1} onChange={setC1} /></Field>;
    case 'textColorSingle': return <Field label="Text Color"><ColorRow swatches={COMMON_COLORS} value={c1} onChange={setC1} /></Field>;
    case 'lineColor': return <Field label="Line Color"><ColorRow swatches={COMMON_COLORS} value={c2} onChange={setC2} /></Field>;
    case 'sameColor': return <Checkbox checked={same} onClick={() => setSame(!same)} label="Use same Color" note="line = text color" />;
    case 'thread': return <Field label="Thread Color"><ColorRow swatches={THREAD_COLORS} value={c1} onChange={setC1} /></Field>;
    case 'font': return <Field label="Font"><Segmented options={FONTS} value={font} onChange={setFont} /></Field>;
    case 'size': return <Field label="Size"><Segmented options={SIZES} value={size} onChange={setSize} /></Field>;
    case 'number': return (
      <Field label="Number">
        <div style={{ display: 'inline-flex', alignItems: 'center', height: 32, background: 'var(--gb-fill-inverse-medium)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', overflow: 'hidden' }}>
          <button onClick={() => setNum((n) => Math.max(0, n - 1))} style={{ width: 30, height: 32, border: 'none', background: 'transparent', color: 'var(--gb-text-tertiary)', cursor: 'pointer' }}>−</button>
          <div style={{ width: 50, textAlign: 'center', fontFamily: 'var(--gb-font-mono)', fontSize: 14, fontWeight: 800, color: 'var(--gb-text-primary)', borderLeft: '1px solid var(--gb-border-subtle)', borderRight: '1px solid var(--gb-border-subtle)', lineHeight: '32px' }}>{num}</div>
          <button onClick={() => setNum((n) => Math.min(99, n + 1))} style={{ width: 30, height: 32, border: 'none', background: 'transparent', color: 'var(--gb-text-tertiary)', cursor: 'pointer' }}>+</button>
        </div>
      </Field>
    );
    case 'monoStyle': return (
      <Field label="Monogram Style">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {MONO_GROUPS.map((g) => (
            <div key={g.label}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, color: 'var(--gb-text-muted)', marginBottom: 6 }}>{g.label}</div>
              <TileGrid items={g.items} value={style} onChange={setStyle} cols={6} big />
            </div>
          ))}
        </div>
      </Field>
    );
    case 'alignGraphic': return <Field label="Alignment Style"><TileGrid items={ALIGN_GRAPHICS} value={align} onChange={setAlign} cols={6} big /></Field>;
    case 'iconGrid': return (
      <Field label="Icon">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 240, overflowY: 'auto' }}>
          {Object.entries(ICON_THEMES).map(([theme, names]) => (
            <div key={theme}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, color: 'var(--gb-text-muted)', marginBottom: 6 }}>{theme}</div>
              <TileGrid items={names} value={icon} onChange={setIcon} cols={3} />
            </div>
          ))}
        </div>
      </Field>
    );
    case 'bundle': return (
      <Field label="Base product color"><ColorRow swatches={BASE_COLORS} value={c1} onChange={setC1} /></Field>
    );
    default: return null;
  }
}

/* the assembled controls for one modification */
function ModControls({ name, p, serviceLevel }) {
  const meta = MODS[name];
  if (!meta) return null;
  if (!meta.controls.length) {
    return <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', fontStyle: 'italic', padding: '4px 0' }}>{meta.note || 'Preset — no buyer-facing controls.'}</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {meta.controls.map((k, i) => <Control key={i} k={k} p={p} serviceLevel={serviceLevel} />)}
      {meta.extras && (
        <div style={{ fontSize: 10.5, color: 'var(--gb-text-tertiary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <I.bolt size={11} style={{ color: 'var(--gb-brand-label)' }} /> {meta.extras}
        </div>
      )}
    </div>
  );
}

/* golf-ball print-type tile grid */
function PrintTypeGrid({ p }) {
  const [sel, setSel] = useState('Custom Logo');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
        {BALL_PRINT_TYPES.map((t) => {
          const on = sel === t;
          return (
            <button key={t} onClick={() => setSel(t)} style={{ position: 'relative', minHeight: 54, borderRadius: 'var(--gb-r-md)', cursor: 'pointer', padding: '8px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, background: on ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-inverse-medium)', border: '1px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'), color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', fontFamily: 'inherit' }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', background: on ? 'var(--gb-brand-label)' : 'var(--gb-fill-strong)', border: '1px solid var(--gb-border-strong)' }} />
              <span style={{ fontSize: 9, fontWeight: 700, textAlign: 'center', lineHeight: 1.1 }}>{t}</span>
            </button>
          );
        })}
      </div>
      <div style={{ borderTop: '1px solid var(--gb-border-subtle)', paddingTop: 14 }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--gb-brand-label)', marginBottom: 12 }}>{sel}</div>
        <ModControls name={sel} p={p} serviceLevel />
      </div>
    </div>
  );
}

/* ── exported: the Customization accordion for the DetailPanel ── */
export function CustomizeBlock({ p }) {
  const { ux, mods } = modsForProduct(p);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(mods[0]);
  return (
    <div style={{ marginTop: 16 }}>
      <div onClick={() => setOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 12px', cursor: 'pointer', background: open ? 'var(--gb-brand-tint-soft)' : 'var(--gb-fill-subtle)', borderRadius: open ? 'var(--gb-r-md) var(--gb-r-md) 0 0' : 'var(--gb-r-md)', border: '1px solid ' + (open ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)') }}>
        <div style={{ width: 24, height: 24, borderRadius: 'var(--gb-r-sm)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><I.edit size={12} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Customization</div>
          <div style={{ fontSize: 10, color: 'var(--gb-text-muted)' }}>{mods.length} imprint {mods.length === 1 ? 'option' : 'options'}</div>
        </div>
        <I.chevd size={13} style={{ color: 'var(--gb-text-tertiary)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--gb-anim)' }} />
      </div>
      {open && (
        <div style={{ border: '1px solid var(--gb-brand-tint-border)', borderTop: 'none', borderRadius: '0 0 var(--gb-r-md) var(--gb-r-md)', padding: 14 }}>
          {ux === 'grid' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gb-text-secondary)' }}>Select a print type</span>
                <Tag tone="neutral" size="sm">corporate: Custom Logo</Tag>
              </div>
              <PrintTypeGrid p={p} />
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {mods.length > 1 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {mods.map((m) => {
                    const on = active === m;
                    return (
                      <button key={m} onClick={() => setActive(m)} style={{ flex: '1 0 auto', padding: '7px 10px', borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 10.5, fontWeight: 600, background: on ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-inverse-medium)', border: '1px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-default)'), color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)' }}>{m}</button>
                    );
                  })}
                </div>
              )}
              <ModControls name={mods.length > 1 ? active : mods[0]} p={p} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
