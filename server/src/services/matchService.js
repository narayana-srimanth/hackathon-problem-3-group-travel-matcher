// Live matching (M4): a stored search against the current groups. Never cached, so a group that
// fills up drops out on the next read. The rules themselves are the pure domain/matching.js.
const { Group, Traveller, Interest } = require('../models');
const { evaluateMatch, genderComposition } = require('../domain/matching');
const { rankMatches, scoreMatch } = require('../domain/ranking');
const { buildEmptyStateHints } = require('../domain/hints');
const { slicePage } = require('../utils/pagination');
const { toMatchCard } = require('../dto/search');
const { staysOverlap } = require('../domain/dates');
const { latestRequestsByGroup } = require('./requestLookup');
const { membershipsOf } = require('./membership');

const unique = (list) => [...new Set(list)];
const PEOPLE_FIELDS = { _id: 0, travellerId: 1, name: 1, gender: 1, genderPreference: 1, interests: 1 };

// Groups matching `filter`, minus the pre-filtered ones (not rules): groups the seeker owns or is
// in, and groups whose stay overlaps a trip the seeker has already joined (one group per night).
// Each comes with its owner profile and member profiles. 3 queries.
async function loadCandidates(filter, seekerId) {
  const [all, myTrips] = await Promise.all([Group.find(filter, { _id: 0 }).lean(), membershipsOf(seekerId)]);
  const groups = all.filter(
    (g) =>
      g.ownerId !== seekerId &&
      !g.memberIds.includes(seekerId) &&
      !myTrips.some((trip) => staysOverlap(trip, g)),
  );
  const people = unique(groups.flatMap((g) => [g.ownerId, ...g.memberIds]));
  const travellers = await Traveller.find({ travellerId: { $in: people } }, PEOPLE_FIELDS).lean();
  const byId = new Map(travellers.map((t) => [t.travellerId, t]));
  return groups
    .filter((g) => byId.has(g.ownerId))
    .map((g) => ({
      group: g,
      owner: byId.get(g.ownerId),
      members: g.memberIds.map((id) => byId.get(id)).filter(Boolean),
    }));
}

const evaluateAll = (search, candidates) =>
  candidates.map((c) => ({ ...c, evaluation: evaluateMatch(search, c.group, c.owner) }));

// G1 filters (applied after the 6 rules, so they can only narrow): the group shares EVERY
// selected interest (plan D1), and its current members have the chosen gender composition.
function applyFilters(matches, { sharedInterest = [], genderComposition: composition }) {
  return matches.filter(
    (m) =>
      sharedInterest.every((i) => m.evaluation.facts.shared.includes(i)) &&
      (!composition || genderComposition(m.members.map((p) => p.gender)) === composition),
  );
}

// Near misses for an empty result (plan D2): same-city groups we already evaluated, plus OPEN
// groups in the other cities (for OTHER_CITY).
async function emptyStateHints(search, seekerId, sameCity) {
  const [otherCities, interests] = await Promise.all([
    loadCandidates({ status: 'OPEN', city: { $ne: search.city } }, seekerId),
    Interest.find({}, { _id: 0, interest: 1, label: 1 }).lean(),
  ]);
  const interestLabels = Object.fromEntries(interests.map((i) => [i.interest, i.label]));
  return buildEmptyStateHints(search, [...sameCity, ...evaluateAll(search, otherCities)], { interestLabels });
}

// E11 / E13 → { matches: Page<MatchCard>, emptyStateHints }
async function findMatches(
  search,
  seekerId,
  { page, limit, sharedInterest, genderComposition: composition },
) {
  const evaluated = evaluateAll(
    search,
    await loadCandidates({ city: search.city, status: 'OPEN' }, seekerId),
  );
  const ranked = rankMatches(search, evaluated);
  const pageOfMatches = slicePage(
    applyFilters(ranked, { sharedInterest, genderComposition: composition }),
    page,
    limit,
  );

  const [requests, hints] = await Promise.all([
    latestRequestsByGroup(
      seekerId,
      pageOfMatches.items.map((m) => m.group.groupId),
    ),
    // Hints only when nothing matches at all; an empty page caused by the G1 filters gets none
    ranked.length === 0 ? emptyStateHints(search, seekerId, evaluated) : [],
  ]);

  const items = pageOfMatches.items.map((m) => {
    const latest = requests.get(m.group.groupId);
    return toMatchCard(m, search, latest ? latest.status : null);
  });
  return { matches: { ...pageOfMatches, items }, emptyStateHints: hints };
}

// One group against one search: the E14 checklist and the E15 re-check + snapshot.
// Any group, including other cities and non-OPEN ones.
async function evaluateGroup(search, group) {
  const owner = await Traveller.findOne({ travellerId: group.ownerId }, PEOPLE_FIELDS).lean();
  const evaluation = evaluateMatch(search, group, owner);
  return { evaluation, ...scoreMatch(evaluation, search, group) };
}

module.exports = { loadCandidates, findMatches, evaluateGroup };
