/**
 * Unit tests — src/lib/giftCatalogMath.js
 *
 * Pure pricing/formatting helpers for the gift catalog. No DOM/chrome
 * globals needed — the module (and its giftSets.js import) is pure.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  usd, money, nfmt, rid, relTime,
  onSale, hasPromo, isDeal,
  priceAtQty, isTierPrice, priceAtBreaks,
  SECOND_POLE_FEE, lineHasImprint, lineSecondPoleFee, linePriceAt, lineIsTierPrice,
  topPrice, lowPrice, saleCut, netP, netTop, netLow,
} from '../../src/lib/giftCatalogMath.js';

describe('usd', () => {
  it('formats a plain number to two decimals with a $ prefix', () => {
    assert.equal(usd(29.99), '$29.99');
  });

  it('renders null as an em-dash placeholder', () => {
    assert.equal(usd(null), '—');
    assert.equal(usd(undefined), '—');
  });

  it('formats zero as $0.00 (zero is a price, not a missing value)', () => {
    assert.equal(usd(0), '$0.00');
  });

  it('rounds to cents', () => {
    assert.equal(usd(19.999), '$20.00');
    assert.equal(usd(19.994), '$19.99');
  });

  it('keeps the sign on negative amounts', () => {
    assert.equal(usd(-5), '$-5.00');
  });

  it('coerces numeric strings', () => {
    assert.equal(usd('12'), '$12.00');
  });

  it('renders non-numeric input as $NaN (current behavior — no guard)', () => {
    assert.equal(usd('abc'), '$NaN');
  });
});

describe('money', () => {
  it('adds thousands separators and two decimals', () => {
    assert.equal(money(1234.5), '$1,234.50');
    assert.equal(money(1234567.891), '$1,234,567.89');
  });

  it('treats null/undefined/0 as $0.00', () => {
    assert.equal(money(null), '$0.00');
    assert.equal(money(undefined), '$0.00');
    assert.equal(money(0), '$0.00');
  });

  it('formats negative amounts with the sign after the $', () => {
    assert.equal(money(-1234.5), '$-1,234.50');
  });
});

describe('nfmt', () => {
  it('formats integers with thousands separators', () => {
    assert.equal(nfmt(1234567), '1,234,567');
  });

  it('treats null/0 as 0', () => {
    assert.equal(nfmt(null), '0');
    assert.equal(nfmt(0), '0');
  });

  it('coerces numeric strings', () => {
    assert.equal(nfmt('2500'), '2,500');
  });
});

describe('rid', () => {
  it('returns a short base36 id (shape only — value is random)', () => {
    const id = rid();
    assert.equal(typeof id, 'string');
    assert.match(id, /^[a-z0-9]{1,6}$/);
  });
});

describe('relTime', () => {
  it('returns empty string for a missing timestamp', () => {
    assert.equal(relTime(0), '');
    assert.equal(relTime(null), '');
  });

  it('reads "just now" under 45 seconds', () => {
    assert.equal(relTime(Date.now() - 30_000), 'just now');
  });

  it('reads minutes under an hour', () => {
    assert.equal(relTime(Date.now() - 5 * 60_000), '5m ago');
    assert.equal(relTime(Date.now() - 59 * 60_000), '59m ago');
  });

  it('reads hours under a day', () => {
    assert.equal(relTime(Date.now() - 2 * 3_600_000), '2h ago');
  });

  it('reads days at 24h and beyond', () => {
    assert.equal(relTime(Date.now() - 3 * 86_400_000), '3d ago');
  });
});

describe('onSale / hasPromo / isDeal', () => {
  it('onSale is true only when orig exists and exceeds price', () => {
    assert.equal(onSale({ orig: 39.99, price: 29.99 }), true);
    assert.equal(onSale({ orig: 29.99, price: 29.99 }), false);
    assert.equal(onSale({ price: 29.99 }), false);
  });

  it('hasPromo reflects a promo flag and tolerates null', () => {
    assert.equal(hasPromo({ promo: 'EVERY12GETS6' }), true);
    assert.equal(hasPromo({}), false);
    assert.equal(hasPromo(null), false);
  });

  it('isDeal is true for either a markdown or a promo', () => {
    assert.equal(isDeal({ orig: 39.99, price: 29.99 }), true);
    assert.equal(isDeal({ price: 29.99, promo: 'BOGO' }), true);
    assert.equal(isDeal({ price: 29.99 }), false);
  });
});

/* A realistic custom-logo volume ladder (per-dozen). */
const ladder = { breaks: [{ q: 1, p: 51.99 }, { q: 12, p: 47.99 }, { q: 24, p: 43.99 }] };

