import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';

import {
  addDoNotContactMarker,
  hasDoNotContactMarker,
  mountContactDoNotEmail,
  removeDoNotContactMarker,
} from '../../src/lib/contactDoNotEmail.js';

function contactPage(context = '') {
  return new JSDOM(`<!doctype html><html><head></head><body>
    <div class="portlet box green">
      <div class="portlet-title"><div class="actions">
        <a id="btnRemoveDoNotCall" class="btn mini red">Remove From Do Not Call List</a>
      </div></div>
      <div class="portlet-body">
        <table><tbody><tr><td id="lblContactCustomDataContext">${context}</td></tr>
        <tr><td id="lblContactEmail"><a href="mailto:buyer@example.test">buyer@example.test</a></td></tr></tbody></table>
      </div>
    </div>
  </body></html>`, {
    url: 'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=240&customerID=6510673',
  });
}

describe('contact do-not-email control', () => {
  it('adds and removes the marker without discarding other context notes', () => {
    const marked = addDoNotContactMarker('Prefers calls after 2 PM');
    assert.equal(marked, 'DO NOT CONTACT\nPrefers calls after 2 PM');
    assert.equal(hasDoNotContactMarker(marked), true);
    assert.equal(removeDoNotContactMarker(marked), 'Prefers calls after 2 PM');
  });

  it('injects a second red control beside Do Not Call and strikes marked emails', () => {
    const dom = contactPage('DO NOT CONTACT');
    const mounted = mountContactDoNotEmail({
      doc: dom.window.document,
      href: dom.window.location.href,
      updateContact: async () => {},
      MutationObserverImpl: dom.window.MutationObserver,
    });
    const button = mounted.button;
    assert.equal(button.previousElementSibling.id, 'btnRemoveDoNotCall');
    assert.match(button.className, /\bred\b/);
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    assert.equal(button.textContent, 'Remove From Do Not Email List');
    assert.equal(dom.window.document.getElementById('lblContactEmail').classList.contains('gb-do-not-email'), true);
    mounted.disconnect();
  });

  it('persists the context marker and updates the page immediately', async () => {
    const dom = contactPage('Prefers calls after 2 PM');
    const writes = [];
    const mounted = mountContactDoNotEmail({
      doc: dom.window.document,
      href: dom.window.location.href,
      updateContact: async (id, edits) => writes.push({ id, edits }),
      MutationObserverImpl: dom.window.MutationObserver,
    });
    mounted.button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(writes, [{
      id: '6510673',
      edits: { Context: 'DO NOT CONTACT\nPrefers calls after 2 PM' },
    }]);
    assert.equal(dom.window.document.getElementById('lblContactCustomDataContext').textContent,
      'DO NOT CONTACT\nPrefers calls after 2 PM');
    assert.equal(dom.window.document.getElementById('lblContactEmail').classList.contains('gb-do-not-email'), true);
    mounted.disconnect();
  });
});
