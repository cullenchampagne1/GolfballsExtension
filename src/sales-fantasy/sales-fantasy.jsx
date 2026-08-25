import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion } from 'motion/react';
import { ensureTheme } from '../lib/theme.js';
import { I, Icon } from '../ui';
import {
  SALES_FANTASY_CURRENT_WEEK,
  SALES_FANTASY_PODS,
  SALES_FANTASY_ROLES,
  SALES_FANTASY_SCORING,
  buildFantasySchedule,
  buildStandings,
  fantasyScore,
  memberWeekPointSplit,
  matchupForPod,
  podForId,
  podWeekPointSplit,
  scoreRoleMetrics,
  weekState,
} from '../lib/salesFantasy.js';

const MY_POD_ID = 'pod-1';
const SCHEDULE = buildFantasySchedule(SALES_FANTASY_PODS);
const EASE = [0.22, 1, 0.36, 1];
const PAGE_TRANSITION = { duration: 0.2, ease: EASE };

const FantasyIcon = {
  performance: (props) => <Icon {...props}><path d="M4 19V9M10 19V5M16 19v-7M22 19V3" /><path d="M2 19h20" /></Icon>,
  matchup: (props) => <Icon {...props}><path d="M8 5l4 4 4-4" /><path d="M8 19l4-4 4 4" /><path d="M12 9v6" /><path d="M3 12h5M16 12h5" /></Icon>,
  standings: (props) => <Icon {...props}><path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7" /></Icon>,
  rules: (props) => <Icon {...props}><path d="M6 3h12a2 2 0 012 2v16l-4-2-4 2-4-2-4 2V5a2 2 0 012-2z" /><path d="M8 8h8M8 12h8M8 16h5" /></Icon>,
  trophy: (props) => <Icon {...props}><path d="M8 4h8v5a4 4 0 01-8 0V4z" /><path d="M8 6H4v2a4 4 0 004 4M16 6h4v2a4 4 0 01-4 4M12 13v4M8 21h8M9 17h6" /></Icon>,
  arrowLeft: (props) => <Icon {...props}><path d="M15 18l-6-6 6-6" /></Icon>,
  arrowRight: (props) => <Icon {...props}><path d="M9 18l6-6-6-6" /></Icon>,
};

const NAV_ITEMS = [
  { id: 'performance', label: 'Performance', navLabel: 'My Stats', icon: FantasyIcon.performance },
  { id: 'matchups', label: 'Matchups', icon: FantasyIcon.matchup },
  { id: 'standings', label: 'Standings', icon: FantasyIcon.standings },
  { id: 'rules', label: 'Rules', icon: FantasyIcon.rules },
];
const POD_PAGE = { id: 'pods', label: 'POD Standing' };
const PAGES = [...NAV_ITEMS, POD_PAGE];
const VIEW_ORDER = ['performance', 'matchups', 'pods', 'standings', 'rules'];

