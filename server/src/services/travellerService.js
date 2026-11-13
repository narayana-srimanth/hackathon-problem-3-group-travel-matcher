// Travellers: no-password identity (M1), the "Continue as…" list, profiles (G2).
const { Traveller, Group } = require('../models');
const { ID_COLLATION } = require('../models/options');
const { nextId } = require('../db/counters');
const { badRequest, notFound } = require('../errors');
const { paginate, toPage } = require('../utils/pagination');
const { escapeRegex } = require('../utils/text');
const { toTraveller, toTravellerSummary } = require('../dto/traveller');
const { checkHomeCity, checkInterests } = require('./metaService');

// E04 — body is already shape-validated (and interests de-duplicated) by the zod schema
async function signUp(body) {
  const [home, interestProblems] = await Promise.all([
    checkHomeCity(body.homeCity),
    checkInterests(body.interests),
  ]);
  const details = [...(home.detail ? [home.detail] : []), ...interestProblems];
  if (details.length > 0) {
    const first = details[0];
    throw badRequest(`${first.field}: ${first.issue}`, details);
  }

  const traveller = await Traveller.create({
    travellerId: await nextId('traveller'),
    name: body.name,
    age: body.age ?? null,
    gender: body.gender,
    homeCity: body.homeCity,
    homeAirport: home.airport, // derived, never sent by the client
    interests: body.interests,
    genderPreference: body.genderPreference,
  });
  return { traveller: toTraveller(traveller.toObject()) };
}

// E05 — case-insensitive name substring, sorted by travellerId (numerically)
async function listTravellers({ query, page, limit }) {
  const filter = query ? { name: { $regex: escapeRegex(query), $options: 'i' } } : {};
  const { skip } = paginate({ page, limit });
  const [items, total] = await Promise.all([
    Traveller.find(filter, { _id: 0, travellerId: 1, name: 1, gender: 1, homeCity: 1 })
      .collation(ID_COLLATION)
      .sort({ travellerId: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Traveller.countDocuments(filter),
  ]);
  return toPage(items.map(toTravellerSummary), page, limit, total);
}

// The groups a traveller is in (owner or member; pending requests never count), by check-in
async function groupsOf(travellerId) {
  const groups = await Group.find(
    { memberIds: travellerId },
    { _id: 0, groupId: 1, name: 1, city: 1, checkIn: 1, checkOut: 1, ownerId: 1 },
  )
    .collation(ID_COLLATION)
    .sort({ checkIn: 1, groupId: 1 })
    .lean();
  return groups.map((g) => ({
    groupId: g.groupId,
    name: g.name,
    city: g.city,
    checkIn: g.checkIn,
    checkOut: g.checkOut,
    role: g.ownerId === travellerId ? 'OWNER' : 'MEMBER',
  }));
}

// E06 — any signed-in traveller can view a profile
async function getProfile(travellerId) {
  const traveller = await Traveller.findOne({ travellerId }, { _id: 0 }).lean();
  if (!traveller) throw notFound(`Unknown traveller '${travellerId}'.`);
  return { traveller: toTraveller(traveller), groups: await groupsOf(travellerId) };
}

module.exports = { signUp, listTravellers, groupsOf, getProfile };
