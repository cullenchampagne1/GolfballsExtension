/** One-time acknowledgement state for the installation identity callout. */
export const IDENTITY_NOTICE_KEY = 'gbInstallationIdentityNoticeV1';

export function identityNoticeSignature(identity) {
  if (!identity?.registered) return '';
  return [identity.installationId, identity.updatedAt, identity.displayName]
    .map((value) => String(value || '').trim())
    .join('|');
}

export function shouldShowIdentityConfirmation(identity, acknowledgedSignature) {
  const signature = identityNoticeSignature(identity);
  return !!signature && signature !== String(acknowledgedSignature || '');
}

/**
 * Network availability is deliberately absent from this decision. Until a
 * cached or freshly loaded identity exists there is no notice to render.
 */
export function installationIdentityNoticeView(
  identity,
  acknowledgedSignature,
  ready = true,
) {
  if (!ready || !identity) return 'hidden';
  if (!identity.registered) return 'prompt';
  return shouldShowIdentityConfirmation(identity, acknowledgedSignature)
    ? 'confirmation'
    : 'hidden';
}
