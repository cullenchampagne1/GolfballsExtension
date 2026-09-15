import { normalizeImportedWorkflow } from './workflowImport.js';

export const MANAGED_WORKFLOW_KIND = 'revstack-managed-workflow';

const clone = (value) => JSON.parse(JSON.stringify(value));

export function shareableWorkflow(workflow) {
  const safe = clone(workflow || {});
  for (const key of ['id', 'lastSaved', 'managedWorkflow', 'managedWorkflowEnrollment']) delete safe[key];
  return safe;
}

export function workflowsFromShare(share) {
  const rows = share?.scopes?.workflows?.workflows;
  if (!Array.isArray(rows) || rows.length < 1) {
    throw new Error('This link does not contain a workflow');
  }
  return rows.map((row, index) => normalizeImportedWorkflow(row, index));
}

export function managedWorkflow(workflow) {
  const meta = workflow?.managedWorkflow;
  return meta?.kind === MANAGED_WORKFLOW_KIND && meta.bucketId ? meta : null;
}

export function allowLocalWorkflowUsage(settings = {}) {
  return settings?.['emailTemplates.allowParentAccount'] === true
    || settings?.['workflows.allowLocalUsage'] !== false;
}

export function filterWorkflowLibrary(workflows, settings = {}) {
  const list = Array.isArray(workflows) ? workflows : [];
  return allowLocalWorkflowUsage(settings)
    ? list
    : list.filter((workflow) => !!managedWorkflow(workflow));
}

export function setWorkflowBucketEnrollment(workflow, enrolled) {
  const next = { ...workflow };
  if (enrolled) next.managedWorkflowEnrollment = true;
  else delete next.managedWorkflowEnrollment;
  return next;
}

export function reconcileWorkflowBucket(existing, bucket) {
  const list = Array.isArray(existing) ? existing : [];
  const rows = Array.isArray(bucket?.workflows) ? bucket.workflows : [];
  const byBucket = new Map(list.map((item) => [managedWorkflow(item)?.bucketId, item]).filter(([id]) => id));
  const ordinary = list.filter((item) => !managedWorkflow(item));
  const managed = rows.map((item) => {
    let previous = byBucket.get(String(item.id));
    if (!previous && item.created_by_current) {
      previous = ordinary.find((row) => String(row.id) === String(item.client_workflow_id));
      if (previous) ordinary.splice(ordinary.indexOf(previous), 1);
    }
    return {
      ...(item.workflow || {}),
      id: previous?.id || `managed_${item.id}`,
      lastSaved: previous?.lastSaved || null,
      managedWorkflow: {
        kind: MANAGED_WORKFLOW_KIND,
        bucketId: String(item.id),
        clientWorkflowId: String(item.client_workflow_id || previous?.id || ''),
        version: Math.max(1, Number(item.version) || 1),
        snapshot: clone(item.workflow || {}),
        createdBy: String(item.created_by || 'Management'),
        lastEditor: String(item.last_editor || item.created_by || 'Management'),
        createdByCurrent: item.created_by_current === true,
        editable: bucket?.is_parent === true,
        updatedAt: String(item.updated_at || ''),
      },
    };
  });
  return [...ordinary, ...managed];
}

export function workflowBucketWrite(workflow) {
  const meta = managedWorkflow(workflow);
  return {
    ...(meta?.bucketId ? { bucket_id: meta.bucketId } : {}),
    client_workflow_id: String(meta?.clientWorkflowId || workflow.id),
    base_version: Number(meta?.version || 0),
    ...(meta?.snapshot ? { base_workflow: clone(meta.snapshot) } : {}),
    workflow: shareableWorkflow(workflow),
  };
}
