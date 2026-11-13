// Human-readable text for rule checks and hints. Kept apart from the rules so wording can
// change without touching matching logic.

const { RULES } = require('./constants');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const INR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

const inr = (n) => `₹${INR.format(n)}`;
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function formatDay(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

// '10–15 Apr', or '30 Mar–2 Apr' across months
function formatRange(from, to) {
  const [, m1, d1] = from.split('-').map(Number);
  const [, m2, d2] = to.split('-').map(Number);
  return m1 === m2 ? `${d1}–${d2} ${MONTHS[m1 - 1]}` : `${formatDay(from)}–${formatDay(to)}`;
}

// 'A', 'A or B', 'A, B or C' (and the same with 'and')
function joinList(items, word) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${word} ${items[items.length - 1]}`;
}
const orList = (items) => joinList(items, 'or');
const andList = (items) => joinList(items, 'and');

// 'Female only' / 'Anyone'
function preferenceLabel(preference, gender) {
  return preference === 'SAME_GENDER' ? `${capitalise(gender.toLowerCase())} only` : 'Anyone';
}

// Seeker's preference ↔ owner's preference, e.g. 'Female only ↔ female only'
function genderLabel(seeker, owner) {
  const left = preferenceLabel(seeker.genderPreference, seeker.gender);
  const right = preferenceLabel(owner.genderPreference, owner.gender).toLowerCase();
  return `${left} ↔ ${right}`;
}

const ruleMessages = {
  SAME_CITY: ({ passed, searchCity, groupCity }) =>
    passed ? `Both going to ${groupCity}` : `This group is going to ${groupCity}, not ${searchCity}`,

  DATES_OVERLAP: ({ passed, sharedNights, sharedFrom, sharedTo }) => {
    const range = sharedNights > 0 ? ` (${formatRange(sharedFrom, sharedTo)})` : '';
    if (passed) return `${plural(sharedNights, 'shared night')}${range}`;
    const what =
      sharedNights === 0 ? 'No shared nights' : `Only ${plural(sharedNights, 'shared night')}${range}`;
    return `${what}; at least ${RULES.MIN_SHARED_NIGHTS} needed`;
  },

  BUDGET: ({ passed, diffInr, limitInr }) =>
    passed
      ? `Budgets differ by ${inr(diffInr)}, within the ${inr(limitInr)} limit`
      : `Budgets differ by ${inr(diffInr)}; the limit is ${inr(limitInr)}`,

  SHARED_INTERESTS: ({ passed, shared }) => {
    if (passed) return `${plural(shared.length, 'shared interest')}`;
    const what =
      shared.length === 0 ? 'No shared interests' : `Only ${plural(shared.length, 'shared interest')}`;
    return `${what}; at least ${RULES.MIN_SHARED_INTERESTS} needed`;
  },

  GENDER: ({ passed, seeker, owner, seekerAllows, ownerAllows }) => {
    if (passed) return genderLabel(seeker, owner);
    const reasons = [];
    if (!seekerAllows) {
      reasons.push(
        `The group owner is ${owner.gender.toLowerCase()} and your preference is ${seeker.gender.toLowerCase()} only`,
      );
    }
    if (!ownerAllows) reasons.push(`The group owner prefers ${owner.gender.toLowerCase()} travellers only`);
    return reasons.join('; ');
  },

  GROUP_SIZE: ({ passed, freeAfterJoin, memberCount, maxSize }) => {
    if (!passed) return `The group is full (${memberCount} of ${maxSize})`;
    if (freeAfterJoin === 0) return 'You would take the last place';
    return `${plural(freeAfterJoin, 'place')} left after you join`;
  },
};

module.exports = {
  inr,
  plural,
  formatDay,
  formatRange,
  orList,
  andList,
  preferenceLabel,
  genderLabel,
  ruleMessages,
};
