// Booking and BookingQuote (spec §4)
const { toIso } = require('../utils/text');
const { toHotel, toRoom } = require('./hotel');

const toBooking = (b, { hotel, room }) => ({
  bookingId: b.bookingId,
  groupId: b.groupId,
  optionId: b.optionId,
  hotel: toHotel(hotel),
  room: toRoom(room),
  roomsBooked: b.roomsBooked,
  nights: b.nights,
  memberIds: b.memberIds,
  totalInr: b.totalInr,
  perMemberInr: b.perMemberInr,
  status: b.status,
  bookedBy: b.bookedBy,
  createdAt: toIso(b.createdAt),
});

// group + option + its live price → what the confirmation popup shows
const toBookingQuote = ({ group, option, hotel, room, price, members }) => ({
  optionId: option.optionId,
  hotelName: hotel.name,
  roomName: room.name,
  checkIn: group.checkIn,
  checkOut: group.checkOut,
  nights: price.nights,
  roomsNeeded: price.roomsNeeded,
  memberCount: group.memberIds.length,
  pricePerNightInr: price.pricePerNightInr,
  totalInr: price.totalInr,
  perMemberInr: price.perMemberInr,
  available: price.available,
  members,
});

module.exports = { toBooking, toBookingQuote };
