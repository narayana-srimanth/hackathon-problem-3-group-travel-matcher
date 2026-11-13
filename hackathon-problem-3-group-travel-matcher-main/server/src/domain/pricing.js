// Hotel option pricing for a group (M6). Pure: the service loads rooms and availability.
//
// roomsNeeded = ceil(partySize / room.maxAdults)       (one room type for the whole group)
// available  ⇔ roomsLeft ≥ roomsNeeded on EVERY night of [checkIn, checkOut)
// totalInr    = pricePerNightInr × roomsNeeded × nights  (integer, the authoritative amount)
// perMemberInr = round2(totalInr / partySize)

const { nightsOf } = require('./dates');

// + EPSILON so values like 1.005 round up as people expect
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const round1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;

const availabilityKey = (roomId, date) => `${roomId}|${date}`;

// planFor: 'CURRENT' (current members) or 'MAX' (a full group)
const partySizeFor = (group, planFor = 'CURRENT') =>
  planFor === 'MAX' ? group.maxSize : group.memberIds.length;

const budgetSharePct = (perMemberInr, budgetInr) => round1((perMemberInr / budgetInr) * 100);

// room: { roomId, maxAdults, pricePerNightInr }; stay: { checkIn, checkOut }
// availability: Map 'roomId|date' → roomsLeft. A missing row counts as sold out.
function priceOption(room, stay, partySize, availability) {
  if (!Number.isInteger(partySize) || partySize < 1) throw new Error(`Invalid party size: ${partySize}`);

  const nights = nightsOf(stay);
  const roomsNeeded = Math.ceil(partySize / room.maxAdults);
  const left = nights.map((d) => availability.get(availabilityKey(room.roomId, d)) ?? 0);
  const firstShortIndex = left.findIndex((n) => n < roomsNeeded);
  const totalInr = room.pricePerNightInr * roomsNeeded * nights.length;

  return {
    roomId: room.roomId,
    pricePerNightInr: room.pricePerNightInr,
    roomsNeeded,
    nights: nights.length,
    totalInr,
    perMemberInr: round2(totalInr / partySize),
    available: nights.length > 0 && firstShortIndex === -1,
    minRoomsLeft: left.length > 0 ? Math.min(...left) : 0,
    firstUnavailableDate: firstShortIndex === -1 ? null : nights[firstShortIndex], // for ROOMS_UNAVAILABLE
  };
}

module.exports = { round2, round1, availabilityKey, partySizeFor, budgetSharePct, priceOption };
