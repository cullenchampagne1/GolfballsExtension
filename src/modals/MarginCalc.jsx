import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  FloatingPanel, ModalHeader, ModalFooter, Field, Input, Btn, Callout, I,
  NumberDisplay, inputBaseStyle, T,
} from '../ui/index.js';
import { useDevSettings } from '../lib/devSettings.js';

// Fallback only — real value comes from Developer Settings
// (`marginCalc.minAllowedMargin`) which is loaded from chrome.storage.
const DEFAULT_MIN_MARGIN = 30;

/* ───────────────────────────────────────────────────────────────
   MarginCalc — margin & profit calculator, rebuilt on the design
   system. First modal migrated from vanilla JS to React.

   Math ported verbatim from content/margin-calculator-modal.js:
   enter any two values and the rest auto-calculate.
─────────────────────────────────────────────────────────────── */

function parseVal(str) {
  const n = parseFloat(String(str).replace(/[^0-9.-]+/g, ''));
  return Number.isNaN(n) ? null : n;
}

function formatVal(v) {
  if (v === null || v === undefined) return '';
  return Number.isInteger(v) ? String(v) : String(parseFloat(v.toFixed(4)));
}

// totalProfit is a number (not a formatted string) — it feeds NumberDisplay,
// which tweens it. Every other field holds the raw input string.
const BLANK = { cost: '', price: '', margin: '', markup: '', profit: '', qty: '1', totalProfit: 0 };

/**
 * Given the field that changed, recompute the dependent fields. Pure — the
 * source field itself is never overwritten, so partial input ("1.") survives.
 */
function recalc(source, draft) {
  const next = { ...draft };
  let c = parseVal(next.cost);
  let p = parseVal(next.price);
  let pr = parseVal(next.profit);
  let mrg = parseVal(next.margin);
  let mkp = parseVal(next.markup);

  const qStr = next.qty.trim();
  let q = parseVal(qStr);
  if (qStr === '') q = 1;
  if (q === null) q = 0;

  if (source === 'cost' || source === 'price') {
    if (c !== null && p !== null) {
      pr = p - c;
      mrg = p !== 0 ? (pr / p) * 100 : 0;
      mkp = c !== 0 ? (pr / c) * 100 : 0;
      next.profit = formatVal(pr);
      next.margin = formatVal(mrg);
      next.markup = formatVal(mkp);
    }
  } else if (source === 'margin' && mrg !== null) {
    if (c !== null) {
      p = mrg >= 100 ? 0 : c / (1 - mrg / 100);
      pr = p - c;
      mkp = c !== 0 ? (pr / c) * 100 : 0;
      next.price = formatVal(p);
      next.profit = formatVal(pr);
      next.markup = formatVal(mkp);
    } else if (p !== null) {
      c = p * (1 - mrg / 100);
      pr = p - c;
      mkp = c !== 0 ? (pr / c) * 100 : 0;
      next.cost = formatVal(c);
      next.profit = formatVal(pr);
      next.markup = formatVal(mkp);
    }
  } else if (source === 'markup' && mkp !== null && c !== null) {
    pr = c * (mkp / 100);
    p = c + pr;
    mrg = p !== 0 ? (pr / p) * 100 : 0;
    next.price = formatVal(p);
    next.profit = formatVal(pr);
    next.margin = formatVal(mrg);
  } else if (source === 'profit' && pr !== null && c !== null) {
    p = c + pr;
    mrg = p !== 0 ? (pr / p) * 100 : 0;
    mkp = c !== 0 ? (pr / c) * 100 : 0;
    next.price = formatVal(p);
    next.margin = formatVal(mrg);
    next.markup = formatVal(mkp);
  }
  // 'qty' just flows through to the always-on total-profit recompute

  const latestPr = parseVal(next.profit);
  next.totalProfit = latestPr !== null ? latestPr * q : 0;
  return next;
}

/** $ / % adornment — modal-local, too trivial to be a shared component. */
const sym = (ch) => <span style={{ fontWeight: 700, color: 'var(--gb-text-muted)' }}>{ch}</span>;

/**
 * Props: shortcut (footer hint string) · onClosed (real unmount) ·
 * bindClose (receives the animated-close fn for the keyboard toggle).
 */
