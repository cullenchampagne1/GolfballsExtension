/**
 * Unit tests — src/lib/variableResolution.js (renderTemplate, dropConditional)
 *
 * Pure string module. Assertions pin the EXACT rendered output, including the
 * quirk that sentence-scope drops also swallow the space after the previous
 * sentence's period (current actual behavior).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { renderTemplate, dropConditional } from '../../src/lib/variableResolution.js';

describe('renderTemplate — substitution', () => {
  it('substitutes a resolved {{var}} placeholder', () => {
    assert.equal(renderTemplate('Hi {{first}}, welcome!', { first: 'Ann' }), 'Hi Ann, welcome!');
  });

  it('tolerates whitespace inside the braces', () => {
    assert.equal(renderTemplate('Order {{ orderId }} shipped', { orderId: '5119355' }), 'Order 5119355 shipped');
  });

  it('leaves an unresolved placeholder intact so the rep sees the gap', () => {
    assert.equal(renderTemplate('Hi {{first}},', {}), 'Hi {{first}},');
    assert.equal(renderTemplate('Hi {{first}},', { first: '' }), 'Hi {{first}},');
  });

  it('OR-block {{a|b}} falls through to the first non-empty candidate', () => {
    assert.equal(renderTemplate('Hi {{nick|first}}!', { nick: '', first: 'Ann' }), 'Hi Ann!');
    assert.equal(renderTemplate('Hi {{nick|first}}!', { nick: 'Cap', first: 'Ann' }), 'Hi Cap!');
  });

  it('OR-block with no resolvable candidate passes the original through', () => {
    assert.equal(renderTemplate('Hi {{nick|first}}!', {}), 'Hi {{nick|first}}!');
  });

  it('empty pipe segments are dropped, so {{|x}} behaves like {{x}}', () => {
    assert.equal(renderTemplate('Code: {{|promo}}', { promo: 'SAVE10' }), 'Code: SAVE10');
  });

  it('renders null/undefined templates as an empty string', () => {
    assert.equal(renderTemplate(null, {}), '');
    assert.equal(renderTemplate(undefined, {}), '');
  });

  it('substitutes multiple distinct placeholders in one pass', () => {
    assert.equal(
      renderTemplate('{{first}} {{last}} ({{first}})', { first: 'Ann', last: 'Lee' }),
      'Ann Lee (Ann)',
    );
  });
});

describe('renderTemplate + defs — conditional drop before substitution', () => {
  const defs = { order: { smart: { conditional: true } } };

  it('drops the sentence holding an empty conditional var, then substitutes the rest', () => {
    const out = renderTemplate('Hello. Your order {{order}} shipped. Thanks {{first}}.', { first: 'Ann' }, defs);
    assert.equal(out, 'Hello.Thanks Ann.'); // sentence-drop also eats the separating space
  });

  it('keeps the sentence and substitutes when the conditional var resolved', () => {
    const out = renderTemplate('Hello. Your order {{order}} shipped.', { order: '#42' }, defs);
    assert.equal(out, 'Hello. Your order #42 shipped.');
  });
});

describe('dropConditional', () => {
  it('only drops for vars marked smart.conditional — plain empties stay', () => {
    const defs = { order: { smart: {} } };
    assert.equal(
      dropConditional('Your order {{order}} shipped.', defs, {}),
      'Your order {{order}} shipped.',
    );
  });

  it('sentence scope removes just the sentence containing the placeholder', () => {
    const defs = { order: { smart: { conditional: true } } };
    assert.equal(
      dropConditional('Hello. Your order {{order}} shipped. Thanks.', defs, {}),
      'Hello.Thanks.',
    );
  });

  it('line scope removes the whole line including its newline', () => {
    const defs = { code: { smart: { conditional: true, conditionalScope: 'line' } } };
    assert.equal(
      dropConditional('Line one\nUse code {{code}} now\nLine three', defs, {}),
      'Line one\nLine three',
    );
  });

  it('paragraph scope removes the paragraph and its blank-line separator', () => {
    const defs = { code: { smart: { conditional: true, conditionalScope: 'paragraph' } } };
    assert.equal(
      dropConditional('Para one.\n\nUse code {{code}} now.\n\nPara three.', defs, {}),
      'Para one.\n\nPara three.',
    );
  });

  it('a non-empty resolved value suppresses the drop', () => {
    const defs = { order: { smart: { conditional: true } } };
    assert.equal(
      dropConditional('Your order {{order}} shipped.', defs, { order: '#42' }),
      'Your order {{order}} shipped.',
    );
  });

  it('escapes regex metacharacters in variable names', () => {
    const defs = { 'total($)': { smart: { conditional: true } } };
    assert.equal(dropConditional('Total is {{total($)}} today.', defs, {}), '');
  });

  it('returns "" / the template for null inputs', () => {
    assert.equal(dropConditional(null, {}, {}), '');
    assert.equal(dropConditional('text', null, {}), 'text');
  });

  it('drops the sentence around an OR-block whose candidates are ALL empty', () => {
    const defs = { nick: { smart: { conditional: true } }, first: { smart: { conditional: true } } };
    assert.equal(
      dropConditional('Keep. Use {{nick|first}} here. End.', defs, {}),
      'Keep.End.',
    );
  });
});
