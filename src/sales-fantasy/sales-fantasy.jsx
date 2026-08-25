import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion } from 'motion/react';
import { ensureTheme } from '../lib/theme.js';
import { I, Icon } from '../ui';
import {
  SALES_FANTASY_CURRENT_WEEK,
  SALES_FANTASY_PODS,
  buildFantasySchedule,
  buildStandings,
  fantasyScore,
  matchupForPod,
  podForId,
  podWeekPointSplit,
  weekState,
} from '../lib/salesFantasy.js';

const MY_POD_ID = 'pod-1';
const SCHEDULE = buildFantasySchedule(SALES_FANTASY_PODS);
const EASE = [0.22, 1, 0.36, 1];
const PAGE_TRANSITION = { duration: 0.2, ease: EASE };

const FantasyIcon = {
  overview: (props) => <Icon {...props}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></Icon>,
  matchup: (props) => <Icon {...props}><path d="M8 5l4 4 4-4" /><path d="M8 19l4-4 4 4" /><path d="M12 9v6" /><path d="M3 12h5M16 12h5" /></Icon>,
  standings: (props) => <Icon {...props}><path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7" /></Icon>,
  trophy: (props) => <Icon {...props}><path d="M8 4h8v5a4 4 0 01-8 0V4z" /><path d="M8 6H4v2a4 4 0 004 4M16 6h4v2a4 4 0 01-4 4M12 13v4M8 21h8M9 17h6" /></Icon>,
  arrowLeft: (props) => <Icon {...props}><path d="M15 18l-6-6 6-6" /></Icon>,
  arrowRight: (props) => <Icon {...props}><path d="M9 18l6-6-6-6" /></Icon>,
};

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', navLabel: 'Home', icon: FantasyIcon.overview },
  { id: 'matchups', label: 'Matchups', icon: FantasyIcon.matchup },
  { id: 'standings', label: 'Standings', icon: FantasyIcon.standings },
  { id: 'pods', label: 'Pods', icon: I.users },
];

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
  .sf-brand-copy, .sf-team-copy, .sf-pod-copy { min-width: 0; }
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
  .sf-week-control { min-height: 38px; display: flex; align-items: stretch; border: 1px solid var(--gb-border-strong); border-radius: var(--gb-r-md); background: var(--gb-fill-subtle); overflow: hidden; }
  .sf-icon-button { width: 36px; min-height: 36px; padding: 0; display: grid; place-items: center; border: 0; cursor: pointer; color: var(--gb-text-tertiary); background: transparent; transition: color .16s ease, background-color .16s ease; }
  .sf-icon-button:hover:not(:disabled) { color: var(--gb-text-primary); background: var(--gb-fill-soft); }
  .sf-icon-button:disabled { cursor: default; color: var(--gb-text-ghost); }
  .sf-week-label { position: relative; width: 82px; min-height: 36px; overflow: hidden; color: var(--gb-text-primary); border-inline: 1px solid var(--gb-border-default); font-size: 11px; font-weight: 750; text-align: center; }
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
  .sf-section-label, .sf-view-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sf-3); }
  .sf-section-title, .sf-view-heading { margin: 0; color: var(--gb-text-primary); font-size: 15px; line-height: 1.3; letter-spacing: -.2px; }
  .sf-section-note, .sf-view-copy { color: var(--gb-text-muted); font-size: 10.5px; line-height: 1.4; }
  .sf-view-copy { margin-top: var(--sf-1); }
  .sf-stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--sf-2); }
  .sf-stat { min-width: 0; padding: var(--sf-3); border: 1px solid var(--gb-border-default); border-radius: var(--gb-r-lg); background: var(--gb-surface-1); }
  .sf-stat-label { color: var(--gb-text-muted); font-size: 10px; font-weight: 750; letter-spacing: .45px; text-transform: uppercase; overflow-wrap: anywhere; }
  .sf-stat-value { margin-top: var(--sf-2); color: var(--gb-text-primary); font-size: 20px; line-height: 1.15; font-weight: 850; letter-spacing: -.5px; font-variant-numeric: tabular-nums; }
  .sf-stat-detail { margin-top: var(--sf-1); color: var(--gb-text-tertiary); font-size: 10px; line-height: 1.4; overflow-wrap: anywhere; }
  .sf-positive { color: var(--gb-success-fg); }
  .sf-match-status { display: flex; align-items: center; gap: 6px; color: var(--gb-text-muted); font-size: 9px; font-weight: 800; letter-spacing: .55px; text-transform: uppercase; white-space: nowrap; }
  .sf-match-status.live { color: var(--gb-success-fg); }
  .sf-match-status-dot { width: 6px; height: 6px; flex: 0 0 auto; border-radius: 50%; background: currentColor; }
  .sf-score-hero { padding: var(--sf-4); display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: var(--sf-3); background: var(--gb-fill-faint); }
  .sf-score-team { min-width: 0; display: flex; align-items: center; gap: var(--sf-3); }
  .sf-score-team.away { flex-direction: row-reverse; text-align: right; }
  .sf-team-name { color: var(--gb-text-primary); font-size: 13px; font-weight: 750; overflow-wrap: anywhere; }
  .sf-team-record { margin-top: 2px; color: var(--gb-text-muted); font-size: 10px; line-height: 1.4; }
  .sf-score { margin-top: var(--sf-1); color: var(--gb-text-primary); font-size: 27px; line-height: 1.05; font-weight: 850; letter-spacing: -.8px; font-variant-numeric: tabular-nums; }
  .sf-vs { width: 32px; height: 32px; display: grid; place-items: center; border: 1px solid var(--gb-border-default); border-radius: 50%; color: var(--gb-text-muted); background: var(--gb-surface-1); font-size: 9px; font-weight: 850; }
  .sf-split-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-top: 1px solid var(--gb-border-subtle); }
  .sf-pod-split { min-width: 0; padding: var(--sf-4); }
  .sf-pod-split + .sf-pod-split { border-left: 1px solid var(--gb-border-subtle); }
  .sf-split-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sf-2); margin-bottom: var(--sf-2); }
  .sf-split-title { color: var(--gb-text-primary); font-size: 11px; font-weight: 750; }
  .sf-split-total { color: var(--gb-brand-label); font-size: 12px; font-weight: 850; font-variant-numeric: tabular-nums; }
  .sf-split-columns { display: grid; grid-template-columns: minmax(54px, 1fr) repeat(3, minmax(34px, auto)) minmax(42px, auto); gap: 6px; color: var(--gb-text-muted); font-size: 8.5px; font-weight: 750; letter-spacing: .25px; text-align: right; text-transform: uppercase; }
  .sf-rep-split { min-width: 0; padding: 9px 0; display: grid; grid-template-columns: minmax(54px, 1fr) repeat(3, minmax(34px, auto)) minmax(42px, auto); align-items: center; gap: 6px; border-top: 1px solid var(--gb-border-subtle); }
  .sf-rep-split:first-of-type { border-top: 0; }
  .sf-rep-name { min-width: 0; color: var(--gb-text-secondary); font-size: 10.5px; font-weight: 700; overflow-wrap: anywhere; }
  .sf-point-part { color: var(--gb-text-muted); font-size: 10px; text-align: right; font-variant-numeric: tabular-nums; }
  .sf-point-total { padding-left: 6px; color: var(--gb-brand-label); border-left: 1px solid var(--gb-border-default); font-size: 11px; font-weight: 850; text-align: right; font-variant-numeric: tabular-nums; }
  .sf-equation { padding-top: var(--sf-2); display: flex; flex-wrap: wrap; align-items: center; gap: 4px; color: var(--gb-text-muted); border-top: 1px solid var(--gb-border-default); font-size: 9.5px; line-height: 1.5; }
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
  .sf-standing-list { padding: var(--sf-1) 0; }
  .sf-standing-row { padding: var(--sf-2) var(--sf-3); display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; align-items: center; gap: var(--sf-2); border-bottom: 1px solid var(--gb-border-subtle); }
  .sf-standing-row:last-child { border-bottom: 0; }
  .sf-standing-rank { color: var(--gb-text-muted); font-size: 10px; font-weight: 750; text-align: center; }
  .sf-standing-team { min-width: 0; display: flex; align-items: center; gap: var(--sf-2); }
  .sf-standing-name { color: var(--gb-text-secondary); font-size: 11px; font-weight: 650; overflow-wrap: anywhere; }
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
  .sf-pod-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--sf-2); }
  .sf-pod-tile { min-width: 0; padding: var(--sf-2); display: flex; align-items: center; gap: var(--sf-2); border: 1px solid var(--gb-border-default); border-radius: var(--gb-r-lg); cursor: pointer; color: var(--gb-text-secondary); background: var(--gb-surface-1); text-align: left; transition: border-color .16s ease, background-color .16s ease, box-shadow .16s ease; }
  .sf-pod-tile:hover { background: var(--gb-fill-soft); border-color: var(--gb-border-strong); }
  .sf-pod-tile.active { color: var(--gb-brand-label); border-color: var(--gb-brand-label); background: var(--gb-brand-tint-soft); box-shadow: none; }
  .sf-pod-tile-name { color: var(--gb-text-primary); font-size: 10.5px; font-weight: 700; overflow-wrap: anywhere; }
  .sf-pod-tile-meta { margin-top: 1px; color: var(--gb-text-muted); font-size: 9px; }
  .sf-pod-hero { padding: var(--sf-4); display: flex; align-items: center; gap: var(--sf-3); }
  .sf-pod-hero-copy { min-width: 0; flex: 1; }
  .sf-pod-hero-name { color: var(--gb-text-primary); font-size: 17px; font-weight: 800; letter-spacing: -.25px; }
  .sf-pod-hero-meta { margin-top: 3px; color: var(--gb-text-muted); font-size: 10.5px; line-height: 1.4; overflow-wrap: anywhere; }
  .sf-pod-hero-score { text-align: right; }
  .sf-pod-hero-value { color: var(--gb-text-primary); font-size: 20px; line-height: 1.15; font-weight: 850; font-variant-numeric: tabular-nums; }
  .sf-pod-hero-label { margin-top: 2px; color: var(--gb-text-muted); font-size: 9px; font-weight: 700; letter-spacing: .45px; text-transform: uppercase; }
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
    color: var(--gb-text-muted); transition: color .18s ease, background-color .18s ease;
  }
  .sf-bottom-item:hover { color: var(--gb-text-primary); background: var(--gb-fill-subtle); }
  .sf-bottom-item.active { color: var(--gb-brand-label); }
  .sf-bottom-active { position: absolute; z-index: -1; inset: 5px 12%; border-radius: var(--gb-r-md); background: var(--gb-brand-tint-soft); }
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
  .sf-bottom-center-icon { height: 15px; display: grid; place-items: center; }
  .sf-bottom-center-week { font-size: 11px; line-height: 1.1; font-weight: 850; letter-spacing: -.1px; }
  .sf-bottom-center-rank { font-size: 8px; line-height: 1.1; font-weight: 750; opacity: .82; text-transform: uppercase; letter-spacing: .45px; }
  .sf-bottom-item:focus-visible, .sf-bottom-center:focus-visible, .sf-icon-button:focus-visible, .sf-pod-tile:focus-visible, .sf-compact-matchup:focus-visible, .sf-link-button:focus-visible { outline: none; box-shadow: var(--gb-focus-ring); }
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
    .sf-week-control { min-height: 34px; }
    .sf-icon-button { width: 31px; min-height: 32px; }
    .sf-week-label { width: 65px; min-height: 32px; font-size: 10px; }
    .sf-content { padding: 14px var(--sf-3) 48px; }
    .sf-mobile-page-head { margin-bottom: var(--sf-3); }
    .sf-page-title { font-size: 18px; }
    .sf-page-subtitle { max-width: 280px; font-size: 10px; }
    .sf-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .sf-split-grid, .sf-scoreboard-grid, .sf-matchup-list { grid-template-columns: 1fr; }
    .sf-pod-split + .sf-pod-split { border-left: 0; border-top: 1px solid var(--gb-border-subtle); }
    .sf-pod-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .sf-bottom-nav { flex-basis: 70px; min-height: 70px; padding-inline: var(--sf-1); }
    .sf-bottom-active { inset-inline: 5%; }
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
          className="sf-bottom-center"
          aria-label={`Return to current Week ${SALES_FANTASY_CURRENT_WEEK} overview; POD 1 is rank ${rank}`}
          onClick={onCurrentWeek}
        >
          <span className="sf-bottom-center-icon"><FantasyIcon.trophy size={14} /></span>
          <span className="sf-bottom-center-week">Week {SALES_FANTASY_CURRENT_WEEK}</span>
          <span className="sf-bottom-center-rank">Rank #{rank}</span>
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
      <div className="sf-split-head"><span className="sf-split-title">{pod.name} reps</span><span className="sf-split-total">{split.total.toFixed(1)}</span></div>
      <div className="sf-split-columns" aria-hidden="true"><span /><span>Sales</span><span>Margin</span><span>Orders</span><span>Total</span></div>
      {split.members.map((member) => (
        <div className="sf-rep-split" key={member.memberId}>
          <span className="sf-rep-name">{member.memberName}</span>
          <span className="sf-point-part" title="Sales points">{member.sales.toFixed(1)}</span>
          <span className="sf-point-part" title="Margin points">{member.margin.toFixed(1)}</span>
          <span className="sf-point-part" title="Order points">{member.orders.toFixed(1)}</span>
          <strong className="sf-point-total">{member.total.toFixed(1)}</strong>
        </div>
      ))}
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
  return (
    <article className="sf-card">
      <div className="sf-card-head">
        <div><div className="sf-card-title">{title}</div><div className="sf-card-caption">Week {week} · every total is the sum of three reps</div></div>
        <div className={`sf-match-status ${state}`}><span className="sf-match-status-dot" />{statusLabel(state)}</div>
      </div>
      <div className="sf-score-hero">
        <div className="sf-score-team"><PodMark pod={home} size="large" /><div className="sf-team-copy"><div className="sf-team-name">{home.name}</div><div className="sf-team-record">{recordLabel(homeRecord)} · rank #{homeRecord?.rank || '—'}</div><div className="sf-score">{fantasyScore(home.id, week).toFixed(1)}</div></div></div>
        <div className="sf-vs">VS</div>
        <div className="sf-score-team away"><PodMark pod={away} size="large" /><div className="sf-team-copy"><div className="sf-team-name">{away.name}</div><div className="sf-team-record">{recordLabel(awayRecord)} · rank #{awayRecord?.rank || '—'}</div><div className="sf-score">{fantasyScore(away.id, week).toFixed(1)}</div></div></div>
      </div>
      <div className="sf-split-grid"><SplitPanel pod={home} week={week} /><SplitPanel pod={away} week={week} /></div>
      <div className="sf-score-note"><strong>How it adds up:</strong> each rep earns sales, margin, and order points. Those three categories make the rep total; all three rep totals make the POD score above.</div>
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

function StandingsPreview({ standings, onViewAll }) {
  return (
    <article className="sf-card">
      <div className="sf-card-head"><div><div className="sf-card-title">League leaders</div><div className="sf-card-caption">Through Week {SALES_FANTASY_CURRENT_WEEK - 1}</div></div><button type="button" className="sf-link-button" onClick={onViewAll}>View all</button></div>
      <div className="sf-standing-list">
        {standings.slice(0, 5).map((row) => { const pod = podForId(row.podId); return <div className="sf-standing-row" key={row.podId}><div className="sf-standing-rank">{row.rank}</div><div className="sf-standing-team"><PodMark pod={pod} size="small" /><span className="sf-standing-name">{pod.name}</span></div><div className="sf-standing-record">{recordLabel(row)}</div></div>; })}
      </div>
    </article>
  );
}

function Overview({ week, standings, onView }) {
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
        <div className="sf-stat"><div className="sf-stat-label">Week {week} points</div><div className="sf-stat-value">{currentPoints.toFixed(1)}</div><div className="sf-stat-detail">3 rep totals</div></div>
      </div>
      <MatchupBreakdown game={game} week={week} standings={standings} title="POD 1 matchup" />
      <div className="sf-section-label"><h2 className="sf-section-title">Week {week} around the league</h2><button type="button" className="sf-link-button" onClick={() => onView('matchups')}>Open scoreboard</button></div>
      <div className="sf-scoreboard-grid">{weekData.games.filter((item) => item !== game).map((item) => <CompactMatchup game={item} week={week} key={item.id} selected={false} onSelect={() => onView('matchups')} />)}<ByeCard byes={weekData.byes} /></div>
      <StandingsPreview standings={standings} onViewAll={() => onView('standings')} />
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
      <div className="sf-view-head"><div><h2 className="sf-view-heading">Week {week} point splits</h2><div className="sf-view-copy">Select any matchup to audit every rep contribution.</div></div><span className={`sf-status-pill sf-live-pill ${weekState(week)}`}><span className="sf-live-dot" />{statusLabel(weekState(week))}</span></div>
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
      <div className="sf-view-head"><div><h2 className="sf-view-heading">League standings</h2><div className="sf-view-copy">Wins rank first; completed-week points break ties.</div></div><span className="sf-section-note">10 pods · 30 reps</span></div>
      <div className="sf-card sf-table-wrap"><table className="sf-league-table"><thead><tr><th>Rank</th><th>Pod</th><th>W</th><th>L</th><th>Bye</th><th>Points for</th></tr></thead><tbody>{standings.map((row) => { const pod = podForId(row.podId); return <tr className={pod.id === MY_POD_ID ? 'mine' : ''} key={pod.id}><td><span className={`sf-rank-badge ${row.rank <= 3 ? 'top' : ''}`}>{row.rank}</span></td><td><div className="sf-standing-team"><PodMark pod={pod} size="small" /><span className="sf-team-name">{pod.name}</span></div></td><td>{row.wins}</td><td>{row.losses}</td><td>{row.byes}</td><td className="sf-metric-primary">{row.pointsFor.toFixed(1)}</td></tr>; })}</tbody></table></div>
      <div className="sf-data-note">Standings include completed matchups only.</div>
    </div>
  );
}

