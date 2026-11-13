// The live-change surface: every business threshold lives here.

const RULES = Object.freeze({
  MIN_SHARED_NIGHTS: 2, // DATES_OVERLAP: at least this many shared nights
  BUDGET_TOLERANCE_PCT: 40, // BUDGET: |a − b| ≤ 40% of the lower budget (inclusive)
  MIN_SHARED_INTERESTS: 2, // SHARED_INTERESTS: compared with the group OWNER's interests
});

// The fixed order of Evaluation.checks (API spec §4 invariant)
const RULE_ORDER = Object.freeze([
  'SAME_CITY',
  'DATES_OVERLAP',
  'BUDGET',
  'SHARED_INTERESTS',
  'GENDER',
  'GROUP_SIZE',
]);

// Stays are [checkIn, checkOut): DATA_WINDOW.from ≤ checkIn < checkOut ≤ DATA_WINDOW.to
const DATA_WINDOW = Object.freeze({ from: '2027-04-01', to: '2027-04-20' });

const GROUP_SIZE = Object.freeze({ MIN: 1, MAX: 4 }); // total people, owner included
const BUDGET_RANGE = Object.freeze({ MIN: 1000, MAX: 10000000 }); // INR per person

// Ranking weights (sum to 1); see ranking.js
const RANK_WEIGHTS = Object.freeze({ interests: 0.35, dates: 0.3, budget: 0.25, space: 0.1 });

const PAGE = Object.freeze({ DEFAULT_PAGE: 1, DEFAULT_LIMIT: 20, MAX_LIMIT: 50 });

const HINTS = Object.freeze({ MAX: 3 });

// Co-traveller reviews: whole stars, an optional short comment
const REVIEW = Object.freeze({ RATING_MIN: 1, RATING_MAX: 5, COMMENT_MAX: 500 });

// Group chat: message length and how many messages one request returns
const CHAT = Object.freeze({ BODY_MAX: 2000, DEFAULT_LIMIT: 50, MAX_LIMIT: 100 });

module.exports = {
  RULES,
  RULE_ORDER,
  DATA_WINDOW,
  GROUP_SIZE,
  BUDGET_RANGE,
  RANK_WEIGHTS,
  PAGE,
  HINTS,
  REVIEW,
  CHAT,
};
