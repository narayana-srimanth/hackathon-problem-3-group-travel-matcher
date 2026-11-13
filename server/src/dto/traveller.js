// Traveller documents → API shapes (spec §4). Only listed fields leave the server.
const { toIso } = require('../utils/text');

const toTraveller = (t) => ({
  travellerId: t.travellerId,
  name: t.name,
  age: t.age ?? null,
  gender: t.gender,
  homeCity: t.homeCity,
  homeAirport: t.homeAirport,
  interests: t.interests,
  genderPreference: t.genderPreference,
  createdAt: toIso(t.createdAt),
});

const toTravellerSummary = (t) => ({
  travellerId: t.travellerId,
  name: t.name,
  gender: t.gender,
  homeCity: t.homeCity,
});

module.exports = { toTraveller, toTravellerSummary };