const CSS = `
  button { color: inherit; font: inherit; }
  .sf-app {
    --sf-1: 4px; --sf-2: 8px; --sf-3: 12px; --sf-4: 16px; --sf-5: 20px;
    width: 100%; height: 100%; min-width: 0;
    display: flex; flex-direction: column; overflow: hidden;
    color: var(--gb-text-secondary);
    background: linear-gradient(180deg, var(--gb-brand-tint-soft) 0, var(--gb-surface-canvas) 150px);
    font-family: var(--gb-font-sans); font-size: 12px; line-height: 1.4;
  }
  .sf-appbar {
    flex: 0 0 auto; min-height: 68px; padding: 9px var(--sf-5);
    border-bottom: 1px solid var(--gb-border-default); background: var(--gb-surface-1);
  }
  .sf-appbar-inner { width: 100%; max-width: 760px; min-height: 50px; margin: 0 auto; display: flex; align-items: center; gap: var(--sf-4); }
  .sf-appbar-brand { min-width: 0; flex: 1; display: flex; align-items: center; gap: 10px; }
  .sf-brand-mark, .sf-pod-mark {
    display: grid; place-items: center; flex: 0 0 auto;
    color: var(--gb-brand-label); background: var(--gb-brand-tint-medium);
    border: 1px solid var(--gb-brand-tint-border);
  }
  .sf-brand-mark { width: 38px; height: 38px; border-radius: 12px; }
  .sf-brand-copy, .sf-team-copy { min-width: 0; }
  .sf-brand-name { color: var(--gb-text-primary); font-size: 14px; font-weight: 850; letter-spacing: -.25px; overflow-wrap: anywhere; }
  .sf-kicker { margin-top: 3px; color: var(--gb-text-muted); font-size: 10px; font-weight: 750; letter-spacing: .7px; text-transform: uppercase; }
  .sf-appbar-meta { margin-top: 2px; display: flex; align-items: center; gap: 6px; color: var(--gb-text-muted); font-size: 9.5px; font-weight: 700; }
  .sf-appbar-meta .sf-live-dot { color: var(--gb-success-fg); }
  .sf-live-pill, .sf-status-pill, .sf-event-pill {
    display: inline-flex; align-items: center; justify-content: center; gap: 5px;
    border-radius: var(--gb-r-pill); font-weight: 800; text-transform: uppercase;
  }
  .sf-live-pill { padding: 4px 7px; color: var(--gb-success-fg); background: var(--gb-success-tint-soft); border: 1px solid var(--gb-success-tint-border); font-size: 9px; letter-spacing: .5px; }
  .sf-live-dot { width: 6px; height: 6px; flex: 0 0 auto; border-radius: 50%; background: currentColor; }
  .sf-pod-mark { width: 32px; height: 32px; border-radius: var(--gb-r-md); font-size: 13px; font-weight: 850; font-variant-numeric: tabular-nums; }
  .sf-pod-mark.small { width: 28px; height: 28px; border-radius: var(--gb-r-sm); font-size: 11px; }
  .sf-pod-mark.large { width: 46px; height: 46px; border-radius: var(--gb-r-lg); font-size: 17px; }
  .sf-appbar-actions { flex: 0 0 auto; display: flex; align-items: center; gap: var(--sf-2); }
  .sf-standing-chip { min-height: 38px; padding: 0 11px; display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--gb-brand-tint-border); border-radius: var(--gb-r-md); color: var(--gb-brand-label); background: var(--gb-brand-tint-soft); font-size: 10px; font-weight: 800; }
  .sf-main { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  .sf-mobile-page-head { width: 100%; max-width: 760px; margin: 0 auto var(--sf-4); display: flex; align-items: flex-end; justify-content: space-between; gap: var(--sf-4); }
  .sf-page-title-row { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sf-2); }
  .sf-page-title { margin: 0; color: var(--gb-text-primary); font-size: 20px; line-height: 1.15; letter-spacing: -.45px; overflow-wrap: anywhere; }
  .sf-page-subtitle { margin-top: var(--sf-1); color: var(--gb-text-muted); font-size: 11px; line-height: 1.4; overflow-wrap: anywhere; }
  .sf-event-pill { padding: 4px 7px; color: var(--gb-brand-label); background: var(--gb-brand-tint-soft); border: 1px solid var(--gb-brand-tint-border); font-size: 9px; letter-spacing: .6px; }
  .sf-week-wrap { flex: 0 0 auto; }
  .sf-week-control { min-height: 30px; display: flex; align-items: stretch; border: 1px solid var(--gb-border-default); border-radius: var(--gb-r-sm); background: var(--gb-fill-faint); overflow: hidden; }
  .sf-icon-button { width: 29px; min-height: 28px; padding: 0; display: grid; place-items: center; border: 0; cursor: pointer; color: var(--gb-text-tertiary); background: transparent; transition: color .16s ease, background-color .16s ease; }
  .sf-icon-button:hover:not(:disabled) { color: var(--gb-text-primary); background: var(--gb-fill-soft); }
  .sf-icon-button:disabled { cursor: default; color: var(--gb-text-ghost); }
  .sf-week-label { position: relative; width: 56px; min-height: 28px; overflow: hidden; color: var(--gb-text-primary); border-inline: 1px solid var(--gb-border-default); font-size: 9.5px; font-weight: 750; text-align: center; }
  .sf-week-label-inner { position: absolute; inset: 0; display: grid; place-items: center; padding: var(--sf-1) var(--sf-2); }
  .sf-content { flex: 1; min-height: 0; overflow: auto; padding: 18px var(--sf-5) 50px; scrollbar-width: thin; scrollbar-color: var(--gb-border-strong) transparent; }
  .sf-content::-webkit-scrollbar { width: 7px; }
  .sf-content::-webkit-scrollbar-thumb { background: var(--gb-border-strong); border: 2px solid transparent; border-radius: 99px; background-clip: padding-box; }
  .sf-view-motion { width: 100%; max-width: 760px; margin: 0 auto; }
  .sf-view-motion, .sf-stack { min-width: 0; }
  .sf-stack { display: grid; gap: var(--sf-4); }
  .sf-card { min-width: 0; border: 1px solid var(--gb-border-default); border-radius: var(--gb-r-xl); background: var(--gb-surface-1); box-shadow: 0 3px 12px rgba(0, 0, 0, .11), inset 0 1px 0 var(--gb-fill-subtle); overflow: hidden; }
  .sf-card-head { padding: var(--sf-3) var(--sf-4); display: flex; align-items: center; justify-content: space-between; gap: var(--sf-3); border-bottom: 1px solid var(--gb-border-subtle); }
  .sf-card-title { color: var(--gb-text-primary); font-size: 13px; font-weight: 750; overflow-wrap: anywhere; }
  .sf-card-caption { margin-top: 2px; color: var(--gb-text-muted); font-size: 10px; line-height: 1.4; overflow-wrap: anywhere; }
  .sf-section-label { display: flex; align-items: center; justify-content: space-between; gap: var(--sf-3); }
  .sf-section-title { margin: 0; color: var(--gb-text-primary); font-size: 15px; line-height: 1.3; letter-spacing: -.2px; }
  .sf-section-note { color: var(--gb-text-muted); font-size: 10.5px; line-height: 1.4; }
  .sf-stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--sf-2); }
  .sf-stat { min-width: 0; padding: var(--sf-3); border: 1px solid var(--gb-border-default); border-radius: var(--gb-r-lg); background: var(--gb-surface-1); }
  .sf-stat-label { color: var(--gb-text-muted); font-size: 10px; font-weight: 750; letter-spacing: .45px; text-transform: uppercase; overflow-wrap: anywhere; }
  .sf-stat-value { margin-top: var(--sf-2); color: var(--gb-text-primary); font-size: 20px; line-height: 1.15; font-weight: 850; letter-spacing: -.5px; font-variant-numeric: tabular-nums; }
  .sf-stat-detail { margin-top: var(--sf-1); color: var(--gb-text-tertiary); font-size: 10px; line-height: 1.4; overflow-wrap: anywhere; }
  .sf-positive { color: var(--gb-success-fg); }
  .sf-match-status { display: flex; align-items: center; gap: 6px; color: var(--gb-text-muted); font-size: 9px; font-weight: 800; letter-spacing: .55px; text-transform: uppercase; white-space: nowrap; }
  .sf-match-status.live { color: var(--gb-success-fg); }
  .sf-match-status-dot { width: 6px; height: 6px; flex: 0 0 auto; border-radius: 50%; background: currentColor; }
  .sf-matchup-card-head { padding-block: var(--sf-2); }
  .sf-matchup-board { display: grid; grid-template-columns: minmax(0, 1fr) 86px minmax(0, 1fr); align-items: stretch; border-bottom: 1px solid var(--gb-border-default); background: var(--gb-fill-faint); }
  .sf-matchup-entry { min-width: 0; min-height: 64px; padding: var(--sf-2) var(--sf-3); display: flex; align-items: center; justify-content: space-between; gap: 10px; border-top: 2px solid transparent; }
  .sf-matchup-entry.leading { border-top-color: var(--gb-brand-label); background: var(--gb-brand-tint-soft); }
  .sf-matchup-entry.away { flex-direction: row-reverse; text-align: right; }
  .sf-matchup-team { min-width: 0; flex: 1; display: flex; align-items: center; gap: var(--sf-2); }
  .sf-matchup-entry.away .sf-matchup-team { flex-direction: row-reverse; }
  .sf-matchup-side { color: var(--gb-text-muted); font-size: 7.5px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; }
  .sf-team-name { margin-top: 1px; color: var(--gb-text-primary); font-size: 11.5px; font-weight: 750; overflow-wrap: anywhere; }
  .sf-team-record { margin-top: 1px; color: var(--gb-text-muted); font-size: 9px; line-height: 1.3; }
  .sf-board-score { flex: 0 0 auto; color: var(--gb-text-primary); font-size: 23px; line-height: 1; font-weight: 850; letter-spacing: -.7px; font-variant-numeric: tabular-nums; }
  .sf-board-score-unit { display: block; margin-top: 2px; color: var(--gb-text-muted); font-size: 7px; font-weight: 800; letter-spacing: .45px; text-transform: uppercase; }
  .sf-matchup-centerline { padding: 6px var(--sf-1); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; color: var(--gb-text-muted); border-inline: 1px solid var(--gb-border-default); background: var(--gb-surface-1); text-align: center; }
  .sf-matchup-centerline::before { content: ''; width: 18px; height: 1px; background: var(--gb-border-strong); }
  .sf-matchup-week { font-size: 7.5px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; }
  .sf-matchup-margin { color: var(--gb-text-primary); font-size: 8.5px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .sf-split-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-top: 1px solid var(--gb-border-subtle); }
  .sf-pod-split { min-width: 0; }
  .sf-pod-split + .sf-pod-split { border-left: 1px solid var(--gb-border-subtle); }
  .sf-split-head { padding: var(--sf-3) var(--sf-4); display: flex; align-items: center; justify-content: space-between; gap: var(--sf-2); background: var(--gb-fill-faint); }
  .sf-split-title { color: var(--gb-text-primary); font-size: 11px; font-weight: 750; }
  .sf-split-total { color: var(--gb-brand-label); font-size: 12px; font-weight: 850; font-variant-numeric: tabular-nums; }
  .sf-equation { padding: var(--sf-3) var(--sf-4); display: flex; flex-wrap: wrap; align-items: center; gap: 4px; color: var(--gb-text-muted); border-top: 1px solid var(--gb-border-default); font-size: 9.5px; line-height: 1.5; }
  .sf-equation strong { color: var(--gb-text-primary); font-size: 11px; }
  .sf-score-note { padding: 0 var(--sf-4) var(--sf-4); color: var(--gb-text-muted); font-size: 10px; line-height: 1.5; }
  .sf-score-note strong { color: var(--gb-text-secondary); }
  .sf-status-pill.final { color: var(--gb-text-tertiary); background: var(--gb-fill-subtle); border-color: var(--gb-border-default); }
  .sf-status-pill.scheduled { color: var(--gb-info-fg); background: var(--gb-info-tint-soft); border-color: var(--gb-info-tint-border); }
  .sf-scoreboard-grid, .sf-matchup-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sf-2); }
  .sf-compact-matchup { min-width: 0; padding: var(--sf-3); border: 1px solid var(--gb-border-default); border-radius: var(--gb-r-lg); cursor: pointer; color: inherit; background: var(--gb-surface-1); text-align: left; transition: border-color .16s ease, background-color .16s ease, box-shadow .16s ease; }
  .sf-compact-matchup:hover { border-color: var(--gb-border-strong); background: var(--gb-fill-soft); }
  .sf-compact-matchup.selected { border-color: var(--gb-brand-label); background: var(--gb-brand-tint-soft); box-shadow: none; }
  .sf-compact-top { margin-bottom: var(--sf-2); display: flex; justify-content: space-between; align-items: center; gap: var(--sf-2); color: var(--gb-text-muted); font-size: 9px; font-weight: 750; letter-spacing: .45px; text-transform: uppercase; }
  .sf-compact-team { min-width: 0; padding: 3px 0; display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; align-items: center; gap: var(--sf-2); }
  .sf-compact-name { min-width: 0; color: var(--gb-text-secondary); font-size: 11px; font-weight: 650; overflow-wrap: anywhere; }
  .sf-compact-score { color: var(--gb-text-primary); font-size: 13px; font-weight: 850; font-variant-numeric: tabular-nums; }
  .sf-bye-card { min-height: 70px; padding: var(--sf-3); display: flex; align-items: center; gap: var(--sf-3); border: 1px dashed var(--gb-border-strong); border-radius: var(--gb-r-lg); background: var(--gb-fill-faint); }
  .sf-bye-icon { width: 34px; height: 34px; display: grid; place-items: center; flex: 0 0 auto; color: var(--gb-brand-label); border: 1px solid var(--gb-brand-tint-border); border-radius: var(--gb-r-md); background: var(--gb-brand-tint-soft); }
  .sf-bye-title { color: var(--gb-text-primary); font-size: 12px; font-weight: 750; }
  .sf-bye-pods { margin-top: 2px; color: var(--gb-text-muted); font-size: 10px; overflow-wrap: anywhere; }
  .sf-standing-team { min-width: 0; display: flex; align-items: center; gap: var(--sf-2); }
  .sf-standing-record { color: var(--gb-text-tertiary); font-size: 10px; font-weight: 750; }
  .sf-link-button { min-height: 30px; padding: 4px 7px; border: 0; border-radius: var(--gb-r-sm); background: transparent; color: var(--gb-brand-label); cursor: pointer; font-size: 10.5px; font-weight: 750; transition: background-color .16s ease; }
  .sf-link-button:hover { background: var(--gb-brand-tint-soft); }
  .sf-table-wrap { min-width: 0; overflow-x: auto; }
  .sf-league-table, .sf-member-table { width: 100%; min-width: 520px; border-collapse: collapse; table-layout: fixed; }
  .sf-league-table th, .sf-member-table th { padding: 9px var(--sf-3); color: var(--gb-text-muted); background: var(--gb-fill-faint); border-bottom: 1px solid var(--gb-border-default); font-size: 9px; line-height: 1.35; font-weight: 800; letter-spacing: .5px; text-align: right; text-transform: uppercase; }
  .sf-league-table td, .sf-member-table td { padding: 10px var(--sf-3); border-bottom: 1px solid var(--gb-border-subtle); color: var(--gb-text-secondary); font-size: 11px; line-height: 1.4; text-align: right; font-variant-numeric: tabular-nums; }
  .sf-league-table tr:last-child td, .sf-member-table tr:last-child td { border-bottom: 0; }
  .sf-league-table th:first-child, .sf-league-table td:first-child { width: 54px; text-align: center; }
  .sf-league-table th:nth-child(2), .sf-league-table td:nth-child(2), .sf-member-table th:first-child, .sf-member-table td:first-child { text-align: left; }
  .sf-league-table th:nth-child(2) { width: 36%; }
  .sf-league-table tr.mine td { background: var(--gb-brand-tint-soft); }
  .sf-rank-badge { width: 24px; height: 24px; display: inline-grid; place-items: center; border: 1px solid var(--gb-border-default); border-radius: 50%; color: var(--gb-text-tertiary); background: var(--gb-fill-subtle); font-size: 10px; font-weight: 800; }
  .sf-rank-badge.top { color: var(--gb-brand-label); border-color: var(--gb-brand-tint-border); background: var(--gb-brand-tint-soft); }
  .sf-member { min-width: 0; display: flex; align-items: center; gap: var(--sf-2); }
  .sf-avatar { width: 30px; height: 30px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 50%; color: var(--gb-brand-label); background: var(--gb-brand-tint-soft); border: 1px solid var(--gb-brand-tint-border); font-size: 11px; font-weight: 800; }
  .sf-member-name { color: var(--gb-text-primary); font-size: 11px; font-weight: 700; overflow-wrap: anywhere; }
  .sf-member-role { margin-top: 2px; color: var(--gb-text-muted); font-size: 9.5px; }
  .sf-metric-primary { color: var(--gb-brand-label) !important; font-weight: 850; }
  .sf-role-list { display: grid; }
  .sf-role-card { min-width: 0; border-top: 1px solid var(--gb-border-default); }
  .sf-role-head { padding: var(--sf-3) var(--sf-4); display: flex; align-items: center; gap: var(--sf-3); background: var(--gb-fill-faint); }
  .sf-role-head-copy { min-width: 0; flex: 1; }
  .sf-role-name { color: var(--gb-text-primary); font-size: 12px; font-weight: 800; }
  .sf-role-title { margin-top: 1px; color: var(--gb-text-muted); font-size: 9.5px; overflow-wrap: anywhere; }
  .sf-role-total { text-align: right; }
  .sf-role-total-value { color: var(--gb-brand-label); font-size: 16px; line-height: 1.1; font-weight: 850; font-variant-numeric: tabular-nums; }
  .sf-role-total-label { margin-top: 2px; color: var(--gb-text-muted); font-size: 8px; font-weight: 750; letter-spacing: .45px; text-transform: uppercase; }
  .sf-role-categories { display: grid; grid-template-columns: 1fr; }
  .sf-category { min-width: 0; padding: var(--sf-3) var(--sf-4) var(--sf-4); }
  .sf-category + .sf-category { border-top: 1px solid var(--gb-border-subtle); }
  .sf-category-head { min-height: 25px; display: flex; align-items: center; justify-content: space-between; gap: var(--sf-2); border-bottom: 1px solid var(--gb-border-default); }
  .sf-category-name { color: var(--gb-text-secondary); font-size: 9px; font-weight: 800; letter-spacing: .55px; text-transform: uppercase; }
  .sf-category-points { color: var(--gb-brand-label); font-size: 10.5px; font-weight: 850; font-variant-numeric: tabular-nums; }
  .sf-metric-row { min-height: 28px; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: var(--sf-2); border-bottom: 1px solid var(--gb-border-subtle); }
  .sf-metric-label { min-width: 0; color: var(--gb-text-secondary); font-size: 10px; overflow-wrap: anywhere; }
  .sf-metric-value { color: var(--gb-text-muted); font-size: 9.5px; font-variant-numeric: tabular-nums; }
  .sf-metric-points { min-width: 43px; color: var(--gb-text-primary); font-size: 10px; font-weight: 800; text-align: right; font-variant-numeric: tabular-nums; }
  .sf-margin-summary { padding-top: var(--sf-2); display: flex; flex-wrap: wrap; gap: 4px; }
  .sf-margin-chip { padding: 3px 5px; color: var(--gb-text-muted); border: 1px solid var(--gb-border-subtle); border-radius: var(--gb-r-sm); background: var(--gb-fill-faint); font-size: 8.5px; white-space: nowrap; }
  .sf-margin-chip.hit { color: var(--gb-brand-label); border-color: var(--gb-brand-tint-border); background: var(--gb-brand-tint-soft); }
  .sf-member-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sf-2); }
  .sf-member-tab { position: relative; isolation: isolate; min-width: 0; min-height: 64px; padding: var(--sf-3) var(--sf-4); display: flex; align-items: center; gap: var(--sf-3); overflow: hidden; border: 1px solid var(--gb-border-default); border-radius: var(--gb-r-lg); cursor: pointer; color: var(--gb-text-secondary); background: var(--gb-surface-1); text-align: left; transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease; }
  .sf-member-tab:hover:not(.active) { border-color: var(--gb-border-strong); transform: translateY(-1px); }
  .sf-member-tab.active { color: var(--gb-brand-label); border-color: var(--gb-brand-label); box-shadow: 0 3px 10px var(--gb-brand-tint-soft); }
  .sf-member-active { position: absolute; z-index: 0; inset: 0; border-radius: inherit; background: var(--gb-brand-tint-soft); }
  .sf-member-tab > :not(.sf-member-active) { position: relative; z-index: 1; }
  .sf-member-tab-copy { min-width: 0; }
  .sf-member-tab-name { display: block; color: var(--gb-text-primary); font-size: 11px; font-weight: 800; }
  .sf-member-tab-role { display: block; margin-top: 2px; overflow: hidden; color: var(--gb-text-muted); font-size: 8.5px; text-overflow: ellipsis; white-space: nowrap; }
  .sf-performance-detail { min-width: 0; display: grid; gap: var(--sf-4); }
  .sf-performance-card .sf-stat-grid { padding: var(--sf-4); }
  .sf-performance-hero { padding: var(--sf-4); display: flex; align-items: center; gap: var(--sf-3); border-bottom: 1px solid var(--gb-border-default); background: var(--gb-fill-faint); }
  .sf-performance-copy { min-width: 0; flex: 1; }
  .sf-performance-name { color: var(--gb-text-primary); font-size: 16px; font-weight: 850; }
  .sf-performance-meta { margin-top: 2px; color: var(--gb-text-muted); font-size: 10px; }
  .sf-performance-score { text-align: right; }
  .sf-performance-score-value { color: var(--gb-brand-label); font-size: 25px; line-height: 1; font-weight: 850; font-variant-numeric: tabular-nums; }
  .sf-performance-score-label { margin-top: 3px; color: var(--gb-text-muted); font-size: 8.5px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; }
  .sf-week-trend { padding: var(--sf-3) var(--sf-4) var(--sf-4); display: grid; grid-template-columns: repeat(9, minmax(0, 1fr)); align-items: end; gap: 5px; min-height: 122px; }
  .sf-week-bar-button { min-width: 0; height: 88px; padding: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px; border: 0; cursor: pointer; color: var(--gb-text-muted); background: transparent; }
  .sf-week-bar-value { font-size: 8px; font-weight: 750; font-variant-numeric: tabular-nums; }
  .sf-week-bar-track { width: 100%; max-width: 24px; height: 54px; display: flex; align-items: flex-end; border-radius: 4px 4px 2px 2px; background: var(--gb-fill-subtle); overflow: hidden; }
  .sf-week-bar-fill { width: 100%; min-height: 3px; border-radius: inherit; background: var(--gb-border-strong); }
  .sf-week-bar-button.active { color: var(--gb-brand-label); }
  .sf-week-bar-button.active .sf-week-bar-fill { background: var(--gb-brand-label); }
  .sf-week-bar-label { font-size: 8px; font-weight: 800; text-transform: uppercase; }
  .sf-rule-intro { padding: var(--sf-4); color: var(--gb-text-secondary); font-size: 11px; line-height: 1.6; }
  .sf-rule-section { min-width: 0; }
  .sf-rule-section-body { padding: var(--sf-3) var(--sf-4) var(--sf-4); }
  .sf-rule-list { margin: 0; padding-left: 18px; color: var(--gb-text-secondary); font-size: 10.5px; line-height: 1.65; }
  .sf-rule-table-wrap { min-width: 0; overflow-x: auto; }
  .sf-rule-table { width: 100%; min-width: 500px; border-collapse: collapse; table-layout: fixed; }
  .sf-rule-table th, .sf-rule-table td { padding: 9px var(--sf-3); border-bottom: 1px solid var(--gb-border-subtle); font-size: 10px; text-align: right; font-variant-numeric: tabular-nums; }
  .sf-rule-table th { color: var(--gb-text-muted); background: var(--gb-fill-faint); font-size: 8.5px; letter-spacing: .5px; text-transform: uppercase; }
  .sf-rule-table th:first-child, .sf-rule-table td:first-child { width: 40%; text-align: left; }
  .sf-rule-table tr:last-child td { border-bottom: 0; }
  .sf-example-grid { margin-top: var(--sf-3); display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sf-2); }
  .sf-example { padding: var(--sf-3); border: 1px solid var(--gb-border-default); border-radius: var(--gb-r-md); background: var(--gb-fill-faint); }
  .sf-example-label { color: var(--gb-text-muted); font-size: 8.5px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; }
  .sf-example-value { margin-top: var(--sf-1); color: var(--gb-text-primary); font-size: 18px; font-weight: 850; font-variant-numeric: tabular-nums; }
  .sf-example-detail { margin-top: var(--sf-1); color: var(--gb-text-muted); font-size: 9.5px; line-height: 1.5; }
  .sf-data-note { color: var(--gb-text-ghost); font-size: 9.5px; line-height: 1.4; text-align: right; }
  .sf-empty { padding: 32px var(--sf-4); color: var(--gb-text-muted); text-align: center; }
  .sf-bottom-nav {
    position: relative; z-index: 5; flex: 0 0 76px; min-height: 76px;
    display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); align-items: stretch;
    padding: 7px max(12px, env(safe-area-inset-right)) max(7px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
    border-top: 1px solid var(--gb-border-default); background: var(--gb-surface-1);
  }
  .sf-bottom-item {
    position: relative; isolation: isolate; min-width: 0; min-height: 58px; padding: 7px 4px 4px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
    border: 0; border-radius: var(--gb-r-md); cursor: pointer; background: transparent;
    color: var(--gb-text-muted); transition: color .18s ease;
  }
  .sf-bottom-item::before, .sf-bottom-active { position: absolute; z-index: -1; inset: 5px 12%; border-radius: var(--gb-r-md); }
  .sf-bottom-item::before { content: ''; background: var(--gb-fill-subtle); opacity: 0; transition: opacity .18s ease; }
  .sf-bottom-item:hover:not(.active) { color: var(--gb-text-primary); }
  .sf-bottom-item:hover:not(.active)::before { opacity: 1; }
  .sf-bottom-item.active { color: var(--gb-brand-label); }
  .sf-bottom-active { background: var(--gb-brand-tint-soft); }
  .sf-bottom-label { max-width: 100%; overflow: hidden; font-size: 9px; font-weight: 750; letter-spacing: .1px; text-overflow: ellipsis; white-space: nowrap; }
  .sf-bottom-center-slot { position: relative; display: flex; justify-content: center; }
  .sf-bottom-center {
    position: absolute; top: -27px; width: 84px; min-height: 68px; padding: 7px 6px 6px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
    border: 1px solid var(--gb-brand-border); border-radius: 22px; cursor: pointer;
    color: var(--gb-text-on-brand); background: linear-gradient(180deg, var(--gb-brand) 0%, var(--gb-brand-dark) 100%);
    box-shadow: 0 4px 10px rgba(0, 0, 0, .2); transition: filter .18s ease, box-shadow .18s ease;
  }
  .sf-bottom-center:hover { filter: brightness(1.06); box-shadow: 0 5px 12px rgba(0, 0, 0, .22); }
  .sf-bottom-center.active { box-shadow: 0 0 0 3px var(--gb-brand-tint-medium), 0 5px 12px rgba(0, 0, 0, .22); }
  .sf-bottom-center-icon { height: 15px; display: grid; place-items: center; }
  .sf-bottom-center-week { font-size: 11px; line-height: 1.1; font-weight: 850; letter-spacing: -.1px; }
  .sf-bottom-center-rank { font-size: 8px; line-height: 1.1; font-weight: 750; opacity: .82; text-transform: uppercase; letter-spacing: .45px; }
  .sf-bottom-item:focus-visible, .sf-bottom-center:focus-visible, .sf-icon-button:focus-visible, .sf-compact-matchup:focus-visible, .sf-link-button:focus-visible, .sf-member-tab:focus-visible, .sf-week-bar-button:focus-visible { outline: none; box-shadow: var(--gb-focus-ring); }
  @media (max-width: 760px) {
    .sf-appbar { padding-inline: var(--sf-4); }
    .sf-content { padding-inline: var(--sf-4); }
  }
  @media (max-width: 620px) {
    .sf-appbar { min-height: 62px; padding: 7px var(--sf-3); }
    .sf-appbar-inner { gap: var(--sf-2); }
    .sf-brand-mark { width: 34px; height: 34px; border-radius: 10px; }
    .sf-brand-name { font-size: 13px; }
    .sf-appbar-meta { font-size: 8.5px; }
    .sf-appbar-actions > .sf-pod-mark { display: none; }
    .sf-content { padding: 14px var(--sf-3) 48px; }
    .sf-mobile-page-head { margin-bottom: var(--sf-3); }
    .sf-page-title { font-size: 18px; }
    .sf-page-subtitle { max-width: 280px; font-size: 10px; }
    .sf-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .sf-split-grid, .sf-scoreboard-grid, .sf-matchup-list { grid-template-columns: 1fr; }
    .sf-matchup-board { grid-template-columns: minmax(0, 1fr) 66px minmax(0, 1fr); }
    .sf-matchup-entry { padding: var(--sf-2); gap: 6px; }
    .sf-matchup-team { gap: var(--sf-2); }
    .sf-matchup-entry .sf-pod-mark { display: none; }
    .sf-board-score { font-size: 20px; }
    .sf-member-tabs { gap: var(--sf-1); }
    .sf-member-tab { min-height: 58px; padding: var(--sf-2); gap: var(--sf-2); }
    .sf-member-tab-role { display: none; }
    .sf-example-grid { grid-template-columns: 1fr; }
    .sf-pod-split + .sf-pod-split { border-left: 0; border-top: 1px solid var(--gb-border-subtle); }
    .sf-bottom-nav { flex-basis: 70px; min-height: 70px; padding-inline: var(--sf-1); }
    .sf-bottom-item::before, .sf-bottom-active { inset-inline: 5%; }
    .sf-bottom-center { top: -24px; width: 76px; min-height: 63px; border-radius: 20px; }
    .sf-bottom-label { font-size: 8px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .sf-app *, .sf-app *::before, .sf-app *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; }
  }
`;