export function MarginCalc({ shortcut, onClosed, bindClose }) {
  const [v, setV] = useState(BLANK);
  const onField = (field) => (val) => setV((prev) => recalc(field, { ...prev, [field]: val }));
  const selectAll = (e) => e.target.select();

  /* Animation settings — driven by Developer Settings so users can
     turn off count-up or tweak its duration without code changes. */
  const [dev] = useDevSettings();
  const countAnimate  = !!dev['numberDisplay.enabled'];
  const countDuration = (dev['numberDisplay.durationMs'] || 400) / 1000;

  // Low-margin warning gate. Only fires when the margin has a real
  // positive value below the user's configured minimum — empty / zero /
  // negative margins are "no signal" states, not "out of range". A
  // threshold of 0 disables the warning entirely (matches the desc in
  // the dev settings registry). The Callout's own AnimatePresence
  // handles the in/out transition as the user types past the threshold.
  const minMargin = Number(dev['marginCalc.minAllowedMargin'] ?? DEFAULT_MIN_MARGIN);
  const marginNum = parseVal(v.margin);
  const showLowMargin = minMargin > 0 && marginNum !== null && marginNum > 0 && marginNum < minMargin;

  return (
    <FloatingPanel
      width={360}
      backdrop
      draggable={dev['marginCalc.draggable'] ?? true}
      onClose={onClosed}
      bindClose={bindClose}
    >
      <ModalHeader
        icon={<I.calc />}
        title="Margin Calculator"
        subtitle="Enter any two values"
      />

      <div style={{ padding: '12px 12px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Item Cost">
            <Input size="sm" mono inputMode="decimal" placeholder="0.00" autoFocus
              leading={sym('$')} value={v.cost} onChange={onField('cost')} onFocus={selectAll} />
          </Field>
          <Field label="Selling Price">
            <Input size="sm" mono inputMode="decimal" placeholder="0.00"
              leading={sym('$')} value={v.price} onChange={onField('price')} onFocus={selectAll} />
          </Field>
        </div>

        <div style={{ height: 1, background: 'var(--gb-border-subtle)', margin: '2px 0' }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Gross Margin">
            <Input size="sm" mono inputMode="decimal" placeholder="0.00"
              trailing={sym('%')} value={v.margin} onChange={onField('margin')} onFocus={selectAll} />
          </Field>
          <Field label="Markup">
            <Input size="sm" mono inputMode="decimal" placeholder="0.00"
              trailing={sym('%')} value={v.markup} onChange={onField('markup')} onFocus={selectAll} />
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '0.55fr 1fr 1fr', gap: 8 }}>
          <Field label="Qty">
            <Input size="sm" mono inputMode="numeric" placeholder="1"
              value={v.qty} onChange={onField('qty')} />
          </Field>
          <Field label="Unit Profit">
            <Input size="sm" mono inputMode="decimal" placeholder="0.00"
              leading={sym('$')} value={v.profit} onChange={onField('profit')} onFocus={selectAll} />
          </Field>
          <Field label="Total Profit">
            {/* read-only result — counts up/down as the inputs change */}
            <div style={{ ...inputBaseStyle({ size: 'sm' }), cursor: 'default' }}>
              {sym('$')}
              <NumberDisplay
                value={v.totalProfit}
                decimals={2}
                animate={countAnimate}
                duration={countDuration}
                style={{
                  flex: 1, minWidth: 0,
                  fontFamily: 'var(--gb-font-mono)', fontWeight: 600,
                  // Muted when we've got no signal (no inputs yet);
                  // red only once there's an actual computed total
                  // — otherwise a fresh-opened calc reads as alarming.
                  color: v.totalProfit !== 0
                    ? 'var(--gb-error-fg)'
                    : 'var(--gb-text-muted)',
                }}
              />
            </div>
          </Field>
        </div>

        {/* Low-margin warning — wrapped in our own AnimatePresence so the
            whole Callout mounts/unmounts cleanly as the margin crosses
            the threshold (height collapses, gap closes), without leaving
            an empty Callout shell behind when it's "no signal". */}
        <AnimatePresence initial={false}>
          {showLowMargin && (
            <motion.div
              key="low-margin"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={T.base}
              style={{ overflow: 'hidden' }}
            >
              <Callout
                tone="warning"
                title={`Margin ${marginNum.toFixed(1)}% is below the recommended ${minMargin}%`}
              >
                Increased sell price recomended.
              </Callout>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ModalFooter>
        <Btn variant="ghost" size="sm" onClick={() => setV(BLANK)}>Clear all</Btn>
        <span style={{ flex: 1 }} />
        {shortcut && (
          <span style={{ fontSize: 10.5, color: 'var(--gb-text-ghost)' }}>{shortcut} to toggle</span>
        )}
      </ModalFooter>
    </FloatingPanel>
  );
}
