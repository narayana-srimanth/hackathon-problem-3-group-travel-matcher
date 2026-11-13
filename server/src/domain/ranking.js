// Scores eligible groups 0–100 and orders them deterministically.
//
// | component | formula                                   | weight |
// | interests | |shared| / |search ∪ owner|  (Jaccard)   | 0.35   |
// | dates     | sharedNights / max(seekerNights, groupNights) | 0.30 |
// | budget    | 1 − diff / (40% × lower budget)           | 0.25   |
// | space     | freeAfterJoin / (maxSize − 1)             | 0.10   |
//
// score = round(100 × Σ weight × component). Each component is clamped to [0, 1], so a
// non-eligible group (used to order empty-state hints) never gets a negative part.

const { RANK_WEIGHTS, RULES } = require('./constants');
const { nightCount } = require('./dates');

const clamp01 = (x) => Math.min(1, Math.max(0, x));

function scoreComponents(evaluation, search, group) {
  const f = evaluation.facts;
  const longestStay = Math.max(nightCount(search), nightCount(group));
  const tolerance = RULES.BUDGET_TOLERANCE_PCT * f.lowerBudgetInr; // × 100 scale, like the rule
  const otherPlaces = group.maxSize - 1;

  return {
    interests: clamp01(f.unionInterestCount > 0 ? f.shared.length / f.unionInterestCount : 0),
    dates: clamp01(longestStay > 0 ? f.sharedNights / longestStay : 0),
    budget: clamp01(tolerance > 0 ? 1 - (f.diffInr * 100) / tolerance : Number(f.diffInr === 0)),
    space: clamp01(otherPlaces > 0 ? f.freeAfterJoin / otherPlaces : 0),
  };
}

function scoreMatch(evaluation, search, group) {
  const components = scoreComponents(evaluation, search, group);
  const total = Object.entries(RANK_WEIGHTS).reduce((sum, [key, w]) => sum + w * components[key], 0);
  return { score: Math.round(100 * total), components };
}

// 'G-9' < 'G-10' < 'G-1001': compare the numeric part, then the text
function compareIds(a, b) {
  const na = Number(a.replace(/^\D+/, ''));
  const nb = Number(b.replace(/^\D+/, ''));
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
}

// score ↓, shared-interest count ↓, shared nights ↓, checkIn ↑, groupId ↑
function compareMatches(a, b) {
  return (
    b.score - a.score ||
    b.evaluation.facts.shared.length - a.evaluation.facts.shared.length ||
    b.evaluation.facts.sharedNights - a.evaluation.facts.sharedNights ||
    (a.group.checkIn < b.group.checkIn ? -1 : a.group.checkIn > b.group.checkIn ? 1 : 0) ||
    compareIds(a.group.groupId, b.group.groupId)
  );
}

// evaluated: [{ group, owner, evaluation }] → the eligible ones, scored and sorted
function rankMatches(search, evaluated) {
  return evaluated
    .filter((e) => e.evaluation.eligible)
    .map((e) => ({ ...e, ...scoreMatch(e.evaluation, search, e.group) }))
    .sort(compareMatches);
}

module.exports = { scoreComponents, scoreMatch, compareIds, compareMatches, rankMatches };
