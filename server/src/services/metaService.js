// Meta data for every dropdown (E02, E03) and the catalog checks other services reuse
// (sign-up and search both validate home city and interests against the catalog).
const { Interest, City, DepartureCity } = require('../models');
const { DATA_WINDOW } = require('../domain/constants');

// E02 — 16 interests in file order
async function listInterests() {
  const items = await Interest.find({}, { _id: 0, interest: 1, label: 1, category: 1 })
    .sort({ sortOrder: 1 })
    .lean();
  return { items };
}

// E03 — cities in catalog order (Japan first), departure cities, the data window
async function getDestinations() {
  const [cities, departureCities] = await Promise.all([
    City.find({}, { _id: 0, name: 1, country: 1, countryCode: 1, timezone: 1 }).sort({ sortOrder: 1 }).lean(),
    DepartureCity.find({}, { _id: 0, city: 1, airport: 1 }).sort({ sortOrder: 1 }).lean(),
  ]);
  return { cities, departureCities, dataWindow: { from: DATA_WINDOW.from, to: DATA_WINDOW.to } };
}

// → { airport } or { detail } for a 400 VALIDATION_ERROR
async function checkHomeCity(homeCity, field = 'homeCity') {
  const found = await DepartureCity.findOne({ city: homeCity }, { _id: 0, airport: 1 }).lean();
  if (found) return { airport: found.airport };
  const all = await DepartureCity.find({}, { _id: 0, city: 1 }).sort({ sortOrder: 1 }).lean();
  return {
    detail: { field, issue: `'${homeCity}' is not one of ${all.map((d) => d.city).join(', ')}` },
  };
}

// → details[] (empty when every id is a known interest)
async function checkInterests(ids, field = 'interests') {
  const known = await Interest.find({ interest: { $in: ids } }, { _id: 0, interest: 1 }).lean();
  const knownIds = new Set(known.map((i) => i.interest));
  return ids
    .map((id, index) => ({ id, index }))
    .filter(({ id }) => !knownIds.has(id))
    .map(({ id, index }) => ({ field: `${field}.${index}`, issue: `'${id}' is not a known interest` }));
}

module.exports = { listInterests, getDestinations, checkHomeCity, checkInterests };
