// The 6 matching rules (brief §5). Pure: inputs are plain objects, no I/O.
//
// search: { city, checkIn, checkOut, budgetInr, interests[], gender, genderPreference }
// group:  { groupId, city, checkIn, checkOut, budgetInr, maxSize, memberIds[] }
// owner:  { interests[], gender, genderPreference }   (the group's owner profile)

const { RULES } = require('./constants');
const { sharedNights, sharedRange } = require('./dates');
const { ruleMessages, genderLabel } = require('./messages');

const unique = (list) => [...new Set(list)];

// 'ANY' allows everyone; 'SAME_GENDER' only the same gender
const allows = (preference, selfGender, otherGender) => preference === 'ANY' || selfGender === otherGender;

// The budget rule in integers: diff ≤ PCT% × lower  ⇔  diff × 100 ≤ PCT × lower (exact, no floats)
const budgetWithinTolerance = (diff, lower) => diff * 100 <= RULES.BUDGET_TOLERANCE_PCT * lower;
const budgetLimit = (lower) => Math.floor((RULES.BUDGET_TOLERANCE_PCT * lower) / 100);

// The facts every rule, the ranking, the match reasons and the hints are built from
function matchFacts(search, group, owner) {
  const nights = sharedNights(search, group);
  const range = sharedRange(search, group) || { sharedFrom: null, sharedTo: null };
  const lower = Math.min(search.budgetInr, group.budgetInr);
  const searchInterests = new Set(search.interests);
  const ownerInterests = unique(owner.interests);
  const memberCount = group.memberIds.length;

  return {
    sharedNights: nights,
    ...range,
    diffInr: Math.abs(search.budgetInr - group.budgetInr),
    lowerBudgetInr: lower,
    limitInr: budgetLimit(lower),
    shared: ownerInterests.filter((i) => searchInterests.has(i)), // in the owner's order, de-duplicated
    unionInterestCount: new Set([...searchInterests, ...ownerInterests]).size,
    seekerAllows: allows(search.genderPreference, search.gender, owner.gender),
    ownerAllows: allows(owner.genderPreference, owner.gender, search.gender),
    memberCount,
    freeAfterJoin: group.maxSize - memberCount - 1,
  };
}

// Runs ALL rules (never stops at the first failure) and returns the evidence for each one.
// → { eligible, checks[6] (fixed RULE_ORDER), failed: RuleId[], facts }
function evaluateMatch(search, group, owner) {
  const f = matchFacts(search, group, owner);
  const seeker = { gender: search.gender, genderPreference: search.genderPreference };

  const raw = [
    { rule: 'SAME_CITY', passed: search.city === group.city },
    {
      rule: 'DATES_OVERLAP',
      passed: f.sharedNights >= RULES.MIN_SHARED_NIGHTS,
      sharedNights: f.sharedNights,
    },
    {
      rule: 'BUDGET',
      passed: budgetWithinTolerance(f.diffInr, f.lowerBudgetInr),
      diffInr: f.diffInr,
      limitInr: f.limitInr,
    },
    { rule: 'SHARED_INTERESTS', passed: f.shared.length >= RULES.MIN_SHARED_INTERESTS, shared: f.shared },
    { rule: 'GENDER', passed: f.seekerAllows && f.ownerAllows },
    { rule: 'GROUP_SIZE', passed: f.freeAfterJoin >= 0, freeAfterJoin: f.freeAfterJoin },
  ];

  const context = {
    ...f,
    searchCity: search.city,
    groupCity: group.city,
    maxSize: group.maxSize,
    seeker,
    owner,
  };
  const checks = raw.map((check) => ({
    ...check,
    message: ruleMessages[check.rule]({ ...context, passed: check.passed }),
  }));

  return {
    eligible: checks.every((c) => c.passed),
    checks,
    failed: checks.filter((c) => !c.passed).map((c) => c.rule),
    facts: f,
  };
}

// What a MatchCard shows (API spec §4 MatchReasons)
function matchReasons(evaluation, search, owner) {
  const f = evaluation.facts;
  return {
    sharedNights: f.sharedNights,
    sharedFrom: f.sharedFrom,
    sharedTo: f.sharedTo,
    sharedInterests: f.shared,
    budgetDiffInr: f.diffInr,
    budgetLimitInr: f.limitInr,
    gender: genderLabel(search, owner),
    spotsAfterJoin: f.freeAfterJoin,
  };
}

// 422 NOT_ELIGIBLE details: [{ rule, issue }]
const notEligibleDetails = (evaluation) =>
  evaluation.checks.filter((c) => !c.passed).map((c) => ({ rule: c.rule, issue: c.message }));

// G1 filter: ALL_FEMALE | ALL_MALE | MIXED, from the current members' genders
function genderComposition(genders) {
  if (genders.length > 0 && genders.every((g) => g === 'FEMALE')) return 'ALL_FEMALE';
  if (genders.length > 0 && genders.every((g) => g === 'MALE')) return 'ALL_MALE';
  return 'MIXED';
}

module.exports = {
  allows,
  budgetWithinTolerance,
  budgetLimit,
  matchFacts,
  evaluateMatch,
  matchReasons,
  notEligibleDetails,
  genderComposition,
};
