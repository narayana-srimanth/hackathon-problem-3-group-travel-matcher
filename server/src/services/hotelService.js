// Hotel search for a group (M6, E21) and the catalog loading the saved options and the booking
// reuse. It always uses the group's own city and dates, reads live roomsLeft (so other groups'
// bookings count), and prices everything on the server with domain/pricing.js.
const { Hotel, Room, Availability, SavedOption } = require('../models');
const { nightsOf } = require('../domain/dates');
const { priceOption, partySizeFor, availabilityKey } = require('../domain/pricing');
const { compareIds } = require('../domain/ranking');
const { slicePage } = require('../utils/pagination');
const { toHotel, toRoomOption } = require('../dto/hotel');
const { findGroupForMember } = require('./groupService');
const { cityMap } = require('./metaService');

// roomId|date → roomsLeft, for these rooms on these nights (current values, after bookings)
async function availabilityMap(roomIds, nights) {
  const rows = await Availability.find(
    { roomId: { $in: roomIds }, date: { $in: nights } },
    { _id: 0, roomId: 1, date: 1, roomsLeft: 1 },
  ).lean();
  return new Map(rows.map((a) => [availabilityKey(a.roomId, a.date), a.roomsLeft]));
}

// Hotels sort: perMember ↑ (cheapest option), rating ↓, stars ↓; ties by hotelId (plan D7)
const HOTEL_SORTS = {
  perMember: (a, b) => a.cheapestPerMemberInr - b.cheapestPerMemberInr,
  rating: (a, b) => b.hotel.rating - a.hotel.rating,
  stars: (a, b) => b.hotel.stars - a.hotel.stars,
};
// Options within a hotel: perMemberInr ↑, then roomId
const byPerMember = (a, b) => a.perMemberInr - b.perMemberInr || compareIds(a.roomId, b.roomId);

// E21
async function searchHotels(groupId, actorId, query) {
  const group = await findGroupForMember(groupId, actorId);
  const nights = nightsOf(group);
  const partySize = partySizeFor(group, query.planFor);

  // 3 indexed queries load exactly what the pure pricing needs
  const hotelFilter = { city: group.city };
  if (query.minStars !== undefined) hotelFilter.stars = { $gte: query.minStars };
  if (query.minRating !== undefined) hotelFilter.rating = { $gte: query.minRating };
  const hotels = await Hotel.find(hotelFilter, { _id: 0 }).lean();
  const roomFilter = { hotelId: { $in: hotels.map((h) => h.hotelId) } };
  if (query.roomType) roomFilter.roomType = query.roomType;
  const [rooms, saved, cities] = await Promise.all([
    Room.find(roomFilter, { _id: 0 }).lean(),
    SavedOption.find({ groupId }, { _id: 0, optionId: 1, roomId: 1 }).lean(),
    cityMap([group.city]),
  ]);
  const availability = await availabilityMap(
    rooms.map((r) => r.roomId),
    nights,
  );
  const savedByRoom = new Map(saved.map((o) => [o.roomId, o.optionId]));

  // Price every room; keep only available options (and within maxPerMemberInr)
  const optionsByHotel = new Map();
  for (const room of rooms) {
    const price = priceOption(room, group, partySize, availability);
    if (!price.available) continue;
    if (query.maxPerMemberInr !== undefined && price.perMemberInr > query.maxPerMemberInr) continue;
    const option = toRoomOption(room, price, {
      budgetInr: group.budgetInr,
      savedOptionId: savedByRoom.get(room.roomId),
    });
    if (!optionsByHotel.has(room.hotelId)) optionsByHotel.set(room.hotelId, []);
    optionsByHotel.get(room.hotelId).push(option);
  }

  // Hotels with no available option are left out (total counts the ones with at least one)
  const items = hotels
    .filter((h) => optionsByHotel.has(h.hotelId))
    .map((h) => {
      const options = optionsByHotel.get(h.hotelId).sort(byPerMember);
      return { hotel: toHotel(h), cheapestPerMemberInr: options[0].perMemberInr, options };
    })
    .sort((a, b) => HOTEL_SORTS[query.sort](a, b) || compareIds(a.hotel.hotelId, b.hotel.hotelId));

  const city = cities.get(group.city);
  return {
    context: {
      groupId: group.groupId,
      city: group.city,
      checkIn: group.checkIn,
      checkOut: group.checkOut,
      nights,
      partySize,
      budgetInr: group.budgetInr,
      timezone: city ? city.timezone : null,
    },
    ...slicePage(items, query.page, query.limit),
  };
}

// The hotel + room of each roomId, and live availability for the group's nights
async function loadRoomsForGroup(group, roomIds) {
  const rooms = await Room.find({ roomId: { $in: roomIds } }, { _id: 0 }).lean();
  const [hotels, availability] = await Promise.all([
    Hotel.find({ hotelId: { $in: [...new Set(rooms.map((r) => r.hotelId))] } }, { _id: 0 }).lean(),
    availabilityMap(roomIds, nightsOf(group)),
  ]);
  return {
    roomsById: new Map(rooms.map((r) => [r.roomId, r])),
    hotelsById: new Map(hotels.map((h) => [h.hotelId, h])),
    availability,
  };
}

module.exports = { availabilityMap, searchHotels, loadRoomsForGroup };
