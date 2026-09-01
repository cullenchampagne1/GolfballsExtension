import { renderTemplate } from './variableResolution.js';

export const ORIGINAL_EMAIL_VARIATION_ID = '__original';

export function templatesForEmailPreview(templates, pageType) {
  const list = Array.isArray(templates) ? templates : [];
  if (pageType === 'order') {
    return list.filter((template) => template.type === 'order' || template.type === 'email' || !template.type);
  }
  if (pageType === 'account' || pageType === 'contact') {
    return list.filter((template) => template.type === 'account');
  }
  return [];
}

export function selectEmailPreviewVariation(template, variationId) {
  if (!template || !variationId || variationId === ORIGINAL_EMAIL_VARIATION_ID) return null;
  return (Array.isArray(template.variations) ? template.variations : [])
    .find((variation) => variation.id === variationId) || null;
}

export function buildEmailCreationPreview(template, variationId, resolvedVars = {}, toEmail = '') {
  if (!template) return null;
  const variation = selectEmailPreviewVariation(template, variationId);
  const subjectSource = variation?.subject || template.subject || '';
  const bodySource = variation?.body || template.body || '';
  return {
    to: String(toEmail || ''),
    subject: renderTemplate(subjectSource, resolvedVars, template.vars || {}),
    htmlBody: renderTemplate(bodySource, resolvedVars, template.vars || {}),
    templateId: template.id || '',
    templateName: template.name || '',
    variationId: variation?.id || ORIGINAL_EMAIL_VARIATION_ID,
  };
}
