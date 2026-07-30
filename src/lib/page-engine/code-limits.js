/* Shared source/body bounds for every code-engine execution surface.
 *
 * Workflow programs are wrapped with the sandbox recorder before execution,
 * which adds roughly 3–4 KiB to the saved source. The old 8 KiB body cap
 * therefore rejected otherwise valid ~5 KiB workflows. A 64 KiB ceiling keeps
 * the paste-bomb guard while leaving enough room for real multi-function
 * automations and their instrumentation.
 */
export const MAX_CODE_BODY_LENGTH = 64 * 1024;

export function codeBodyLengthError(body) {
  if (typeof body !== 'string') return 'code body must be a string';
  if (body.length > MAX_CODE_BODY_LENGTH) {
    return `code body exceeds ${MAX_CODE_BODY_LENGTH} characters`;
  }
  return null;
}
