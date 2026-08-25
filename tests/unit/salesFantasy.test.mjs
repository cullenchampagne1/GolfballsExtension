import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SALES_FANTASY_CURRENT_WEEK,
  SALES_FANTASY_PODS,
  SALES_FANTASY_ROLES,
  SALES_FANTASY_SCORING,
  buildFantasySchedule,
  buildStandings,
  fantasyScore,
  marginTierForOrder,
  memberWeekPointSplit,
  orderMarginPercent,
  matchupForPod,
  podWeekPointSplit,
  scoreRoleMetrics,
  weekState,
} from '../../src/lib/salesFantasy.js';

describe('salesFantasy · league model', () => {
  it('defines POD 1 through POD 10 with one SR, SA, and BDR each', () => {
    assert.equal(SALES_FANTASY_PODS.length, 10);
    assert.equal(new Set(SALES_FANTASY_PODS.map((pod) => pod.id)).size, 10);
    assert.deepEqual(SALES_FANTASY_PODS.map((pod) => pod.id), Array.from({ length: 10 }, (_, index) => `pod-${index + 1}`));
    assert.deepEqual(SALES_FANTASY_PODS.map((pod) => pod.name), Array.from({ length: 10 }, (_, index) => `POD ${index + 1}`));
    assert.deepEqual(SALES_FANTASY_PODS.map((pod) => pod.number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const [podIndex, pod] of SALES_FANTASY_PODS.entries()) {
      assert.equal(pod.members.length, 3, pod.name);
      assert.deepEqual(pod.members.map((member) => member.name), ['SR', 'SA', 'BDR']);
      assert.deepEqual(pod.members.map((member) => member.roleId), SALES_FANTASY_ROLES.map((role) => role.id));
      for (const [memberIndex, member] of pod.members.entries()) {
        assert.equal(member.id, `pod-${podIndex + 1}-${SALES_FANTASY_ROLES[memberIndex].id}`);
        assert.equal(member.number, memberIndex + 1);
        assert.equal(member.role, SALES_FANTASY_ROLES[memberIndex].title);
      }
    }
  });

  it('scores the four activity and five sales rows into role and pod totals', () => {
    for (const pod of SALES_FANTASY_PODS) {
      for (let week = 1; week <= 9; week += 1) {
        const split = podWeekPointSplit(pod.id, week);
        assert.equal(split.members.length, 3, `${pod.name} week ${week}`);
        for (const member of split.members) {
          assert.deepEqual(member.activity.rows.map((row) => row.id), [
            'emailsSent', 'emailsReplied', 'outboundCalls', 'inboundCalls',
          ]);
          assert.deepEqual(member.sales.rows.map((row) => row.id), [
            'proposalsSent', 'orders', 'totalSales', 'totalProfit', 'marginBonus',
          ]);
          assert.equal(member.total, Number((member.activity.total + member.sales.total).toFixed(1)), member.memberId);
          assert.deepEqual(member, memberWeekPointSplit(pod.id, member.memberId, week));
        }
        assert.equal(split.total, Number(split.members.reduce((sum, member) => sum + member.total, 0).toFixed(1)), `${pod.name} week ${week}`);
        assert.equal(fantasyScore(pod.id, week), split.total, `${pod.name} week ${week}`);
      }
    }
  });

  it('awards each completed order only its highest qualifying margin bonus', () => {
    const metrics = {
      activity: { emailsSent: 10, emailsReplied: 2, outboundCalls: 4, inboundCalls: 1 },
      sales: {
        proposalsSent: 3,
        orders: [
          { id: 'base', sale: 1000, profit: 299 },
          { id: 'rounded-below', sale: 1000, profit: 299.6 },
          { id: 'healthy', sale: 1000, profit: 300 },
          { id: 'strong', sale: 1000, profit: 400 },
          { id: 'premium', sale: 1000, profit: 500 },
        ],
      },
    };
    const score = scoreRoleMetrics(metrics);

    assert.equal(orderMarginPercent(metrics.sales.orders[0]), 29.9);
    assert.equal(marginTierForOrder(metrics.sales.orders[0]).id, 'base');
    assert.equal(orderMarginPercent(metrics.sales.orders[1]), 30);
    assert.equal(marginTierForOrder(metrics.sales.orders[1]).id, 'base');
    assert.equal(marginTierForOrder(metrics.sales.orders[2]).id, 'healthy');
    assert.equal(marginTierForOrder(metrics.sales.orders[3]).id, 'strong');
    assert.equal(marginTierForOrder(metrics.sales.orders[4]).id, 'premium');
    assert.deepEqual(score.sales.marginTiers.map((tier) => tier.orders), [2, 1, 1, 1]);
    assert.equal(score.sales.rows.find((row) => row.id === 'marginBonus').points, 16);
    assert.equal(score.sales.rows.find((row) => row.id === 'orders').points, 25);
  });

  it('keeps every weight and margin break in one explicit scoring contract', () => {
    assert.deepEqual(SALES_FANTASY_SCORING.activity.map((rule) => rule.label), [
      'Emails sent', 'Emails replied', 'Outbound calls', 'Inbound calls',
    ]);
    assert.deepEqual(SALES_FANTASY_SCORING.sales.map((rule) => rule.label), [
      'Proposals sent', 'Orders', 'Total sales', 'Total profit',
    ]);
    assert.deepEqual(SALES_FANTASY_SCORING.marginTiers.map((tier) => [tier.minMargin, tier.bonusPoints]), [
      [0, 0], [30, 2], [40, 5], [50, 9],
    ]);
  });

  it('builds nine head-to-head weeks with every pod present once per week', () => {
    const schedule = buildFantasySchedule();
    assert.equal(schedule.length, 9);
    for (const week of schedule) {
      const active = week.games.flatMap((game) => [game.home, game.away]);
      const participants = [...active, ...week.byes];
      assert.equal(participants.length, 10, `week ${week.week}`);
      assert.equal(new Set(participants).size, 10, `week ${week.week}`);
      assert.ok(week.games.length === 4 || week.games.length === 5, `week ${week.week}`);
      assert.ok(week.byes.length === 0 || week.byes.length === 2, `week ${week.week}`);
    }
  });

  it('gives every pod exactly one paired bye across the season', () => {
    const schedule = buildFantasySchedule();
    const byeCounts = new Map(SALES_FANTASY_PODS.map((pod) => [pod.id, 0]));
    for (const week of schedule) {
      for (const podId of week.byes) byeCounts.set(podId, byeCounts.get(podId) + 1);
    }
    assert.deepEqual([...byeCounts.values()], Array(10).fill(1));
    assert.equal(schedule.reduce((total, week) => total + week.byes.length, 0), 10);
  });

  it('produces stable scores, live state, matchups, and ranked records', () => {
    const schedule = buildFantasySchedule();
    assert.equal(fantasyScore('pod-1', 4), 504.3);
    assert.deepEqual(podWeekPointSplit('pod-1', 4).members.map((member) => member.total), [171.4, 206.5, 126.4]);
    assert.equal(weekState(SALES_FANTASY_CURRENT_WEEK), 'live');
    assert.equal(weekState(SALES_FANTASY_CURRENT_WEEK - 1), 'final');
    assert.equal(weekState(SALES_FANTASY_CURRENT_WEEK + 1), 'scheduled');
    assert.deepEqual(matchupForPod(schedule[3], 'pod-1'), { home: 'pod-7', away: 'pod-1', id: 'week-4-game-1' });
    const standings = buildStandings(SALES_FANTASY_PODS, schedule, SALES_FANTASY_CURRENT_WEEK);
    assert.equal(standings.length, 10);
    assert.deepEqual(standings.map((record) => record.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(standings.reduce((sum, record) => sum + record.wins, 0), standings.reduce((sum, record) => sum + record.losses, 0));
  });
});
