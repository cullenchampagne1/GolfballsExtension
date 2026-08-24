/**
 * Sales Fantasy league model.
 *
 * The event UI currently runs on deterministic preview data while the live
 * metrics feed is being connected. Pod identity, scheduling, and the scoring
 * contract live here so the server adapter can replace only the fixture data.
 */

export const SALES_FANTASY_CURRENT_WEEK = 4;

const POD_COUNT = 10;
const MEMBERS_PER_POD = 3;

function memberMetrics(podNumber, memberNumber) {
  const seed = podNumber * 29 + memberNumber * 17;
  return {
    revenue: 22000 + ((seed * 907) % 17800),
    margin: Number((31.4 + ((seed * 13) % 91) / 10).toFixed(1)),
    orders: 19 + (seed % 23),
  };
}

export const SALES_FANTASY_PODS = Array.from({ length: POD_COUNT }, (_, podIndex) => {
  const number = podIndex + 1;
  const id = `pod-${number}`;
  return {
    id,
    number,
    name: `POD ${number}`,
    seed: number,
    members: Array.from({ length: MEMBERS_PER_POD }, (_, memberIndex) => {
      const memberNumber = memberIndex + 1;
      return {
        id: `${id}-rep-${memberNumber}`,
        number: memberNumber,
        name: `Rep ${memberNumber}`,
        role: memberNumber === 1 ? 'Pod captain' : 'Sales rep',
        metrics: memberMetrics(number, memberNumber),
      };
    }),
  };
});

/** Standard circle-method round robin for an even number of pods. */
export function buildRoundRobinSchedule(pods = SALES_FANTASY_PODS) {
  if (!Array.isArray(pods) || pods.length < 2 || pods.length % 2 !== 0) {
    throw new TypeError('Sales Fantasy requires an even number of at least two pods');
  }
  const rotation = pods.map((pod) => pod.id);
  const weeks = [];
  for (let round = 0; round < rotation.length - 1; round += 1) {
    const games = [];
    for (let index = 0; index < rotation.length / 2; index += 1) {
      const left = rotation[index];
      const right = rotation[rotation.length - 1 - index];
      const flip = (round + index) % 2 === 1;
      games.push({ home: flip ? right : left, away: flip ? left : right });
    }
    weeks.push(games);
    rotation.splice(1, 0, rotation.pop());
  }
  return weeks;
}

/* Pick one complete matchup from each of N/2 distinct weeks so every pod is
 * selected exactly once. Removing those games creates paired bye weeks: with
 * ten pods, a single-bye week would leave an odd nine pods and cannot support
 * head-to-head play. */
