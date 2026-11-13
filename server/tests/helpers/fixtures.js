// The data pack as plain camelCase objects (through the real loader) for the pure domain tests.
const env = require('../../src/config/env');
const { loadDataPack } = require('../../src/db/dataPack');

const pack = loadDataPack(env.DATA_DIR);

const travellersById = new Map(pack.travellers.map((t) => [t.travellerId, t]));
const groupsById = new Map(pack.groups.map((g) => [g.groupId, g]));
const roomsById = new Map(pack.rooms.map((r) => [r.roomId, r]));
const interestLabels = Object.fromEntries(pack.interests.map((i) => [i.interest, i.label]));
const availabilityRows = pack.availability;
const availability = new Map(availabilityRows.map((a) => [`${a.roomId}|${a.date}`, a.roomsLeft]));

// Priya's search from the brief (scenario 2)
const PRIYA_SEARCH = Object.freeze({
  city: 'Kyoto',
  checkIn: '2027-04-09',
  checkOut: '2027-04-16',
  budgetInr: 62000,
  interests: ['TEMPLES', 'STREET_FOOD', 'ADVENTURE'],
  gender: 'FEMALE',
  genderPreference: 'SAME_GENDER',
});

const group = (id) => groupsById.get(id);
const ownerOf = (g) => travellersById.get(g.ownerId);
const candidates = () => pack.groups.map((g) => ({ group: g, owner: ownerOf(g) }));

module.exports = {
  pack,
  travellers: pack.travellers,
  travellersById,
  groups: pack.groups,
  group,
  ownerOf,
  candidates,
  interestLabels,
  rooms: pack.rooms,
  roomsById,
  availabilityRows,
  availability,
  PRIYA_SEARCH,
};
