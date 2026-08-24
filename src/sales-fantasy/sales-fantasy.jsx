import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
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
  weekState,
} from '../lib/salesFantasy.js';

const MY_POD_ID = 'pin-seekers';
const SCHEDULE = buildFantasySchedule(SALES_FANTASY_PODS);

const FantasyIcon = {
  overview: (props) => <Icon {...props}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></Icon>,
  matchup: (props) => <Icon {...props}><path d="M8 5l4 4 4-4" /><path d="M8 19l4-4 4 4" /><path d="M12 9v6" /><path d="M3 12h5M16 12h5" /></Icon>,
  standings: (props) => <Icon {...props}><path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7" /></Icon>,
  trophy: (props) => <Icon {...props}><path d="M8 4h8v5a4 4 0 01-8 0V4z" /><path d="M8 6H4v2a4 4 0 004 4M16 6h4v2a4 4 0 01-4 4M12 13v4M8 21h8M9 17h6" /></Icon>,
  arrowLeft: (props) => <Icon {...props}><path d="M15 18l-6-6 6-6" /></Icon>,
  arrowRight: (props) => <Icon {...props}><path d="M9 18l6-6-6-6" /></Icon>,
};

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: FantasyIcon.overview },
  { id: 'matchups', label: 'Matchups', icon: FantasyIcon.matchup },
  { id: 'standings', label: 'Standings', icon: FantasyIcon.standings },
  { id: 'pods', label: 'Pods', icon: I.users },
];

