import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../lib/prior-order.js', import.meta.url), 'utf8');
const context = { URL };
vm.runInNewContext(source, context, { filename: 'lib/prior-order.js' });
const parser = context.GBPriorOrder;

function envelope(cart) {
  const json = JSON.stringify(cart)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<?xml version="1.0"?><string xmlns="https://tempuri.org/">${json}</string>`;
}

describe('prior order envelope · duplicate link', () => {
  it('selects the real Duplicate Order checkout and ignores the CRM increment link', () => {
    const id = '123e4567-e89b-42d3-a456-426614174000';
    const html = `
      <a href="default.aspx?orderID=91&amp;Page=37&amp;incorder=true">Increment Order String</a>
      <a href="https://www.golfballs.com/cart?checkoutid=${id}">Duplicate <strong>Order</strong></a>
    `;
    assert.equal(parser.findDuplicateCheckoutId(html), id);
  });

  it('rejects a checkout id hosted anywhere except the Golfballs cart', () => {
    const id = '123e4567-e89b-42d3-a456-426614174000';
    assert.equal(parser.findDuplicateCheckoutId(`<a href="https://evil.test/cart?checkoutid=${id}">Duplicate Order</a>`), '');
  });

  it('does not follow an arbitrary Golfballs checkout link without the Duplicate Order label', () => {
    const id = '123e4567-e89b-42d3-a456-426614174000';
    assert.equal(parser.findDuplicateCheckoutId(`<a href="https://www.golfballs.com/cart?checkoutid=${id}">Open cart</a>`), '');
  });
});

describe('prior order envelope · privacy projection', () => {
  it('keeps proposal/cart fields and drops every checkout, payment, and address field', () => {
    const parsed = parser.parseCheckoutEnvelope(envelope({
      authorization: { token: 'never-cross' },
      billingAddress: { email: 'private@example.test' },
      shippingAddress: { street: 'private' },
      paymentType: 'card',
      userPassword: 'never-cross',
      orderDate: '8/14/2026',
      itemsInCart: [{
        itemGuid: 'line-1',
        ShortCode: 'P01155',
        productTitle: 'Titleist Pro V1 Custom Logo Golf Balls',
        brand: 'Titleist',
        url: '/Golf-Balls/Titleist-Pro-V1-Custom-Logo.htm',
        totalQty: 12,
        ItemPrice: 54.99,
        CustomData: { parentSku: 'B5338', customerEmail: 'drop-me' },
        ItemPriceBreak: { PriceBreak: [{ Quantity: 12, Price: 54.99, Cost: 12 }] },
        childList: [{
          ShortCode: 'P01155-WHT',
          productChildID: 81,
          PropertyValueProduct: [{ Value: 'White', propertyProductID: 4, propertyValueProductID: 44 }],
        }],
        modification: {
          interfaceState: { GolfBallCustomLogo: { customLogo: { fileName: 'logo.png', filePath: 'Source/CustomerUploads/logo.png', useCustomLogo: true } } },
          dynamicImage: [{ configOverrides: { BC: '#FFFFFF' } }],
        },
        customUserImage: { firstPole: { fileName: 'logo.png', filePath: 'Source/CustomerUploads/logo.png' } },
        images: [{ URL: 'P01155.jpg', internalNote: 'drop' }],
      }],
    }));

    assert.equal(parsed.orderDate, '8/14/2026');
    assert.equal(parsed.itemsInCart.length, 1);
    assert.equal(parsed.itemsInCart[0].CustomData.parentSku, 'B5338');
    assert.deepEqual(
      { ...parsed.itemsInCart[0].childList[0].PropertyValueProduct[0] },
      { Value: 'White', propertyProductID: 4, propertyValueProductID: 44 },
    );
    assert.equal(parsed.itemsInCart[0].modification.interfaceState.GolfBallCustomLogo.customLogo.fileName, 'logo.png');
    const serialized = JSON.stringify(parsed);
    for (const forbidden of ['authorization', 'billingAddress', 'shippingAddress', 'paymentType', 'userPassword', 'private@example.test', 'never-cross']) {
      assert.equal(serialized.includes(forbidden), false, `${forbidden} must not cross the worker boundary`);
    }
  });
});
