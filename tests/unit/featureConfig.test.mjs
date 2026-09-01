/**
 * Feature surface config — the data layer for the reworked Features section.
 * Pins that defaults derive from the capability registry, that per-page
 * visibility resolves for BOTH surfaces, that the registry cross-implements
 * launchers (popup-only → shelf, shelf-only → popup), and that inline
 * features (email/text preview) are demoted to plain toggles.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FEATURE_DEFAULTS, FEATURE_FLAG_META } from '../../src/lib/flags.js';
import { DEV_SETTINGS, SALES_FANTASY_SETTING_KEY } from '../../src/lib/devSettings.js';
import { FEATURE_REGISTRY, featureByKey, shelfFeatures, popupFeatures, shelfActionDefs } from '../../src/lib/features/featureRegistry.js';
import { normalizeFeatureConfig, featureShowsOnPage, featureShowsInPopup, pageApplies, urlMatches, surfaceSummary, togglePage } from '../../src/lib/features/featureConfig.js';

const popupSource = await readFile(new URL('../../src/popup/popup.jsx', import.meta.url), 'utf8');
const backgroundSource = await readFile(new URL('../../background.js', import.meta.url), 'utf8');
const salesFantasyHtml = await readFile(new URL('../../sales-fantasy.html', import.meta.url), 'utf8');
const salesFantasySource = await readFile(new URL('../../src/sales-fantasy/sales-fantasy.jsx', import.meta.url), 'utf8');
const salesFantasyModelSource = await readFile(new URL('../../src/lib/salesFantasy.js', import.meta.url), 'utf8');
const salesFantasyButtonSource = popupSource.match(/function SalesFantasyButton[\s\S]*?\n}\n/)?.[0] || '';

describe('featureRegistry · surfaces', () => {
  it('a dual-surface feature has popup + a page-scoped shelf', () => {
    const call = featureByKey('callLogEnabled');
    assert.equal(call.surfaces.popup, true);
    assert.deepEqual(call.surfaces.shelf.pages, ['contact', 'account']);
    assert.ok(call.surfaces.shelf.dynamic, 'call log is a live-DOM (dynamic) action');
    assert.ok(call.surfaces.shelf.actions.some((a) => a.id === 'gb-call-contact'));
  });

  it('demotes inline features (email/text preview) to a plain toggle', () => {
    for (const key of ['emailPreviewEnabled', 'textPreviewEnabled']) {
      const f = featureByKey(key);
      assert.equal(f.surfaces.popup, false, `${key} popup`);
      assert.equal(f.surfaces.shelf, null, `${key} shelf`);
    }
  });

  it('cross-implements a formerly popup-only feature onto the shelf', () => {
    const margin = featureByKey('marginCalcEnabled');
    assert.equal(margin.surfaces.popup, true);
    assert.ok(margin.surfaces.shelf, 'margin calc now has a shelf action');
    assert.deepEqual(margin.surfaces.shelf.pages, ['order']);
    assert.equal(margin.surfaces.shelf.global, '__gbShowMarginCalcModal');
  });

  it('cross-implements a formerly shelf-only feature into the popup', () => {
    const phone = featureByKey('phoneFinderEnabled');
    assert.equal(phone.surfaces.popup, true);
    assert.deepEqual(phone.surfaces.shelf.pages, ['contact']);
  });

  it('demotes Workflow Manager to a toggle (opened only from CRM Search / Tasks)', () => {
    const cm = featureByKey('workflowManagerEnabled');
    assert.equal(cm.surfaces.popup, false);
    assert.equal(cm.surfaces.shelf, null);
  });

  it('scopes Order Edit to order pages on both surfaces', () => {
    const oe = featureByKey('orderEditEnabled');
    assert.equal(oe.surfaces.popup, true);
    assert.deepEqual(oe.surfaces.shelf.pages, ['order']);
    assert.equal(oe.surfaces.shelf.global, '__gbShowOrderEditModal');
  });

  it('unifies image viewer + submit proof: one feature, per-surface labels', () => {
    const img = featureByKey('imagePreviewEnabled');
    assert.equal(img.surfaces.shelf.actions[0].label, 'Image Viewer'); // shelf reads "Image Viewer"
    assert.equal(img.surfaces.popupLabel, 'Submit Proof');             // popup reads "Submit Proof"
    // The old standalone Submit Proof flag is merged away (no separate feature).
    assert.equal(featureByKey('submitProofEnabled'), null);
  });

  it('shelfFeatures / popupFeatures list only surfaced features', () => {
    const shelf = shelfFeatures().map((f) => f.key);
    assert.ok(shelf.includes('crmSearchEnabled'));
    assert.ok(shelf.includes('marginCalcEnabled'));
    assert.ok(!shelf.includes('emailPreviewEnabled'));
    const popup = popupFeatures().map((f) => f.key);
    assert.ok(popup.includes('phoneFinderEnabled'));
    assert.ok(!popup.includes('textPreviewEnabled'));
  });

  it('shelfActionDefs flattens actions tagged with feature key + pages', () => {
    const defs = shelfActionDefs();
    const findPhone = defs.find((d) => d.id === 'gb-find-phone');
    assert.equal(findPhone.key, 'phoneFinderEnabled');
    assert.deepEqual(findPhone.pages, ['contact']);
    assert.equal(findPhone.dynamic, true);
    const crm = defs.find((d) => d.id === 'gb-open-contacts');
    assert.equal(crm.global, '__gbShowCrmSearchModal');
    assert.equal(crm.dynamic, false);
    // call log contributes TWO actions under one feature
    assert.equal(defs.filter((d) => d.key === 'callLogEnabled').length, 2);
  });
});

describe('developer settings · Sales Fantasy event', () => {
  it('is a managed-ready developer setting instead of a feature or Events section', () => {
    const setting = DEV_SETTINGS.find((item) => item.key === SALES_FANTASY_SETTING_KEY);
    assert.deepEqual(setting, {
      key: 'salesFantasy.enabled',
      label: 'Sales Fantasy',
      desc: 'Show the temporary Sales Fantasy event launcher in the extension popup.',
      type: 'bool',
      default: false,
    });
    assert.equal(Object.hasOwn(FEATURE_DEFAULTS, 'salesFantasyEnabled'), false);
    assert.equal(FEATURE_FLAG_META.some((item) => item.key === 'salesFantasyEnabled'), false);
    assert.equal(featureByKey('salesFantasyEnabled'), null);
    assert.equal(FEATURE_FLAG_META.some((item) => item.section === 'Events'), false);
  });

  it('gates the event launcher and opens the full Sales Fantasy window', () => {
    assert.match(popupSource, /devSettings\[SALES_FANTASY_SETTING_KEY\] === true/);
    assert.match(popupSource, /salesFantasyEnabled=\{salesFantasyEnabled\}/);
    assert.match(popupSource, /\{salesFantasyEnabled && \(/);
    assert.doesNotMatch(popupSource, /flags\.salesFantasyEnabled/);
    assert.match(popupSource, /action: 'openSalesFantasy'/);
    assert.match(salesFantasyButtonSource, /<Btn\s+full\s+size="sm"/);
    assert.match(salesFantasyButtonSource, /variant="secondary"/);
    assert.match(salesFantasyButtonSource, /minHeight: 36/);
    assert.match(salesFantasyButtonSource, /padding: '7px 10px'/);
    assert.match(salesFantasyButtonSource, /radial-gradient\(120% 220% at 6% 50%/);
    assert.match(salesFantasyButtonSource, /background: 'var\(--gb-brand-tint-medium\)'/);
    assert.match(salesFantasyButtonSource, /border: '1px solid var\(--gb-brand-tint-border\)'/);
    assert.match(salesFantasyButtonSource, /<I\.sparkle size=\{12\} \/>/);
    assert.match(salesFantasyButtonSource, /scale: \[0\.9, 1\.4\]/);
    assert.doesNotMatch(salesFantasyButtonSource, /scale: \[0\.9, 1\.5\]/);
    assert.match(salesFantasyButtonSource, />\s*Sales Fantasy\s*</);
    assert.match(salesFantasyButtonSource, /<Tag tone="brand" size="xs">Event<\/Tag>/);
    assert.doesNotMatch(salesFantasyButtonSource, /rgba\(10,11,12|background: 'rgba\(/);
    assert.match(backgroundSource, /const MANAGER_WINDOW_BOUNDS = Object\.freeze\(\{ width: 860, height: 700 \}\)/);
    assert.match(backgroundSource, /const SALES_FANTASY_WINDOW_BOUNDS = Object\.freeze\(\{ width: 700, height: 900 \}\)/);
    assert.match(backgroundSource, /url: chrome\.runtime\.getURL\('editor\.html'\),\s*type: 'popup', \.\.\.MANAGER_WINDOW_BOUNDS/);
    assert.match(backgroundSource, /url: chrome\.runtime\.getURL\('sales-fantasy\.html'\),\s*type: 'popup', \.\.\.SALES_FANTASY_WINDOW_BOUNDS/);
    assert.match(salesFantasyHtml, /<title>Sales Fantasy<\/title>/);
    assert.match(salesFantasyHtml, /<body data-gb-scale="editor">/);
    assert.match(salesFantasyHtml, /react-dist\/sales-fantasy\/sales-fantasy\.js/);
    for (const label of ['Performance', 'Matchups', 'Standings', 'Rules']) {
      assert.match(salesFantasySource, new RegExp(`label: '${label}'`));
    }
    assert.match(salesFantasySource, /const POD_PAGE = \{ id: 'pods', label: 'POD Standing' \}/);
    assert.doesNotMatch(salesFantasySource, /label: 'Overview'|id: 'overview'/);
    assert.match(salesFantasySource, /import \{ AnimatePresence, motion \} from 'motion\/react'/);
    assert.match(salesFantasySource, /data-gb-ui-root/);
    assert.match(salesFantasySource, /prefers-reduced-motion: reduce/);
    assert.match(salesFantasySource, /overflow-wrap: anywhere/);
    assert.match(salesFantasySource, /<header className="sf-appbar">/);
    assert.match(salesFantasySource, /<nav className="sf-bottom-nav" aria-label="Sales Fantasy app navigation">/);
    assert.match(salesFantasySource, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
    assert.match(salesFantasySource, /\.sf-week-control \{ min-height: 30px;/);
    assert.match(salesFantasySource, /\.sf-icon-button \{ width: 29px; min-height: 28px;/);
    assert.match(salesFantasySource, /\.sf-week-label \{ position: relative; width: 56px; min-height: 28px;/);
    assert.doesNotMatch(salesFantasySource, /\.sf-week-control \{ min-height: 38px|\.sf-icon-button \{ width: 36px|\.sf-week-label \{ position: relative; width: 82px/);
    assert.match(salesFantasySource, /\.sf-bottom-item::before, \.sf-bottom-active \{ position: absolute; z-index: -1; inset: 5px 12%;/);
    assert.match(salesFantasySource, /\.sf-bottom-item:hover:not\(\.active\)::before \{ opacity: 1; \}/);
    assert.doesNotMatch(salesFantasySource, /\.sf-bottom-item:hover \{[^}]*background:/);
    assert.match(salesFantasySource, /background: var\(--gb-surface-canvas\)/);
    assert.match(salesFantasySource, /\.sf-appbar \{[\s\S]*?box-shadow: none;/);
    assert.doesNotMatch(salesFantasySource, /var\(--gb-brand-tint-soft\) 0, var\(--gb-surface-canvas\) 150px/);
    assert.match(salesFantasySource, /const NAV_TRANSITION = \{ type: 'spring', stiffness: 430, damping: 34, mass: 0\.72 \}/);
    assert.match(salesFantasySource, /sf-bottom-center \$\{centerActive \? 'active' : ''\}/);
    assert.match(salesFantasySource, /className="sf-bottom-center-selected"/);
    assert.match(salesFantasySource, /animate=\{centerActive \? \{ y: -3, scale: 1\.035 \} : \{ y: 0, scale: 1 \}\}/);
    assert.match(salesFantasySource, /\.sf-bottom-center\.active \{[\s\S]*?background: linear-gradient\(180deg, var\(--gb-brand\) 0%, var\(--gb-brand-dark\) 100%\)/);
    assert.doesNotMatch(salesFantasySource, /0 9px 22px var\(--gb-brand-tint-strong\)|0 11px 26px var\(--gb-brand-tint-strong\)/);
    assert.match(salesFantasySource, /Open POD 1 current Week \$\{SALES_FANTASY_CURRENT_WEEK\} standing/);
    assert.match(salesFantasySource, /className="sf-bottom-center-week">POD 1/);
    assert.match(salesFantasySource, /className="sf-bottom-center-rank">W\{SALES_FANTASY_CURRENT_WEEK\} · Rank #\{rank\}/);
    assert.match(salesFantasySource, /className="sf-avatar" aria-hidden="true">\{memberInitials\(candidate\.name\)\}/);
    assert.match(salesFantasySource, /className="sf-avatar" aria-hidden="true">\{memberInitials\(member\.name\)\}/);
    assert.doesNotMatch(salesFantasySource, /className="sf-avatar">\{(?:candidate|member)\.name\}/);
    assert.match(salesFantasySource, /onCurrentWeek=\{returnToCurrentWeek\}/);
    assert.match(salesFantasySource, /setView\('pods'\)/);
    assert.match(salesFantasySource, /key=\{`head-\$\{page\.id\}-\$\{week\}`\}/);
    assert.match(salesFantasySource, /className="sf-page-subtitle">\{pageSubtitle\(view, week\)\}/);
    assert.doesNotMatch(salesFantasySource, /sf-view-head|sf-view-heading|sf-view-copy/);
    assert.doesNotMatch(salesFantasySource, /sf-sidebar|<aside|sf-nav-button|sf-topbar/);
    for (const pointLabel of ['Activity', 'Sales', 'Referred']) {
      assert.match(salesFantasySource, new RegExp(`name="${pointLabel}"`));
    }
    for (const metricLabel of ['Emails sent', 'Emails replied', 'Outbound calls', 'Inbound calls', 'Proposals sent', 'Owned orders', 'Owned sales', 'Owned profit', 'Referred orders', 'Referred dollars']) {
      assert.match(salesFantasyModelSource, new RegExp(metricLabel, 'i'));
    }
    assert.match(salesFantasySource, /The three role totals reconcile to the official POD score/);
    assert.match(salesFantasySource, /className="sf-matchup-board"/);
    assert.match(salesFantasySource, /official role contribution ledger/);
    assert.doesNotMatch(salesFantasySource, /className="sf-vs">VS|\.sf-vs \{/);
    assert.match(salesFantasySource, /aria-label=\{`Pod \$\{pod\.number\}`\}>\{pod\.number\}/);
    assert.doesNotMatch(salesFantasySource, /Pin Seekers|Fairway Force|Avery Cole|pin-seekers/);
    assert.doesNotMatch(salesFantasySource, /min-width: 680px|line-height: 30px|height: 29px/);
  });

  it('shows role metric rows and the BDR Referred category in pod and matchup breakdowns', () => {
    const splitPanelSource = salesFantasySource.match(/function SplitPanel[\s\S]*?\n}\n\nfunction MatchupBreakdown/)?.[0] || '';
    const roleBreakdownsSource = salesFantasySource.match(/function RoleBreakdowns[\s\S]*?\n}\n\nfunction SalesFantasyApp/)?.[0] || '';
    const metricCategorySource = salesFantasySource.match(/function MetricCategory[\s\S]*?\n}\n\nfunction RoleBreakdowns/)?.[0] || '';

    assert.match(splitPanelSource, /<RoleBreakdowns pod=\{pod\} week=\{week\} \/>/);
    assert.match(roleBreakdownsSource, /pod\.members\.map/);
    assert.match(roleBreakdownsSource, /<MetricCategory name="Activity" score=\{points\.activity\} \/>/);
    assert.match(roleBreakdownsSource, /points\.sales && <MetricCategory name="Sales" score=\{points\.sales\} \/>/);
    assert.match(roleBreakdownsSource, /points\.referred && <MetricCategory name="Referred" score=\{points\.referred\} \/>/);
    assert.match(metricCategorySource, /score\.rows\.map/);
    assert.match(metricCategorySource, /className="sf-metric-row"/);
    assert.match(salesFantasySource, /\.sf-role-categories \{ display: grid; grid-template-columns: 1fr; \}/);
    assert.match(salesFantasySource, /\.sf-category \+ \.sf-category \{ border-top:/);
    assert.doesNotMatch(salesFantasySource, /sf-split-columns|sf-rep-split|sf-point-part|sf-point-total/);
  });

  it('adds individual weekly Performance and detailed Rules pages', () => {
    const performanceSource = salesFantasySource.match(/function Performance[\s\S]*?\n}\n\nfunction ruleRate/)?.[0] || '';
    const roleScoringSource = salesFantasySource.match(/function RoleScoringDetails[\s\S]*?\n}\n\nfunction Rules/)?.[0] || '';
    const scheduleSource = salesFantasySource.match(/function SeasonSchedule[\s\S]*?\n}\n\nfunction Rules/)?.[0] || '';
    const rulesSource = salesFantasySource.match(/function Rules[\s\S]*?\n}\n\nfunction PodDashboard/)?.[0] || '';

    assert.match(performanceSource, /memberWeekPointSplit/);
    assert.match(performanceSource, /Select individual performance/);
    assert.match(performanceSource, /layoutId="sf-member-active"/);
    assert.match(performanceSource, /className="sf-performance-detail" key=\{member\.id\}/);
    assert.match(performanceSource, /initial=\{\{ opacity: 0, y: 8 \}\}/);
    assert.match(performanceSource, /Weekly performance/);
    assert.match(performanceSource, /sf-week-bar-button/);
    assert.match(salesFantasySource, /grid-template-columns: repeat\(10, minmax\(0, 1fr\)\)/);
    assert.doesNotMatch(salesFantasySource, /grid-template-columns: repeat\(9, minmax\(0, 1fr\)\)/);
    assert.match(salesFantasySource, /\.sf-member-tab \{ position: relative; isolation: isolate; min-width: 0; min-height: 64px; padding: var\(--sf-3\) var\(--sf-4\);/);
    assert.match(salesFantasySource, /\.sf-member-active \{ position: absolute; z-index: 0; inset: 0;/);
    assert.match(rulesSource, /Scoring overview/);
    assert.match(rulesSource, /SR, SA, and BDR use the same point values/);
    assert.match(rulesSource, /Scoring details by position/);
    assert.match(rulesSource, /Every position receives the same statistic-by-statistic breakdown/);
    assert.match(rulesSource, /SALES_FANTASY_ROLES\.map\(\(role\) => <RoleScoringDetails role=\{role\}/);
    assert.match(rulesSource, /<SeasonSchedule \/>/);
    assert.match(scheduleSource, /5 · Season schedule/);
    assert.match(scheduleSource, /Ten weeks · four matchups and two PODs on bye every week/);
    assert.match(scheduleSource, /SCHEDULE\.map\(\(week\)/);
    assert.match(scheduleSource, /week\.games\.map/);
    assert.match(scheduleSource, /week\.byes\.map/);
    assert.match(salesFantasySource, /\.sf-schedule-week \{[^}]*grid-template-columns: 58px minmax\(0, 1fr\) 122px/);
    assert.match(roleScoringSource, /SALES_FANTASY_SCORING\.activity/);
    assert.match(roleScoringSource, /SALES_FANTASY_SCORING\.sales/);
    assert.match(roleScoringSource, /SALES_FANTASY_SCORING\.marginTiers/);
    assert.match(roleScoringSource, /SALES_FANTASY_SCORING\.referral/);
    assert.match(roleScoringSource, /role\.id === 'bdr' \? ruleRate\(rule, role\.id\) : 'Not scored'/);
    assert.match(salesFantasySource, /rule\.pointsByRole\?\.\[roleId\] \?\? rule\.pointsPerUnit \?\? 0/);
    assert.match(salesFantasySource, /Orders placed while the account is assigned to the BDR/);
    assert.doesNotMatch(rulesSource, /Work routing and attribution|primary economic driver|natural advantage|scoring contract/);
    assert.doesNotMatch(rulesSource, /BDR scoring details|highOutput|minimumOutput/);
    assert.match(salesFantasySource, /\.sf-performance-card \.sf-stat-grid \{ padding: var\(--sf-4\); \}/);
    assert.match(salesFantasySource, /\.sf-role-rule-grid \{ padding: var\(--sf-4\); display: grid; grid-template-columns: repeat\(3,/);
  });

  it('keeps the official matchup ledger compact above detailed role rows', () => {
    const matchupSource = salesFantasySource.match(/function MatchupBreakdown[\s\S]*?\n}\n\nfunction MatchupTab/)?.[0] || '';

    assert.match(salesFantasySource, /\.sf-matchup-card-head \{ padding-block: var\(--sf-2\); \}/);
    assert.match(salesFantasySource, /\.sf-matchup-entry \{ min-width: 0; min-height: 64px; padding: var\(--sf-2\) var\(--sf-3\); display: flex;/);
    assert.match(salesFantasySource, /\.sf-board-score \{ flex: 0 0 auto;[^}]*font-size: 23px;/);
    assert.match(matchupSource, /className="sf-card-head sf-matchup-card-head"/);
    assert.equal((matchupSource.match(/size="small"/g) || []).length, 2);
    assert.doesNotMatch(matchupSource, /size="large"/);
  });

  it('uses a top matchup switcher and vertically connected brackets below standings', () => {
    const matchupsSource = salesFantasySource.match(/function Matchups[\s\S]*?\n}\n\nfunction Standings/)?.[0] || '';
    const standingsSource = salesFantasySource.match(/function Standings[\s\S]*?\n}\n\nfunction BracketSlot/)?.[0] || '';
    const bracketsSource = salesFantasySource.match(/function BracketSlot[\s\S]*?\n}\n\nfunction MetricCategory/)?.[0] || '';

    assert.doesNotMatch(salesFantasySource, /\{ id: 'brackets', label: 'Brackets'/);
    assert.match(salesFantasySource, /const VIEW_ORDER = \['performance', 'matchups', 'pods', 'standings', 'rules'\]/);
    assert.match(matchupsSource, /className="sf-matchup-switcher"/);
    assert.match(matchupsSource, /className="sf-matchup-switcher-track"/);
    assert.match(matchupsSource, /<MatchupTab game=\{game\} week=\{week\} index=\{index\}/);
    assert.ok(matchupsSource.indexOf('sf-matchup-switcher') < matchupsSource.indexOf('<AnimatePresence'), 'the matchup selector stays above the active ledger');
    assert.doesNotMatch(matchupsSource, /sf-matchup-list|<CompactMatchup/);
    assert.match(standingsSource, /<Brackets standings=\{standings\} \/>/);
    assert.match(bracketsSource, /buildPlayoffBracket\(standings\)/);
    assert.match(bracketsSource, /Winner Bracket/);
    assert.match(bracketsSource, /Loser Bracket/);
    assert.match(bracketsSource, /className="sf-bracket-viewport" aria-label="Vertically stacked winner and loser brackets"/);
    assert.doesNotMatch(bracketsSource, /drag="x"|dragConstraints|Drag to pan|tabIndex=\{0\}/);
    assert.equal((bracketsSource.match(/viewBox="0 0 1000 52"/g) || []).length, 2);
    assert.equal((bracketsSource.match(/className="sf-bracket-connector"/g) || []).length, 3);
    for (const path of ['M500 0 V24 H250 V52', 'M250 0 V24 H500 V52', 'M750 0 V24 H500 V52']) assert.match(bracketsSource, new RegExp(path));
    assert.match(salesFantasySource, /\.sf-bracket-canvas \{ width: 100%;/);
    assert.match(salesFantasySource, /\.sf-bracket-rounds \{ display: flex; flex-direction: column;/);
    assert.match(salesFantasySource, /\.sf-bracket-round \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(bracketsSource, /round\.games\.length > 1 \? `\$\{round\.label\.slice\(0, -1\)\} \$\{gameIndex \+ 1\}` : round\.label/);
    assert.match(salesFantasySource, /\.sf-bracket-connectors \{ position: relative; z-index: 0; width: 100%; height: 52px;/);
    assert.doesNotMatch(salesFantasySource, /\.sf-bracket-viewport \{[^}]*overflow-x: auto|\.sf-bracket-canvas \{ width: 980px/);
    assert.doesNotMatch(salesFantasySource, /\.sf-bracket-game::after/);
    assert.match(salesFantasySource, /view !== 'standings' && view !== 'rules'/);
    assert.match(salesFantasyModelSource, /export function buildPlayoffBracket/);
  });
});

describe('featureConfig · defaults + queries', () => {
  it('defaults from the registry, clamps to supported surfaces', () => {
    const cfg = normalizeFeatureConfig({});
    assert.deepEqual(cfg.crmSearchEnabled, { showInPopup: true, showInShelf: true, pages: ['*'], customUrl: '' });
    // margin calc: cross-implemented, default pages from the registry
    assert.deepEqual(cfg.marginCalcEnabled, { showInPopup: false, showInShelf: true, pages: ['order'], customUrl: '' });
    // inline feature: both surfaces forced off, no pages, no custom link
    assert.deepEqual(cfg.emailPreviewEnabled, { showInPopup: false, showInShelf: false, pages: [], customUrl: '' });
    assert.equal(Object.keys(cfg).length, FEATURE_REGISTRY.length);
  });

  it('defaults the popup to edit, watch, tasks, search, notifications, and submit proof only', () => {
    const cfg = normalizeFeatureConfig({});
    const visible = popupFeatures()
      .filter((feature) => cfg[feature.key].showInPopup)
      .map((feature) => feature.key)
      .sort();
    assert.deepEqual(visible, [
      'crmSearchEnabled',
      'imagePreviewEnabled',
      'notificationsEnabled',
      'orderEditEnabled',
      'taskListEnabled',
      'watchListEnabled',
    ]);
  });

  it('honors a saved override', () => {
    const cfg = normalizeFeatureConfig({ callLogEnabled: { showInPopup: true, showInShelf: true, pages: ['contact'] } });
    assert.equal(cfg.callLogEnabled.showInPopup, true);
    assert.deepEqual(cfg.callLogEnabled.pages, ['contact']);
  });

  it('pageApplies matches wildcard and specific pages', () => {
    assert.equal(pageApplies(['*'], 'order'), true);
    assert.equal(pageApplies(['*'], null), true);
    assert.equal(pageApplies(['contact'], 'contact'), true);
    assert.equal(pageApplies(['contact'], 'order'), false);
    assert.equal(pageApplies([], 'order'), false);
  });

  it('resolves per-page shelf visibility (page chips gate the shelf only)', () => {
    const cfg = normalizeFeatureConfig({ callLogEnabled: { showInShelf: true, showInPopup: true, pages: ['contact'] }, crmSearchEnabled: { showInShelf: true, showInPopup: true, pages: ['*'] } });
    assert.equal(featureShowsOnPage(cfg.callLogEnabled, 'contact'), true);
    assert.equal(featureShowsOnPage(cfg.callLogEnabled, 'order'), false);
    assert.equal(featureShowsOnPage(cfg.emailPreviewEnabled, 'contact'), false); // no shelf
  });

  it('popup is GLOBAL — enabled popup shows on every page, ignoring page chips', () => {
    // Regression: the popup used to be gated by the shelf's page chips, so a
    // contact-scoped feature vanished from the popup on an order page.
    const cfg = normalizeFeatureConfig({ callLogEnabled: { showInShelf: true, showInPopup: true, pages: ['contact'] } });
    assert.equal(featureShowsInPopup(cfg.callLogEnabled), true);      // even though pages=['contact']
    const off = normalizeFeatureConfig({ callLogEnabled: { showInPopup: false } });
    assert.equal(featureShowsInPopup(off.callLogEnabled), false);
  });

  it('summarizes surfaces for the collapsed row', () => {
    assert.match(surfaceSummary(normalizeFeatureConfig({}).crmSearchEnabled), /Popup · Shelf · all pages/);
    assert.match(surfaceSummary(normalizeFeatureConfig({ callLogEnabled: { showInPopup: false, showInShelf: true, pages: ['contact', 'account'] } }).callLogEnabled), /Shelf · 2 pages/);
  });
});

describe('featureConfig · custom-link matcher', () => {
  it('normalizes and trims a custom link on shelf-capable features', () => {
    const cfg = normalizeFeatureConfig({ callLogEnabled: { showInShelf: true, customUrl: '  Page=271  ' } });
    assert.equal(cfg.callLogEnabled.customUrl, 'Page=271');
  });

  it('urlMatches is a case-sensitive substring test; empty never matches', () => {
    assert.equal(urlMatches('Page=271', 'https://crm/Default.aspx?Page=271&x=1'), true);
    assert.equal(urlMatches('Page=999', 'https://crm/Default.aspx?Page=271'), false);
    assert.equal(urlMatches('', 'https://crm/anything'), false);
  });

  it('shows a shelf action when the URL contains the custom link even off its pages', () => {
    const cfg = normalizeFeatureConfig({ callLogEnabled: { showInShelf: true, pages: ['contact'], customUrl: '/Admin/Order' } });
    // Not a contact page, but the URL contains the custom link → shows.
    assert.equal(featureShowsOnPage(cfg.callLogEnabled, 'order', 'https://crm/golfballs/crm/Admin/Order/View'), true);
    // Neither the page nor the URL matches → hidden.
    assert.equal(featureShowsOnPage(cfg.callLogEnabled, 'order', 'https://crm/somewhere/else'), false);
  });

  it('reflects the custom link in the collapsed summary', () => {
    const cfg = normalizeFeatureConfig({ callLogEnabled: { showInShelf: true, pages: ['contact'], customUrl: 'Page=271' } });
    assert.match(surfaceSummary(cfg.callLogEnabled), /\+ link/);
  });
});

describe('featureConfig · togglePage', () => {
  it('selecting a specific page drops the `*` wildcard', () => {
    assert.deepEqual(togglePage(['*'], 'contact'), ['contact']);
  });

  it('selecting `*` collapses back to all-pages', () => {
    assert.deepEqual(togglePage(['contact', 'account'], '*'), ['*']);
  });

  it('adds a page and keeps registry order (not click order)', () => {
    assert.deepEqual(togglePage(['order'], 'contact'), ['contact', 'order']);
  });

  it('removing the last specific page falls back to `*`', () => {
    assert.deepEqual(togglePage(['contact'], 'contact'), ['*']);
  });

  it('toggling a present page removes just that page', () => {
    assert.deepEqual(togglePage(['contact', 'account'], 'account'), ['contact']);
  });
});