function PodMark({ pod, size = '' }) {
  return <span className={`sf-pod-mark ${size}`.trim()} aria-label={`Pod ${pod.number}`}>{pod.number}</span>;
}

function recordLabel(record) {
  return record ? `${record.wins}-${record.losses}${record.ties ? `-${record.ties}` : ''}` : '0-0';
}

function statusLabel(state) {
  return state === 'live' ? 'Live scoring' : state === 'final' ? 'Final' : 'Scheduled';
}

function formatMetricValue(row) {
  if (row.format === 'money') return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(row.value);
  if (row.format === 'orders') return `${row.value} order${row.value === 1 ? '' : 's'}`;
  if (row.format === 'proposals') return `${row.value} proposal${row.value === 1 ? '' : 's'}`;
  return Number(row.value).toLocaleString('en-US');
}

function pageSubtitle(view, week) {
  if (view === 'performance') return `POD 1 individual contribution · Week ${week}`;
  if (view === 'matchups') return `Week ${week} · audit every role contribution`;
  if (view === 'standings') return '10 pods · wins rank first; completed-week points break ties';
  if (view === 'rules') return 'Attribution, role rates, margin tiers, and worked scoring examples';
  return `Current POD standing · SR, SA, and BDR · Week ${week}`;
}

function WeekControl({ week, direction, onChange }) {
  return (
    <div className="sf-week-control" aria-label="Select matchup week">
      <button className="sf-icon-button" type="button" aria-label="Previous week" disabled={week <= 1} onClick={() => onChange(week - 1)}><FantasyIcon.arrowLeft size={14} /></button>
      <div className="sf-week-label" aria-live="polite">
        <AnimatePresence initial={false} mode="popLayout" custom={direction}>
          <motion.span
            className="sf-week-label-inner"
            key={week}
            custom={direction}
            initial={(travel) => ({ opacity: 0, x: travel * 12 })}
            animate={{ opacity: 1, x: 0 }}
            exit={(travel) => ({ opacity: 0, x: travel * -12 })}
            transition={PAGE_TRANSITION}
          >Week {week}</motion.span>
        </AnimatePresence>
      </div>
      <button className="sf-icon-button" type="button" aria-label="Next week" disabled={week >= SCHEDULE.length} onClick={() => onChange(week + 1)}><FantasyIcon.arrowRight size={14} /></button>
    </div>
  );
}

