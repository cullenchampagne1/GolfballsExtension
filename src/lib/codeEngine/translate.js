/* ───────────────────────────────────────────────────────────────
   codeEngine/translate — code → block IR.

   Walks the @lezer/javascript syntax tree (the SAME parser the code box
   uses for highlighting, so no runtime parser and no CSP issue) into a
   block tree the editor renders and the run animation lights up:

     await actions.X(args)   → action block   (kind:'action', contract:'X')
     if / else               → branch block   (then[]/else[] children)
     for / for-of / while     → loop block     (body[] children)
     switch                  → cases block    (cases[{test, body[]}])
     anything else            → code block     (raw source, still executed)

   Code is the SOURCE OF TRUTH; the block tree is a one-directional
   projection. Every block carries a stable `id` derived from its source
   span so the run trace can key on it.

   Pure: parses a string, returns a plain tree. No DOM, no execution.
─────────────────────────────────────────────────────────────── */

import { parser } from '@lezer/javascript';
import { contractFor } from './contracts.js';

/** Stable id from a node's source span — survives re-parse of unchanged code. */
const nodeId = (from, to) => `n${from}_${to}`;

const slice = (src, from, to) => src.slice(from, to);

/** First direct child cursor matching one of `names`, else null. */
function childByName(node, names) {
  const set = new Set(Array.isArray(names) ? names : [names]);
  const c = node.node.cursor();
  if (!c.firstChild()) return null;
  do {
    if (set.has(c.name)) return c.node;
  } while (c.nextSibling());
  return null;
}

/** All direct children (as nodes) — cheap array for iteration. */
function children(node) {
  const out = [];
  const c = node.node.cursor();
  if (!c.firstChild()) return out;
  do { out.push(c.node); } while (c.nextSibling());
  return out;
}

/**
 * If `node` is `actions.NAME(...)` (optionally awaited / assigned), return
 * `{ contract, argText }`; else null. This is what turns a call into a typed
 * action block instead of an opaque code block.
 */
function asActionCall(src, node) {
  let call = node;
  if (call.name === 'AwaitExpression') call = childByName(call, 'CallExpression') || call;
  if (call.name !== 'CallExpression') return null;
  const member = childByName(call, 'MemberExpression');
  if (!member) return null;
  const memberText = slice(src, member.from, member.to);
  const match = memberText.match(/^actions\s*\.\s*([A-Za-z_$][\w$]*)$/);
  if (!match) return null;
  const contract = contractFor(match[1]);
  if (!contract) return null;
  const args = childByName(call, 'ArgList');
  return {
    contract: contract.name,
    argText: args ? slice(src, args.from + 1, args.to - 1).trim() : '',
    // The block id keys on the CALL node so it matches instrument.js exactly
    // (the statement span differs — it includes `await`/`const … =`).
    callFrom: call.from,
    callTo: call.to,
  };
}

/** Statement node → one block (recursing into branch/loop/switch bodies). */
function statementToBlock(src, stmt) {
  const id = nodeId(stmt.from, stmt.to);
  const text = slice(src, stmt.from, stmt.to);

  // A comment is its own block kind — rendered as a note, not a step.
  if (stmt.name === 'LineComment' || stmt.name === 'BlockComment') {
    return { id, kind: 'comment', text };
  }

  // An expression statement whose expression is an action call → action block.
  if (stmt.name === 'ExpressionStatement' || stmt.name === 'VariableDeclaration') {
    const expr = stmt.name === 'ExpressionStatement'
      ? children(stmt)[0]
      : (() => {
        // const y = await actions.X(...) — find the initializer expression.
        const eq = children(stmt).find((n) => n.name === 'Equals');
        if (!eq) return null;
        const after = children(stmt).filter((n) => n.from >= eq.to);
        return after.find((n) => n.name === 'AwaitExpression' || n.name === 'CallExpression') || null;
      })();
    const action = expr ? asActionCall(src, expr) : null;
    if (action) {
      const assignTo = stmt.name === 'VariableDeclaration'
        ? (childByName(stmt, 'VariableDefinition') && slice(src,
          childByName(stmt, 'VariableDefinition').from, childByName(stmt, 'VariableDefinition').to)) || null
        : null;
      return {
        id: nodeId(action.callFrom, action.callTo),
        kind: 'action', contract: action.contract, argText: action.argText,
        assignTo, text,
      };
    }
    // A non-action `const/let/var x = …` → a distinct "set variable" block.
    if (stmt.name === 'VariableDeclaration') {
      const def = childByName(stmt, 'VariableDefinition');
      const name = def ? slice(src, def.from, def.to) : '';
      const eq = children(stmt).find((n) => n.name === 'Equals');
      const valueText = eq ? slice(src, eq.to, stmt.to).replace(/;\s*$/, '').trim() : '';
      return { id, kind: 'setVar', name, valueText, text };
    }
  }

  if (stmt.name === 'IfStatement') return ifToBlock(src, stmt, id, text);
  if (stmt.name === 'ForStatement' || stmt.name === 'WhileStatement'
      || stmt.name === 'DoStatement') {
    return loopToBlock(src, stmt, id, text);
  }
  if (stmt.name === 'SwitchStatement') return switchToBlock(src, stmt, id, text);

  return { id, kind: 'code', text };
}

