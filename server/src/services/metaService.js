// Meta data for every dropdown (E02, E03) and the catalog checks other services reuse
// (sign-up and search both validate home city and interests against the catalog).
const { Interest, City, DepartureCity } = require('../models');
const { DATA_WINDOW } = require('../domain/constants');
const { andList, formatLongDate, formatWindow } = require('../domain/messages');
const { unprocessable, ERROR_CODES } = require('../errors');

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

// The 5 destination cities by name → { name, country, countryCode, timezone }
async function cityMap(names) {
  const filter = names ? { name: { $in: names } } : {};
  const cities = await City.find(filter, { _id: 0, sortOrder: 0 }).sort({ sortOrder: 1 }).lean();
  return new Map(cities.map((c) => [c.name, c]));
}

// 422 OUT_OF_DATA_RANGE unless the city is one of the 5 and the stay is inside the data window.
// Expects shape-valid input (real dates, checkOut after checkIn).
async function assertInDataRange({ city, checkIn, checkOut }) {
  const cities = await cityMap();
  const details = [];
  if (!cities.has(city)) details.push({ field: 'city', issue: `'${city}' is not available` });
  if (checkIn < DATA_WINDOW.from) {
    details.push({ field: 'checkIn', issue: `must be on or after ${formatLongDate(DATA_WINDOW.from)}` });
  }
  if (checkOut > DATA_WINDOW.to) {
    details.push({ field: 'checkOut', issue: `must be on or before ${formatLongDate(DATA_WINDOW.to)}` });
  }
  if (details.length === 0) return cities.get(city);

  const names = andList([...cities.keys()]);
  throw unprocessable(
    ERROR_CODES.OUT_OF_DATA_RANGE,
    `We only have data for ${names} between ${formatWindow(DATA_WINDOW.from, DATA_WINDOW.to)}.`,
    details,
  );
}

module.exports = {
  listInterests,
  getDestinations,
  checkHomeCity,
  checkInterests,
  cityMap,
  assertInDataRange,
};