const CSS = `
  * { box-sizing: border-box; }
  button, select { font: inherit; }
  button { color: inherit; }
  .sf-app {
    width: 100%; height: 100%; min-width: 680px;
    display: grid; grid-template-columns: 190px minmax(0, 1fr);
    color: var(--gb-text-secondary); background: var(--gb-surface-canvas);
    font-family: var(--gb-font-sans); font-size: 12px;
  }
  .sf-sidebar {
    min-width: 0; display: flex; flex-direction: column;
    background: var(--gb-surface-1); border-right: 1px solid var(--gb-border-default);
  }
  .sf-brand { height: 72px; padding: 14px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid var(--gb-border-subtle); }
  .sf-brand-mark, .sf-pod-mark {
    display: grid; place-items: center; flex: 0 0 auto;
    color: var(--gb-brand-label); background: var(--gb-brand-tint-medium);
    border: 1px solid var(--gb-brand-tint-border);
  }
  .sf-brand-mark { width: 34px; height: 34px; border-radius: var(--gb-r-md); box-shadow: inset 0 -2px 0 var(--gb-brand-tint-border); }
  .sf-brand-copy { min-width: 0; }
  .sf-brand-name { color: var(--gb-text-primary); font-weight: 800; font-size: 13px; letter-spacing: -.2px; }
  .sf-kicker { margin-top: 3px; color: var(--gb-text-muted); font-size: 8.5px; font-weight: 750; letter-spacing: .8px; text-transform: uppercase; }
  .sf-nav { display: grid; gap: 4px; padding: 14px 10px; }
  .sf-nav-button {
    width: 100%; height: 34px; padding: 0 10px; display: flex; align-items: center; gap: 9px;
    border: 1px solid transparent; border-radius: var(--gb-r-md); cursor: pointer;
    background: transparent; color: var(--gb-text-tertiary); font-weight: 650; text-align: left;
  }
  .sf-nav-button:hover { color: var(--gb-text-secondary); background: var(--gb-fill-subtle); }
  .sf-nav-button.active { color: var(--gb-brand-label); background: var(--gb-brand-tint-soft); border-color: var(--gb-brand-tint-border); }
  .sf-nav-button:focus-visible, .sf-icon-button:focus-visible, .sf-pod-tile:focus-visible { outline: none; box-shadow: var(--gb-focus-ring); }
  .sf-season-card { margin: auto 10px 10px; padding: 10px; border: 1px solid var(--gb-border-default); border-radius: var(--gb-r-lg); background: var(--gb-fill-faint); }
  .sf-season-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .sf-season-title { color: var(--gb-text-primary); font-size: 10.5px; font-weight: 700; }
  .sf-live-pill, .sf-status-pill, .sf-event-pill {
    display: inline-flex; align-items: center; justify-content: center; gap: 5px;
    border-radius: var(--gb-r-pill); font-weight: 800; text-transform: uppercase;
  }
  .sf-live-pill { padding: 3px 6px; color: var(--gb-success-fg); background: var(--gb-success-tint-soft); border: 1px solid var(--gb-success-tint-border); font-size: 7.5px; letter-spacing: .6px; }
  .sf-live-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
  .sf-season-meta { margin-top: 7px; color: var(--gb-text-muted); font-size: 9.5px; line-height: 1.5; }
  .sf-my-pod { margin: 0 10px 12px; padding: 9px; display: flex; align-items: center; gap: 8px; border: 1px solid var(--gb-border-default); border-radius: var(--gb-r-lg); background: var(--gb-fill-subtle); }
  .sf-pod-mark { width: 30px; height: 30px; border-radius: var(--gb-r-md); font-size: 9px; font-weight: 850; letter-spacing: .2px; }
  .sf-pod-mark.small { width: 26px; height: 26px; border-radius: var(--gb-r-sm); font-size: 8px; }
  .sf-pod-mark.large { width: 42px; height: 42px; border-radius: var(--gb-r-lg); font-size: 11px; }
  .sf-my-pod-name { color: var(--gb-text-primary); font-size: 10.5px; font-weight: 700; }
  .sf-my-pod-meta { color: var(--gb-text-muted); font-size: 9px; margin-top: 2px; }
  .sf-main { min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
  .sf-topbar { min-height: 72px; padding: 0 20px; display: flex; align-items: center; gap: 16px; border-bottom: 1px solid var(--gb-border-default); background: var(--gb-surface-1); }
  .sf-topbar-copy { min-width: 0; flex: 1; }
  .sf-page-title { margin: 0; color: var(--gb-text-primary); font-size: 17px; line-height: 1.2; letter-spacing: -.35px; }
  .sf-page-subtitle { margin-top: 4px; color: var(--gb-text-muted); font-size: 9.5px; }
  .sf-event-pill { padding: 4px 7px; margin-left: 7px; vertical-align: 2px; color: var(--gb-brand-label); background: var(--gb-brand-tint-soft); border: 1px solid var(--gb-brand-tint-border); font-size: 7px; letter-spacing: .65px; }
  .sf-week-control { height: 32px; display: flex; align-items: center; border: 1px solid var(--gb-border-strong); border-radius: var(--gb-r-md); background: var(--gb-fill-subtle); overflow: hidden; }
  .sf-icon-button { width: 30px; height: 30px; display: grid; place-items: center; border: 0; cursor: pointer; color: var(--gb-text-tertiary); background: transparent; }
  .sf-icon-button:hover:not(:disabled) { color: var(--gb-text-primary); background: var(--gb-fill-soft); }
  .sf-icon-button:disabled { cursor: default; color: var(--gb-text-ghost); }
  .sf-week-label { min-width: 76px; padding: 0 8px; color: var(--gb-text-primary); border-inline: 1px solid var(--gb-border-default); font-size: 10px; font-weight: 750; line-height: 30px; text-align: center; }
  .sf-content { flex: 1; min-height: 0; overflow: auto; padding: 18px 20px 24px; scrollbar-width: thin; scrollbar-color: var(--gb-border-strong) transparent; }
  .sf-content::-webkit-scrollbar { width: 7px; }
  .sf-content::-webkit-scrollbar-thumb { background: var(--gb-border-strong); border: 2px solid transparent; border-radius: 99px; background-clip: padding-box; }
  .sf-stack { display: grid; gap: 14px; }
  .sf-card { border: 1px solid var(--gb-border-default); border-radius: var(--gb-r-xl); background: var(--gb-surface-1); box-shadow: 0 8px 22px rgba(0, 0, 0, .14); overflow: hidden; }
  .sf-card-flat { border: 1px solid var(--gb-border-default); border-radius: var(--gb-r-lg); background: var(--gb-fill-faint); }
  .sf-card-head { min-height: 42px; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; border-bottom: 1px solid var(--gb-border-subtle); }
  .sf-card-title { color: var(--gb-text-primary); font-size: 11px; font-weight: 750; }
  .sf-card-caption { margin-top: 2px; color: var(--gb-text-muted); font-size: 8.5px; }
  .sf-section-label { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .sf-section-title { margin: 0; color: var(--gb-text-primary); font-size: 12px; letter-spacing: -.12px; }
  .sf-section-note { color: var(--gb-text-muted); font-size: 9px; }
  .sf-stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; }
  .sf-stat { min-width: 0; padding: 10px 11px; border: 1px solid var(--gb-border-default); border-radius: var(--gb-r-lg); background: var(--gb-surface-1); }
  .sf-stat-label { color: var(--gb-text-muted); font-size: 8px; font-weight: 750; letter-spacing: .55px; text-transform: uppercase; }
  .sf-stat-value { margin-top: 7px; color: var(--gb-text-primary); font-size: 17px; font-weight: 800; letter-spacing: -.45px; }
  .sf-stat-detail { margin-top: 3px; color: var(--gb-text-tertiary); font-size: 8.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sf-positive { color: var(--gb-success-fg); }
  .sf-dashboard-grid { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(220px, .85fr); gap: 12px; align-items: stretch; }
  .sf-feature-matchup { min-height: 220px; position: relative; }
  .sf-feature-matchup::after { content: ''; position: absolute; inset: auto 0 0; height: 3px; background: var(--gb-brand-label); opacity: .72; }
  .sf-match-status { display: flex; align-items: center; gap: 6px; color: var(--gb-text-muted); font-size: 8px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; }
  .sf-match-status.live { color: var(--gb-success-fg); }
  .sf-match-status-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
  .sf-feature-teams { min-height: 126px; padding: 17px 18px; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 12px; }
  .sf-feature-team { min-width: 0; display: flex; align-items: center; gap: 10px; }
  .sf-feature-team.away { flex-direction: row-reverse; text-align: right; }
  .sf-team-name { color: var(--gb-text-primary); font-size: 12px; font-weight: 750; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sf-team-record { margin-top: 3px; color: var(--gb-text-muted); font-size: 8.5px; }
  .sf-score { margin-top: 7px; color: var(--gb-text-primary); font-size: 25px; font-weight: 850; letter-spacing: -1px; line-height: 1; }
  .sf-feature-team.away .sf-score { text-align: right; }
  .sf-vs { width: 28px; height: 28px; display: grid; place-items: center; border: 1px solid var(--gb-border-default); border-radius: 50%; color: var(--gb-text-muted); background: var(--gb-fill-subtle); font-size: 8px; font-weight: 850; }
  .sf-projection { padding: 0 18px 16px; }
  .sf-projection-labels { display: flex; justify-content: space-between; color: var(--gb-text-muted); font-size: 8px; }
  .sf-projection-track { height: 5px; margin-top: 6px; display: flex; border-radius: 99px; overflow: hidden; background: var(--gb-fill-subtle); }
  .sf-projection-home { background: var(--gb-brand-label); opacity: .9; }
  .sf-projection-away { flex: 1; background: var(--gb-border-strong); }
  .sf-standing-list { padding: 4px 0; }
  .sf-standing-row { min-height: 36px; padding: 5px 10px; display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; align-items: center; gap: 7px; border-bottom: 1px solid var(--gb-border-subtle); }
  .sf-standing-row:last-child { border-bottom: 0; }
  .sf-standing-rank { color: var(--gb-text-muted); font-size: 9px; font-weight: 750; text-align: center; }
  .sf-standing-team { min-width: 0; display: flex; align-items: center; gap: 7px; }
  .sf-standing-name { color: var(--gb-text-secondary); font-size: 9.5px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sf-standing-record { color: var(--gb-text-tertiary); font-size: 9px; font-weight: 750; }
  .sf-link-button { padding: 0; border: 0; background: transparent; color: var(--gb-brand-label); cursor: pointer; font-size: 8.5px; font-weight: 750; }
  .sf-link-button:hover { text-decoration: underline; }
  .sf-scoreboard-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .sf-compact-matchup { padding: 9px 10px; border: 1px solid var(--gb-border-default); border-radius: var(--gb-r-lg); background: var(--gb-surface-1); }
  .sf-compact-matchup.mine { border-color: var(--gb-brand-tint-border); box-shadow: inset 0 -2px 0 var(--gb-brand-tint-border); }
  .sf-compact-top { margin-bottom: 7px; display: flex; justify-content: space-between; align-items: center; gap: 8px; color: var(--gb-text-muted); font-size: 7.5px; font-weight: 750; letter-spacing: .4px; text-transform: uppercase; }
  .sf-compact-team { min-width: 0; min-height: 25px; display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; gap: 7px; }
  .sf-compact-name { min-width: 0; color: var(--gb-text-secondary); font-size: 9.5px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sf-compact-score { color: var(--gb-text-primary); font-size: 11px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .sf-bye-card { min-height: 70px; padding: 10px 12px; display: flex; align-items: center; gap: 10px; border: 1px dashed var(--gb-border-strong); border-radius: var(--gb-r-lg); background: var(--gb-fill-faint); }
  .sf-bye-icon { width: 30px; height: 30px; display: grid; place-items: center; color: var(--gb-brand-label); border: 1px solid var(--gb-brand-tint-border); border-radius: var(--gb-r-md); background: var(--gb-brand-tint-soft); }
  .sf-bye-title { color: var(--gb-text-primary); font-size: 10px; font-weight: 700; }
  .sf-bye-pods { margin-top: 3px; color: var(--gb-text-muted); font-size: 8.5px; }
  .sf-member-table, .sf-league-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .sf-member-table th, .sf-league-table th { height: 29px; padding: 0 10px; color: var(--gb-text-muted); background: var(--gb-fill-faint); border-bottom: 1px solid var(--gb-border-default); font-size: 7.5px; font-weight: 800; letter-spacing: .55px; text-align: right; text-transform: uppercase; }
  .sf-member-table th:first-child, .sf-league-table th:nth-child(2) { text-align: left; }
  .sf-member-table td, .sf-league-table td { height: 43px; padding: 5px 10px; border-bottom: 1px solid var(--gb-border-subtle); color: var(--gb-text-secondary); font-size: 9.5px; text-align: right; font-variant-numeric: tabular-nums; }
  .sf-member-table tr:last-child td, .sf-league-table tr:last-child td { border-bottom: 0; }
  .sf-member-table td:first-child, .sf-league-table td:nth-child(2) { text-align: left; }
  .sf-member { min-width: 0; display: flex; align-items: center; gap: 8px; }
  .sf-avatar { width: 27px; height: 27px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 50%; color: var(--gb-brand-label); background: var(--gb-brand-tint-soft); border: 1px solid var(--gb-brand-tint-border); font-size: 8px; font-weight: 800; }
  .sf-member-name { color: var(--gb-text-primary); font-size: 9.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sf-member-role { margin-top: 2px; color: var(--gb-text-muted); font-size: 8px; }
  .sf-metric-primary { color: var(--gb-brand-label) !important; font-weight: 800; }
  .sf-view-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .sf-view-heading { margin: 0; color: var(--gb-text-primary); font-size: 14px; letter-spacing: -.25px; }
  .sf-view-copy { margin-top: 4px; color: var(--gb-text-muted); font-size: 9px; }
  .sf-matchup-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
  .sf-game-card { padding: 11px; border: 1px solid var(--gb-border-default); border-radius: var(--gb-r-xl); background: var(--gb-surface-1); box-shadow: 0 6px 18px rgba(0, 0, 0, .12); }
  .sf-game-card.mine { border-color: var(--gb-brand-tint-border); box-shadow: 0 6px 18px rgba(0, 0, 0, .12), inset 0 -2px 0 var(--gb-brand-tint-border); }
  .sf-game-head { margin-bottom: 9px; display: flex; align-items: center; justify-content: space-between; color: var(--gb-text-muted); font-size: 7.5px; font-weight: 800; letter-spacing: .55px; text-transform: uppercase; }
  .sf-game-team { min-height: 38px; display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; align-items: center; gap: 8px; border-top: 1px solid var(--gb-border-subtle); }
  .sf-game-team:first-of-type { border-top: 0; }
  .sf-game-score { color: var(--gb-text-primary); font-size: 17px; font-weight: 850; letter-spacing: -.45px; font-variant-numeric: tabular-nums; }
  .sf-game-score.projected { color: var(--gb-text-tertiary); }
  .sf-standings-card { overflow-x: auto; }
  .sf-league-table th:first-child, .sf-league-table td:first-child { width: 42px; text-align: center; }
  .sf-league-table th:nth-child(2) { width: 38%; }
  .sf-league-table tr.mine td { background: var(--gb-brand-tint-soft); }
  .sf-rank-badge { width: 20px; height: 20px; display: inline-grid; place-items: center; border: 1px solid var(--gb-border-default); border-radius: 50%; color: var(--gb-text-tertiary); background: var(--gb-fill-subtle); font-size: 8px; font-weight: 800; }
  .sf-rank-badge.top { color: var(--gb-brand-label); border-color: var(--gb-brand-tint-border); background: var(--gb-brand-tint-soft); }
  .sf-pod-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 7px; }
  .sf-pod-tile { min-width: 0; padding: 8px; display: flex; align-items: center; gap: 7px; border: 1px solid var(--gb-border-default); border-radius: var(--gb-r-lg); cursor: pointer; color: var(--gb-text-secondary); background: var(--gb-surface-1); text-align: left; }
  .sf-pod-tile:hover { background: var(--gb-fill-soft); border-color: var(--gb-border-strong); }
  .sf-pod-tile.active { color: var(--gb-brand-label); border-color: var(--gb-brand-tint-border); background: var(--gb-brand-tint-soft); box-shadow: inset 0 -2px 0 var(--gb-brand-tint-border); }
  .sf-pod-tile-copy { min-width: 0; }
  .sf-pod-tile-name { overflow: hidden; color: var(--gb-text-primary); font-size: 8.5px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
  .sf-pod-tile-meta { margin-top: 2px; color: var(--gb-text-muted); font-size: 7.5px; }
  .sf-pod-hero { padding: 14px; display: flex; align-items: center; gap: 12px; }
  .sf-pod-hero-copy { min-width: 0; flex: 1; }
  .sf-pod-hero-name { color: var(--gb-text-primary); font-size: 15px; font-weight: 800; letter-spacing: -.25px; }
  .sf-pod-hero-meta { margin-top: 4px; color: var(--gb-text-muted); font-size: 9px; }
  .sf-pod-hero-stats { display: flex; gap: 18px; }
  .sf-pod-mini-stat { text-align: right; }
  .sf-pod-mini-value { color: var(--gb-text-primary); font-size: 13px; font-weight: 800; }
  .sf-pod-mini-label { margin-top: 2px; color: var(--gb-text-muted); font-size: 7.5px; font-weight: 700; letter-spacing: .45px; text-transform: uppercase; }
  .sf-empty { padding: 30px 16px; color: var(--gb-text-muted); text-align: center; }
  .sf-data-note { color: var(--gb-text-ghost); font-size: 8px; text-align: right; }
  @media (max-width: 760px) {
    .sf-app { min-width: 0; grid-template-columns: 62px minmax(0, 1fr); }
    .sf-brand { padding: 13px; justify-content: center; }
    .sf-brand-copy, .sf-nav-label, .sf-season-card, .sf-my-pod > div:last-child { display: none; }
    .sf-nav { padding-inline: 9px; }
    .sf-nav-button { justify-content: center; padding: 0; }
    .sf-my-pod { justify-content: center; padding: 8px 5px; }
    .sf-dashboard-grid { grid-template-columns: 1fr; }
    .sf-pod-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
`;

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function PodMark({ pod, size = '' }) {
  return <span className={`sf-pod-mark ${size}`.trim()} aria-hidden="true">{pod.short}</span>;
}

