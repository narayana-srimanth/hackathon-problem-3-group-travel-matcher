// The live-change surface: every matching threshold, ranking weight and limit lives here.

const RULES = {
  MIN_SHARED_NIGHTS: 2, // R2: at least 2 shared nights
  BUDGET_TOLERANCE_PCT: 40, // R3: difference ≤ 40% of the lower budget (inclusive)
  MIN_SHARED_INTERESTS: 2, // R4: compared with the group OWNER's interests
};

// Fixed order of the 6 rules in every Evaluation.checks (API spec §4 invariant)
const RULE_ORDER = ['SAME_CITY', 'DATES_OVERLAP', 'BUDGET', 'SHARED_INTERESTS', 'GENDER', 'GROUP_SIZE'];

const DATA_WINDOW = { from: '2027-04-01', to: '2027-04-20' }; // checkIn ≥ from, checkOut ≤ to

const GROUP_SIZE = { min: 1, max: 4 }; // M2: total people including the owner

const BUDGET = { min: 1000, max: 10000000 }; // INR per person

const RANK_WEIGHTS = { interests: 0.35, dates: 0.3, budget: 0.25, space: 0.1 };

const PAGE = { default: 20, max: 50 };

module.exports = { RULES, RULE_ORDER, DATA_WINDOW, GROUP_SIZE, BUDGET, RANK_WEIGHTS, PAGE };
