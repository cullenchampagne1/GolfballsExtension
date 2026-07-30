import { codeBodyLengthError } from './code-limits.js';

/* Shared tripwires for both direct Node compilation and the browser sandbox.
   This is intentionally one list: an action must receive the same verdict in
   the editor, tests, and the live sandbox. */
const BLOCKED_PATTERNS = [
  { re: /\bwhile\s*\(\s*true\s*\)/i, reason: 'infinite while loop' },
  { re: /\bfor\s*\(\s*;\s*;\s*\)/, reason: 'infinite for loop' },
  { re: /\bfetch\s*\(/, reason: 'use h.fetchJson / h.fetchText instead of fetch()' },
  { re: /\bchrome\b/, reason: 'chrome APIs not allowed' },
  { re: /\bimport\s*\(/, reason: 'dynamic import not allowed' },
  { re: /\beval\s*\(/, reason: 'eval not allowed' },
  { re: /\bFunction\s*\(/, reason: 'Function constructor not allowed' },
  { re: /\bsetTimeout\s*\(/, reason: 'setTimeout not allowed' },
  { re: /\bsetInterval\s*\(/, reason: 'setInterval not allowed' },
  { re: /\bnew\s+Worker\b/, reason: 'Worker not allowed' },
  { re: /\bXMLHttpRequest\b/, reason: 'XHR not allowed' },
  {
    re: /\b(?:window|globalThis|parent|top|opener|postMessage)\b/,
    reason: 'ambient window access not allowed',
  },
];

/** Return the first static validation problem, or null when execution is safe
 *  to hand to the sandbox. */
export function staticCheckCodeBody(body) {
  const lengthIssue = codeBodyLengthError(body);
  if (lengthIssue) return lengthIssue;
  for (const { re, reason } of BLOCKED_PATTERNS) {
    if (re.test(body)) return `blocked: ${reason}`;
  }
  return null;
}

/** Throw the same message returned by staticCheckCodeBody. */
export function assertCodeBodyAllowed(body) {
  const issue = staticCheckCodeBody(body);
  if (issue) throw new Error(issue);
}
