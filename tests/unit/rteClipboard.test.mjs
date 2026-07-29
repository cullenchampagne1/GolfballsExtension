/**
 * Rich-text editor clipboard serialization: copying variables and bullet
 * lists out of the template editor should produce clean {{var}} placeholders
 * and "- " bullet markers, not chip spans / run-together lines.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { fragToPlain, plainToHtml } from '../../src/lib/rteClipboard.js';

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
