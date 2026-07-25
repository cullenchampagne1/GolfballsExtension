import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../../src/modals/MockupStudio.jsx', import.meta.url),
  'utf8',
);

describe('mockup gallery in-studio presentation', () => {
  it('reuses the studio chrome and provides an obvious route back to products', () => {
    assert.match(source, /title=\{currentBatch\?\.name \|\| 'Product Mockup Studio'\}/);
    assert.match(source, />\s*Back to products\s*</);
    assert.match(source, /onClose=\{requestClose\}/);
    assert.match(source, /onClick=\{closeCurrentBatch\}/);
    assert.match(source, /<ModalFooter style=\{\{ minHeight: 50/);
    assert.doesNotMatch(source, /function BatchModal/);
  });

  it('slides between product selection and the selected batch in the same content area', () => {
    assert.match(source, /key=\{`batch:\$\{currentBatch\.batch_id\}`\}/);
    assert.match(source, /initial=\{\{ opacity: 0, x: 28 \}\}/);
    assert.match(source, /key="studio"[\s\S]*initial=\{\{ opacity: 0, x: -28 \}\}/);
    assert.match(source, /<BatchView[\s\S]*batch=\{currentBatch\}/);
    assert.match(source, /background: 'var\(--gb-surface-2\)'/);
    assert.doesNotMatch(source, /zIndex: 45/);
  });
});
