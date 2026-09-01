/** Pure state helpers shared by the email-template variable editor UI. */

export function variableEditorKinds(typeId, kindsByType) {
  return [...new Set([...(kindsByType?.[typeId] || []), 'attachment'])];
}

export function updateVariableDefinition(variables, oldName, updated) {
  return (Array.isArray(variables) ? variables : []).map((variable) => (
    variable.name === oldName
      ? {
          ...variable,
          ...updated,
          smart: variable.smart || {},
          resolved: null,
          status: 'miss',
        }
      : variable
  ));
}

/** Preserve smart options when the editor sends a transient variable
 * definition to the live CRM-page resolver. */
export function variableDefinitionForLiveResolution(definition, variable) {
  return {
    ...(definition || {}),
    smart: { ...((variable && variable.smart) || {}) },
  };
}

/** Smart-only edits must invalidate the live preview just like source edits. */
export function variableLiveResolutionSignature(variables) {
  return JSON.stringify((Array.isArray(variables) ? variables : []).map((variable) => ({
    name: variable?.name || '',
    kind: variable?.kind || '',
    config: variable?.config ?? '',
    source: variable?.source || '',
    group: variable?.group ?? '',
    scope: variable?.scope || '',
    async: !!variable?.async,
    attach: variable?.attach || null,
    smart: variable?.smart || {},
  })));
}
