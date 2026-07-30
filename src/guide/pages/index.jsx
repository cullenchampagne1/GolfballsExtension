import { StartPage } from './start.jsx';
import { PopupPage } from './popup.jsx';
import { SettingsPage } from './settings.jsx';
import { TemplatesPage } from './templates.jsx';
import { WatchListPage, TasksPage, QuickTaskCreatePage, CallsPage, CalendarPage } from './organize.jsx';
import { SearchPage, QBPage, NewPage } from './crm.jsx';
import { ThemesPage, ShortcutsPage } from './config.jsx';
import { ChargePage, ProofPage, MarginPage, OrderExtrasPage } from './ordertools.jsx';
import { EmailViewerPage, ImageViewerPage, Viewer3DPage } from './viewers.jsx';
import { CatalogPage, ProposalsPage } from './catalog.jsx';
import { QuickSendPage, WorkflowManagerPage } from './workflows.jsx';
import { TroubleshootingPage, FaqPage, PowerUserPage, WhatsNewPage } from './reference.jsx';
import { ManualPage, WorkflowsPage } from './reference-content.jsx';
import { NotificationsPage } from './notifications.jsx';
import { CRMWorkspacesPage } from './workspaces.jsx';

/* Route → page component. Every route has a bespoke, hand-built page that
   visually reproduces the real modal/surface (live snippets + TourBox deep
   explanations), matching the Settings and Email Templates reference pages. */
export const PAGES = {
  start: StartPage,
  workflows: WorkflowsPage,
  popup: PopupPage,
  notifications: NotificationsPage,
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
  'crm-workspaces': CRMWorkspacesPage,
  themes: ThemesPage,
  shortcuts: ShortcutsPage,
  charge: ChargePage,
  proof: ProofPage,
  margin: MarginPage,
  'order-extras': OrderExtrasPage,
  'viewer-email': EmailViewerPage,
  'viewer-image': ImageViewerPage,
  'viewer-3d': Viewer3DPage,
  catalog: CatalogPage,
  proposals: ProposalsPage,
  quicksend: QuickSendPage,
  'workflow-manager': WorkflowManagerPage,
  manual: ManualPage,
  troubleshooting: TroubleshootingPage,
  faq: FaqPage,
  power: PowerUserPage,
  whatsnew: WhatsNewPage,
};
