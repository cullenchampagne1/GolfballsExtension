/**
 * Saved-proposal masonry geometry.
 *
 * These cards are absolutely positioned from JS-measured heights, so nothing
 * in the browser guarantees the gap the way a CSS grid would: reserve even a
 * fraction less than a card occupies and the next card in that column lands on
 * top of it. The central assertion here is the one that was actually reported
 * broken — no two cards sharing a column may ever overlap, whatever the
 * measured heights look like.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MASONRY_ASSUMED_HEIGHT, MASONRY_COL_MIN, MASONRY_GAP,
  computeMasonry, normalizeCatalogScale,
  CATALOG_SCALE_DEFAULT, CATALOG_SCALE_MAX, CATALOG_SCALE_MIN,
  catalogRowHeight, CARD_METRICS, CARD_BORDER, CARD_SAFETY, catalogGridResetKey,
} from '../../src/lib/catalogPresentation.js';

const items = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}` }));

/** Every pair of cards in the same column, in placement order. */
function columnNeighbours(layout, list, heights = {}) {
  const byColumn = new Map();
  for (const item of list) {
    const pos = layout.positions[item.id];
    if (!pos) continue;
    const column = byColumn.get(pos.x) || [];
    column.push({ id: item.id, y: pos.y });
    byColumn.set(pos.x, column);
  }
  const pairs = [];
  for (const column of byColumn.values()) {
    column.sort((a, b) => a.y - b.y);
    for (let i = 1; i < column.length; i += 1) {
      const above = column[i - 1];
      pairs.push({
        above,
        below: column[i],
        aboveHeight: Number(heights[above.id]) || MASONRY_ASSUMED_HEIGHT,
      });
    }
  }
  return pairs;
}

function assertNoOverlap(layout, list, heights) {
  for (const { above, below, aboveHeight } of columnNeighbours(layout, list, heights)) {
    const bottom = above.y + aboveHeight;
    assert.ok(
      below.y >= bottom,
      `${below.id} at y=${below.y} overlaps ${above.id} ending at ${bottom}`,
    );
    assert.ok(
      below.y - bottom >= MASONRY_GAP - 0.001,
      `gap between ${above.id} and ${below.id} collapsed to ${below.y - bottom}`,
    );
  }
}

describe('catalog masonry · a gap always survives', () => {
  it('separates whole-pixel cards by the full gap', () => {
    const list = items(6);
    const heights = Object.fromEntries(list.map((it, i) => [it.id, 200 + i * 10]));
    assertNoOverlap(computeMasonry(list, 900, heights), list, heights);
  });

  it('reserves at least the real height when a measurement is negative', () => {
    // `heights[id] || FALLBACK` lets a negative through as truthy, which walks
    // the next card UP the column and straight over its neighbour.
    const list = items(3);
    // 300px admits exactly one column, so all three cards must stack.
    const layout = computeMasonry(list, 300, { p0: -80, p1: -80, p2: -80 });
    assert.equal(layout.cols, 1);
    const column = list
      .map((it) => layout.positions[it.id])
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < column.length; i += 1) {
      assert.ok(column[i].y > column[i - 1].y,
        'a negative measurement must never move a card backwards up the column');
    }
    assert.equal(column[1].y - column[0].y, MASONRY_ASSUMED_HEIGHT + MASONRY_GAP);
  });

  it('survives a long column without drifting', () => {
    const list = items(60);
    const heights = Object.fromEntries(
      list.map((it, i) => [it.id, 211.3333 + (i % 5) * 0.7]),
    );
    assertNoOverlap(computeMasonry(list, 620, heights), list, heights);
  });

  it('holds when a column width is fractional', () => {
    const list = items(9);
    const heights = Object.fromEntries(list.map((it) => [it.id, 233.5]));
    // 907 across 3 columns leaves a repeating fraction per column.
    assertNoOverlap(computeMasonry(list, 907, heights), list, heights);
  });

  it('reserves the assumed height for a card that has not measured yet', () => {
    const list = items(4);
    const layout = computeMasonry(list, 620, {});
    assertNoOverlap(layout, list, {});
    const first = layout.positions.p0;
    const stacked = list
      .map((it) => layout.positions[it.id])
      .filter((pos) => pos.x === first.x)
      .sort((a, b) => a.y - b.y);
    assert.equal(stacked[1].y - stacked[0].y, MASONRY_ASSUMED_HEIGHT + MASONRY_GAP);
  });

  it('ignores a nonsense height rather than collapsing the row', () => {
    const list = items(4);
    for (const bad of [0, -50, NaN, null, undefined, 'tall']) {
      const heights = Object.fromEntries(list.map((it) => [it.id, bad]));
      assertNoOverlap(computeMasonry(list, 620, heights), list, {});
    }
  });
});

describe('catalog masonry · column packing', () => {
  it('fits as many minimum-width columns as the space allows', () => {
    assert.equal(computeMasonry(items(3), 289, {}).cols, 1);
    assert.equal(computeMasonry(items(3), 592, {}).cols, 2);
    assert.equal(computeMasonry(items(3), 905, {}).cols, 3);
  });

  it('divides the leftover width evenly across the columns', () => {
    const layout = computeMasonry(items(4), 900, {});
    assert.equal(layout.cols, 3);
    assert.equal(
      Math.round(layout.colW * layout.cols + MASONRY_GAP * (layout.cols - 1)), 900,
      'columns plus gaps must consume exactly the available width',
    );
  });

  it('degrades safely before the container has been measured', () => {
    for (const width of [0, undefined, null, NaN, -10]) {
      const layout = computeMasonry(items(3), width, {});
      assert.deepEqual(layout.positions, {});
      assert.equal(layout.colW, MASONRY_COL_MIN);
      assert.equal(layout.cols, 1);
    }
  });

  it('places each card in the shortest column', () => {
    const list = items(3);
    const heights = { p0: 400, p1: 100, p2: 100 };
    const layout = computeMasonry(list, 900, heights);
    assert.notEqual(layout.positions.p1.x, layout.positions.p0.x,
      'a tall first card must not also take the second slot');
  });

  it('skips a malformed item without shifting the rest', () => {
    const list = [{ id: 'a' }, null, { id: 'b' }];
    const layout = computeMasonry(list, 620, { a: 100, b: 100 });
    assert.ok(layout.positions.a);
    assert.ok(layout.positions.b);
  });
});

