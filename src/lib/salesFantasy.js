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
const roleRates = (sr, sa, bdr) => Object.freeze({ sr, sa, bdr });

export const SALES_FANTASY_ROLES = Object.freeze([
  Object.freeze({ id: 'sr', label: 'SR', title: 'Sales Representative' }),
  Object.freeze({ id: 'sa', label: 'SA', title: 'Sales Associate' }),
  Object.freeze({ id: 'bdr', label: 'BDR', title: 'Business Development Representative' }),
]);

/** POD assignments imported from the 2026-08-24 Sales Fantasy lineup export. */
export const SALES_FANTASY_LINEUPS = Object.freeze([
  Object.freeze({ sr: 'Lorie Ojeman', sa: 'Alex Sylvester', bdr: 'JP Furman' }),
  Object.freeze({ sr: 'Melanie DeMoss', sa: 'Ryan Garrison', bdr: 'Hayden Fabre' }),
  Object.freeze({ sr: 'Scott Bienvenu', sa: 'Tyler Carney', bdr: 'Kade Kelemen' }),
  Object.freeze({ sr: 'Andy Melancon', sa: 'Sam Reutling', bdr: 'Joshua Faulk' }),
  Object.freeze({ sr: 'Seth Dupre', sa: 'Matthew LaGrange', bdr: 'Cullen Champagne' }),
  Object.freeze({ sr: 'Brendan Begue', sa: 'Brodie Graham', bdr: 'Braxton Terrebonne' }),
  Object.freeze({ sr: 'Joby Lasseigne', sa: 'Cameron Burkstaller', bdr: 'Bryce Sutterfield' }),
  Object.freeze({ sr: 'Collin Duplechain', sa: 'Ashlund Thibodeaux', bdr: 'Clay Landry' }),
  Object.freeze({ sr: 'Mitch Cope', sa: 'Kevin Toms', bdr: 'Cam Burke' }),
  Object.freeze({ sr: 'Logan Bex', sa: 'Logan Bex', bdr: 'Logan Bex' }),
]);

