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
import { QuickSendPage, CampaignsPage } from './campaigns.jsx';
import { TroubleshootingPage, FaqPage, PowerUserPage, WhatsNewPage } from './reference.jsx';

/* Route → page component. Every route has a bespoke, hand-built page that
   visually reproduces the real modal/surface (live snippets + TourBox deep
   explanations), matching the Settings and Email Templates reference pages. */
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
  campaigns: CampaignsPage,
  troubleshooting: TroubleshootingPage,
  faq: FaqPage,
  power: PowerUserPage,
  whatsnew: WhatsNewPage,
};
