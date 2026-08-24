import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SALES_FANTASY_CURRENT_WEEK,
  SALES_FANTASY_PODS,
  buildFantasySchedule,
  buildStandings,
  fantasyScore,
  matchupForPod,
  weekState,
} from '../../src/lib/salesFantasy.js';

describe('salesFantasy · league model', () => {
  it('defines ten pods with three independently measured members each', () => {
    assert.equal(SALES_FANTASY_PODS.length, 10);
    assert.equal(new Set(SALES_FANTASY_PODS.map((pod) => pod.id)).size, 10);
    for (const pod of SALES_FANTASY_PODS) {
      assert.equal(pod.members.length, 3, pod.name);
      for (const member of pod.members) {
        assert.deepEqual(Object.keys(member.metrics), ['fantasyPoints', 'revenue', 'margin', 'orders']);
        assert.ok(member.metrics.fantasyPoints > 0, member.name);
        assert.ok(member.metrics.revenue > 0, member.name);
      }
    }
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
    assert.equal(fantasyScore('pin-seekers', 4), 266.2);
    assert.equal(weekState(SALES_FANTASY_CURRENT_WEEK), 'live');
    assert.equal(weekState(SALES_FANTASY_CURRENT_WEEK - 1), 'final');
    assert.equal(weekState(SALES_FANTASY_CURRENT_WEEK + 1), 'scheduled');
    assert.ok(matchupForPod(schedule[3], 'pin-seekers'));
    const standings = buildStandings(SALES_FANTASY_PODS, schedule, SALES_FANTASY_CURRENT_WEEK);
    assert.equal(standings.length, 10);
    assert.deepEqual(standings.map((record) => record.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(standings.reduce((sum, record) => sum + record.wins, 0), standings.reduce((sum, record) => sum + record.losses, 0));
  });
});