function BottomNav({ view, rank, onView, onCurrentWeek }) {
  const renderItem = (item) => {
    const NavIcon = item.icon;
    const active = view === item.id;
    return (
      <button
        type="button"
        key={item.id}
        className={`sf-bottom-item ${active ? 'active' : ''}`}
        aria-current={active ? 'page' : undefined}
        onClick={() => onView(item.id)}
      >
        {active && <motion.span className="sf-bottom-active" layoutId="sf-bottom-active" transition={PAGE_TRANSITION} />}
        <NavIcon size={17} />
        <span className="sf-bottom-label">{item.navLabel || item.label}</span>
      </button>
    );
  };

  return (
    <nav className="sf-bottom-nav" aria-label="Sales Fantasy app navigation">
      {NAV_ITEMS.slice(0, 2).map(renderItem)}
      <div className="sf-bottom-center-slot">
        <button
          type="button"
          className={`sf-bottom-center ${view === 'pods' ? 'active' : ''}`}
          aria-current={view === 'pods' ? 'page' : undefined}
          aria-label={`Open POD 1 current Week ${SALES_FANTASY_CURRENT_WEEK} standing; league rank ${rank}`}
          onClick={onCurrentWeek}
        >
          <span className="sf-bottom-center-icon"><FantasyIcon.trophy size={14} /></span>
          <span className="sf-bottom-center-week">POD 1</span>
          <span className="sf-bottom-center-rank">W{SALES_FANTASY_CURRENT_WEEK} · Rank #{rank}</span>
        </button>
      </div>
      {NAV_ITEMS.slice(2).map(renderItem)}
    </nav>
  );
}

