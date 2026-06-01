import { readFileSync } from 'node:fs';
import { buildCartData, buildSaveCartBody, SAVE_CART_URL, getCartUrl, parseGetCart } from '/Users/cullenchampagne/Downloads/golfballs-payment-extension/src/lib/cartSerializer.js';

const cap = JSON.parse(readFileSync('/private/tmp/gb-design/cart-capture.json', 'utf8'));
const ttLine = cap.shoppingCart.itemsInCart.find((l) => /Triple Track/.test(l.productTitle));
console.log('using real line:', ttLine.productTitle, '| itemGuid', ttLine.itemGuid);

const cartData = buildCartData([ttLine]);
const body = buildSaveCartBody(cartData);          // { cartData, customerID:0, salesRepID:0 }
console.log('cartData totals → total', cartData.cartTotal, 'qty', cartData.cartTotalQty, '| items', cartData.itemsInCart.length);

const H = { 'Content-Type': 'application/json', Accept: 'application/json', sitekey: 'golfballs' };

console.log('\n→ PUT saveCart …');
const saveResp = await fetch(SAVE_CART_URL, { method: 'PUT', headers: H, body: JSON.stringify(body) });
const saveJson = await saveResp.json();
console.log('  status', saveResp.status, '| d =', JSON.stringify(saveJson.d || saveJson));
const cartNumber = (saveJson.d || {}).cartNumber;
if (!cartNumber) { console.log('NO cartNumber — abort'); process.exit(1); }

console.log(`\n→ GET getCart/${cartNumber} …`);
const loadResp = await fetch(getCartUrl(cartNumber), { method: 'GET', headers: { Accept: 'application/json', sitekey: 'golfballs' } });
const loaded = parseGetCart(await loadResp.json());
console.log('  status', loadResp.status, '| items', (loaded.itemsInCart || []).length);

const back = (loaded.itemsInCart || [])[0] || {};
const title = back.productTitle;
const deco = ((back.modificationHistory || [])[0]?.dynamicImage || [])[0]?.Print?.userText?.[0];
console.log('  round-tripped title:', title);
console.log('  round-tripped decoration (Print userText):', JSON.stringify(deco));

const pass = title === ttLine.productTitle && JSON.stringify(deco) === JSON.stringify((ttLine.modificationHistory[0].dynamicImage[0].Print.userText[0]));
console.log(pass ? '\n✅ ROUND-TRIP OK — saveCart created a real proposal and getCart returned it intact'
                 : '\n❌ round-trip mismatch');
console.log('   (proposal/cart #' + cartNumber + ' now exists on the server as a guest cart)');
process.exit(pass ? 0 : 1);
