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
/**
 * renderTemplate(template, resolved, defs?)
 *
 * Substitutes `{{name}}` placeholders against `resolved`. Supports
 * the OR-block syntax `{{var1|var2|var3}}` — the substitution falls
 * through the pipe-separated candidates in order and returns the
 * first non-empty value. When none resolve, the original `{{...}}`
 * passes through so the sender notices a missing variable instead
 * of getting a silent blank.
 *
 * When `defs` is supplied, `dropConditional` runs first so
 * `smart.conditional` placeholders with empty values strip their
 * surrounding sentence / line / paragraph before substitution. The
 * conditional check looks up each candidate name independently —
 * an OR-block is "empty for conditional purposes" only when EVERY
 * candidate resolved empty.
 *
 * @param {string} template — raw text with {{var}} / {{a|b}} placeholders
 * @param {Record<string,string>} resolved — resolved values keyed by name
 * @param {Record<string,object>=} defs — variable definitions (optional)
 * @returns {string}
 */
export function renderTemplate(template, resolved, defs) {
  if (template == null) return '';
  const text = defs ? dropConditional(template, defs, resolved) : String(template);
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (orig, raw) => {
    /* Pipe-separated candidates. Each gets trimmed; empty parts are
       dropped (so `{{|x}}` collapses to `{{x}}` rather than rolling
       a stray empty pick into a no-op match). */
    const names = String(raw).split('|').map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) return orig;
    for (const name of names) {
      const v = resolved?.[name];
      if (v != null && String(v).length > 0) return v;
    }
    /* No candidate resolved — surface the original placeholder so
       the rep sees something is missing rather than emitting an
       awkward blank. Matches the legacy single-var behavior. */
    return orig;
  });
}

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