describe('priceAtQty', () => {
  it('walks the volume ladder to the largest break at or below the qty', () => {
    assert.equal(priceAtQty(ladder, 1), 51.99);
    assert.equal(priceAtQty(ladder, 12), 47.99);
    assert.equal(priceAtQty(ladder, 23), 47.99);
    assert.equal(priceAtQty(ladder, 100), 43.99);
  });

  it('falls back to the first break below the smallest tier', () => {
    assert.equal(priceAtQty({ breaks: [{ q: 12, p: 47.99 }] }, 3), 47.99);
  });

  it('uses logo price, then retail price, then 0 when there is no ladder', () => {
    assert.equal(priceAtQty({ logo: 33.5, price: 29.99 }, 12), 33.5);
    assert.equal(priceAtQty({ price: 29.99 }, 12), 29.99);
    assert.equal(priceAtQty({}, 12), 0);
  });
});

describe('isTierPrice', () => {
  it('accepts a price within half a cent of the tier the qty implies', () => {
    assert.equal(isTierPrice(ladder, 12, 47.99), true);
    assert.equal(isTierPrice(ladder, 12, 47.994), true);
  });

  it('flags a hand-edited price away from the tier', () => {
    assert.equal(isTierPrice(ladder, 12, 45.0), false);
  });
});

describe('priceAtBreaks', () => {
  it('returns the largest break at or below q from a {q,p} ladder', () => {
    const bks = [{ q: 12, p: 14.95 }, { q: 96, p: 13.95 }];
    assert.equal(priceAtBreaks(bks, 12), 14.95);
    assert.equal(priceAtBreaks(bks, 50), 14.95);
    assert.equal(priceAtBreaks(bks, 96), 13.95);
  });

  it('returns null below the smallest break or for an empty ladder', () => {
    assert.equal(priceAtBreaks([{ q: 12, p: 14.95 }], 6), null);
    assert.equal(priceAtBreaks([], 12), null);
    assert.equal(priceAtBreaks(null, 12), null);
  });
});

describe('second-pole fees', () => {
  it('exposes the standard golfballs.com fees: Logo +$6, Text +$4', () => {
    assert.deepEqual(SECOND_POLE_FEE, { logo: 6, text: 4 });
  });

  it('lineHasImprint is true only for a real decoration engine', () => {
    assert.equal(lineHasImprint({ decoration: { engine: 'ballLogo' } }), true);
    assert.equal(lineHasImprint({ decoration: { engine: 'none' } }), false);
    assert.equal(lineHasImprint({}), false);
    assert.equal(lineHasImprint(null), false);
  });

  it('lineSecondPoleFee charges by the 2nd-pole imprint kind', () => {
    assert.equal(lineSecondPoleFee({ decoration: { pole2: { kind: 'logo' } } }), 6);
    assert.equal(lineSecondPoleFee({ decoration: { pole2: { kind: 'text' } } }), 4);
  });

  it('lineSecondPoleFee is 0 without a real 2nd-pole imprint', () => {
    assert.equal(lineSecondPoleFee({ decoration: {} }), 0);
    assert.equal(lineSecondPoleFee({ decoration: { pole2: { kind: 'monogram' } } }), 0);
    assert.equal(lineSecondPoleFee(null), 0);
  });
});

