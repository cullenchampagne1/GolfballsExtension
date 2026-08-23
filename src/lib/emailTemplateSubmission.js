export const EMAIL_TEMPLATE_SUBMISSION_KIND = 'revstack-email-template-submission';
export const EMAIL_TEMPLATE_SUBMISSION_KEY = 'templateSubmission';

export function emailTemplateSubmission(template) {
  const value = template?.[EMAIL_TEMPLATE_SUBMISSION_KEY];
  return value?.kind === EMAIL_TEMPLATE_SUBMISSION_KIND
    && typeof value.submissionId === 'string' ? value : null;
}

export function submissionEditorTemplate(submission, isParent = false) {
  if (!submission?.id || !submission?.template) return null;
  const template = JSON.parse(JSON.stringify(submission.template));
  template.id = `submission_${String(submission.id).replace(/[^A-Za-z0-9_-]/g, '')}`;
  template[EMAIL_TEMPLATE_SUBMISSION_KEY] = {
    kind: EMAIL_TEMPLATE_SUBMISSION_KIND,
    submissionId: String(submission.id),
    version: Math.max(1, Number(submission.version) || 1),
    status: submission.status === 'approved' ? 'approved' : 'pending',
    submitterName: String(submission.submitter_name || 'Unregistered installation'),
    lastEditor: String(submission.last_editor || ''),
    approvedBucketId: String(submission.approved_bucket_id || ''),
    isParent: isParent === true,
    submittedByCurrent: submission.submitted_by_current === true,
    updatedAt: String(submission.updated_at || ''),
  };
  return template;
}

export function submissionTemplateDocument(template) {
  const next = JSON.parse(JSON.stringify(template || {}));
  delete next.id;
  delete next.folderId;
  delete next[EMAIL_TEMPLATE_SUBMISSION_KEY];
  delete next.managedTemplate;
  delete next.managedTemplateEnrollment;
  delete next.shareImport;
  delete next.shareSync;
  delete next.createdAt;
  delete next.updatedAt;
  return next;
}
