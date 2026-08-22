/* Managed capability helpers for every email-template surface.
 *
 * A missing value means the rollout default (allowed). Remote policy writes
 * the effective values into devSettings, so consumers only need one strict
 * rule: an explicit false closes the capability. Local templates are never
 * deleted here; they are projected out while usage is disabled so restoring
 * the policy restores the user's library intact.
 */

export const EMAIL_TEMPLATE_CAPABILITY_KEYS = Object.freeze({
  allowCreation: 'emailTemplates.allowCreation',
  allowLinkImport: 'emailTemplates.allowLinkImport',
  allowBulkSending: 'emailTemplates.allowBulkSending',
  allowLocalTemplateUsage: 'emailTemplates.allowLocalTemplateUsage',
  allowParentAccount: 'emailTemplates.allowParentAccount',
});

export function resolveEmailTemplateCapabilities(devSettings = {}) {
  const settings = devSettings && typeof devSettings === 'object' && !Array.isArray(devSettings)
    ? devSettings
    : {};
  return Object.freeze(Object.fromEntries(
    Object.entries(EMAIL_TEMPLATE_CAPABILITY_KEYS)
      .map(([name, key]) => [
        name,
        name === 'allowParentAccount' ? settings[key] === true : settings[key] !== false,
      ]),
  ));
}
export function filterLocalEmailTemplates(templates, devSettings = {}) {
  const all = Array.isArray(templates) ? templates : [];
  const capabilities = resolveEmailTemplateCapabilities(devSettings);
  if (capabilities.allowParentAccount) return all;
  if (capabilities.allowLocalTemplateUsage) {
    return all.filter((template) => !isManagedEmailTemplate(template));
  }
  return all.filter((template) => isManagedEmailTemplate(template) || !!template?.shareImport);
}

export function managedEmailTemplate(template) {
  const source = template?.managedTemplate;
  return source?.kind === 'revstack-managed-email-template'
    && typeof source.bucketId === 'string' ? source : null;
}

export function isManagedEmailTemplate(template) {
  return !!managedEmailTemplate(template);
}

export function emailTemplateIsEditable(template, devSettings = {}) {
  if (template?.shareImport) return false;
  const managed = managedEmailTemplate(template);
  if (managed) return resolveEmailTemplateCapabilities(devSettings).allowParentAccount
    && managed.editable === true;
  return resolveEmailTemplateCapabilities(devSettings).allowLocalTemplateUsage;
}

export function readEmailTemplateCapabilities(storage = globalThis.chrome?.storage?.local) {
  return new Promise((resolve) => {
    if (!storage?.get) {
      resolve(resolveEmailTemplateCapabilities());
      return;
    }
    let settled = false;
    const finish = (stored = {}) => {
      if (settled) return;
      settled = true;
      resolve(resolveEmailTemplateCapabilities(stored?.devSettings));
    };
    try {
      const pending = storage.get('devSettings', finish);
      if (pending?.then) pending.then(finish, () => finish());
    } catch {
      finish();
    }
  });
}