function selectPairedByes(rounds, podCount) {
  const target = podCount / 2;
  const walk = (startWeek, usedPods, selections) => {
    if (selections.length === target) return selections;
    for (let weekIndex = startWeek; weekIndex < rounds.length; weekIndex += 1) {
      for (let gameIndex = 0; gameIndex < rounds[weekIndex].length; gameIndex += 1) {
        const game = rounds[weekIndex][gameIndex];
        if (usedPods.has(game.home) || usedPods.has(game.away)) continue;
        const nextUsed = new Set(usedPods);
        nextUsed.add(game.home);
        nextUsed.add(game.away);
        const found = walk(weekIndex + 1, nextUsed, [...selections, { weekIndex, gameIndex }]);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(0, new Set(), []) || [];
}

/**
 * Nine-week schedule for ten pods. Five weeks have two pods on bye and four
 * matchups; four weeks contain the full five matchups. Every pod gets one bye.
 */
export function buildFantasySchedule(pods = SALES_FANTASY_PODS) {
  const rounds = buildRoundRobinSchedule(pods);
  const byeSelections = selectPairedByes(rounds, pods.length);
  if (byeSelections.length !== pods.length / 2) {
    throw new Error('Unable to produce a balanced paired-bye schedule');
  }
  const byWeek = new Map(byeSelections.map((selection) => [selection.weekIndex, selection.gameIndex]));
  return rounds.map((games, weekIndex) => {
    const byeGameIndex = byWeek.get(weekIndex);
    const byeGame = byeGameIndex === undefined ? null : games[byeGameIndex];
    return {
      week: weekIndex + 1,
      games: games
        .filter((_, gameIndex) => gameIndex !== byeGameIndex)
        .map((game, gameIndex) => ({ ...game, id: `week-${weekIndex + 1}-game-${gameIndex + 1}` })),
      byes: byeGame ? [byeGame.home, byeGame.away] : [],
    };
  });
}

const oneDecimal = (value) => Number(value.toFixed(1));

/**
 * Explainable weekly score for one rep. Each category is already expressed
 * as points so the UI can show the exact addition without hiding a formula.
 */
export function memberWeekPointSplit(podId, memberId, weekNumber, pods = SALES_FANTASY_PODS) {
  const podIndex = pods.findIndex((pod) => pod.id === podId);
  const pod = pods[podIndex];
  const memberIndex = pod?.members.findIndex((member) => member.id === memberId) ?? -1;
  if (podIndex < 0 || memberIndex < 0 || !Number.isInteger(weekNumber) || weekNumber < 1) return null;

  const podNumber = podIndex + 1;
  const memberNumber = memberIndex + 1;
  const sales = oneDecimal(42 + ((podNumber * 19 + memberNumber * 13 + weekNumber * 17) % 257) / 10);
  const margin = oneDecimal(18 + ((podNumber * 11 + memberNumber * 23 + weekNumber * 7) % 137) / 10);
  const orders = oneDecimal(12 + ((podNumber * 17 + memberNumber * 5 + weekNumber * 19) % 103) / 10);
  return {
    memberId,
    memberName: pod.members[memberIndex].name,
    sales,
    margin,
    orders,
    total: oneDecimal(sales + margin + orders),
  };
}

/** The three rep splits and their reconciled pod total for a single week. */
export function podWeekPointSplit(podId, weekNumber, pods = SALES_FANTASY_PODS) {
  const pod = pods.find((item) => item.id === podId);
  if (!pod) return null;
  const members = pod.members
    .map((member) => memberWeekPointSplit(podId, member.id, weekNumber, pods))
    .filter(Boolean);
  return {
    podId,
    week: weekNumber,
    members,
    total: oneDecimal(members.reduce((sum, member) => sum + member.total, 0)),
  };
}

export function fantasyScore(podId, weekNumber, pods = SALES_FANTASY_PODS) {
  return podWeekPointSplit(podId, weekNumber, pods)?.total || 0;
}

export function weekState(weekNumber, currentWeek = SALES_FANTASY_CURRENT_WEEK) {
  if (weekNumber < currentWeek) return 'final';
  if (weekNumber === currentWeek) return 'live';
  return 'scheduled';
}

export function buildStandings(
  pods = SALES_FANTASY_PODS,
  schedule = buildFantasySchedule(pods),
  currentWeek = SALES_FANTASY_CURRENT_WEEK,
) {
  const records = new Map(pods.map((pod) => [pod.id, {
    podId: pod.id, wins: 0, losses: 0, ties: 0, byes: 0, pointsFor: 0,
  }]));

  for (const week of schedule) {
    if (week.week >= currentWeek) break;
    for (const podId of week.byes) records.get(podId).byes += 1;
    for (const game of week.games) {
      const home = records.get(game.home);
      const away = records.get(game.away);
      const homeScore = fantasyScore(game.home, week.week, pods);
      const awayScore = fantasyScore(game.away, week.week, pods);
      home.pointsFor += homeScore;
      away.pointsFor += awayScore;
      if (homeScore === awayScore) {
        home.ties += 1;
        away.ties += 1;
      } else if (homeScore > awayScore) {
        home.wins += 1;
        away.losses += 1;
      } else {
        away.wins += 1;
        home.losses += 1;
      }
    }
  }

  return [...records.values()]
    .sort((left, right) => (
      right.wins - left.wins
      || left.losses - right.losses
      || right.pointsFor - left.pointsFor
      || left.podId.localeCompare(right.podId)
    ))
    .map((record, index) => ({ ...record, rank: index + 1, pointsFor: oneDecimal(record.pointsFor) }));
}

export function podForId(podId, pods = SALES_FANTASY_PODS) {
  return pods.find((pod) => pod.id === podId) || null;
}

export function matchupForPod(week, podId) {
  return week.games.find((game) => game.home === podId || game.away === podId) || null;
}
