import { StartPage } from './start.jsx';
import { PopupPage } from './popup.jsx';
import { SettingsPage } from './settings.jsx';
import { TemplatesPage } from './templates.jsx';

/* Route → page component. Routes without an entry render the styled
   WipPage placeholder — add pages here as they're built. */
export const PAGES = {
  start: StartPage,
  popup: PopupPage,
  settings: SettingsPage,
  templates: TemplatesPage,
};
