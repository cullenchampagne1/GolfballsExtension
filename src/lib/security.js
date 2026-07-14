/**
 * ESM facade over the classic security-policy.js runtime.
 * Background code consumes the same policy through importScripts().
 */
import '../../security-policy.js';

const policy = globalThis.GBSecurity;

if (!policy) throw new Error('Golfballs security policy failed to initialize');

export const {
  isAllowedFetchUrl,
  isCalendarUrl,
  isChargeRequest,
  isCrmCallLogUrl,
  isMailtoUrl,
  isPowerAutomateUrl,
  isProductUrl,
  parseHttpsUrl,
} = policy;

export default policy;
