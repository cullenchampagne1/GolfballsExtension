import * as subjectTracking from '../lib/emailSubjectTracking.js';
import { createEmailTemplateTrackingStore } from '../lib/emailTemplateTrackingStore.js';

globalThis.GBEmailSubjectTracking = Object.freeze(subjectTracking);
globalThis.GBEmailTemplateTracking = createEmailTemplateTrackingStore();

