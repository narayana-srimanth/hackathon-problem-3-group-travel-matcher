// Search and MatchCard (spec §4)
const { nightCount } = require('../domain/dates');
const { matchReasons } = require('../domain/matching');
const { toIso } = require('../utils/text');

const toSearch = (s) => ({
  searchId: s.searchId,
  travellerId: s.travellerId,
  homeCity: s.homeCity,
  city: s.city,
  checkIn: s.checkIn,
  checkOut: s.checkOut,
  nights: nightCount(s),
  interests: s.interests,
  budgetInr: s.budgetInr,
  gender: s.gender,
  genderPreference: s.genderPreference,
  createdAt: toIso(s.createdAt),
});

// match: { group, owner, evaluation, score } (from ranking.rankMatches)
// ownerRating: { average, count } from co-traveller reviews
function toMatchCard(match, search, viewerRequestStatus, ownerRating) {
  const { group, owner } = match;
  const memberCount = group.memberIds.length;
  return {
    groupId: group.groupId,
    name: group.name,
    city: group.city,
    checkIn: group.checkIn,
    checkOut: group.checkOut,
    memberCount,
    maxSize: group.maxSize,
    freeSpots: group.maxSize - memberCount,
    budgetInr: group.budgetInr,
    owner: { travellerId: owner.travellerId, name: owner.name, rating: ownerRating },
    score: match.score,
    reasons: matchReasons(match.evaluation, search, owner),
    viewerRequestStatus,
  };
}

// The rule-by-rule result without the internal facts
const toEvaluation = ({ eligible, checks, failed }) => ({ eligible, checks, failed });

module.exports = { toSearch, toMatchCard, toEvaluation };