/** Block body (a { … } Block node, or a single statement) → block[]. */
function blockBody(src, node) {
  if (!node) return [];
  if (node.name === 'Block') {
    return children(node)
      .filter((n) => n.name !== '{' && n.name !== '}')
      .map((n) => statementToBlock(src, n));
  }
  return [statementToBlock(src, node)];
}

function ifToBlock(src, stmt, id, text) {
  const cond = childByName(stmt, 'ParenthesizedExpression');
  const kids = children(stmt);
  // The consequent is the first Block/statement after the condition; the
  // alternate follows an `else` keyword.
  const elseKw = kids.find((n) => n.name === 'else');
  const bodies = kids.filter((n) => (n.name === 'Block' || /Statement$/.test(n.name)) && n.name !== 'IfStatement'
    || n.name === 'IfStatement');
  const thenNode = kids.find((n) => n.from >= (cond ? cond.to : stmt.from)
    && (n.name === 'Block' || /Statement$/.test(n.name)));
  const elseNode = elseKw
    ? kids.find((n) => n.from >= elseKw.to && (n.name === 'Block' || /Statement$/.test(n.name)))
    : null;
  void bodies;
  return {
    id,
    kind: 'branch',
    condText: cond ? slice(src, cond.from + 1, cond.to - 1).trim() : '',
    then: blockBody(src, thenNode),
    else: elseNode ? blockBody(src, elseNode) : [],
  };
}

function loopToBlock(src, stmt, id) {
  // Lezer models every for-loop as `ForStatement` and distinguishes the form by
  // its spec child: ForSpec (C-style), ForOfSpec (for-of), ForInSpec (for-in).
  const spec = childByName(stmt, ['ForOfSpec', 'ForInSpec', 'ForSpec', 'ParenthesizedExpression']);
  const specName = spec ? spec.name : '';
  const forEach = specName === 'ForOfSpec' || specName === 'ForInSpec';
  const body = children(stmt).find((n) => n.name === 'Block' || /Statement$/.test(n.name));
  return {
    id,
    kind: 'loop',
    loopKind: stmt.name === 'WhileStatement' || stmt.name === 'DoStatement'
      ? 'while' : forEach ? 'forEach' : 'for',
    headText: spec ? slice(src, spec.from, spec.to).replace(/^\(|\)$/g, '').trim() : '',
    body: blockBody(src, body),
  };
}

function switchToBlock(src, stmt, id) {
  const disc = childByName(stmt, 'ParenthesizedExpression');
  const body = childByName(stmt, 'SwitchBody') || childByName(stmt, 'Block');
  const cases = [];
  if (body) {
    let current = null;
    for (const n of children(body)) {
      if (n.name === 'CaseLabel' || n.name === 'DefaultLabel') {
        const label = slice(src, n.from, n.to).replace(/^case\s*/, '').replace(/:$/, '').trim();
        current = { id: nodeId(n.from, n.to), test: n.name === 'DefaultLabel' ? null : label, body: [] };
        cases.push(current);
      } else if (current && n.name !== '{' && n.name !== '}') {
        current.body.push(statementToBlock(src, n));
      }
    }
  }
  return {
    id,
    kind: 'cases',
    onText: disc ? slice(src, disc.from + 1, disc.to - 1).trim() : '',
    cases,
  };
}

/**
 * Translate a program string into a block IR.
 *
 * @returns {{ blocks: object[], actions: string[], errors: object[] }}
 *   blocks — the top-level block list (each may nest then/else/body/cases)
 *   actions — the distinct contract names the program calls (for gating/preflight)
 *   errors — syntax error spans from the parser (never throws)
 */
export function translateProgram(source) {
  const src = String(source ?? '');
  const errors = [];
  let tree;
  try {
    tree = parser.parse(src);
  } catch (error) {
    return { blocks: [], actions: [], errors: [{ message: error?.message || 'parse failed', from: 0, to: src.length }] };
  }
  // Collect parser error nodes (⚠) so the caller can surface them.
  tree.iterate({
    enter: (n) => {
      if (n.type.isError) errors.push({ message: 'Syntax error', from: n.from, to: n.to });
    },
  });

  const script = tree.topNode;
  const blocks = children(script)
    .filter((n) => n.name !== '⚠')
    .map((n) => statementToBlock(src, n));

  const actions = [];
  const collect = (list) => {
    for (const b of list) {
      if (b.kind === 'action' && !actions.includes(b.contract)) actions.push(b.contract);
      if (b.then) collect(b.then);
      if (b.else) collect(b.else);
      if (b.body) collect(b.body);
      if (b.cases) for (const c of b.cases) collect(c.body);
    }
  };
  collect(blocks);

  return { blocks, actions, errors };
}

/** Flatten the block tree to `{id, kind, contract?}` — for trace-key mapping. */
export function flattenBlocks(blocks) {
  const out = [];
  const walk = (list) => {
    for (const b of list) {
      out.push({ id: b.id, kind: b.kind, contract: b.contract });
      if (b.then) walk(b.then);
      if (b.else) walk(b.else);
      if (b.body) walk(b.body);
      if (b.cases) for (const c of b.cases) walk(c.body);
    }
  };
  walk(blocks);
  return out;
}
