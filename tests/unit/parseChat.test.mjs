/**
 * Unit tests — src/lib/parseChat.js (parseChat)
 *
 * Feeds realistic SnapEngage transcript blobs and pins the structured
 * output: line kinds, speaker names, timestamps, and entity/tag handling.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { chatTranscriptSummary, isChatTranscript, parseChat, safeChatTranscriptUrl } from '../../src/lib/parseChat.js';

describe('parseChat', () => {
  it('classifies a full transcript into visitor/agent/system/link/note lines in order', () => {
    const raw = [
      "(09:14:00) <b>Visitor</b> Hi, my order hasn't shipped yet",
      '(09:15:00) <b>Alex</b> Happy to help!',
      '(09:16:00) <b>Alex</b> [Transferred to Ren]',
      'see https://snapengage.com/transcripts/4521098',
      'Customer verified account by phone.',
    ].join('\n');

    const { messages } = parseChat(raw);
    assert.deepEqual(messages, [
      { kind: 'visitor', name: 'Visitor', time: '09:14:00', body: "Hi, my order hasn't shipped yet" },
      { kind: 'agent', name: 'Alex', time: '09:15:00', body: 'Happy to help!' },
      { kind: 'system', time: '09:16:00', body: '[Transferred to Ren]' },
      { kind: 'link', body: 'see https://snapengage.com/transcripts/4521098' },
      { kind: 'note', body: 'Customer verified account by phone.' },
    ]);
  });

  it('treats "Visitor" case-insensitively as the customer and any other name as agent', () => {
    const { messages } = parseChat('(10:00:00) <b>VISITOR</b> hello\n(10:01:00) <b>Ren</b> hi');
    assert.equal(messages[0].kind, 'visitor');
    assert.equal(messages[1].kind, 'agent');
    assert.equal(messages[1].name, 'Ren');
  });

  it('splits on <br> tags as well as newlines', () => {
    const { messages } = parseChat('(09:14:00) <b>Visitor</b> Hi<br/>(09:15:00) <b>Alex</b> Hello<br>note text');
    assert.deepEqual(messages.map((m) => m.kind), ['visitor', 'agent', 'note']);
    assert.equal(messages[1].body, 'Hello');
  });

  it('decodes HTML entities and strips residual tags from message bodies', () => {
    const { messages } = parseChat('(09:14:00) <b>Visitor</b> Tom &amp; Jerry said &quot;hi&quot; &lt;3 <i>wow</i>');
    assert.equal(messages[0].body, 'Tom & Jerry said "hi" <3 wow');
  });

  it('captures the raw timestamp text between the parentheses', () => {
    const { messages } = parseChat('(9:05 AM) <b>Visitor</b> morning');
    assert.equal(messages[0].time, '9:05 AM');
  });

  it('only marks [bracketed] messages from a speaker line as system', () => {
    const { messages } = parseChat('(09:16:00) <b>Alex</b> [Chat ended]\n(09:17:00) <b>Alex</b> [partial bracket message');
    assert.equal(messages[0].kind, 'system');
    assert.equal(messages[0].body, '[Chat ended]');
    assert.equal(messages[1].kind, 'agent'); // no closing bracket → normal message
  });

  it('skips blank lines instead of emitting empty notes', () => {
    const { messages } = parseChat('note one\n\n   \nnote two');
    assert.deepEqual(messages.map((m) => m.body), ['note one', 'note two']);
  });

  it('returns an empty message list for null/empty/whitespace input', () => {
    assert.deepEqual(parseChat(null), { messages: [] });
    assert.deepEqual(parseChat(''), { messages: [] });
    assert.deepEqual(parseChat('   \n  '), { messages: [] });
  });

  it('requires the see-prefix plus URL for link lines; bare URLs are notes', () => {
    const { messages } = parseChat('https://example.com/x\nSee http://example.com/y');
    assert.equal(messages[0].kind, 'note');
    assert.equal(messages[1].kind, 'link');
  });

  it('summarizes a real Live Chat blob and extracts only safe SnapEngage links', () => {
    const raw = '(14:31:58) <b>Approval Bot</b> This chat may be recorded.<br />(14:31:59) <b>Visitor</b> Looking for an Irish logo<br />(14:32:34) <b>Matt</b> Happy to help<br />See https://www.snapengage.com/viewcase?c=abc for chat transcript';
    assert.equal(isChatTranscript(raw), true);
    assert.deepEqual(chatTranscriptSummary(raw), {
      count: 3,
      participants: ['Approval Bot', 'Visitor', 'Matt'],
      last: { kind: 'agent', name: 'Matt', time: '14:32:34', body: 'Happy to help' },
    });
    assert.equal(safeChatTranscriptUrl(raw), 'https://www.snapengage.com/viewcase?c=abc');
    assert.equal(safeChatTranscriptUrl('See https://example.com/transcript'), '');
  });
});
