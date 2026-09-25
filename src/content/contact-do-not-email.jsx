import { crmUpdateContact } from '../lib/crmContactApi.js';
import { mountContactDoNotEmail } from '../lib/contactDoNotEmail.js';

mountContactDoNotEmail({ updateContact: crmUpdateContact });