function SplitPanel({ pod, week }) {
  const split = podWeekPointSplit(pod.id, week);
  return (
    <section className="sf-pod-split" aria-label={`${pod.name} point split`}>
      <div className="sf-split-head"><span className="sf-split-title">{pod.name} roles</span><span className="sf-split-total">{split.total.toFixed(1)}</span></div>
      <RoleBreakdowns pod={pod} week={week} />
      <div className="sf-equation">
        {split.members.map((member, index) => <React.Fragment key={member.memberId}><span>{member.memberName} {member.total.toFixed(1)}</span>{index < split.members.length - 1 && <span>+</span>}</React.Fragment>)}
        <span>=</span><strong>{split.total.toFixed(1)}</strong>
      </div>
    </section>
  );
}

function MatchupBreakdown({ game, week, standings, title = 'Current matchup' }) {
  if (!game) return <article className="sf-card sf-empty">POD 1 has a bye in Week {week}.</article>;
  const home = podForId(game.home);
  const away = podForId(game.away);
  const homeRecord = standings.find((row) => row.podId === home.id);
  const awayRecord = standings.find((row) => row.podId === away.id);
  const state = weekState(week);
  const homeScore = fantasyScore(home.id, week);
  const awayScore = fantasyScore(away.id, week);
  const margin = Math.abs(homeScore - awayScore);
  return (
    <article className="sf-card">
      <div className="sf-card-head sf-matchup-card-head">
        <div><div className="sf-card-title">{title}</div><div className="sf-card-caption">Week {week} · official role contribution ledger</div></div>
        <div className={`sf-match-status ${state}`}><span className="sf-match-status-dot" />{statusLabel(state)}</div>
      </div>
      <div className="sf-matchup-board" aria-label={`${home.name} ${homeScore.toFixed(1)}, ${away.name} ${awayScore.toFixed(1)}`}>
        <section className={`sf-matchup-entry ${homeScore > awayScore ? 'leading' : ''}`}>
          <div className="sf-matchup-team"><PodMark pod={home} size="small" /><div className="sf-team-copy"><div className="sf-matchup-side">Home · rank #{homeRecord?.rank || '—'}</div><div className="sf-team-name">{home.name}</div><div className="sf-team-record">{recordLabel(homeRecord)} record</div></div></div>
          <div className="sf-board-score">{homeScore.toFixed(1)}<span className="sf-board-score-unit">points</span></div>
        </section>
        <div className="sf-matchup-centerline"><span className="sf-matchup-week">Week {week}</span><strong className="sf-matchup-margin">{margin ? `${margin.toFixed(1)} pt margin` : 'Scores level'}</strong></div>
        <section className={`sf-matchup-entry away ${awayScore > homeScore ? 'leading' : ''}`}>
          <div className="sf-matchup-team"><PodMark pod={away} size="small" /><div className="sf-team-copy"><div className="sf-matchup-side">Away · rank #{awayRecord?.rank || '—'}</div><div className="sf-team-name">{away.name}</div><div className="sf-team-record">{recordLabel(awayRecord)} record</div></div></div>
          <div className="sf-board-score">{awayScore.toFixed(1)}<span className="sf-board-score-unit">points</span></div>
        </section>
      </div>
      <div className="sf-split-grid"><SplitPanel pod={home} week={week} /><SplitPanel pod={away} week={week} /></div>
      <div className="sf-score-note"><strong>How it adds up:</strong> SR, SA, and BDR earn Activity and Sales at the rates shown in Rules. BDR can also earn Referred points from qualifying orders on BDR-owned accounts. The three role totals reconcile to the official POD score.</div>
    </article>
  );
}

