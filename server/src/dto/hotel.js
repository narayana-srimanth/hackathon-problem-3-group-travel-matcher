// Hotel, Room, RoomOption, SavedOption (spec §4). Every money value comes from domain/pricing.js.
const { budgetSharePct } = require('../domain/pricing');
const { toIso } = require('../utils/text');

const toHotel = (h) => ({
  hotelId: h.hotelId,
  name: h.name,
  city: h.city,
  area: h.area,
  stars: h.stars,
  rating: h.rating,
  image: h.image,
  checkInFrom: h.checkInFrom,
  checkOutUntil: h.checkOutUntil,
});

const toRoom = (r) => ({
  roomId: r.roomId,
  roomType: r.roomType,
  name: r.name,
  maxAdults: r.maxAdults,
  pricePerNightInr: r.pricePerNightInr,
  refundable: r.refundable,
});

// room + its price for the party (priceOption result) → RoomOption
const toRoomOption = (room, price, { budgetInr, savedOptionId }) => ({
  ...toRoom(room),
  roomsNeeded: price.roomsNeeded,
  nights: price.nights,
  totalInr: price.totalInr,
  perMemberInr: price.perMemberInr,
  budgetSharePct: budgetSharePct(price.perMemberInr, budgetInr),
  minRoomsLeft: price.minRoomsLeft,
  savedOptionId: savedOptionId ?? null,
});

// option document + catalog + the live price for the CURRENT members → SavedOption
function toSavedOption(option, { hotel, room, group, live }) {
  const memberCount = group.memberIds.length;
  const votes = option.votes.filter((id) => group.memberIds.includes(id)); // members only
  return {
    optionId: option.optionId,
    groupId: option.groupId,
    hotel: toHotel(hotel),
    room: toRoom(room),
    savedBy: option.savedBy,
    createdAt: toIso(option.createdAt),
    votes,
    voteCount: votes.length,
    memberCount,
    allAgree: votes.length === memberCount,
    snapshot: {
      memberCount: option.snapshot.memberCount,
      roomsNeeded: option.snapshot.roomsNeeded,
      totalInr: option.snapshot.totalInr,
      perMemberInr: option.snapshot.perMemberInr,
    },
    live: {
      roomsNeeded: live.roomsNeeded,
      totalInr: live.totalInr,
      perMemberInr: live.perMemberInr,
      available: live.available,
    },
    stale: option.snapshot.memberCount !== memberCount,
  };
}

module.exports = { toHotel, toRoom, toRoomOption, toSavedOption };