export function memberInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Shared weekly scoring contract for every role ledger and pod total. */
export const SALES_FANTASY_SCORING = Object.freeze({
  scoringDaysPerWeek: 5,
  salesEligibleRoles: Object.freeze(['sr', 'sa', 'bdr']),
  ownershipBands: Object.freeze([
    Object.freeze({ roleId: 'bdr', label: '$500 and under', minSale: 0, maxSale: 500, minInclusive: true, maxInclusive: true }),
    Object.freeze({ roleId: 'sa', label: '$500.01–$1,499.99', minSale: 500, maxSale: 1500, minInclusive: false, maxInclusive: false }),
    Object.freeze({ roleId: 'sr', label: '$1,500 and above', minSale: 1500, maxSale: null, minInclusive: true, maxInclusive: true }),
  ]),
  activity: Object.freeze([
    Object.freeze({ id: 'emailsSent', label: 'Emails sent', pointsByRole: roleRates(0.01, 0.01, 0.001) }),
    Object.freeze({ id: 'emailsReplied', label: 'Emails replied', pointsByRole: roleRates(0.1, 0.15, 0.1) }),
    Object.freeze({ id: 'outboundCalls', label: 'Outbound calls', pointsByRole: roleRates(0.15, 0.2, 0.2) }),
    Object.freeze({ id: 'inboundCalls', label: 'Inbound calls', pointsByRole: roleRates(0.1, 0.1, 0.1) }),
  ]),
  sales: Object.freeze([
    Object.freeze({ id: 'proposalsSent', label: 'Proposals sent', pointsByRole: roleRates(2.5, 2.5, 2.5) }),
    Object.freeze({ id: 'orders', label: 'Owned orders', pointsByRole: roleRates(6, 6, 6) }),
    Object.freeze({ id: 'totalSales', label: 'Owned sales', pointsByRole: roleRates(0.001, 0.001, 0.001), format: 'money' }),
    Object.freeze({ id: 'totalProfit', label: 'Owned profit', pointsByRole: roleRates(0.008, 0.008, 0.008), format: 'money' }),
  ]),
  marginTiers: Object.freeze([
    Object.freeze({ id: 'base', label: 'Under 30%', minMargin: 0, proposalBonusPoints: 0, orderBonusPoints: 0 }),
    Object.freeze({ id: 'healthy', label: '30%+', minMargin: 30, proposalBonusPoints: 1, orderBonusPoints: 2 }),
    Object.freeze({ id: 'strong', label: '40%+', minMargin: 40, proposalBonusPoints: 3, orderBonusPoints: 6 }),
    Object.freeze({ id: 'premium', label: '50%+', minMargin: 50, proposalBonusPoints: 6, orderBonusPoints: 12 }),
  ]),
  referral: Object.freeze([
    Object.freeze({ id: 'referredOrders', label: 'Referred orders', pointsPerUnit: 4, format: 'orders' }),
    Object.freeze({ id: 'referredSales', label: 'Referred dollars', pointsPerUnit: 0.004, format: 'money' }),
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
      name: SALES_FANTASY_LINEUPS[podIndex][role.id],
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

const FANTASY_BYE_IDS = Object.freeze(['__sales-fantasy-bye-a__', '__sales-fantasy-bye-b__']);
const FANTASY_BYE_ID_SET = new Set(FANTASY_BYE_IDS);

function isFantasyByeId(podId) {
  return FANTASY_BYE_ID_SET.has(podId);
}

/**
 * Ten-week schedule for ten pods. Two virtual bye slots create four matchups
 * and two real-pod byes every week. The virtual-vs-virtual round is omitted,
 * leaving every pod with eight unique matchups and two byes.
 */
export function buildFantasySchedule(pods = SALES_FANTASY_PODS) {
  if (!Array.isArray(pods) || pods.length < 2 || pods.length % 2 !== 0) {
    throw new TypeError('Sales Fantasy requires an even number of at least two pods');
  }
  if (pods.some((pod) => isFantasyByeId(pod.id))) {
    throw new TypeError('Sales Fantasy pod ids cannot use reserved bye-slot ids');
  }
  const slots = [...pods];
  slots.splice(1, 0, { id: FANTASY_BYE_IDS[0] });
  slots.push({ id: FANTASY_BYE_IDS[1] });
  const rounds = buildRoundRobinSchedule(slots)
    .filter((games) => !games.some((game) => isFantasyByeId(game.home) && isFantasyByeId(game.away)));

  return rounds.map((games, weekIndex) => ({
    week: weekIndex + 1,
    games: games
      .filter((game) => !isFantasyByeId(game.home) && !isFantasyByeId(game.away))
      .map((game, gameIndex) => ({ ...game, id: `week-${weekIndex + 1}-game-${gameIndex + 1}` })),
    byes: games.flatMap((game) => (
      isFantasyByeId(game.home) ? [game.away] : isFantasyByeId(game.away) ? [game.home] : []
    )),
  }));
}

function dealSale(seed, dealIndex, roleId, kind) {
  const salt = kind === 'proposal' ? 71 : 43;
  const value = seed * (dealIndex + 5) * salt;
  if (roleId === 'bdr') return 160 + (value % 341);
  if (roleId === 'sa') return 501 + (value % 999);
  return 1500 + (value % 3501);
}

function roleDeals(podNumber, roleIndex, weekNumber, kind) {
  const roleId = SALES_FANTASY_ROLES[roleIndex].id;
  const seed = podNumber * 97 + (roleIndex + 1) * 53 + weekNumber * 31;
  const orderCount = roleId === 'bdr' ? 1 + (seed % 2) : 2 + (seed % 3);
  const count = kind === 'proposal' ? orderCount + 2 + (seed % 2) : orderCount;
  return Array.from({ length: count }, (_, dealIndex) => {
    const sale = dealSale(seed, dealIndex, roleId, kind);
    const marginPercent = 26 + ((seed + dealIndex * 11 + roleIndex * 7 + (kind === 'proposal' ? 5 : 0)) % 31);
    const accountOwnerRoleId = roleId !== 'bdr' && (seed + dealIndex * 7) % 3 === 0 ? 'bdr' : roleId;
    return {
      id: `preview-${kind}-${podNumber}-${roleIndex + 1}-${weekNumber}-${dealIndex + 1}`,
      sale: money(sale),
      profit: money(sale * marginPercent / 100),
      accountOwnerRoleId,
    };
  });
}

function roleWeekMetrics(podNumber, roleIndex, weekNumber) {
  const seed = podNumber * 97 + (roleIndex + 1) * 53 + weekNumber * 31;
  const roleId = SALES_FANTASY_ROLES[roleIndex].id;
  const roleActivity = [
    { emailsSent: 165 + (seed % 101), emailsReplied: 12 + (seed % 8), outboundCalls: 45 + (seed % 31), inboundCalls: 12 + (seed % 7) },
    { emailsSent: 250 + (seed % 101), emailsReplied: 15 + (seed % 8), outboundCalls: 70 + (seed % 41), inboundCalls: 15 + (seed % 7) },
    { emailsSent: 1000 + (seed % 801), emailsReplied: 15 + (seed % 16), outboundCalls: 175 + (seed % 126), inboundCalls: 8 + (seed % 7) },
  ][roleIndex];
  const activity = {
    emailsSent: roleActivity.emailsSent,
    emailsReplied: roleActivity.emailsReplied,
    outboundCalls: roleActivity.outboundCalls,
    inboundCalls: roleActivity.inboundCalls,
  };
  const orders = roleDeals(podNumber, roleIndex, weekNumber, 'order');
  const proposals = roleDeals(podNumber, roleIndex, weekNumber, 'proposal');
  const referrals = roleId === 'bdr'
    ? SALES_FANTASY_ROLES.slice(0, 2)
      .flatMap((_, ownerIndex) => roleDeals(podNumber, ownerIndex, weekNumber, 'order'))
      .filter((order) => order.accountOwnerRoleId === 'bdr')
    : [];
  return {
    activity,
    sales: {
      proposals,
      orders,
    },
    referred: { orders: referrals },
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

/** Resolve the single owner role from an order or proposal's expected value. */
export function ownerRoleForDeal(deal, rules = SALES_FANTASY_SCORING) {
  if (deal?.sale === null || deal?.sale === undefined || deal?.sale === '') return null;
  const sale = Number(deal?.sale);
  if (!Number.isFinite(sale) || sale < 0) return null;
  const band = rules.ownershipBands.find((candidate) => {
    const aboveMin = candidate.minInclusive ? sale >= candidate.minSale : sale > candidate.minSale;
    const belowMax = candidate.maxSale === null
      || (candidate.maxInclusive ? sale <= candidate.maxSale : sale < candidate.maxSale);
    return aboveMin && belowMax;
  });
  return band?.roleId || null;
}

/**
 * Allocate a pod's shared closed-order feed by deal band. Referral credit is
 * additive when the completed SA/SR order belongs to a BDR-owned account.
 */
export function allocatePodOrders(orders, rules = SALES_FANTASY_SCORING) {
  const owned = Object.fromEntries(SALES_FANTASY_ROLES.map((role) => [role.id, []]));
  const referred = [];
  for (const order of Array.isArray(orders) ? orders : []) {
    const ownerRoleId = ownerRoleForDeal(order, rules);
    if (!ownerRoleId) continue;
    owned[ownerRoleId].push(order);
    if (ownerRoleId !== 'bdr' && order?.accountOwnerRoleId === 'bdr') referred.push(order);
  }
  return { owned, referred };
}

function pointsPerUnitForRole(metric, roleId) {
  return metric.pointsByRole?.[roleId] ?? metric.pointsPerUnit ?? 0;
}

function scoreMetric(metric, value, roleId) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  return {
    id: metric.id,
    label: metric.label,
    value: safeValue,
    format: metric.format || 'number',
    points: oneDecimal(safeValue * pointsPerUnitForRole(metric, roleId)),
  };
}

/** Score one role's normalized weekly CRM metrics into auditable rows. */
export function scoreRoleMetrics(metrics, roleId = 'sr', rules = SALES_FANTASY_SCORING) {
  const activityValues = metrics?.activity || {};
  const earnsSalesPoints = rules.salesEligibleRoles.includes(roleId);
  const suppliedOrders = Array.isArray(metrics?.sales?.orders) ? metrics.sales.orders : [];
  const completedOrders = earnsSalesPoints
    ? suppliedOrders.filter((order) => ownerRoleForDeal(order, rules) === roleId)
    : [];
  const suppliedProposals = Array.isArray(metrics?.sales?.proposals) ? metrics.sales.proposals : [];
  const proposals = earnsSalesPoints
    ? suppliedProposals.filter((proposal) => ownerRoleForDeal(proposal, rules) === roleId)
    : [];
  const proposalCount = !earnsSalesPoints
    ? 0
    : (suppliedProposals.length
      ? proposals.length
      : Math.max(0, Number(metrics?.sales?.proposalsSent) || 0));
  const totalSales = money(completedOrders.reduce((sum, order) => sum + (Number(order?.sale) || 0), 0));
  const totalProfit = money(completedOrders.reduce((sum, order) => sum + (Number(order?.profit) || 0), 0));
  const salesValues = {
    proposalsSent: proposalCount,
    orders: completedOrders.length,
    totalSales,
    totalProfit,
  };
  const activityRows = rules.activity.map((metric) => scoreMetric(metric, activityValues[metric.id], roleId));
  const salesRows = earnsSalesPoints
    ? rules.sales.map((metric) => scoreMetric(metric, salesValues[metric.id], roleId))
    : [];
  const proposalTierCounts = new Map(rules.marginTiers.map((tier) => [tier.id, 0]));
  let proposalMarginBonusPoints = 0;
  proposals.forEach((proposal) => {
    const tier = marginTierForOrder(proposal, rules.marginTiers);
    if (!tier) return;
    proposalTierCounts.set(tier.id, (proposalTierCounts.get(tier.id) || 0) + 1);
    proposalMarginBonusPoints += tier.proposalBonusPoints;
  });
  if (earnsSalesPoints) {
    salesRows.splice(1, 0, {
      id: 'proposalMarginBonus',
      label: 'Proposal margin bonus',
      value: proposals.length,
      format: 'proposals',
      points: oneDecimal(proposalMarginBonusPoints),
    });
  }
  const orderTierCounts = new Map(rules.marginTiers.map((tier) => [tier.id, 0]));
  let orderMarginBonusPoints = 0;
  completedOrders.forEach((order) => {
    const tier = marginTierForOrder(order, rules.marginTiers);
    if (!tier) return;
    orderTierCounts.set(tier.id, (orderTierCounts.get(tier.id) || 0) + 1);
    orderMarginBonusPoints += tier.orderBonusPoints;
  });
  const marginTiers = rules.marginTiers.map((tier) => ({
    ...tier,
    proposals: proposalTierCounts.get(tier.id) || 0,
    orders: orderTierCounts.get(tier.id) || 0,
    proposalPoints: oneDecimal((proposalTierCounts.get(tier.id) || 0) * tier.proposalBonusPoints),
    orderPoints: oneDecimal((orderTierCounts.get(tier.id) || 0) * tier.orderBonusPoints),
  }));
  if (earnsSalesPoints) {
    salesRows.push({
      id: 'orderMarginBonus',
      label: 'Order margin bonus',
      value: completedOrders.length,
      format: 'orders',
      points: oneDecimal(orderMarginBonusPoints),
    });
  }
  const referredOrders = roleId === 'bdr' && Array.isArray(metrics?.referred?.orders)
    ? metrics.referred.orders.filter((order) => {
      const ownerRoleId = ownerRoleForDeal(order, rules);
      return order?.accountOwnerRoleId === 'bdr' && (ownerRoleId === 'sa' || ownerRoleId === 'sr');
    })
    : [];
  const referredValues = {
    referredOrders: referredOrders.length,
    referredSales: money(referredOrders.reduce((sum, order) => sum + (Number(order?.sale) || 0), 0)),
  };
  const referredRows = roleId === 'bdr'
    ? rules.referral.map((metric) => scoreMetric(metric, referredValues[metric.id], roleId))
    : [];
  const activityTotal = oneDecimal(activityRows.reduce((sum, row) => sum + row.points, 0));
  const salesTotal = oneDecimal(salesRows.reduce((sum, row) => sum + row.points, 0));
  const referredTotal = oneDecimal(referredRows.reduce((sum, row) => sum + row.points, 0));
  return {
    raw: { activity: activityValues, sales: salesValues, proposals, completedOrders, referredOrders },
    activity: { rows: activityRows, total: activityTotal },
    sales: earnsSalesPoints ? { rows: salesRows, marginTiers, total: salesTotal } : null,
    referred: roleId === 'bdr' ? { rows: referredRows, total: referredTotal } : null,
    total: oneDecimal(activityTotal + salesTotal + referredTotal),
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
  const scored = scoreRoleMetrics(roleWeekMetrics(podIndex + 1, memberIndex, weekNumber), member.roleId);
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

function bracketPodSlot(record, pods) {
  const pod = pods.find((candidate) => candidate.id === record.podId);
  return {
    kind: 'pod',
    podId: record.podId,
    name: pod?.name || record.podId,
    seed: record.rank,
  };
}

const bracketPendingSlot = (label) => ({ kind: 'pending', label });

function fivePodBracket(id, label, records, pods) {
  const entrants = records.map((record) => bracketPodSlot(record, pods));
  const [first, second, third, fourth, fifth] = entrants;
  return {
    id,
    label,
    entrants,
    rounds: [
      {
        id: `${id}-opening`,
        label: 'Opening',
        games: [{ id: `${id}-opening-1`, slots: [fourth, fifth] }],
      },
      {
        id: `${id}-semifinals`,
        label: 'Semifinals',
        games: [
          { id: `${id}-semifinal-1`, slots: [first, bracketPendingSlot('Winner · Opening')] },
          { id: `${id}-semifinal-2`, slots: [second, third] },
        ],
      },
      {
        id: `${id}-final`,
        label: 'Final',
        games: [{
          id: `${id}-final-1`,
          slots: [bracketPendingSlot('Winner · Semifinal 1'), bracketPendingSlot('Winner · Semifinal 2')],
        }],
      },
    ],
  };
}

/** Current postseason projection: seeds 1–5 upper, seeds 6–10 lower. */
export function buildPlayoffBracket(standings, pods = SALES_FANTASY_PODS) {
  if (!Array.isArray(standings) || standings.length !== 10) {
    throw new TypeError('Sales Fantasy bracket projection requires ten standings rows');
  }
  const ordered = [...standings].sort((left, right) => left.rank - right.rank);
  return {
    winnerBracket: fivePodBracket('winner', 'Winner Bracket', ordered.slice(0, 5), pods),
    loserBracket: fivePodBracket('loser', 'Loser Bracket', ordered.slice(5), pods),
  };
}

export function podForId(podId, pods = SALES_FANTASY_PODS) {
  return pods.find((pod) => pod.id === podId) || null;
}

export function matchupForPod(week, podId) {
  return week.games.find((game) => game.home === podId || game.away === podId) || null;
}
