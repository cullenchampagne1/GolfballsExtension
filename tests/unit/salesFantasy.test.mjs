import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SALES_FANTASY_CURRENT_WEEK,
  SALES_FANTASY_PODS,
  SALES_FANTASY_ROLES,
  SALES_FANTASY_SCORING,
  allocatePodOrders,
  buildFantasySchedule,
  buildStandings,
  fantasyScore,
  marginTierForOrder,
  memberWeekPointSplit,
  ownerRoleForDeal,
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

  it('scores the four activity and six sales rows plus BDR referrals into role and pod totals', () => {
    for (const pod of SALES_FANTASY_PODS) {
      for (let week = 1; week <= 9; week += 1) {
        const split = podWeekPointSplit(pod.id, week);
        assert.equal(split.members.length, 3, `${pod.name} week ${week}`);
        for (const member of split.members) {
          assert.deepEqual(member.activity.rows.map((row) => row.id), [
            'emailsSent', 'emailsReplied', 'outboundCalls', 'inboundCalls',
          ]);
          assert.deepEqual(member.sales.rows.map((row) => row.id), [
            'proposalsSent', 'proposalMarginBonus', 'orders', 'totalSales', 'totalProfit', 'orderMarginBonus',
          ]);
          if (member.roleId === 'bdr') {
            assert.deepEqual(member.referred.rows.map((row) => row.id), ['referredOrders', 'referredSales']);
          } else {
            assert.equal(member.referred, null);
          }
          assert.equal(member.total, Number((member.activity.total + member.sales.total + (member.referred?.total || 0)).toFixed(1)), member.memberId);
          assert.deepEqual(member, memberWeekPointSplit(pod.id, member.memberId, week));
        }
        assert.equal(split.total, Number(split.members.reduce((sum, member) => sum + member.total, 0).toFixed(1)), `${pod.name} week ${week}`);
        assert.equal(fantasyScore(pod.id, week), split.total, `${pod.name} week ${week}`);
      }
    }
  });

  it('awards each proposal and completed order only its highest qualifying margin bonus', () => {
    const deals = [
      { id: 'base', sale: 1000, profit: 299 },
      { id: 'rounded-below', sale: 1000, profit: 299.6 },
      { id: 'healthy', sale: 1000, profit: 300 },
      { id: 'strong', sale: 1000, profit: 400 },
      { id: 'premium', sale: 1000, profit: 500 },
    ];
    const metrics = {
      activity: { emailsSent: 10, emailsReplied: 2, outboundCalls: 4, inboundCalls: 1 },
      sales: {
        proposals: deals,
        orders: deals,
      },
    };
    const score = scoreRoleMetrics(metrics, 'sa');

    assert.equal(orderMarginPercent(metrics.sales.orders[0]), 29.9);
    assert.equal(marginTierForOrder(metrics.sales.orders[0]).id, 'base');
    assert.equal(orderMarginPercent(metrics.sales.orders[1]), 30);
    assert.equal(marginTierForOrder(metrics.sales.orders[1]).id, 'base');
    assert.equal(marginTierForOrder(metrics.sales.orders[2]).id, 'healthy');
    assert.equal(marginTierForOrder(metrics.sales.orders[3]).id, 'strong');
    assert.equal(marginTierForOrder(metrics.sales.orders[4]).id, 'premium');
    assert.deepEqual(score.sales.marginTiers.map((tier) => tier.orders), [2, 1, 1, 1]);
    assert.deepEqual(score.sales.marginTiers.map((tier) => tier.proposals), [2, 1, 1, 1]);
    assert.equal(score.sales.rows.find((row) => row.id === 'proposalMarginBonus').points, 10);
    assert.equal(score.sales.rows.find((row) => row.id === 'orderMarginBonus').points, 20);
    assert.equal(score.sales.rows.find((row) => row.id === 'orders').points, 30);
  });

  it('assigns hard ownership bands and adds BDR referral credit without taking owner credit', () => {
    assert.equal(ownerRoleForDeal({ sale: 500 }), 'bdr');
    assert.equal(ownerRoleForDeal({ sale: 500.01 }), 'sa');
    assert.equal(ownerRoleForDeal({ sale: 1499.99 }), 'sa');
    assert.equal(ownerRoleForDeal({ sale: 1500 }), 'sr');
    assert.equal(ownerRoleForDeal({ sale: -1 }), null);
    assert.equal(ownerRoleForDeal({ sale: null }), null);
    assert.equal(ownerRoleForDeal({}), null);

    const orders = [
      { id: 'bdr-owned', sale: 500, profit: 200, createdByRoleId: 'bdr' },
      { id: 'sa-referred', sale: 750, profit: 300, createdByRoleId: 'bdr' },
      { id: 'sr-referred', sale: 1500, profit: 600, createdByRoleId: 'bdr' },
      { id: 'sr-direct', sale: 2000, profit: 800, createdByRoleId: 'sr' },
    ];
    const allocation = allocatePodOrders(orders);
    assert.deepEqual(allocation.owned.bdr.map((order) => order.id), ['bdr-owned']);
    assert.deepEqual(allocation.owned.sa.map((order) => order.id), ['sa-referred']);
    assert.deepEqual(allocation.owned.sr.map((order) => order.id), ['sr-referred', 'sr-direct']);
    assert.deepEqual(allocation.referred.map((order) => order.id), ['sa-referred', 'sr-referred']);

    const sa = scoreRoleMetrics({ sales: { proposalsSent: 0, orders: allocation.owned.sa } }, 'sa');
    const sr = scoreRoleMetrics({ sales: { proposalsSent: 0, orders: allocation.owned.sr } }, 'sr');
    const bdr = scoreRoleMetrics({
      sales: { proposalsSent: 0, orders: allocation.owned.bdr },
      referred: { orders: allocation.referred },
    }, 'bdr');
    assert.equal(sa.raw.sales.totalSales, 750);
    assert.equal(sr.raw.sales.totalSales, 3500);
    assert.equal(bdr.raw.sales.totalSales, 500);
    assert.equal(bdr.raw.referredOrders.length, 2);
    assert.equal(bdr.referred.rows.find((row) => row.id === 'referredSales').value, 2250);
    assert.equal(bdr.referred.total, 17);
  });

  it('weights BDR outbound calls and referred dollars while rewarding high-margin SA/SR work', () => {
    const calls = scoreRoleMetrics({ activity: { outboundCalls: 40 } }, 'bdr');
    const emails = scoreRoleMetrics({ activity: { emailsSent: 500 } }, 'bdr');
    const referral = scoreRoleMetrics({
      referred: { orders: [{ sale: 10000, profit: 4000, createdByRoleId: 'bdr' }] },
    }, 'bdr');
    assert.equal(calls.activity.rows.find((row) => row.id === 'outboundCalls').points, 50);
    assert.equal(emails.activity.rows.find((row) => row.id === 'emailsSent').points, 30);
    assert.equal(referral.referred.total, 44);

    const lowMargin = scoreRoleMetrics({ sales: {
      proposals: [{ sale: 2000, profit: 500 }],
      orders: [{ sale: 2000, profit: 500 }],
    } }, 'sr');
    const highMargin = scoreRoleMetrics({ sales: {
      proposals: [{ sale: 2000, profit: 1100 }],
      orders: [{ sale: 2000, profit: 1100 }],
    } }, 'sr');
    assert.equal(lowMargin.sales.rows.find((row) => row.id === 'proposalMarginBonus').points, 0);
    assert.equal(lowMargin.sales.rows.find((row) => row.id === 'orderMarginBonus').points, 0);
    assert.equal(highMargin.sales.rows.find((row) => row.id === 'proposalMarginBonus').points, 6);
    assert.equal(highMargin.sales.rows.find((row) => row.id === 'orderMarginBonus').points, 12);
    assert.ok(highMargin.total > lowMargin.total);
  });

  it('keeps every weight and margin break in one explicit scoring contract', () => {
    assert.deepEqual(SALES_FANTASY_SCORING.activity.map((rule) => rule.label), [
      'Emails sent', 'Emails replied', 'Outbound calls', 'Inbound calls',
    ]);
    assert.deepEqual(SALES_FANTASY_SCORING.sales.map((rule) => rule.label), [
      'Proposals sent', 'Owned orders', 'Owned sales', 'Owned profit',
    ]);
    assert.deepEqual(SALES_FANTASY_SCORING.ownershipBands.map((band) => [band.roleId, band.minSale, band.maxSale]), [
      ['bdr', 0, 500], ['sa', 500, 1500], ['sr', 1500, null],
    ]);
    assert.deepEqual(SALES_FANTASY_SCORING.marginTiers.map((tier) => [tier.minMargin, tier.proposalBonusPoints, tier.orderBonusPoints]), [
      [0, 0, 0], [30, 1, 2], [40, 3, 6], [50, 6, 12],
    ]);
    assert.deepEqual(SALES_FANTASY_SCORING.referral.map((rule) => [rule.label, rule.pointsPerUnit]), [
      ['Referred orders', 4], ['Referred dollars', 0.004],
    ]);
  });

  it('keeps preview role contributions on the same playing field across a full season', () => {
    const totals = Object.fromEntries(SALES_FANTASY_ROLES.map((role) => [role.id, 0]));
    for (const pod of SALES_FANTASY_PODS) {
      for (let week = 1; week <= 9; week += 1) {
        for (const member of podWeekPointSplit(pod.id, week).members) totals[member.roleId] += member.total;
      }
    }
    const allPoints = Object.values(totals).reduce((sum, value) => sum + value, 0);
    const shares = Object.fromEntries(Object.entries(totals).map(([roleId, total]) => [roleId, total / allPoints]));
    for (const [roleId, share] of Object.entries(shares)) {
      assert.ok(share >= 0.28 && share <= 0.38, `${roleId} contribution share ${share}`);
    }
    assert.ok(totals.sr > totals.sa, 'larger SR-owned sales remain a driving factor');
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
    assert.equal(fantasyScore('pod-1', 4), 307.9);
    assert.deepEqual(podWeekPointSplit('pod-1', 4).members.map((member) => member.total), [108.8, 89.7, 109.4]);
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
