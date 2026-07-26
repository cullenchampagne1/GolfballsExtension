/* ───────────────────────────────────────────────────────────────
   codeEngine/instrument — tag action calls with their block id.

   The block view keys on a node id per action call (translate.js). At
   run time an `actions.sendEmail(...)` call carries no source span, so
   the runtime can't know which block lit up. This rewrites each
   `actions.X(args)` into `actions.__trace("&lt;nodeId&gt;","X", args)` — the
   SAME nodeId translate.js assigns — so the injected `__trace` dispatcher
   reports which block is executing and the run animation follows along.

   The rewrite is span-driven off the @lezer/javascript tree (no eval,
   CSP-safe) and only touches recognized `actions.*` contract calls;
   everything else is left byte-for-byte. Pure: string in, string out.
─────────────────────────────────────────────────────────────── */

import { parser } from '@lezer/javascript';
import { contractFor } from './contracts.js';

const nodeId = (from, to) => `n${from}_${to}`;

function childByName(node, names) {
  const set = new Set(Array.isArray(names) ? names : [names]);
  const c = node.node.cursor();
  if (!c.firstChild()) return null;
  do { if (set.has(c.name)) return c.node; } while (c.nextSibling());
  return null;
}

/**
 * Rewrite each recognized `actions.X(...)` call so it self-reports its block id.
 *
 * @returns {{ code: string, calls: Array<{ id, contract, from, to }> }}
 *   code — the instrumented source, semantically identical except each contract
 *          call routes through `actions.__trace(id, name, …originalArgs)`.
 *   calls — the calls that were tagged (for preflight / gating).
 *
 * Never throws; on a parse failure returns the input unchanged with no calls.
 */
export function instrument(source) {
  const src = String(source ?? '');
  let tree;
  try { tree = parser.parse(src); } catch { return { code: src, calls: [] }; }

  const edits = []; // { pos, remove, insert }
  const calls = [];

  tree.iterate({
    enter: (ref) => {
      if (ref.name !== 'CallExpression') return undefined;
      const member = childByName(ref, 'MemberExpression');
      if (!member) return undefined;
      const memberText = src.slice(member.from, member.to);
      const args = childByName(ref, 'ArgList');
      if (!args) return undefined;
      const id = nodeId(ref.from, ref.to);
      const afterParen = args.from + 1;
      const hasArgs = src.slice(args.from + 1, args.to - 1).trim().length > 0;

      // page.evaluate(ref) → page.__eval("id", ref) — the evaluation step.
      if (/^page\s*\.\s*evaluate$/.test(memberText)) {
        calls.push({ id, contract: 'evaluate', from: ref.from, to: ref.to });
        edits.push({ pos: member.from, remove: member.to - member.from, insert: 'page.__eval' });
        const lead = `${JSON.stringify(id)},`;
        edits.push({ pos: afterParen, remove: 0, insert: hasArgs ? lead : lead.replace(/,$/, '') });
        return undefined;
      }

      // actions.X(args) → actions.__trace("id","X", args)
      const match = memberText.match(/^actions\s*\.\s*([A-Za-z_$][\w$]*)$/);
      if (!match) return undefined;
      const contract = contractFor(match[1]);
      if (!contract) return undefined;

      calls.push({ id, contract: contract.name, from: ref.from, to: ref.to });
      edits.push({ pos: member.from, remove: member.to - member.from, insert: 'actions.__trace' });
      const lead = `${JSON.stringify(id)},${JSON.stringify(contract.name)},`;
      edits.push({ pos: afterParen, remove: 0, insert: hasArgs ? lead : lead.replace(/,$/, '') });
      return undefined;
    },
  });

  if (!edits.length) return { code: src, calls };

  // Apply from the end so earlier offsets stay valid.
  edits.sort((a, b) => b.pos - a.pos);
  let code = src;
  for (const e of edits) {
    code = code.slice(0, e.pos) + e.insert + code.slice(e.pos + e.remove);
  }
  return { code, calls };
}
