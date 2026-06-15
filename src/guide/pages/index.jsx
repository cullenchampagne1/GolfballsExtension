import { StartPage } from './start.jsx';
import { PopupPage } from './popup.jsx';
import { SettingsPage } from './settings.jsx';
import { TemplatesPage } from './templates.jsx';
import { WatchListPage, TasksPage, QuickTaskCreatePage, CallsPage, CalendarPage } from './organize.jsx';
import { SearchPage, QBPage, NewPage } from './crm.jsx';
import { makeArticlePage } from './article-page.jsx';

/* Route → page component. Bespoke live-stage pages are imported above;
   every other route renders the verified manual through the generic
   ArticlePage (article-page.jsx), so the whole help menu is complete
   and identically themed — no WIP placeholders. Add a bespoke page here
   to override the generic one for a route. */
const ARTICLE_ROUTES = [
  'charge', 'proof', 'themes', 'shortcuts',
  'viewer-email', 'viewer-image', 'viewer-3d', 'margin', 'order-extras',
  'catalog', 'proposals', 'quicksend', 'campaigns',
  'troubleshooting', 'faq', 'power', 'whatsnew',
];

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
  ...Object.fromEntries(ARTICLE_ROUTES.map((id) => [id, makeArticlePage(id)])),
};
