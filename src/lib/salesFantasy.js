/**
 * Sales Fantasy league model.
 *
 * The event UI currently runs on deterministic preview data while the live
 * metrics feed is being connected. Pod identity, scheduling, and the scoring
 * contract live here so the server adapter can replace only the fixture data.
 */

export const SALES_FANTASY_CURRENT_WEEK = 4;

const POD_COUNT = 10;
const oneDecimal = (value) => Number(value.toFixed(1));
const money = (value) => Number(value.toFixed(2));

export const SALES_FANTASY_ROLES = Object.freeze([
  Object.freeze({ id: 'sr', label: 'SR', title: 'Sales Representative' }),
  Object.freeze({ id: 'sa', label: 'SA', title: 'Sales Associate' }),
  Object.freeze({ id: 'bdr', label: 'BDR', title: 'Business Development Representative' }),
]);

/**
 * Preview scoring contract. Production values can replace this object without
 * changing the score engine or any of the pod/matchup presentation code.
 * Revenue and profit use dollar-based rates; completed orders receive their
 * base order points plus the highest margin tier they qualify for.
 */
export const SALES_FANTASY_SCORING = Object.freeze({
  activity: Object.freeze([
    Object.freeze({ id: 'emailsSent', label: 'Emails sent', pointsPerUnit: 0.1 }),
    Object.freeze({ id: 'emailsReplied', label: 'Emails replied', pointsPerUnit: 1.5 }),
    Object.freeze({ id: 'outboundCalls', label: 'Outbound calls', pointsPerUnit: 0.5 }),
    Object.freeze({ id: 'inboundCalls', label: 'Inbound calls', pointsPerUnit: 1 }),
  ]),
  sales: Object.freeze([
    Object.freeze({ id: 'proposalsSent', label: 'Proposals sent', pointsPerUnit: 2 }),
    Object.freeze({ id: 'orders', label: 'Orders', pointsPerUnit: 5 }),
    Object.freeze({ id: 'totalSales', label: 'Total sales', pointsPerUnit: 0.001, format: 'money' }),
    Object.freeze({ id: 'totalProfit', label: 'Total profit', pointsPerUnit: 0.004, format: 'money' }),
  ]),
  marginTiers: Object.freeze([
    Object.freeze({ id: 'base', label: 'Under 30%', minMargin: 0, bonusPoints: 0 }),
    Object.freeze({ id: 'healthy', label: '30%+', minMargin: 30, bonusPoints: 2 }),
    Object.freeze({ id: 'strong', label: '40%+', minMargin: 40, bonusPoints: 5 }),
    Object.freeze({ id: 'premium', label: '50%+', minMargin: 50, bonusPoints: 9 }),
  ]),
});