describe('linePriceAt', () => {
  it('prices an undecorated line at retail', () => {
    assert.equal(linePriceAt({ product: { price: 29.99 }, decoration: { engine: 'none' } }, 12), 29.99);
  });

  it('prefers the chosen variant price (tee count etc.)', () => {
    assert.equal(linePriceAt({ product: { price: 29.99 }, variant: { price: 24.99 } }, 12), 24.99);
  });

  it('prices an imprinted custom-logo line from the volume ladder', () => {
    const line = { product: { customLogo: true, price: 29.99, breaks: ladder.breaks }, decoration: { engine: 'ballLogo' } };
    assert.equal(linePriceAt(line, 24), 43.99);
    assert.equal(linePriceAt(line, 1), 51.99);
  });

  it('adds the dual-pole upcharge on top of the ladder tier', () => {
    const base = { product: { customLogo: true, price: 29.99, breaks: [{ q: 12, p: 47.99 }, { q: 24, p: 43.99 }] } };
    assert.equal(linePriceAt({ ...base, decoration: { engine: 'ballLogo', pole2: { kind: 'logo' } } }, 24), 49.99);
    assert.equal(linePriceAt({ ...base, decoration: { engine: 'ballLogo', pole2: { kind: 'text' } } }, 24), 47.99);
  });

  it('prices a custom (rep-created) item from its own ladder without an imprint', () => {
    const line = { product: { isCustom: true, breaks: [{ q: 48, p: 3.5 }, { q: 144, p: 3.1 }] } };
    assert.equal(linePriceAt(line, 144), 3.1);
    assert.equal(linePriceAt(line, 48), 3.5);
  });

  it('prices a gift-set line per set from the verified gift-set ladder', () => {
    // Ball per-dozen ladder 40/36, sleeve set (oiq .25) + a $5 kit →
    // round95(40×.25)+5 → 14.95 at 12 sets, round95(36×.25)+5 → 13.95 at 96.
    const line = {
      product: { customLogo: true, breaks: [{ q: 12, p: 40 }, { q: 24, p: 36 }] },
      decoration: { engine: 'ballLogo', giftSet: { oiq: 0.25, kit: { ladder: [{ q: 12, p: 5 }] } } },
    };
    assert.equal(linePriceAt(line, 12), 14.95);
    assert.equal(linePriceAt(line, 50), 14.95);
    assert.equal(linePriceAt(line, 96), 13.95);
  });

  it('lineIsTierPrice accepts the computed tier and flags an override', () => {
    const line = { product: { customLogo: true, price: 29.99, breaks: ladder.breaks }, decoration: { engine: 'ballLogo' } };
    assert.equal(lineIsTierPrice(line, 24, 43.99), true);
    assert.equal(lineIsTierPrice(line, 24, 39.99), false);
  });
});

describe('sale math (topPrice/lowPrice/saleCut/net*)', () => {
  it('topPrice/lowPrice read the ladder extremes', () => {
    assert.equal(topPrice(ladder), 51.99);
    assert.equal(lowPrice(ladder), 43.99);
  });

  it('topPrice/lowPrice fall back to logo, then price, then 0', () => {
    assert.equal(topPrice({ logo: 33.5, price: 29.99 }), 33.5);
    assert.equal(lowPrice({ price: 29.99 }), 29.99);
    assert.equal(topPrice({}), 0);
  });

  it('saleCut is the markdown (orig − price) and 0 when not on sale', () => {
    assert.equal(saleCut({ orig: 35, price: 25 }), 10);
    assert.equal(saleCut({ price: 25 }), 0);
    assert.equal(saleCut({ orig: 25, price: 25 }), 0);
  });

  it('netP applies the markdown on top of a raw break (the stacked-sale rule)', () => {
    // $51.99 1+ break with a −$10 markdown really costs $41.99.
    assert.equal(netP({ orig: 35, price: 25 }, 51.99), 41.99);
  });

  it('netP floors at 0 when the markdown exceeds the raw price', () => {
    assert.equal(netP({ orig: 35, price: 25 }, 8), 0);
  });

  it('netTop/netLow net the markdown off the ladder extremes', () => {
    const p = { breaks: ladder.breaks, orig: 35, price: 25 };
    assert.equal(netTop(p), 41.99);
    assert.equal(netLow(p), 33.99);
  });
});
