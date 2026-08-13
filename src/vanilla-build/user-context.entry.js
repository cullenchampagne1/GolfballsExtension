/**
 * Restore the bounded CRM user context before the heavier page surfaces mount.
 * The cached pair is presentation data only; a fresh authenticated iframe
 * broadcast upgrades `sessionVerified` after login and continues refreshing
 * the durable cache on its normal cadence.
 */
import { resolveCurrentUserContext } from '../lib/employeeIdentity.js';

resolveCurrentUserContext().catch(() => {});