function CompactMatchup({ game, week, selected, onSelect }) {
  const pods = [podForId(game.home), podForId(game.away)];
  const mine = pods.some((pod) => pod.id === MY_POD_ID);
  return (
    <motion.button type="button" layout className={`sf-compact-matchup ${selected ? 'selected' : ''}`} onClick={onSelect} aria-pressed={selected}>
      <div className="sf-compact-top"><span>{mine ? 'Your matchup' : 'League matchup'}</span><span>{statusLabel(weekState(week))}</span></div>
      {pods.map((pod) => <div className="sf-compact-team" key={pod.id}><PodMark pod={pod} size="small" /><span className="sf-compact-name">{pod.name}</span><span className="sf-compact-score">{fantasyScore(pod.id, week).toFixed(1)}</span></div>)}
    </motion.button>
  );
}

function ByeCard({ byes }) {
  if (!byes.length) return null;
  const names = byes.map((podId) => podForId(podId).name).join(' · ');
  return <div className="sf-bye-card"><span className="sf-bye-icon"><I.pause size={14} /></span><div><div className="sf-bye-title">Bye week</div><div className="sf-bye-pods">{names}</div></div></div>;
}

function Performance({ week, selectedMemberId, onSelectMember, onSelectWeek }) {
  const pod = podForId(MY_POD_ID);
  const split = podWeekPointSplit(pod.id, week);
  const memberIndex = Math.max(0, pod.members.findIndex((member) => member.id === selectedMemberId));
  const member = pod.members[memberIndex];
  const points = split.members[memberIndex];
  const resultPoints = member.roleId === 'bdr'
    ? (points.sales?.total || 0) + (points.referred?.total || 0)
    : points.sales?.total || 0;
  const share = split.total ? points.total / split.total * 100 : 0;
  const weekScores = Array.from({ length: SCHEDULE.length }, (_, index) => memberWeekPointSplit(pod.id, member.id, index + 1).total);
  const maximum = Math.max(...weekScores, 1);
  const previous = week > 1 ? weekScores[week - 2] : null;
  const change = previous === null ? null : Number((points.total - previous).toFixed(1));
  return (
    <div className="sf-stack">
      <div className="sf-member-tabs" aria-label="Select individual performance">
        {pod.members.map((candidate) => {
          const active = candidate.id === member.id;
          return <button type="button" className={`sf-member-tab ${active ? 'active' : ''}`} aria-pressed={active} key={candidate.id} onClick={() => onSelectMember(candidate.id)}>{active && <motion.span aria-hidden="true" className="sf-member-active" layoutId="sf-member-active" transition={PAGE_TRANSITION} />}<span className="sf-avatar">{candidate.name}</span><span className="sf-member-tab-copy"><span className="sf-member-tab-name">{candidate.name}</span><span className="sf-member-tab-role">{candidate.role}</span></span></button>;
        })}
      </div>
      <AnimatePresence initial={false} mode="wait">
        <motion.div className="sf-performance-detail" key={member.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={PAGE_TRANSITION}>
          <article className="sf-card sf-performance-card">
            <div className="sf-performance-hero"><span className="sf-avatar">{member.name}</span><div className="sf-performance-copy"><div className="sf-performance-name">{member.name}</div><div className="sf-performance-meta">{member.role} · POD 1 · Week {week}</div></div><div className="sf-performance-score"><div className="sf-performance-score-value">{points.total.toFixed(1)}</div><div className="sf-performance-score-label">Individual points</div></div></div>
            <div className="sf-stat-grid">
              <div className="sf-stat"><div className="sf-stat-label">Activity</div><div className="sf-stat-value">{points.activity.total.toFixed(1)}</div><div className="sf-stat-detail">Verified weekly actions</div></div>
              <div className="sf-stat"><div className="sf-stat-label">{member.roleId === 'bdr' ? 'Sales + referred' : 'Sales'}</div><div className="sf-stat-value">{resultPoints.toFixed(1)}</div><div className="sf-stat-detail">{member.roleId === 'bdr' ? 'Owned results plus account referrals' : 'Owned proposals and completed results'}</div></div>
              <div className="sf-stat"><div className="sf-stat-label">POD share</div><div className="sf-stat-value">{share.toFixed(1)}%</div><div className="sf-stat-detail">Of Week {week} total</div></div>
              <div className="sf-stat"><div className="sf-stat-label">Week change</div><div className="sf-stat-value">{change === null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(1)}`}</div><div className={`sf-stat-detail ${change > 0 ? 'sf-positive' : ''}`}>{previous === null ? 'First scored week' : `From ${previous.toFixed(1)} points`}</div></div>
            </div>
            <div className="sf-role-categories">
              <MetricCategory name="Activity" score={points.activity} />
              {points.sales && <MetricCategory name="Sales" score={points.sales} />}
              {points.referred && <MetricCategory name="Referred" score={points.referred} />}
            </div>
          </article>
          <article className="sf-card">
            <div className="sf-card-head"><div><div className="sf-card-title">Weekly performance</div><div className="sf-card-caption">Select a week to audit this individual’s score</div></div></div>
            <div className="sf-week-trend">
              {weekScores.map((score, index) => <button type="button" className={`sf-week-bar-button ${week === index + 1 ? 'active' : ''}`} aria-label={`Week ${index + 1}: ${score.toFixed(1)} points`} aria-pressed={week === index + 1} key={index + 1} onClick={() => onSelectWeek(index + 1)}><span className="sf-week-bar-value">{score.toFixed(0)}</span><span className="sf-week-bar-track"><span className="sf-week-bar-fill" style={{ height: `${Math.max(5, score / maximum * 100)}%` }} /></span><span className="sf-week-bar-label">W{index + 1}</span></button>)}
            </div>
          </article>
        </motion.div>
      </AnimatePresence>
      <div className="sf-data-note">Every displayed point reconciles to the raw metric rows above.</div>
    </div>
  );
}

function ruleRate(rule, roleId) {
  const rate = rule.pointsByRole?.[roleId] || 0;
  if (!rate) return 'No points';
  if (rule.format === 'money') return `${rate * 1000} / $1k`;
  return `${rate} each`;
}

function Rules() {
  const scoringDays = SALES_FANTASY_SCORING.scoringDaysPerWeek;
  const highOutput = scoreRoleMetrics({ activity: { emailsSent: 400 * scoringDays, emailsReplied: 25, outboundCalls: 65 * scoringDays, inboundCalls: 0 } }, 'bdr');
  const minimumOutput = scoreRoleMetrics({ activity: { emailsSent: 100 * scoringDays, emailsReplied: 0, outboundCalls: 20 * scoringDays, inboundCalls: 0 } }, 'bdr');
  return (
    <div className="sf-stack">
      <article className="sf-card">
        <div className="sf-card-head"><div><div className="sf-card-title">Scoring overview</div><div className="sf-card-caption">Your verified weekly results determine your score</div></div></div>
        <div className="sf-rule-intro">Your individual score is the total of the Activity, Sales, and Referred rows that apply to you. A POD score is the combined total of its SR, SA, and BDR. Every detail row shows both the verified result and the points earned.</div>
      </article>

      <article className="sf-card sf-rule-section">
        <div className="sf-card-head"><div><div className="sf-card-title">1 · Activity rates</div><div className="sf-card-caption">Verified actions × the listed rate over {scoringDays} business days</div></div></div>
        <div className="sf-rule-table-wrap"><table className="sf-rule-table"><thead><tr><th>Activity</th>{SALES_FANTASY_ROLES.map((role) => <th key={role.id}>{role.label}</th>)}</tr></thead><tbody>{SALES_FANTASY_SCORING.activity.map((rule) => <tr key={rule.id}><td>{rule.label}</td>{SALES_FANTASY_ROLES.map((role) => <td key={role.id}>{ruleRate(rule, role.id)}</td>)}</tr>)}</tbody></table></div>
      </article>

      <article className="sf-card sf-rule-section">
        <div className="sf-card-head"><div><div className="sf-card-title">2 · Sales rates</div><div className="sf-card-caption">SR, SA, and BDR use the same point values</div></div></div>
        <div className="sf-rule-table-wrap"><table className="sf-rule-table"><thead><tr><th>Sales metric</th>{SALES_FANTASY_ROLES.map((role) => <th key={role.id}>{role.label}</th>)}</tr></thead><tbody>{SALES_FANTASY_SCORING.sales.map((rule) => <tr key={rule.id}><td>{rule.label}</td>{SALES_FANTASY_ROLES.map((role) => <td key={role.id}>{ruleRate(rule, role.id)}</td>)}</tr>)}</tbody></table></div>
      </article>

      <article className="sf-card sf-rule-section">
        <div className="sf-card-head"><div><div className="sf-card-title">3 · Margin bonuses</div><div className="sf-card-caption">The highest qualifying tier applies to each proposal and completed order</div></div></div>
        <div className="sf-rule-table-wrap"><table className="sf-rule-table"><thead><tr><th>Margin</th><th>Proposal bonus</th><th>Order bonus</th></tr></thead><tbody>{SALES_FANTASY_SCORING.marginTiers.map((tier) => <tr key={tier.id}><td>{tier.label}</td><td>+{tier.proposalBonusPoints}</td><td>+{tier.orderBonusPoints}</td></tr>)}</tbody></table></div>
      </article>

      <article className="sf-card sf-rule-section">
        <div className="sf-card-head"><div><div className="sf-card-title">4 · BDR scoring details</div><div className="sf-card-caption">Activity and Sales, plus qualifying Referred points</div></div></div>
        <div className="sf-rule-section-body">
          <ul className="sf-rule-list"><li>BDR proposals, orders, sales, profit, and margin bonuses use the same rates shown in the Sales and Margin tables.</li><li>Referred order: +{SALES_FANTASY_SCORING.referral.find((rule) => rule.id === 'referredOrders').pointsPerUnit} points when the account is assigned to the BDR as the qualifying order is placed.</li><li>Referred dollars: +{SALES_FANTASY_SCORING.referral.find((rule) => rule.id === 'referredSales').pointsPerUnit * 1000} points per $1,000 on those qualifying orders.</li><li>Outbound calls earn more per completed action than email replies.</li></ul>
          <div className="sf-example-grid">
            <div className="sf-example"><div className="sf-example-label">Activity example</div><div className="sf-example-value">{highOutput.total.toFixed(1)} pts</div><div className="sf-example-detail">400 emails/day + 65 outbound calls/day for {scoringDays} days + 25 replies. Sales and Referred points are added separately.</div></div>
            <div className="sf-example"><div className="sf-example-label">Activity example</div><div className="sf-example-value">{minimumOutput.total.toFixed(1)} pts</div><div className="sf-example-detail">100 emails/day + 20 outbound calls/day for {scoringDays} days and zero replies. Sales and Referred points are added separately.</div></div>
          </div>
        </div>
      </article>

      <div className="sf-data-note">All displayed totals use the rates shown on this page.</div>
    </div>
  );
}

function PodDashboard({ week, standings, onView }) {
  const weekData = SCHEDULE[week - 1];
  const myStanding = standings.find((row) => row.podId === MY_POD_ID);
  const game = matchupForPod(weekData, MY_POD_ID);
  const currentPoints = fantasyScore(MY_POD_ID, week);
  return (
    <div className="sf-stack">
      <div className="sf-stat-grid">
        <div className="sf-stat"><div className="sf-stat-label">League rank</div><div className="sf-stat-value">#{myStanding.rank}</div><div className="sf-stat-detail sf-positive">POD 1 standing</div></div>
        <div className="sf-stat"><div className="sf-stat-label">Pod record</div><div className="sf-stat-value">{recordLabel(myStanding)}</div><div className="sf-stat-detail">{myStanding.byes ? `${myStanding.byes} bye used` : 'Bye ahead'}</div></div>
        <div className="sf-stat"><div className="sf-stat-label">Season points</div><div className="sf-stat-value">{myStanding.pointsFor.toFixed(1)}</div><div className="sf-stat-detail">Completed weeks</div></div>
        <div className="sf-stat"><div className="sf-stat-label">Week {week} points</div><div className="sf-stat-value">{currentPoints.toFixed(1)}</div><div className="sf-stat-detail">SR + SA + BDR</div></div>
      </div>
      <MatchupBreakdown game={game} week={week} standings={standings} title="POD 1 matchup" />
      <div className="sf-section-label"><h2 className="sf-section-title">Week {week} around the league</h2><button type="button" className="sf-link-button" onClick={() => onView('matchups')}>Open scoreboard</button></div>
      <div className="sf-scoreboard-grid">{weekData.games.filter((item) => item !== game).map((item) => <CompactMatchup game={item} week={week} key={item.id} selected={false} onSelect={() => onView('matchups')} />)}<ByeCard byes={weekData.byes} /></div>
      <div className="sf-data-note">Preview scoring is deterministic until the production metrics feed is connected.</div>
    </div>
  );
}

function Matchups({ week, standings, selectedGameId, onSelectGame }) {
  const weekData = SCHEDULE[week - 1];
  const myGame = matchupForPod(weekData, MY_POD_ID);
  const selectedGame = weekData.games.find((game) => game.id === selectedGameId) || myGame || weekData.games[0];
  return (
    <div className="sf-stack">
      <AnimatePresence initial={false} mode="wait">
        <motion.div key={selectedGame?.id || `bye-${week}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={PAGE_TRANSITION}>
          <MatchupBreakdown game={selectedGame} week={week} standings={standings} />
        </motion.div>
      </AnimatePresence>
      <div className="sf-section-label"><h2 className="sf-section-title">All Week {week} matchups</h2><span className="sf-section-note">{weekData.games.length} head to head</span></div>
      <div className="sf-matchup-list">{weekData.games.map((game) => <CompactMatchup game={game} week={week} key={game.id} selected={game.id === selectedGame.id} onSelect={() => onSelectGame(game.id)} />)}</div>
      <ByeCard byes={weekData.byes} />
    </div>
  );
}

function Standings({ standings }) {
  return (
    <div className="sf-stack">
      <div className="sf-card sf-table-wrap"><table className="sf-league-table"><thead><tr><th>Rank</th><th>Pod</th><th>W</th><th>L</th><th>Bye</th><th>Points for</th></tr></thead><tbody>{standings.map((row) => { const pod = podForId(row.podId); return <tr className={pod.id === MY_POD_ID ? 'mine' : ''} key={pod.id}><td><span className={`sf-rank-badge ${row.rank <= 3 ? 'top' : ''}`}>{row.rank}</span></td><td><div className="sf-standing-team"><PodMark pod={pod} size="small" /><span className="sf-team-name">{pod.name}</span></div></td><td>{row.wins}</td><td>{row.losses}</td><td>{row.byes}</td><td className="sf-metric-primary">{row.pointsFor.toFixed(1)}</td></tr>; })}</tbody></table></div>
      <div className="sf-data-note">Standings include completed matchups only.</div>
    </div>
  );
}

function MetricCategory({ name, score }) {
  return (
    <section className="sf-category" aria-label={`${name} points`}>
      <div className="sf-category-head"><span className="sf-category-name">{name}</span><span className="sf-category-points">{score.total.toFixed(1)} pts</span></div>
      {score.rows.map((row) => (
        <div className="sf-metric-row" key={row.id}>
          <span className="sf-metric-label">{row.label}</span>
          <span className="sf-metric-value">{formatMetricValue(row)}</span>
          <span className="sf-metric-points">+{row.points.toFixed(1)}</span>
        </div>
      ))}
      {score.marginTiers && (
        <div className="sf-margin-summary" aria-label="Proposals and completed orders by margin tier">
          {score.marginTiers.map((tier) => (
            <span className={`sf-margin-chip ${tier.proposals || tier.orders ? 'hit' : ''}`} key={tier.id}>
              {tier.label}: {tier.proposals}P / {tier.orders}O
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function RoleBreakdowns({ pod, week }) {
  const split = podWeekPointSplit(pod.id, week);
  return (
    <div className="sf-role-list">
      {pod.members.map((member, index) => {
        const points = split.members[index];
        return (
          <section className="sf-role-card" key={member.id}>
            <div className="sf-role-head">
              <span className="sf-avatar">{member.name}</span>
              <div className="sf-role-head-copy"><div className="sf-role-name">{member.name}</div><div className="sf-role-title">{member.role}</div></div>
              <div className="sf-role-total"><div className="sf-role-total-value">{points.total.toFixed(1)}</div><div className="sf-role-total-label">Role points</div></div>
            </div>
            <div className="sf-role-categories">
              <MetricCategory name="Activity" score={points.activity} />
              {points.sales && <MetricCategory name="Sales" score={points.sales} />}
              {points.referred && <MetricCategory name="Referred" score={points.referred} />}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function SalesFantasyApp() {
  const [view, setView] = useState('pods');
  const [week, setWeek] = useState(SALES_FANTASY_CURRENT_WEEK);
  const [direction, setDirection] = useState(1);
  const [selectedMemberId, setSelectedMemberId] = useState(SALES_FANTASY_PODS[0].members[0].id);
  const [selectedGameId, setSelectedGameId] = useState(matchupForPod(SCHEDULE[SALES_FANTASY_CURRENT_WEEK - 1], MY_POD_ID)?.id || '');
  const standings = useMemo(() => buildStandings(SALES_FANTASY_PODS, SCHEDULE, SALES_FANTASY_CURRENT_WEEK), []);
  const myPod = podForId(MY_POD_ID);
  const myStanding = standings.find((row) => row.podId === MY_POD_ID);
  const page = PAGES.find((item) => item.id === view) || POD_PAGE;
  const showWeekControl = view !== 'standings' && view !== 'rules';

  const changeWeek = (nextWeek) => {
    setDirection(nextWeek > week ? 1 : -1);
    setWeek(nextWeek);
  };
  const changeView = (nextView) => {
    const currentIndex = VIEW_ORDER.indexOf(view);
    const nextIndex = VIEW_ORDER.indexOf(nextView);
    setDirection(nextIndex >= currentIndex ? 1 : -1);
    setView(nextView);
  };
  const returnToCurrentWeek = () => {
    setDirection(SALES_FANTASY_CURRENT_WEEK >= week ? 1 : -1);
    setWeek(SALES_FANTASY_CURRENT_WEEK);
    setView('pods');
  };
  const contentKey = showWeekControl ? `${view}-${week}` : view;

  return (
    <><style>{CSS}</style><div className="sf-app" data-gb-ui-root>
      <header className="sf-appbar">
        <div className="sf-appbar-inner">
          <div className="sf-appbar-brand"><span className="sf-brand-mark"><FantasyIcon.trophy size={17} /></span><div className="sf-brand-copy"><div className="sf-brand-name">Sales Fantasy</div><div className="sf-appbar-meta"><span className="sf-live-dot" />Season 01 · Week {SALES_FANTASY_CURRENT_WEEK} of {SCHEDULE.length}</div></div></div>
          <div className="sf-appbar-actions">
            <AnimatePresence initial={false} mode="wait">
              {showWeekControl
                ? <motion.div className="sf-week-wrap" key="week-control" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} transition={PAGE_TRANSITION}><WeekControl week={week} direction={direction} onChange={changeWeek} /></motion.div>
                : <motion.div className="sf-standing-chip" key="standing-chip" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} transition={PAGE_TRANSITION}><FantasyIcon.standings size={13} />Rank #{myStanding.rank}</motion.div>}
            </AnimatePresence>
            <PodMark pod={myPod} size="small" />
          </div>
        </div>
      </header>
      <main className="sf-main">
        <div className="sf-content">
          <AnimatePresence initial={false} mode="wait">
            <motion.div className="sf-mobile-page-head" key={`head-${page.id}-${week}`} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={PAGE_TRANSITION}>
              <div><div className="sf-page-title-row"><h1 className="sf-page-title">{page.label}</h1><span className="sf-event-pill">EVENT</span></div><div className="sf-page-subtitle">{pageSubtitle(view, week)}</div></div>
              {view === 'matchups' && <span className={`sf-status-pill sf-live-pill ${weekState(week)}`}><span className="sf-live-dot" />{statusLabel(weekState(week))}</span>}
            </motion.div>
          </AnimatePresence>
          <AnimatePresence initial={false} mode="wait" custom={direction}>
            <motion.div className="sf-view-motion" key={contentKey} custom={direction} initial={(travel) => ({ opacity: 0, x: travel * 14 })} animate={{ opacity: 1, x: 0 }} exit={(travel) => ({ opacity: 0, x: travel * -14 })} transition={PAGE_TRANSITION}>
              {view === 'performance' && <Performance week={week} selectedMemberId={selectedMemberId} onSelectMember={setSelectedMemberId} onSelectWeek={changeWeek} />}
              {view === 'matchups' && <Matchups week={week} standings={standings} selectedGameId={selectedGameId} onSelectGame={setSelectedGameId} />}
              {view === 'standings' && <Standings standings={standings} />}
              {view === 'rules' && <Rules />}
              {view === 'pods' && <PodDashboard week={week} standings={standings} onView={changeView} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      <BottomNav view={view} rank={myStanding.rank} onView={changeView} onCurrentWeek={returnToCurrentWeek} />
    </div></>
  );
}

ensureTheme();
const root = document.getElementById('sales-fantasy-root');
if (root) createRoot(root).render(<SalesFantasyApp />);
