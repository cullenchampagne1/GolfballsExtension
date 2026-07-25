import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../../src/modals/MockupStudio.jsx', import.meta.url),
  'utf8',
);

describe('mockup gallery modal presentation', () => {
  it('uses the shared header and footer controls for studio and gallery chrome', () => {
    assert.match(source, /title="Product Mockup Studio"/);
    assert.match(source, /title=\{batch\.name \|\| 'Mockup gallery'\}/);
    assert.match(source, /onClose=\{requestClose\}/);
    assert.match(source, /onClose=\{onBack\}/);
    assert.match(source, /<ModalFooter style=\{\{ minHeight: 50/);
    assert.doesNotMatch(source, /title="Close batch details"/);
  });

  it('gives the gallery a consistent centered-modal surface and four-tile room', () => {
    assert.match(source, /width: 'min\(1000px, 100%\)'/);
    assert.match(source, /height: 'min\(680px, 100%\)'/);
    assert.match(source, /background: 'var\(--gb-overlay-strong\)'/);
    assert.match(source, /borderRadius: 'var\(--gb-r-lg\)'/);
    assert.match(source, /background: 'var\(--gb-surface-2\)'/);
  });
});
