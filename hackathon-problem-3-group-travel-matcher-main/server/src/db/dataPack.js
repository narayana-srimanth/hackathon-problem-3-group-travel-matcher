// Reads the data pack (read-only JSON files), maps snake_case → camelCase, and checks the
// references between the files. A broken pack (or a wrong DATA_DIR) stops the boot with the reason.

const fs = require('fs');
const path = require('path');
const { DATA_WINDOW, GROUP_SIZE } = require('../domain/constants');
const { isValidIsoDate } = require('../domain/dates');
const { GENDERS, GENDER_PREFERENCES, ROOM_TYPES } = require('../models/options');

const FILES = Object.freeze({
  destinations: 'catalog/destinations.json',
  hotels: 'catalog/hotels.json',
  rooms: 'catalog/rooms.json',
  availability: 'catalog/availability.json',
  interests: 'problem-3/interests.json',
  travellers: 'problem-3/travellers.json',
  groups: 'problem-3/groups.json',
});

const MAX_LISTED_PROBLEMS = 20;

class DataPackError extends Error {
  constructor(dataDir, problems) {
    const listed = problems.slice(0, MAX_LISTED_PROBLEMS).map((p) => `  - ${p}`);
    if (problems.length > MAX_LISTED_PROBLEMS)
      listed.push(`  … and ${problems.length - MAX_LISTED_PROBLEMS} more`);
    super(`The data pack in ${dataDir} is invalid:\n${listed.join('\n')}\nCheck DATA_DIR.`);
    this.name = 'DataPackError';
    this.problems = problems;
  }
}

function readJson(dataDir, relativePath) {
  const file = path.join(dataDir, relativePath);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw new DataPackError(dataDir, [`cannot read ${relativePath} (${err.code})`]);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new DataPackError(dataDir, [`${relativePath} is not valid JSON: ${err.message}`]);
  }
}

// 'images/hotels/HOTEL-BUSINESS-1.jpg' → '/static/hotels/HOTEL-BUSINESS-1.jpg' (served by app.js)
const hotelImagePath = (image) => (image ? `/static/hotels/${path.posix.basename(image)}` : null);

const derivedGroupStatus = (memberIds, maxSize) => (memberIds.length >= maxSize ? 'FULL' : 'OPEN');

function mapPack(raw) {
  const cities = raw.destinations.countries.flatMap((country) =>
    country.cities.map((city) => ({
      name: city.name,
      country: country.name,
      countryCode: country.code,
      timezone: country.timezone,
    })),
  );

  return {
    cities: cities.map((c, i) => ({ ...c, sortOrder: i })),
    departureCities: raw.destinations.departure_cities.map((d, i) => ({
      city: d.city,
      airport: d.airport,
      sortOrder: i,
    })),
    interests: raw.interests.map((i, n) => ({
      interest: i.interest,
      label: i.label,
      category: i.category,
      sortOrder: n,
    })),
    hotels: raw.hotels.map((h) => ({
      hotelId: h.hotel_id,
      name: h.name,
      aliases: h.aliases || [],
      city: h.city,
      area: h.area || '',
      lat: h.lat ?? null,
      lng: h.lng ?? null,
      rating: h.rating,
      stars: h.stars,
      checkInFrom: h.check_in_from ?? null,
      checkOutUntil: h.check_out_until ?? null,
      familyFriendly: Boolean(h.family_friendly),
      image: hotelImagePath(h.image),
    })),
    rooms: raw.rooms.map((r) => ({
      roomId: r.room_id,
      hotelId: r.hotel_id,
      roomType: r.room_type,
      name: r.name,
      maxAdults: r.max_adults,
      maxChildren: r.max_children ?? 0,
      pricePerNightInr: r.price_per_night && r.price_per_night.amount,
      refundable: Boolean(r.refundable),
      currency: r.price_per_night && r.price_per_night.currency, // checked, then dropped
    })),
    availability: raw.availability.map((a) => ({
      roomId: a.room_id,
      date: a.date,
      roomsLeft: a.rooms_left,
      initialRoomsLeft: a.rooms_left,
    })),
    travellers: raw.travellers.map((t) => ({
      travellerId: t.traveller_id,
      name: t.name,
      age: t.age ?? null,
      gender: t.gender,
      homeCity: t.home_city,
      homeAirport: t.home_airport,
      interests: [...new Set(t.interests)],
      genderPreference: t.gender_preference,
    })),
    groups: raw.groups.map((g) => ({
      groupId: g.group_id,
      name: g.name,
      ownerId: g.owner_id,
      memberIds: g.member_ids,
      city: g.city,
      checkIn: g.check_in,
      checkOut: g.check_out,
      maxSize: g.max_size,
      budgetInr: g.budget_inr,
      itinerary: g.itinerary ?? '',
      status: derivedGroupStatus(g.member_ids, g.max_size),
    })),
  };
}

function findDuplicates(items, keyOf) {
  const seen = new Set();
  const dupes = new Set();
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) dupes.add(key);
    seen.add(key);
  }
  return [...dupes];
}

const isPositiveInt = (n) => Number.isInteger(n) && n > 0;