function MemberTable({ pod, week }) {
  const split = podWeekPointSplit(pod.id, week);
  return (
    <div className="sf-table-wrap"><table className="sf-member-table">
      <thead><tr><th style={{ width: '32%' }}>Rep</th><th>Sales pts</th><th>Margin pts</th><th>Order pts</th><th>Total</th></tr></thead>
      <tbody>{pod.members.map((member, index) => { const points = split.members[index]; return <tr key={member.id}><td><div className="sf-member"><span className="sf-avatar">{member.number}</span><div className="sf-pod-copy"><div className="sf-member-name">{member.name}</div><div className="sf-member-role">{member.role}</div></div></div></td><td>{points.sales.toFixed(1)}</td><td>{points.margin.toFixed(1)}</td><td>{points.orders.toFixed(1)}</td><td className="sf-metric-primary">{points.total.toFixed(1)}</td></tr>; })}</tbody>
    </table></div>
  );
}

function Pods({ week, selectedPodId, onSelect, standings }) {
  const pod = podForId(selectedPodId);
  const record = standings.find((row) => row.podId === pod.id);
  const split = podWeekPointSplit(pod.id, week);
  return (
    <div className="sf-stack">
      <div className="sf-view-head"><div><h2 className="sf-view-heading">POD 1–10</h2><div className="sf-view-copy">The pod number is its league mark. Select one to inspect Week {week}.</div></div><span className="sf-section-note">3 reps per pod</span></div>
      <div className="sf-pod-grid">{SALES_FANTASY_PODS.map((item) => <button type="button" className={`sf-pod-tile ${item.id === pod.id ? 'active' : ''}`} key={item.id} onClick={() => onSelect(item.id)}><PodMark pod={item} size="small" /><span className="sf-pod-copy"><span className="sf-pod-tile-name">{item.name}</span><span className="sf-pod-tile-meta">Seed {item.seed}</span></span></button>)}</div>
      <AnimatePresence initial={false} mode="wait">
        <motion.section className="sf-card" key={`${pod.id}-${week}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={PAGE_TRANSITION}>
          <div className="sf-pod-hero"><PodMark pod={pod} size="large" /><div className="sf-pod-hero-copy"><div className="sf-pod-hero-name">{pod.name}</div><div className="sf-pod-hero-meta">Seed {pod.seed} · rank #{record.rank} · record {recordLabel(record)}</div></div><div className="sf-pod-hero-score"><div className="sf-pod-hero-value">{split.total.toFixed(1)}</div><div className="sf-pod-hero-label">Week {week} points</div></div></div>
          <MemberTable pod={pod} week={week} />
          <div className="sf-score-note"><strong>Reconciled total:</strong> {split.members.map((member) => member.total.toFixed(1)).join(' + ')} = {split.total.toFixed(1)}</div>
        </motion.section>
      </AnimatePresence>
      <div className="sf-data-note">Rep labels are placeholders until the production roster feed is connected.</div>
    </div>
  );
}

function SalesFantasyApp() {
  const [view, setView] = useState('overview');
  const [week, setWeek] = useState(SALES_FANTASY_CURRENT_WEEK);
  const [direction, setDirection] = useState(1);
  const [selectedPodId, setSelectedPodId] = useState(MY_POD_ID);
  const [selectedGameId, setSelectedGameId] = useState(matchupForPod(SCHEDULE[SALES_FANTASY_CURRENT_WEEK - 1], MY_POD_ID)?.id || '');
  const standings = useMemo(() => buildStandings(SALES_FANTASY_PODS, SCHEDULE, SALES_FANTASY_CURRENT_WEEK), []);
  const myPod = podForId(MY_POD_ID);
  const myStanding = standings.find((row) => row.podId === MY_POD_ID);
  const page = NAV_ITEMS.find((item) => item.id === view) || NAV_ITEMS[0];
  const showWeekControl = view !== 'standings';

  const changeWeek = (nextWeek) => {
    setDirection(nextWeek > week ? 1 : -1);
    setWeek(nextWeek);
  };
  const changeView = (nextView) => {
    const currentIndex = NAV_ITEMS.findIndex((item) => item.id === view);
    const nextIndex = NAV_ITEMS.findIndex((item) => item.id === nextView);
    setDirection(nextIndex >= currentIndex ? 1 : -1);
    setView(nextView);
  };
  const returnToCurrentWeek = () => {
    setDirection(SALES_FANTASY_CURRENT_WEEK >= week ? 1 : -1);
    setWeek(SALES_FANTASY_CURRENT_WEEK);
    setView('overview');
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
            <motion.div className="sf-mobile-page-head" key={`head-${page.id}`} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={PAGE_TRANSITION}>
              <div><div className="sf-page-title-row"><h1 className="sf-page-title">{page.label}</h1><span className="sf-event-pill">EVENT</span></div><div className="sf-page-subtitle">10 pods · 3 reps each · weekly head-to-head competition</div></div>
            </motion.div>
          </AnimatePresence>
          <AnimatePresence initial={false} mode="wait" custom={direction}>
            <motion.div className="sf-view-motion" key={contentKey} custom={direction} initial={(travel) => ({ opacity: 0, x: travel * 14 })} animate={{ opacity: 1, x: 0 }} exit={(travel) => ({ opacity: 0, x: travel * -14 })} transition={PAGE_TRANSITION}>
              {view === 'overview' && <Overview week={week} standings={standings} onView={changeView} />}
              {view === 'matchups' && <Matchups week={week} standings={standings} selectedGameId={selectedGameId} onSelectGame={setSelectedGameId} />}
              {view === 'standings' && <Standings standings={standings} />}
              {view === 'pods' && <Pods week={week} selectedPodId={selectedPodId} onSelect={setSelectedPodId} standings={standings} />}
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