function recordLabel(record) {
  return record ? `${record.wins}-${record.losses}${record.ties ? `-${record.ties}` : ''}` : '0-0';
}

function statusLabel(state) {
  return state === 'live' ? 'Live scoring' : state === 'final' ? 'Final' : 'Scheduled';
}

function WeekControl({ week, onChange }) {
  return (
    <div className="sf-week-control" aria-label="Select matchup week">
      <button className="sf-icon-button" type="button" aria-label="Previous week" disabled={week <= 1} onClick={() => onChange(week - 1)}><FantasyIcon.arrowLeft size={13} /></button>
      <div className="sf-week-label">Week {week}</div>
      <button className="sf-icon-button" type="button" aria-label="Next week" disabled={week >= SCHEDULE.length} onClick={() => onChange(week + 1)}><FantasyIcon.arrowRight size={13} /></button>
    </div>
  );
}

function MemberTable({ pod }) {
  return (
    <table className="sf-member-table">
      <thead><tr><th style={{ width: '38%' }}>Rep</th><th>Fantasy pts</th><th>Revenue</th><th>Margin</th><th>Orders</th></tr></thead>
      <tbody>
        {pod.members.map((member) => (
          <tr key={member.id}>
            <td><div className="sf-member"><span className="sf-avatar">{member.initials}</span><div style={{ minWidth: 0 }}><div className="sf-member-name">{member.name}</div><div className="sf-member-role">{member.role}</div></div></div></td>
            <td className="sf-metric-primary">{member.metrics.fantasyPoints.toFixed(1)}</td>
            <td>{currency.format(member.metrics.revenue)}</td>
            <td>{member.metrics.margin.toFixed(1)}%</td>
            <td>{member.metrics.orders}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FeatureMatchup({ game, week, standings }) {
  if (!game) return <div className="sf-card sf-empty">Your pod has a bye this week.</div>;
  const home = podForId(game.home);
  const away = podForId(game.away);
  const homeRecord = standings.find((row) => row.podId === home.id);
  const awayRecord = standings.find((row) => row.podId === away.id);
  const homeScore = fantasyScore(home.id, week);
  const awayScore = fantasyScore(away.id, week);
  const total = homeScore + awayScore;
  const homePct = Math.max(18, Math.min(82, (homeScore / total) * 100));
  const state = weekState(week);
  return (
    <article className="sf-card sf-feature-matchup">
      <div className="sf-card-head">
        <div><div className="sf-card-title">Your matchup</div><div className="sf-card-caption">Week {week} · Head to head</div></div>
        <div className={`sf-match-status ${state}`}><span className="sf-match-status-dot" />{statusLabel(state)}</div>
      </div>
      <div className="sf-feature-teams">
        <div className="sf-feature-team"><PodMark pod={home} size="large" /><div style={{ minWidth: 0 }}><div className="sf-team-name">{home.name}</div><div className="sf-team-record">{recordLabel(homeRecord)} · #{homeRecord?.rank || '—'}</div><div className="sf-score">{homeScore.toFixed(1)}</div></div></div>
        <div className="sf-vs">VS</div>
        <div className="sf-feature-team away"><PodMark pod={away} size="large" /><div style={{ minWidth: 0 }}><div className="sf-team-name">{away.name}</div><div className="sf-team-record">{recordLabel(awayRecord)} · #{awayRecord?.rank || '—'}</div><div className="sf-score">{awayScore.toFixed(1)}</div></div></div>
      </div>
      <div className="sf-projection"><div className="sf-projection-labels"><span>{Math.round(homePct)}% win chance</span><span>{Math.round(100 - homePct)}%</span></div><div className="sf-projection-track"><span className="sf-projection-home" style={{ width: `${homePct}%` }} /><span className="sf-projection-away" /></div></div>
    </article>
  );
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

function CompactMatchup({ game, week }) {
  const home = podForId(game.home);
  const away = podForId(game.away);
  const state = weekState(week);
  const mine = game.home === MY_POD_ID || game.away === MY_POD_ID;
  return (
    <article className={`sf-compact-matchup ${mine ? 'mine' : ''}`}>
      <div className="sf-compact-top"><span>Week {week}</span><span>{statusLabel(state)}</span></div>
      {[home, away].map((pod) => <div className="sf-compact-team" key={pod.id}><PodMark pod={pod} size="small" /><span className="sf-compact-name">{pod.name}</span><span className="sf-compact-score">{fantasyScore(pod.id, week).toFixed(1)}</span></div>)}
    </article>
  );
}

function ByeCard({ byes }) {
  if (!byes.length) return null;
  const names = byes.map((podId) => podForId(podId).name).join(' · ');
  return <div className="sf-bye-card"><span className="sf-bye-icon"><I.pause size={13} /></span><div><div className="sf-bye-title">Bye week</div><div className="sf-bye-pods">{names}</div></div></div>;
}

function Overview({ week, standings, onView }) {
  const weekData = SCHEDULE[week - 1];
  const myStanding = standings.find((row) => row.podId === MY_POD_ID);
  const myPod = podForId(MY_POD_ID);
  const game = matchupForPod(weekData, MY_POD_ID);
  const rosterPoints = myPod.members.reduce((sum, member) => sum + member.metrics.fantasyPoints, 0);
  return (
    <div className="sf-stack">
      <div className="sf-stat-grid">
        <div className="sf-stat"><div className="sf-stat-label">League rank</div><div className="sf-stat-value">#{myStanding.rank}</div><div className="sf-stat-detail sf-positive">Top {Math.round(myStanding.rank / SALES_FANTASY_PODS.length * 100)}%</div></div>
        <div className="sf-stat"><div className="sf-stat-label">Pod record</div><div className="sf-stat-value">{recordLabel(myStanding)}</div><div className="sf-stat-detail">{myStanding.byes ? `${myStanding.byes} bye used` : 'Bye ahead'}</div></div>
        <div className="sf-stat"><div className="sf-stat-label">Season points</div><div className="sf-stat-value">{myStanding.pointsFor.toFixed(1)}</div><div className="sf-stat-detail">Through Week {SALES_FANTASY_CURRENT_WEEK - 1}</div></div>
        <div className="sf-stat"><div className="sf-stat-label">Roster power</div><div className="sf-stat-value">{rosterPoints.toFixed(1)}</div><div className="sf-stat-detail">3 active reps</div></div>
      </div>
      <div className="sf-dashboard-grid"><FeatureMatchup game={game} week={week} standings={standings} /><StandingsPreview standings={standings} onViewAll={() => onView('standings')} /></div>
      <div className="sf-section-label"><h2 className="sf-section-title">Around the league</h2><span className="sf-section-note">{weekData.games.length} matchups · {weekData.byes.length} byes</span></div>
      <div className="sf-scoreboard-grid">{weekData.games.filter((item) => item !== game).map((item) => <CompactMatchup game={item} week={week} key={item.id} />)}<ByeCard byes={weekData.byes} /></div>
      <div className="sf-card"><div className="sf-card-head"><div><div className="sf-card-title">Pin Seekers roster</div><div className="sf-card-caption">Individual scoring metrics</div></div><button type="button" className="sf-link-button" onClick={() => onView('pods')}>View pod</button></div><MemberTable pod={myPod} /></div>
      <div className="sf-data-note">Preview uses structured sample metrics · production feed connects next</div>
    </div>
  );
}

function Matchups({ week }) {
  const weekData = SCHEDULE[week - 1];
  const state = weekState(week);
  return (
    <div className="sf-stack">
      <div className="sf-view-head"><div><h2 className="sf-view-heading">Week {week} scoreboard</h2><div className="sf-view-copy">Every pod is measured from its three-person roster.</div></div><span className={`sf-status-pill sf-live-pill ${state}`}><span className="sf-live-dot" />{statusLabel(state)}</span></div>
      <div className="sf-matchup-list">
        {weekData.games.map((game, index) => {
          const home = podForId(game.home); const away = podForId(game.away); const projected = state === 'scheduled'; const mine = [home.id, away.id].includes(MY_POD_ID);
          return <article className={`sf-game-card ${mine ? 'mine' : ''}`} key={game.id}><div className="sf-game-head"><span>Matchup {index + 1}</span><span>{mine ? 'Your pod' : statusLabel(state)}</span></div>{[home, away].map((pod) => <div className="sf-game-team" key={pod.id}><PodMark pod={pod} /><div><div className="sf-team-name">{pod.name}</div><div className="sf-team-record">3 active reps</div></div><div className={`sf-game-score ${projected ? 'projected' : ''}`}>{fantasyScore(pod.id, week).toFixed(1)}</div></div>)}</article>;
        })}
      </div>
      <ByeCard byes={weekData.byes} />
      <div className="sf-data-note">Scheduled weeks display projected points</div>
    </div>
  );
}

function Standings({ standings }) {
  return (
    <div className="sf-stack"><div className="sf-view-head"><div><h2 className="sf-view-heading">League standings</h2><div className="sf-view-copy">Ranked by wins, then points scored.</div></div><span className="sf-section-note">10 pods · 30 reps</span></div><div className="sf-card sf-standings-card"><table className="sf-league-table"><thead><tr><th>Rank</th><th>Pod</th><th>W</th><th>L</th><th>Bye</th><th>Points for</th></tr></thead><tbody>{standings.map((row) => { const pod = podForId(row.podId); return <tr className={pod.id === MY_POD_ID ? 'mine' : ''} key={pod.id}><td><span className={`sf-rank-badge ${row.rank <= 3 ? 'top' : ''}`}>{row.rank}</span></td><td><div className="sf-standing-team"><PodMark pod={pod} size="small" /><span className="sf-team-name">{pod.name}</span></div></td><td>{row.wins}</td><td>{row.losses}</td><td>{row.byes}</td><td className="sf-metric-primary">{row.pointsFor.toFixed(1)}</td></tr>; })}</tbody></table></div><div className="sf-data-note">Standings include completed weeks only</div></div>
  );
}

function Pods({ selectedPodId, onSelect, standings }) {
  const pod = podForId(selectedPodId);
  const record = standings.find((row) => row.podId === pod.id);
  const totalRevenue = pod.members.reduce((sum, member) => sum + member.metrics.revenue, 0);
  const avgMargin = pod.members.reduce((sum, member) => sum + member.metrics.margin, 0) / pod.members.length;
  return (
    <div className="sf-stack"><div className="sf-view-head"><div><h2 className="sf-view-heading">League pods</h2><div className="sf-view-copy">Choose a pod to inspect all three members.</div></div><span className="sf-section-note">3 reps per pod</span></div><div className="sf-pod-grid">{SALES_FANTASY_PODS.map((item) => <button type="button" className={`sf-pod-tile ${item.id === pod.id ? 'active' : ''}`} key={item.id} onClick={() => onSelect(item.id)}><PodMark pod={item} size="small" /><span className="sf-pod-tile-copy"><span className="sf-pod-tile-name">{item.name}</span><span className="sf-pod-tile-meta">Seed {item.seed}</span></span></button>)}</div><section className="sf-card"><div className="sf-pod-hero"><PodMark pod={pod} size="large" /><div className="sf-pod-hero-copy"><div className="sf-pod-hero-name">{pod.name}</div><div className="sf-pod-hero-meta">Seed {pod.seed} · Rank #{record.rank} · Record {recordLabel(record)}</div></div><div className="sf-pod-hero-stats"><div className="sf-pod-mini-stat"><div className="sf-pod-mini-value">{currency.format(totalRevenue)}</div><div className="sf-pod-mini-label">Revenue</div></div><div className="sf-pod-mini-stat"><div className="sf-pod-mini-value">{avgMargin.toFixed(1)}%</div><div className="sf-pod-mini-label">Avg margin</div></div></div></div><MemberTable pod={pod} /></section><div className="sf-data-note">Member names and metrics are sample data for UI review</div></div>
  );
}

function SalesFantasyApp() {
  const [view, setView] = useState('overview');
  const [week, setWeek] = useState(SALES_FANTASY_CURRENT_WEEK);
  const [selectedPodId, setSelectedPodId] = useState(MY_POD_ID);
  const standings = useMemo(() => buildStandings(SALES_FANTASY_PODS, SCHEDULE, SALES_FANTASY_CURRENT_WEEK), []);
  const myPod = podForId(MY_POD_ID);
  const myStanding = standings.find((row) => row.podId === MY_POD_ID);
  const page = NAV_ITEMS.find((item) => item.id === view) || NAV_ITEMS[0];
  return (
    <><style>{CSS}</style><div className="sf-app">
      <aside className="sf-sidebar">
        <div className="sf-brand"><span className="sf-brand-mark"><FantasyIcon.trophy size={17} /></span><div className="sf-brand-copy"><div className="sf-brand-name">Sales Fantasy</div><div className="sf-kicker">Limited event</div></div></div>
        <nav className="sf-nav" aria-label="Sales Fantasy"><div className="sf-kicker" style={{ padding: '0 9px 5px' }}>League</div>{NAV_ITEMS.map((item) => { const NavIcon = item.icon; return <button type="button" key={item.id} className={`sf-nav-button ${view === item.id ? 'active' : ''}`} onClick={() => setView(item.id)}><NavIcon size={14} /><span className="sf-nav-label">{item.label}</span></button>; })}</nav>
        <div className="sf-season-card"><div className="sf-season-row"><span className="sf-season-title">Season 01</span><span className="sf-live-pill"><span className="sf-live-dot" />Live</span></div><div className="sf-season-meta">Week {SALES_FANTASY_CURRENT_WEEK} of {SCHEDULE.length}<br />5 matchup rounds include paired byes</div></div>
        <div className="sf-my-pod"><PodMark pod={myPod} /><div style={{ minWidth: 0 }}><div className="sf-my-pod-name">{myPod.name}</div><div className="sf-my-pod-meta">Your pod · #{myStanding.rank}</div></div></div>
      </aside>
      <main className="sf-main">
        <header className="sf-topbar"><div className="sf-topbar-copy"><h1 className="sf-page-title">{page.label}<span className="sf-event-pill">EVENT</span></h1><div className="sf-page-subtitle">10 pods · 3 reps each · weekly head-to-head competition</div></div>{(view === 'overview' || view === 'matchups') && <WeekControl week={week} onChange={setWeek} />}</header>
        <div className="sf-content">{view === 'overview' && <Overview week={week} standings={standings} onView={setView} />}{view === 'matchups' && <Matchups week={week} />}{view === 'standings' && <Standings standings={standings} />}{view === 'pods' && <Pods selectedPodId={selectedPodId} onSelect={setSelectedPodId} standings={standings} />}</div>
      </main>
    </div></>
  );
}

ensureTheme();
const root = document.getElementById('sales-fantasy-root');
if (root) createRoot(root).render(<SalesFantasyApp />);
