/* ───────────────────────────────────────────────────────────────
   codeEngine/instrument — tag action + function execution with block ids.

   The block view keys on a node id per action call (translate.js). At
   run time an `actions.sendEmail(...)` call carries no source span, so
   the runtime can't know which block lit up. This rewrites each
   `actions.X(args)` into `actions.__trace("&lt;nodeId&gt;","X", args)` — the
   SAME nodeId translate.js assigns — so the injected `__trace` dispatcher
   reports which block is executing and the run animation follows along.

   Function declarations and assigned function/arrow expressions also receive
   a tiny `actions.__function(id, name)` entry hook. It runs every time the
   function is entered, so three calls to one helper animate the SAME function
   block three times instead of only lighting whatever nested action it owns.

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

function children(node) {
  const out = [];
  const c = node.node.cursor();
  if (!c.firstChild()) return out;
  do { out.push(c.node); } while (c.nextSibling());
  return out;
}

function nodeText(source, node) {
  return node ? source.slice(node.from, node.to) : '';
}

/**
 * Rewrite each recognized `actions.X(...)` call and function entry so they
 * self-report their block ids.
 *
 * @returns {{ code: string, calls: Array, functions: Array }}
 *   code — the instrumented source, semantically identical except each contract
 *          call routes through `actions.__trace(id, name, …originalArgs)` and
 *          function bodies begin with `actions.__function(id, name)`.
 *   calls — the calls that were tagged (for preflight / gating).
 *   functions — function-entry hooks (for presentation only, never gating).
 *
 * Never throws; on a parse failure returns the input unchanged with no calls.
 */
export function instrument(source) {
  const src = String(source ?? '');
  let tree;
  try { tree = parser.parse(src); } catch { return { code: src, calls: [], functions: [] }; }

  const edits = []; // { pos, remove, insert }
  const calls = [];
  const functions = [];

  const instrumentFunction = (stmt, fnNode, assignedName = '') => {
    const fnKids = children(fnNode);
    const ownName = fnKids.find((n) => n.name === 'VariableDefinition');
    const name = assignedName || nodeText(src, ownName) || 'anonymous';
    const id = nodeId(stmt.from, stmt.to);
    const body = childByName(fnNode, 'Block');
    const hook = `actions.__function(${JSON.stringify(id)},${JSON.stringify(name)})`;
    functions.push({ id, name, from: stmt.from, to: stmt.to });
    if (body) {
      edits.push({ pos: body.from + 1, remove: 0, insert: `\n${hook};` });
      return;
    }

    // Implicit-return arrow: `x => expr` → `x => (hook(), expr)`.
    const arrow = childByName(fnNode, 'Arrow');
    const expr = arrow
      ? fnKids.find((n) => n.from >= arrow.to && n.name !== ';')
      : null;
    if (expr) {
      edits.push({ pos: expr.from, remove: 0, insert: `(${hook},` });
      edits.push({ pos: expr.to, remove: 0, insert: ')' });
    }
  };

  tree.iterate({
    enter: (ref) => {
      if (ref.name === 'FunctionDeclaration') {
        instrumentFunction(ref, ref);
        return undefined;
      }

      if (ref.name === 'VariableDeclaration') {
        const fnNode = childByName(ref, ['ArrowFunction', 'FunctionExpression']);
        if (fnNode) {
          const def = childByName(ref, 'VariableDefinition');
          instrumentFunction(ref, fnNode, nodeText(src, def));
        }
        return undefined;
      }

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

  if (!edits.length) return { code: src, calls, functions };

  // Apply from the end so earlier offsets stay valid.
  // A replacement at the same position must run before an insertion (an
  // implicit arrow can begin with an action call), otherwise the replacement
  // would consume the newly inserted function hook.
  edits.sort((a, b) => (b.pos - a.pos) || ((b.remove || 0) - (a.remove || 0)));
  let code = src;
  for (const e of edits) {
    code = code.slice(0, e.pos) + e.insert + code.slice(e.pos + e.remove);
  }
  return { code, calls, functions };
}
