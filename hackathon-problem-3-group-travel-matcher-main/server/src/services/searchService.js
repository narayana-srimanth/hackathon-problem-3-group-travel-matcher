// Seeker searches (M3) and their matches (M4). A search is stored as a snapshot: the rules use
// the SEARCH's dates, budget, interests and preference, and the gender from the profile.
const { Search } = require('../models');
const { nextId } = require('../db/counters');
const { badRequest, forbidden, notFound } = require('../errors');
const { toSearch, toEvaluation } = require('../dto/search');
const { checkHomeCity, checkInterests, assertInDataRange } = require('./metaService');
const { findMatches, evaluateGroup } = require('./matchService');
const { findGroupOr404 } = require('./groupService');

const firstIssue = (details) => `${details[0].field}: ${details[0].issue}`;

// 404 unknown search, 403 someone else's
async function findOwnSearch(searchId, actorId) {
  const search = await Search.findOne({ searchId }, { _id: 0 }).lean();
  if (!search) throw notFound(`Unknown search '${searchId}'.`);
  if (search.travellerId !== actorId) throw forbidden('This search belongs to another traveller.');
  return search;
}

// E11 — body is shape-valid; catalog checks (400) come before the data-range check (422)
async function createSearch(body, actor) {
  const [home, interestProblems] = await Promise.all([
    checkHomeCity(body.homeCity),
    checkInterests(body.interests),
  ]);
  const details = [...(home.detail ? [home.detail] : []), ...interestProblems];
  if (details.length > 0) throw badRequest(firstIssue(details), details);
  await assertInDataRange(body);

  const created = await Search.create({
    searchId: await nextId('search'),
    travellerId: actor.travellerId,
    homeCity: body.homeCity,
    city: body.city,
    checkIn: body.checkIn,
    checkOut: body.checkOut,
    interests: body.interests,
    budgetInr: body.budgetInr,
    gender: actor.gender, // never from the body
    genderPreference: body.genderPreference,
  });
  const search = created.toObject();
  const result = await findMatches(search, actor.travellerId, { page: 1, limit: body.limit });
  return { search: toSearch(search), ...result };
}

// E12
async function getSearch(searchId, actorId) {
  return { search: toSearch(await findOwnSearch(searchId, actorId)) };
}

// E13 — re-evaluated on current data every time
async function getMatches(searchId, actorId, query) {
  if (query.sharedInterest.length > 0) {
    const problems = await checkInterests(query.sharedInterest, 'sharedInterest');
    if (problems.length > 0) throw badRequest(firstIssue(problems), problems);
  }
  const search = await findOwnSearch(searchId, actorId);
  return findMatches(search, actorId, query);
}

// E14 — the ✅/❌ checklist for any group, including ones that don't match
async function getEvaluation(searchId, groupId, actorId) {
  const search = await findOwnSearch(searchId, actorId);
  const group = await findGroupOr404(groupId);
  const { evaluation } = await evaluateGroup(search, group);
  return toEvaluation(evaluation);
}

module.exports = { findOwnSearch, createSearch, getSearch, getMatches, getEvaluation };
