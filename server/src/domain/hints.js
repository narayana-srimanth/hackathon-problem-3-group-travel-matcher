// Empty-state hints (brief FAQ: "for no matches, suggest actions").
// The service calls this only when a search has no matches. It passes every candidate group
// (OPEN, not the seeker's own, any city) with its evaluation. A hint comes from a group that
// fails exactly ONE rule, and says the smallest change that would make it pass:
//   SAME_CITY        → OTHER_CITY     DATES_OVERLAP → WIDEN_DATES (exact new date)
//   BUDGET           → ADJUST_BUDGET  SHARED_INTERESTS → ADD_INTERESTS
// GENDER and GROUP_SIZE give no hint (the seeker can't change them). At most HINTS.MAX hints,
// best-scoring groups first. A stay shorter than the minimum always gets a general hint first.

const { RULES, DATA_WINDOW, BUDGET_RANGE, HINTS } = require('./constants');
const { toDay, fromDay, nightCount, sharedNights } = require('./dates');
const { inr, plural, formatDay, orList, andList } = require('./messages');
const { scoreMatch, compareMatches } = require('./ranking');

// The smallest date change that reaches the minimum shared nights: a later check-out or an
// earlier check-in, inside the data window. Ties prefer the check-out. null when impossible.
function suggestDates(search, group) {
  const need = RULES.MIN_SHARED_NIGHTS;
  const inDay = toDay(search.checkIn);
  const outDay = toDay(search.checkOut);

  let later = null;
  for (let d = outDay + 1; d <= toDay(DATA_WINDOW.to); d += 1) {
    const stay = { checkIn: search.checkIn, checkOut: fromDay(d) };
    if (sharedNights(stay, group) >= need) {
      later = {
        field: 'checkOut',
        date: stay.checkOut,
        shift: d - outDay,
        shared: sharedNights(stay, group),
      };
      break;
    }
  }
  let earlier = null;
  for (let d = inDay - 1; d >= toDay(DATA_WINDOW.from); d -= 1) {
    const stay = { checkIn: fromDay(d), checkOut: search.checkOut };
    if (sharedNights(stay, group) >= need) {
      earlier = { field: 'checkIn', date: stay.checkIn, shift: inDay - d, shared: sharedNights(stay, group) };
      break;
    }
  }
  if (later && earlier) return earlier.shift < later.shift ? earlier : later;
  return later || earlier;
}

// The budget closest to the seeker's that passes the rule against this group's budget
function suggestBudget(searchBudget, groupBudget) {
  const pct = RULES.BUDGET_TOLERANCE_PCT;
  if (searchBudget > groupBudget) {
    return { budget: groupBudget + Math.floor((pct * groupBudget) / 100), direction: 'or less' };
  }
  // seeker is the lower budget: (g − s) × 100 ≤ pct × s  ⇔  s ≥ 100g / (100 + pct)
  return { budget: Math.ceil((100 * groupBudget) / (100 + pct)), direction: 'or more' };
}

const label = (labels, id) => labels[id] || id;

const hintBuilders = {
  SAME_CITY: (search, { group }) => ({
    type: 'OTHER_CITY',
    groupId: group.groupId,
    message: `${group.name} in ${group.city} matches everything except the city.`,
  }),

  DATES_OVERLAP: (search, { group, evaluation }) => {
    const suggestion = suggestDates(search, group);
    if (!suggestion) return null;
    const n = evaluation.facts.sharedNights;
    const now = n === 0 ? 'shares no nights' : `shares only ${plural(n, 'night')}`;
    const change = suggestion.field === 'checkOut' ? 'a check-out' : 'a check-in';
    return {
      type: 'WIDEN_DATES',
      groupId: group.groupId,
      message: `${group.name} ${now}; ${change} of ${formatDay(suggestion.date)} would share ${suggestion.shared}.`,
    };
  },

  BUDGET: (search, { group }) => {
    const { budget, direction } = suggestBudget(search.budgetInr, group.budgetInr);
    if (budget < BUDGET_RANGE.MIN || budget > BUDGET_RANGE.MAX) return null;
    return {
      type: 'ADJUST_BUDGET',
      groupId: group.groupId,
      message: `${group.name}'s budget is ${inr(group.budgetInr)}; a budget of ${inr(budget)} ${direction} would match.`,
    };
  },

  SHARED_INTERESTS: (search, { group, owner, evaluation }, labels) => {
    const shared = evaluation.facts.shared;
    const have = new Set(search.interests);
    const missing = [...new Set(owner.interests)].filter((i) => !have.has(i));
    const need = RULES.MIN_SHARED_INTERESTS - shared.length;
    if (missing.length < need) return null;
    const now = shared.length === 0 ? 'no interests' : `only ${andList(shared.map((i) => label(labels, i)))}`;
    const howMany = need === 1 ? 'one' : String(need);
    return {
      type: 'ADD_INTERESTS',
      groupId: group.groupId,
      message: `${group.name} shares ${now}; adding ${howMany} of ${orList(missing.map((i) => label(labels, i)))} would match.`,
    };
  },
};

// candidates: [{ group, owner, evaluation }]; options.interestLabels: { TEMPLES: 'Temples and shrines', … }
function buildEmptyStateHints(search, candidates, { interestLabels = {} } = {}) {
  const hints = [];
  if (nightCount(search) < RULES.MIN_SHARED_NIGHTS) {
    hints.push({
      type: 'WIDEN_DATES',
      message: `Stay at least ${plural(RULES.MIN_SHARED_NIGHTS, 'night')} to match a group.`,
    });
  }

  const nearMisses = candidates
    .filter((c) => c.evaluation.failed.length === 1 && hintBuilders[c.evaluation.failed[0]])
    .map((c) => ({ ...c, ...scoreMatch(c.evaluation, search, c.group) }))
    .sort(compareMatches);

  for (const candidate of nearMisses) {
    if (hints.length >= HINTS.MAX) break;
    const hint = hintBuilders[candidate.evaluation.failed[0]](search, candidate, interestLabels);
    if (hint) hints.push(hint);
  }
  return hints;
}

module.exports = { buildEmptyStateHints, suggestDates, suggestBudget };
