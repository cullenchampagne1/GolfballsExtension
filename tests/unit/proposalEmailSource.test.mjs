/**
 * Unit tests — src/lib/proposalEmailSource.js
 *
 * Follows tests/unit/findPhone.test.mjs conventions. Two static imports are
 * redirected via node:module loader hooks (see helpers/): the JSX modal
 * (node can't parse it; only colorNameOf is used) and the chrome-backed
 * saveProposal loader, which is replaced by a fixture store. The module's
 * own pipeline — proposalToEmailSource, cartLinkOf, the multi-cart combine —
 * plus its real deps (giftImprints, giftSets, cartSerializer) are under test.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./helpers/proposalEmailSource.loaderHooks.mjs', import.meta.url);

const { buildEmailSourceFromCartIds } = await import('../../src/lib/proposalEmailSource.js');

/* ── Fixtures served by the saveProposal stub ─────────────────── */
const tp5Line = {
  id: 'L1',
  product: {
    title: 'TP5 Golf Balls', brand: 'TaylorMade', img: 'https://static.golfballs.com/tp5.png',
    price: 44.99, orig: 54.99, breaks: [{ q: 1, p: 49.99 }, { q: 12, p: 44.99 }],
  },
  variant: { values: { style: 'White' } },
  splits: [{ qty: 12, price: 44.99 }],
};

const freeLine = {
  id: 'L9', free: true, freeValue: 30,
  product: { title: 'Logo Tees', brand: 'Custom', img: 'https://static.golfballs.com/tees.png', price: 2.5 },
  splits: [{ qty: 12 }],
};

const giftSetLine = {
  id: 'L2',
  product: { title: 'Pro V1', brand: 'Titleist', img: 'https://static.golfballs.com/prov1.png', price: 5 },
  decoration: {
    engine: 'ballText',
    giftSet: { name: 'Birthday Sleeve', oiq: 0.25, thumbnail: 'https://static.golfballs.com/box.png' },
    pole1: { lines: ['GO BUCKS', null, null], color: '#1a2b3c' },
  },
  splits: [{ qty: 4, price: 12.5 }],
};

// Mirrors the reported Srixon email: 12 paid at the volume tier plus 4
// materialized free dozens at the lower break. The email subtotal includes the
// giveaway's full $259.96 value, then the promotion must show its code and
// subtract that value before the estimated total.
const srixonProduct = {
  title: 'Srixon Z-Star Diamond 3 Golf Balls',
  brand: 'Srixon',
  img: 'https://static.golfballs.com/srixon-z-star-diamond.png',
  price: 64.99,
  orig: 64.99,
  breaks: [{ q: 1, p: 64.99 }, { q: 12, p: 59.99 }],
};
const srixonPaidLine = {
  id: 'SZ1',
  product: srixonProduct,
  splits: [{ id: 'SZ1', qty: 12, price: 59.99 }],
};
const srixonFreeLine = {
  id: 'SZ1-PROMO',
  parentLineId: 'SZ1',
  free: true,
  product: srixonProduct,
  splits: [{ id: 'SZ1-PROMO', qty: 4, price: 0 }],
};
const srixonPromotion = {
  promo: 'EVERY12GETS4',
  promoType: 'FREE_QUANTITY',
  totalPromoDiscount: 259.96,
  totalDiscount: 259.96,
  freeItems: [{ itemGuid: 'SZ1-PROMO', amount: 4 }],
};

globalThis.__gbTestProposalCarts = {
  CART1: { lines: [tp5Line] },
  CARTF: { lines: [freeLine] },
  CARTG: { lines: [giftSetLine] },
  CARTS: {
    lines: [srixonPaidLine, srixonFreeLine],
    promotion: srixonPromotion,
  },
};

