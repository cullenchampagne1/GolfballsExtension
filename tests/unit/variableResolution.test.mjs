/**
 * Unit tests — src/lib/variableResolution.js (renderTemplate, dropConditional)
 *
 * Pure string module. Assertions pin the EXACT rendered output, including the
 * quirk that sentence-scope drops also swallow the space after the previous
 * sentence's period (current actual behavior).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

import { renderTemplate, dropConditional } from '../../src/lib/variableResolution.js';

const vanillaResolverSource = await readFile(
  new URL('../../src/vanilla/variable-resolution.js', import.meta.url),
  'utf8',
);

describe('renderTemplate — substitution', () => {
  it('substitutes a resolved {{var}} placeholder', () => {
    assert.equal(renderTemplate('Hi {{first}}, welcome!', { first: 'Ann' }), 'Hi Ann, welcome!');
  });

  it('tolerates whitespace inside the braces', () => {
    assert.equal(renderTemplate('Order {{ orderId }} shipped', { orderId: '5119355' }), 'Order 5119355 shipped');
  });

  it('renders unresolved placeholders blank so braces never leak into sent mail', () => {
    assert.equal(renderTemplate('Hi {{first}},', {}), 'Hi ,');
    assert.equal(renderTemplate('Hi {{first}},', { first: '' }), 'Hi ,');
  });

  it('OR-block {{a|b}} falls through to the first non-empty candidate', () => {
    assert.equal(renderTemplate('Hi {{nick|first}}!', { nick: '', first: 'Ann' }), 'Hi Ann!');
    assert.equal(renderTemplate('Hi {{nick|first}}!', { nick: 'Cap', first: 'Ann' }), 'Hi Cap!');
  });

  it('OR-block with no resolvable candidate renders blank', () => {
    assert.equal(renderTemplate('Hi {{nick|first}}!', {}), 'Hi !');
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

  it('keeps the source sentence formatting around a substituted variable', () => {
    assert.equal(
      renderTemplate('<p><small style="font-size:10px">Hi {{first}}</small></p>', { first: 'Ann' }),
      '<p><small style="font-size:10px">Hi Ann</small></p>',
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

describe('dropConditional — visual HTML scopes', () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.NodeFilter = dom.window.NodeFilter;

  it('drops the actual br-delimited editor line, including images on it', () => {
    const defs = { code: { smart: { conditional: true, conditionalScope: 'line' } } };
    assert.equal(
      dropConditional('<p>Keep<br><img src="https://example.test/a.png">{{code}}<br>After</p>', defs, {}),
      '<p>Keep<br>After</p>',
    );
  });

  it('removes a paragraph whose only visible content is the empty variable', () => {
    const defs = { first: { smart: { conditional: true, conditionalScope: 'paragraph' } } };
    assert.equal(dropConditional('<p>Keep</p><p><span>{{first}}</span></p><p>After</p>', defs, {}), '<p>Keep</p><p>After</p>');
  });

  it('keeps surrounding HTML valid while dropping only one sentence', () => {
    const defs = { first: { smart: { conditional: true, conditionalScope: 'sentence' } } };
    assert.equal(
      dropConditional('<p>Hello. <small>Welcome {{first}} today.</small> Thanks.</p>', defs, {}),
      '<p>Hello. Thanks.</p>',
    );
  });
});

describe('cached Page Engine variable resolution', () => {
  it('resolves recipient, schema fields, code vars, name, and email history from one saved snapshot', async () => {
    const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
    const get = (object, path, fallback = '') => {
      const value = String(path || '').split('.').reduce(
        (current, key) => (current == null ? current : current[key]),
        object,
      );
      return value == null ? fallback : value;
    };
    dom.window.__gbPageEngine = {
      resolve: get,
      toDisplayString: (value) => (value == null ? '' : String(value)),
      evaluateCodeData: async (data, _body, vars) => `${vars.first}:${data.stats.totalRevenue}`,
    };
    dom.window.eval(vanillaResolverSource);
    const snapshot = {
      schemaId: 'contact',
      id: '42',
      sourceUrl: 'https://crm.test/Default.aspx?Page=240&customerID=42',
      data: {
        contact: {
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ada@example.test',
          emails: [{ date: '2026-07-21T12:00:00Z' }],
        },
        stats: { totalRevenue: 1250 },
      },
    };

    const result = await dom.window.__gbResolveVarsForData(snapshot, {
      first: { type: 'schema', path: 'contact.firstName' },
      summary: { type: 'code', body: 'return `${vars.first}:${ctx.stats.totalRevenue}`;' },
    }, { type: 'auto' });

    assert.equal(result.toEmail, 'ada@example.test');
    assert.deepEqual({ ...result.resolved }, { first: 'Ada', summary: 'Ada:1250' });
    assert.equal(result.displayName, 'Ada Lovelace');
    assert.equal(result.lastEmailMs, Date.parse('2026-07-21T12:00:00Z'));

    const transformed = await dom.window.__gbResolveVarsForData(snapshot, {
      first: { type: 'literal', value: 'MARCUS', smart: { transform: 'titleCase' } },
      greeting: { type: 'literal', value: 'HELLO WORLD', smart: { transform: 'capitalize' } },
      centeredLogo: {
        type: 'attachment', mode: 'inline', source: 'url',
        url: 'https://example.test/logo.png', filename: 'logo.png', width: 240, align: 'center',
      },
    }, { type: 'auto' });
    assert.equal(transformed.resolved.first, 'Marcus');
    assert.equal(transformed.resolved.greeting, 'Hello world');
    assert.match(transformed.resolved.centeredLogo, /data-gb-image-align="center"/);
    assert.match(transformed.resolved.centeredLogo, /margin:8px auto;/);
    dom.window.close();
  });
});
