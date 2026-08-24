/**
 * Sales Fantasy league model.
 *
 * The first event release uses structured sample data so the UI can be built
 * and reviewed before a production metrics endpoint exists. Keep the view
 * layer pointed at these helpers: replacing the fixture with server data then
 * becomes a data-adapter change rather than a dashboard rewrite.
 */

export const SALES_FANTASY_CURRENT_WEEK = 4;

const MEMBER_NAMES = [
  ['Avery Cole', 'Jordan Reed', 'Taylor Lane'],
  ['Morgan Lee', 'Casey Brooks', 'Riley Grant'],
  ['Cameron Wells', 'Quinn Harper', 'Jamie Stone'],
  ['Parker Young', 'Reese Bailey', 'Drew Collins'],
  ['Skyler Price', 'Emerson Gray', 'Hayden Scott'],
  ['Rowan James', 'Finley Moore', 'Dakota Bell'],
  ['Alexis Ward', 'Charlie Hayes', 'Kendall Ross'],
  ['Blake Perry', 'Sage Bennett', 'Logan Foster'],
  ['Marley Cook', 'Robin Hughes', 'Arden Powell'],
  ['Sydney Long', 'Elliot Bryant', 'Micah Kelly'],
];

const POD_DEFS = [
  ['pin-seekers', 'Pin Seekers', 'PS'],
  ['fairway-force', 'Fairway Force', 'FF'],
  ['birdie-bureau', 'Birdie Bureau', 'BB'],
  ['green-jackets', 'Green Jackets', 'GJ'],
  ['flag-hunters', 'Flag Hunters', 'FH'],
  ['back-nine', 'Back Nine', 'BN'],
  ['clubhouse-crew', 'Clubhouse Crew', 'CC'],
  ['ace-makers', 'Ace Makers', 'AM'],
  ['long-drivers', 'Long Drivers', 'LD'],
  ['sunday-bags', 'Sunday Bags', 'SB'],
];

function initials(name) {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function memberMetrics(podIndex, memberIndex) {
  const seed = (podIndex + 2) * 17 + (memberIndex + 3) * 11;
  return {
    fantasyPoints: Number((82 + (seed % 41) + memberIndex * 2.7).toFixed(1)),
    revenue: 21800 + ((seed * 907) % 17800),
    margin: Number((31.4 + ((seed * 13) % 91) / 10).toFixed(1)),
    orders: 19 + (seed % 23),
  };
}

export const SALES_FANTASY_PODS = POD_DEFS.map(([id, name, short], podIndex) => ({
  id,
  name,
  short,
  seed: podIndex + 1,
  members: MEMBER_NAMES[podIndex].map((name, memberIndex) => ({
    id: `${id}-${memberIndex + 1}`,
    name,
    initials: initials(name),
    role: memberIndex === 0 ? 'Pod captain' : 'Sales rep',
    metrics: memberMetrics(podIndex, memberIndex),
  })),
}));

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

export function fantasyScore(podId, weekNumber, pods = SALES_FANTASY_PODS) {
  const podIndex = pods.findIndex((pod) => pod.id === podId);
  if (podIndex < 0 || !Number.isInteger(weekNumber) || weekNumber < 1) return 0;
  const whole = 246 + ((podIndex * 47 + weekNumber * 31 + podIndex * weekNumber * 7) % 104);
  return Number((whole + ((podIndex + weekNumber * 3) % 10) / 10).toFixed(1));
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
    .map((record, index) => ({ ...record, rank: index + 1, pointsFor: Number(record.pointsFor.toFixed(1)) }));
}

export function podForId(podId, pods = SALES_FANTASY_PODS) {
  return pods.find((pod) => pod.id === podId) || null;
}

export function matchupForPod(week, podId) {
  return week.games.find((game) => game.home === podId || game.away === podId) || null;
}
