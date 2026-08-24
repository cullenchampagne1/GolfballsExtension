/**
 * Rich-text editor clipboard serialization: copying variables and bullet
 * lists out of the template editor should produce clean {{var}} placeholders
 * and "- " bullet markers, not chip spans / run-together lines.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  decorateEditorImages,
  fragToPlain,
  normalizePastedFragment,
  plainToHtml,
  stripEditorDecorations,
} from '../../src/lib/rteClipboard.js';

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

function frag(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

// A rendered variable chip carries a hidden .gb-rte-chip-name span holding the
// {{name}} placeholder plus a visible name + bolt — matches chipHTML output.
const CHIP = (name) =>
  `<span class="gb-rte-chip" contenteditable="false">`
  + `<span class="gb-rte-chip-name" style="display:none">{{${name}}}</span>`
  + `<span>${name}</span><span class="gb-rte-chip-bolt">⚡</span></span>`;

describe('fragToPlain — chips become {{var}}', () => {
  it('serializes a chip to its placeholder, not its visible label + bolt', () => {
    const out = fragToPlain(frag(`Hi ${CHIP('contactFirstName')}, welcome`));
    assert.equal(out, 'Hi {{contactFirstName}}, welcome');
  });

  it('does not duplicate the name (hidden + visible spans collapse to one)', () => {
    const out = fragToPlain(frag(CHIP('rep')));
    assert.equal(out, '{{rep}}');
  });
});

describe('fragToPlain — bullet lists get "- " markers and line breaks', () => {
  it('turns <ul><li> into dash-prefixed lines instead of a run-together blob', () => {
    const out = fragToPlain(frag('<p>Options:</p><ul><li>First</li><li>Second</li></ul>'));
    assert.equal(out, 'Options:\n- First\n- Second');
  });

  it('keeps a variable inside a bullet as its placeholder', () => {
    const out = fragToPlain(frag(`<ul><li>Hello ${CHIP('firstName')}</li></ul>`));
    assert.equal(out, '- Hello {{firstName}}');
  });

  it('breaks lines on <br>', () => {
    assert.equal(fragToPlain(frag('one<br>two')), 'one\ntwo');
  });
});

describe('plainToHtml — plain paste keeps line breaks and lets {{var}} survive', () => {
  it('escapes HTML and converts newlines to <br>', () => {
    assert.equal(plainToHtml('a < b\nnext'), 'a &lt; b<br>next');
  });

  it('leaves {{var}} intact so a later highlight pass can chip it', () => {
    assert.equal(plainToHtml('Hi {{firstName}}'), 'Hi {{firstName}}');
  });
});

describe('rich paste normalization', () => {
  it('keeps a bullet-only clipboard fragment as one real list without whitespace lines', () => {
    assert.equal(
      normalizePastedFragment('\n  <li>First</li>\n  <li>Second</li>\n'),
      '<ul><li>First</li><li>Second</li></ul>',
    );
  });

  it('anchors a resized image left even when pasted into centered content', () => {
    const decorated = decorateEditorImages('<p style="text-align:center"><img src="https://example.test/a.png" width="240" align="right" style="margin:8px auto"></p>');
    assert.match(decorated, /class="gb-rte-image"/);
    assert.match(decorated, /class="gb-rte-image-resize"/);
    const decoratedRoot = frag(decorated);
    const wrapper = decoratedRoot.querySelector('.gb-rte-image');
    assert.equal(wrapper.style.display, 'block');
    assert.equal(wrapper.style.marginLeft, '0px');
    assert.equal(wrapper.style.marginRight, 'auto');
    const stored = stripEditorDecorations(decorated);
    assert.doesNotMatch(stored, /gb-rte-image/);
    const storedRoot = frag(stored);
    const image = storedRoot.querySelector('img');
    assert.equal(image.getAttribute('align'), null);
    assert.equal(image.getAttribute('data-gb-resized-image'), 'true');
    assert.equal(image.getAttribute('width'), '240');
    assert.equal(image.style.width, '240px');
    assert.equal(image.style.maxWidth, '100%');
    assert.equal(image.style.height, 'auto');
    assert.equal(image.style.display, 'block');
    assert.equal(image.style.marginLeft, '0px');
    assert.equal(image.style.marginRight, 'auto');
  });
});
