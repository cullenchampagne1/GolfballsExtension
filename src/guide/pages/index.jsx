import { StartPage } from './start.jsx';
import { PopupPage } from './popup.jsx';
import { SettingsPage } from './settings.jsx';
import { TemplatesPage } from './templates.jsx';
import { WatchListPage, TasksPage, QuickTaskCreatePage, CallsPage, CalendarPage } from './organize.jsx';
import { SearchPage, QBPage, NewPage } from './crm.jsx';

/* Route → page component. Routes without an entry render the styled
   WipPage placeholder — add pages here as they're built. */
export const PAGES = {
  start: StartPage,
  popup: PopupPage,
  settings: SettingsPage,
  templates: TemplatesPage,
  watchlist: WatchListPage,
  tasks: TasksPage,
  quicktask: QuickTaskCreatePage,
  calls: CallsPage,
  calendar: CalendarPage,
  'crm-search': SearchPage,
  'crm-query': QBPage,
  'crm-new': NewPage,
};