describe('catalog scale · composing the two sliders', () => {
  it('defaults to the catalog magnification, not 1', () => {
    assert.equal(normalizeCatalogScale(undefined), CATALOG_SCALE_DEFAULT);
    assert.ok(CATALOG_SCALE_DEFAULT > 1,
      'the catalog is magnified by default; falling back to 1 shrinks it');
  });

  it('keeps a composed scale inside the catalog band', () => {
    assert.equal(normalizeCatalogScale(CATALOG_SCALE_DEFAULT * 0.2), CATALOG_SCALE_MIN);
    assert.equal(normalizeCatalogScale(CATALOG_SCALE_DEFAULT * 5), CATALOG_SCALE_MAX);
    assert.equal(normalizeCatalogScale(CATALOG_SCALE_DEFAULT * 1), CATALOG_SCALE_DEFAULT);
  });

  it('scales the default down when the Modals slider is reduced', () => {
    const composed = normalizeCatalogScale(CATALOG_SCALE_DEFAULT * 0.9);
    assert.ok(composed < CATALOG_SCALE_DEFAULT && composed >= CATALOG_SCALE_MIN);
  });
});

/* ── Product-grid row height ──────────────────────────────────────────────────
   The catalog mount root carries a real CSS `zoom`, under which fractional
   layout heights mis-round: a card ends up a hair taller than the content-sized
   track and the next row creeps up into it (reported as overlapping rows, and
   only on SOME displays because font metrics differ by platform/DPI). The grid
   therefore pins every track to catalogRowHeight(), so the row height must be
   an exact integer and must never be smaller than the card's own parts. */
describe('catalog product-grid row height', () => {
  for (const compact of [false, true]) {
    const label = compact ? 'compact' : 'comfortable';
    const m = compact ? CARD_METRICS.compact : CARD_METRICS.normal;

    it(`is a whole number of pixels (${label})`, () => {
      const h = catalogRowHeight(compact);
      assert.ok(Number.isInteger(h), `${label} row height ${h} must be an integer`);
      assert.ok(h > 0);
    });

    it(`reserves every stacked part plus headroom (${label})`, () => {
      // Sum of the parts a card always occupies — the track must cover it or
      // the card (overflow:hidden) clips its own price row.
      const parts = CARD_BORDER + m.pad * 2 + m.image + m.contentTop
        + m.brand + m.title + m.sku + m.gap * 3 + m.price;
      assert.equal(catalogRowHeight(compact), parts + CARD_SAFETY);
      assert.ok(catalogRowHeight(compact) >= parts, 'track must never be shorter than the card');
    });

    it(`every card part is itself an integer (${label})`, () => {
      for (const [key, value] of Object.entries(m)) {
        assert.ok(Number.isInteger(value), `${label}.${key} = ${value} must be an integer`);
      }
    });
  }

  it('compact rows are shorter than comfortable rows', () => {
    assert.ok(catalogRowHeight(true) < catalogRowHeight(false));
  });

  it('defaults to the comfortable row height', () => {
    assert.equal(catalogRowHeight(), catalogRowHeight(false));
  });
});

/* ── Grid reset key ───────────────────────────────────────────────────────────
   The product grid resets its render window and jumps to the top when this key
   changes. Favoriting a card rebuilds the `results` array (fresh Set → memos
   re-run → `[...r]`), so keying the reset on the array made starring a card
   below the fold teleport the scroll position back to the top. The key must
   track only the browsing criteria. */
describe('catalog grid reset key', () => {
  const base = { sel: 'dept:Accessories', query: '', sort: 'popular', special: null, searchingAll: false, brands: [] };

  it('is unchanged by favoriting (the scroll-teleport bug)', () => {
    // Same criteria, different favourites/results — the key must not move.
    assert.equal(catalogGridResetKey(base), catalogGridResetKey({ ...base }));
  });

  it('is stable across Set identity and brand ordering', () => {
    const a = catalogGridResetKey({ ...base, brands: new Set(['Titleist', 'Srixon']) });
    const b = catalogGridResetKey({ ...base, brands: new Set(['Srixon', 'Titleist']) });
    assert.equal(a, b, 'a re-created Set with the same brands must not reset the grid');
  });

  it('changes when the user actually changes what they are browsing', () => {
    const start = catalogGridResetKey(base);
    assert.notEqual(catalogGridResetKey({ ...base, sel: 'all' }), start);
    assert.notEqual(catalogGridResetKey({ ...base, query: 'towel' }), start);
    assert.notEqual(catalogGridResetKey({ ...base, sort: 'priceLow' }), start);
    assert.notEqual(catalogGridResetKey({ ...base, special: 'sale' }), start);
    assert.notEqual(catalogGridResetKey({ ...base, searchingAll: true }), start);
    assert.notEqual(catalogGridResetKey({ ...base, brands: ['Srixon'] }), start);
  });

  it('tolerates being called with nothing', () => {
    assert.equal(typeof catalogGridResetKey(), 'string');
    assert.equal(catalogGridResetKey(), catalogGridResetKey({}));
  });
});