describe('buildEmailSourceFromCartIds — single cart', () => {
  it('maps a product line onto a display row with qty, unit price, and rounded totals', async () => {
    const src = await buildEmailSourceFromCartIds(['CART1']);
    assert.equal(src.lines.length, 1);
    const row = src.lines[0];
    assert.equal(row.lineId, 'L1');
    assert.equal(row.title, 'TP5 Golf Balls');
    assert.equal(row.brand, 'TaylorMade');
    assert.equal(row.subtitle, 'White');
    assert.equal(row.img, 'https://static.golfballs.com/tp5.png');
    assert.equal(row.qty, 12);
    assert.equal(row.unitPrice, 44.99);
    assert.equal(row.lineTotal, 539.88);
    assert.equal(src.total, 539.88);
    assert.deepEqual(src.rawLines, [tp5Line]);
  });

  it('adds a retail strike-through (origUnit/origTotal) when the quoted price beats the highest retail', async () => {
    const src = await buildEmailSourceFromCartIds(['CART1']);
    // retail = max(orig 54.99, 1-qty break 49.99, price 44.99)
    assert.equal(src.lines[0].origUnit, 54.99);
    assert.equal(src.lines[0].origTotal, 659.88);
  });

  it('builds the proposal-tagged cart link and defaults the group/option names', async () => {
    const src = await buildEmailSourceFromCartIds(['CART1']);
    assert.equal(
      src.cartLink,
      'https://www.golfballs.com/cart?cartID=CART1&utm_medium=Proposal&utm_source=Proposal-CART1',
    );
    assert.equal(src.groupName, 'Your Custom Order');
    assert.equal(src.optionName, 'Option 1');
    assert.equal(src.discount, 0);
    assert.equal(src.freePromo, false);
    assert.equal(src.promoCode, '');
  });

  it('uses meta.name as the option name when provided', async () => {
    const src = await buildEmailSourceFromCartIds(['CART1'], { name: 'Premium Option' });
    assert.equal(src.optionName, 'Premium Option');
  });

  it('prices a FREE line at its full per-unit value (freeValue / qty) and flags it', async () => {
    const src = await buildEmailSourceFromCartIds(['CARTF']);
    const row = src.lines[0];
    assert.equal(row.free, true);
    assert.equal(row.unitPrice, 2.5);       // 30 / 12
    assert.equal(row.lineTotal, 30);
    assert.equal(row.origUnit, null);        // free lines never get a strike
    assert.equal(src.total, 30);             // subtotal includes the free line
  });

  it('carries a free-item promotion into the email and deducts its full value from the subtotal', async () => {
    const src = await buildEmailSourceFromCartIds(['CARTS'], { name: 'Srixon Z-Star Diamond' });

    assert.equal(src.lines.length, 2);
    assert.equal(src.lines[0].lineTotal, 719.88);
    assert.equal(src.lines[0].origTotal, 779.88);
    assert.equal(src.lines[1].free, true);
    assert.equal(src.lines[1].unitPrice, 64.99);
    assert.equal(src.lines[1].lineTotal, 259.96);
    assert.equal(src.total, 979.84, 'subtotal includes the free merchandise at full value');
    assert.equal(src.discount, 259.96, 'promotion removes the free merchandise');
    assert.equal(src.promoCode, 'EVERY12GETS4');
    assert.equal(src.freePromo, true);
    assert.equal(
      Math.round((src.total - src.discount) * 100) / 100,
      719.88,
      'estimated total is the paid merchandise only',
    );
  });
});

describe('buildEmailSourceFromCartIds — gift sets and imprints', () => {
  it('titles a gift-set line by the SET and composes the size · ball subtitle with the set image', async () => {
    const src = await buildEmailSourceFromCartIds(['CARTG']);
    const row = src.lines[0];
    assert.equal(row.title, 'Birthday Sleeve');
    assert.equal(row.subtitle, '3-ball sleeve · Pro V1');
    assert.equal(row.img, 'https://static.golfballs.com/box.png');
  });

  it('describes a personalized-text imprint (type label, quoted detail line, color hex, text)', async () => {
    const src = await buildEmailSourceFromCartIds(['CARTG']);
    const imp = src.lines[0].imprint;
    assert.equal(imp.type, 'ballText');
    assert.equal(imp.typeLabel, 'Personalized');
    assert.equal(imp.frontLabel, 'Personalized');
    assert.deepEqual(imp.detailLines, ['“GO BUCKS”']);
    assert.equal(imp.colorHex, '#1a2b3c');
    assert.equal(imp.text, 'GO BUCKS');
  });

  it("suppresses the 'Custom' pseudo-brand on rows", async () => {
    const src = await buildEmailSourceFromCartIds(['CARTF']);
    assert.equal(src.lines[0].brand, '');
  });
});

describe('buildEmailSourceFromCartIds — multiple carts', () => {
  it('combines carts into the multi shape: per-cart sections, empty flat lines, summed total', async () => {
    const multi = await buildEmailSourceFromCartIds(['CART1', 'CARTF']);
    assert.equal(multi.sections.length, 2);
    assert.deepEqual(multi.lines, []);
    assert.equal(multi.total, 569.88); // 539.88 + 30
    assert.equal(multi.groupName, 'Your Custom Order');
    assert.equal(multi.optionName, '2 proposals');
    assert.equal(multi.rawLines.length, 2);
    assert.ok(multi.sections[1].cartLink.includes('cartID=CARTF'));
  });

  it('numbers section option names sequentially when no meta name is given', async () => {
    const multi = await buildEmailSourceFromCartIds(['CART1', 'CARTG']);
    assert.equal(multi.sections[0].optionName, 'Option 1');
    assert.equal(multi.sections[1].optionName, 'Option 2');
  });

  it('preserves each selected proposal name when multiple carts are generated', async () => {
    const multi = await buildEmailSourceFromCartIds(['CART1', 'CARTG'], {
      optionNamesByCartId: {
        CART1: 'Executive Golf Balls',
        CARTG: 'Event Gift Sets',
      },
    });
    assert.deepEqual(multi.sections.map((section) => section.optionName), [
      'Executive Golf Balls',
      'Event Gift Sets',
    ]);
  });
});
