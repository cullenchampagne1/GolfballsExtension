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
