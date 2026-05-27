/* ───────────────────────────────────────────────────────────────
   variableResolution.js — shared template-variable helpers.

   The popup (React) and the content script (vanilla) both need to
   resolve template variables and drop sentences containing unresolved
   conditional placeholders. The popup imports from here directly;
   the vanilla content script keeps a parallel copy because it can't
   ESM-import inside a manifest-listed content script. This file is
   the canonical version — keep them in sync.
─────────────────────────────────────────────────────────────── */

/**
 * dropConditional(template, defs, resolved)
 *
 * Strips any block (sentence / line / paragraph, per `def.smart.conditionalScope`)
 * that contains a variable placeholder whose resolved value is empty AND
 * whose definition has `smart.conditional = true`. Used so opt-in conditional
 * vars don't leak `{{name}}` or "Hi ," style fragments into the rendered text.
 *
 * Call BEFORE the final `.replace(/\{\{...\}\}/g, …)` substitution pass.
 *
 * @param {string} template — raw text with {{var}} placeholders
 * @param {Record<string, { smart?: { conditional?: boolean, conditionalScope?: 'sentence'|'line'|'paragraph' } }>} defs
 *        — variable definitions keyed by name
 * @param {Record<string, string>} resolved — resolved values keyed by name
 * @returns {string}
 */
export function dropConditional(template, defs, resolved) {
  if (!template || !defs) return template || '';
  let out = String(template);
  for (const [name, def] of Object.entries(defs)) {
    const smart = def && def.smart;
    if (!smart || !smart.conditional) continue;
    const val = resolved ? resolved[name] : '';
    if (val != null && String(val).length > 0) continue;
    const placeholder = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const scope = smart.conditionalScope || 'sentence';
    let rx;
    if (scope === 'paragraph') {
      rx = new RegExp(`[^\\n]*\\{\\{\\s*${placeholder}\\s*\\}\\}[^\\n]*(\\n\\n|\\n?$)`, 'g');
    } else if (scope === 'line') {
      rx = new RegExp(`[^\\n]*\\{\\{\\s*${placeholder}\\s*\\}\\}[^\\n]*\\n?`, 'g');
    } else {
      // Sentence: from the prior boundary (.!?¶ start) up to and including
      // the next sentence-ending punctuation. Lookbehind keeps the trailing
      // punctuation of the PREVIOUS sentence intact.
      rx = new RegExp(`(?:^|(?<=[.!?\\n]))\\s*[^.!?\\n]*\\{\\{\\s*${placeholder}\\s*\\}\\}[^.!?\\n]*[.!?]?\\s*`, 'g');
    }
    out = out.replace(rx, '');
  }
  return out;
}