// Returns a list of problems (empty when the pack is consistent)
function validateDataPack(pack) {
  const problems = [];
  const add = (msg) => problems.push(msg);

  const keyed = [
    ['cities', (c) => c.name],
    ['departureCities', (d) => d.city],
    ['interests', (i) => i.interest],
    ['hotels', (h) => h.hotelId],
    ['rooms', (r) => r.roomId],
    ['availability', (a) => `${a.roomId}|${a.date}`],
    ['travellers', (t) => t.travellerId],
    ['groups', (g) => g.groupId],
  ];
  for (const [name, keyOf] of keyed) {
    for (const key of findDuplicates(pack[name], keyOf)) add(`${name}: duplicate key ${key}`);
  }

  const cityNames = new Set(pack.cities.map((c) => c.name));
  const departureCities = new Set(pack.departureCities.map((d) => d.city));
  const interestIds = new Set(pack.interests.map((i) => i.interest));
  const hotelIds = new Set(pack.hotels.map((h) => h.hotelId));
  const roomIds = new Set(pack.rooms.map((r) => r.roomId));
  const travellerIds = new Set(pack.travellers.map((t) => t.travellerId));

  for (const h of pack.hotels) {
    if (!cityNames.has(h.city)) add(`hotel ${h.hotelId}: unknown city '${h.city}'`);
  }

  for (const r of pack.rooms) {
    if (!hotelIds.has(r.hotelId)) add(`room ${r.roomId}: unknown hotel ${r.hotelId}`);
    if (!ROOM_TYPES.includes(r.roomType)) add(`room ${r.roomId}: unknown room type '${r.roomType}'`);
    if (!isPositiveInt(r.maxAdults)) add(`room ${r.roomId}: max_adults must be a positive integer`);
    if (!isPositiveInt(r.pricePerNightInr)) add(`room ${r.roomId}: price must be a positive integer`);
    if (r.currency !== 'INR') add(`room ${r.roomId}: currency must be INR, got '${r.currency}'`);
  }

  for (const a of pack.availability) {
    if (!roomIds.has(a.roomId)) add(`availability ${a.roomId} ${a.date}: unknown room`);
    if (!isValidIsoDate(a.date) || a.date < DATA_WINDOW.from || a.date > DATA_WINDOW.to) {
      add(`availability ${a.roomId}: date '${a.date}' outside ${DATA_WINDOW.from}…${DATA_WINDOW.to}`);
    }
    if (!Number.isInteger(a.roomsLeft) || a.roomsLeft < 0) {
      add(`availability ${a.roomId} ${a.date}: rooms_left must be an integer ≥ 0`);
    }
  }

  for (const t of pack.travellers) {
    if (!GENDERS.includes(t.gender)) add(`traveller ${t.travellerId}: unknown gender '${t.gender}'`);
    if (!GENDER_PREFERENCES.includes(t.genderPreference)) {
      add(`traveller ${t.travellerId}: unknown gender preference '${t.genderPreference}'`);
    }
    if (!departureCities.has(t.homeCity))
      add(`traveller ${t.travellerId}: unknown home city '${t.homeCity}'`);
    for (const i of t.interests) {
      if (!interestIds.has(i)) add(`traveller ${t.travellerId}: unknown interest '${i}'`);
    }
  }

  for (const g of pack.groups) {
    const id = `group ${g.groupId}`;
    if (!travellerIds.has(g.ownerId)) add(`${id}: unknown owner ${g.ownerId}`);
    for (const m of g.memberIds) if (!travellerIds.has(m)) add(`${id}: unknown member ${m}`);
    if (!g.memberIds.includes(g.ownerId)) add(`${id}: owner ${g.ownerId} is not in member_ids`);
    if (new Set(g.memberIds).size !== g.memberIds.length) add(`${id}: duplicate member_ids`);
    if (!Number.isInteger(g.maxSize) || g.maxSize < GROUP_SIZE.MIN || g.maxSize > GROUP_SIZE.MAX) {
      add(`${id}: max_size must be ${GROUP_SIZE.MIN}–${GROUP_SIZE.MAX}`);
    }
    if (g.memberIds.length > g.maxSize)
      add(`${id}: ${g.memberIds.length} members exceed max_size ${g.maxSize}`);
    if (!cityNames.has(g.city)) add(`${id}: unknown city '${g.city}'`);
    if (!isValidIsoDate(g.checkIn) || !isValidIsoDate(g.checkOut)) {
      add(`${id}: invalid dates ${g.checkIn} → ${g.checkOut}`);
    } else {
      if (g.checkIn >= g.checkOut) add(`${id}: check_out must be after check_in`);
      if (g.checkIn < DATA_WINDOW.from || g.checkOut > DATA_WINDOW.to)
        add(`${id}: dates outside the data window`);
    }
    if (!isPositiveInt(g.budgetInr)) add(`${id}: budget_inr must be a positive integer`);
  }

  return problems;
}

// Read + map. Throws DataPackError if a file is missing, isn't JSON, or has the wrong shape.
function readDataPack(dataDir) {
  const raw = Object.fromEntries(Object.entries(FILES).map(([key, rel]) => [key, readJson(dataDir, rel)]));
  try {
    return mapPack(raw);
  } catch (err) {
    throw new DataPackError(dataDir, [`unexpected file structure: ${err.message}`]);
  }
}

// Read + map + validate; what the boot and the seed/reset scripts use
function loadDataPack(dataDir) {
  const pack = readDataPack(dataDir);
  const problems = validateDataPack(pack);
  if (problems.length > 0) throw new DataPackError(dataDir, problems);
  // currency was only needed for the check (every price is INR)
  return { ...pack, rooms: pack.rooms.map(({ currency: _currency, ...room }) => room) };
}

module.exports = { FILES, DataPackError, readDataPack, validateDataPack, loadDataPack, hotelImagePath };
