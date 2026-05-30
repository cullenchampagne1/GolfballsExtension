/* ───────────────────────────────────────────────────────────────
   parseChat.js — chat-transcript parser, ported from the legacy
   _parseAndRenderChatHtml in src/vanilla/modals/text-preview.js.

   The case-history row stores a SnapEngage transcript as a single
   blob of lines like:

     (09:14:00) <b>Visitor</b> Hi, my order hasn't shipped…
     (09:15:00) <b>Cullen</b> Happy to help!
     (09:16:00) <b>Cullen</b> [Transferred to Ren]
     see https://snapengage.com/transcripts/4521098

   Each line resolves to { kind, name?, time?, body }:
     • visitor / agent — a `(time) <b>Name</b> message` line; name
       "Visitor" (case-insensitive) is the customer, everything else
       is an agent.
     • system          — a matched line whose message is `[ … ]`.
     • link            — a line starting "see https://".
     • note            — any other non-empty line (free-text case note).
─────────────────────────────────────────────────────────────── */

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

/* The transcript stores plain text with occasional markup; render it
   as text (strip tags, decode the handful of entities that show up). */
function toText(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/g, (m) => ENTITIES[m] || m)
    .trim();
}

export function parseChat(rawText) {
  const messages = [];
  if (!rawText || !String(rawText).trim()) return { messages };

  const lines = String(rawText).split(/<br\s*\/?>|\n/i);
  for (const line of lines) {
    const clean = line.trim();
    if (!clean) continue;

    const m = clean.match(/^\((.*?)\)\s*<b>(.*?)<\/b>\s*(.*)$/);
    if (m) {
      const [, time, name, msg] = m;
      const trimmedMsg = msg.trim();
      if (trimmedMsg.startsWith('[') && trimmedMsg.endsWith(']')) {
        messages.push({ kind: 'system', time, body: toText(trimmedMsg) });
      } else {
        const isVisitor = name.trim().toLowerCase() === 'visitor';
        messages.push({ kind: isVisitor ? 'visitor' : 'agent', name: toText(name), time, body: toText(msg) });
      }
    } else if (/^see\s+https?:\/\//i.test(clean)) {
      messages.push({ kind: 'link', body: clean });
    } else {
      messages.push({ kind: 'note', body: toText(clean) });
    }
  }
  return { messages };
}