export const SALES_FANTASY_PODS = Array.from({ length: POD_COUNT }, (_, podIndex) => {
  const number = podIndex + 1;
  const id = `pod-${number}`;
  return {
    id,
    number,
    name: `POD ${number}`,
    seed: number,
    members: SALES_FANTASY_ROLES.map((role, memberIndex) => ({
      id: `${id}-${role.id}`,
      number: memberIndex + 1,
      name: role.label,
      role: role.title,
      roleId: role.id,
    })),
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

function roleWeekMetrics(podNumber, roleIndex, weekNumber) {
  const seed = podNumber * 97 + (roleIndex + 1) * 53 + weekNumber * 31;
  const roleActivity = [
    { emailsSent: 39, emailsReplied: 8, outboundCalls: 17, inboundCalls: 7 },
    { emailsSent: 31, emailsReplied: 6, outboundCalls: 11, inboundCalls: 9 },
    { emailsSent: 57, emailsReplied: 10, outboundCalls: 25, inboundCalls: 5 },
  ][roleIndex];
  const activity = {
    emailsSent: roleActivity.emailsSent + (seed % 21),
    emailsReplied: roleActivity.emailsReplied + (seed % 8),
    outboundCalls: roleActivity.outboundCalls + (seed % 15),
    inboundCalls: roleActivity.inboundCalls + (seed % 7),
  };
  const orderCount = 2 + (seed % 4);
  const orders = Array.from({ length: orderCount }, (_, orderIndex) => {
    const amount = 3100 + ((seed * (orderIndex + 5) * 47) % 9400);
    const marginPercent = 24 + ((seed + orderIndex * 11 + roleIndex * 7) % 34);
    return {
      id: `preview-${podNumber}-${roleIndex + 1}-${weekNumber}-${orderIndex + 1}`,
      sale: money(amount),
      profit: money(amount * marginPercent / 100),
    };
  });
  return {
    activity,
    sales: {
      proposalsSent: orderCount + 3 + (seed % 5),
      orders,
    },
  };
}

export function orderMarginPercent(order) {
  const sale = Number(order?.sale);
  const profit = Number(order?.profit);
  if (!Number.isFinite(sale) || sale <= 0 || !Number.isFinite(profit)) return 0;
  return oneDecimal(Math.max(0, profit / sale * 100));
}

export function marginTierForOrder(order, tiers = SALES_FANTASY_SCORING.marginTiers) {
  const sale = Number(order?.sale);
  const profit = Number(order?.profit);
  const margin = Number.isFinite(sale) && sale > 0 && Number.isFinite(profit)
    ? Math.max(0, profit / sale * 100)
    : 0;
  return [...tiers]
    .filter((tier) => margin >= tier.minMargin)
    .sort((left, right) => right.minMargin - left.minMargin)[0] || tiers[0] || null;
}

function scoreMetric(metric, value) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  return {
    id: metric.id,
    label: metric.label,
    value: safeValue,
    format: metric.format || 'number',
    points: oneDecimal(safeValue * metric.pointsPerUnit),
  };
}

/** Score one role's normalized weekly CRM metrics into auditable rows. */
export function scoreRoleMetrics(metrics, rules = SALES_FANTASY_SCORING) {
  const activityValues = metrics?.activity || {};
  const completedOrders = Array.isArray(metrics?.sales?.orders) ? metrics.sales.orders : [];
  const totalSales = money(completedOrders.reduce((sum, order) => sum + (Number(order?.sale) || 0), 0));
  const totalProfit = money(completedOrders.reduce((sum, order) => sum + (Number(order?.profit) || 0), 0));
  const salesValues = {
    proposalsSent: metrics?.sales?.proposalsSent || 0,
    orders: completedOrders.length,
    totalSales,
    totalProfit,
  };
  const activityRows = rules.activity.map((metric) => scoreMetric(metric, activityValues[metric.id]));
  const salesRows = rules.sales.map((metric) => scoreMetric(metric, salesValues[metric.id]));
  const tierCounts = new Map(rules.marginTiers.map((tier) => [tier.id, 0]));
  let marginBonusPoints = 0;
  completedOrders.forEach((order) => {
    const tier = marginTierForOrder(order, rules.marginTiers);
    if (!tier) return;
    tierCounts.set(tier.id, (tierCounts.get(tier.id) || 0) + 1);
    marginBonusPoints += tier.bonusPoints;
  });
  const marginTiers = rules.marginTiers.map((tier) => ({
    ...tier,
    orders: tierCounts.get(tier.id) || 0,
    points: oneDecimal((tierCounts.get(tier.id) || 0) * tier.bonusPoints),
  }));
  salesRows.push({
    id: 'marginBonus',
    label: 'Margin bonus',
    value: completedOrders.length,
    format: 'orders',
    points: oneDecimal(marginBonusPoints),
  });
  const activityTotal = oneDecimal(activityRows.reduce((sum, row) => sum + row.points, 0));
  const salesTotal = oneDecimal(salesRows.reduce((sum, row) => sum + row.points, 0));
  return {
    raw: { activity: activityValues, sales: salesValues, completedOrders },
    activity: { rows: activityRows, total: activityTotal },
    sales: { rows: salesRows, marginTiers, total: salesTotal },
    total: oneDecimal(activityTotal + salesTotal),
  };
}

/**
 * Explainable weekly score for one pod role. Raw metrics and points remain
 * together so every total can be audited from the UI.
 */
export function memberWeekPointSplit(podId, memberId, weekNumber, pods = SALES_FANTASY_PODS) {
  const podIndex = pods.findIndex((pod) => pod.id === podId);
  const pod = pods[podIndex];
  const memberIndex = pod?.members.findIndex((member) => member.id === memberId) ?? -1;
  if (podIndex < 0 || memberIndex < 0 || !Number.isInteger(weekNumber) || weekNumber < 1) return null;

  const member = pod.members[memberIndex];
  const scored = scoreRoleMetrics(roleWeekMetrics(podIndex + 1, memberIndex, weekNumber));
  return {
    memberId,
    memberName: member.name,
    memberRole: member.role,
    roleId: member.roleId,
    ...scored,
  };
}

/** The SR, SA, and BDR splits and their reconciled pod total for a single week. */
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
