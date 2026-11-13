// Finalise booking (M6): any member books ONE saved option for the whole group. It reduces the
// shared roomsLeft for every other group, it can't be edited or cancelled in v1, and the cost is
// split equally across the members at booking time.
//
// E28 is all-or-nothing without a transaction:
//   1. claim the group's single booking      (unique bookings.groupId → double-click = 409)
//   2. freeze the group: status → BOOKED, only if its members are still the ones we priced for
//      (so no approval can add someone mid-booking)
//   3. reduce roomsLeft on every night, each step only if enough rooms are left
//   4. on any failure undo what was done (rooms back, previous status back, booking deleted)
//   5. close the group's PENDING join requests
// Known limitation: a crash in the middle of 2–4 can leave a partial booking (see README).
const { Availability, Booking, Group, Traveller } = require('../models');
const { nextId } = require('../db/counters');
const { ERROR_CODES, conflict, notFound } = require('../errors');
const { nightsOf } = require('../domain/dates');
const { priceOption } = require('../domain/pricing');
const { toBooking, toBookingQuote } = require('../dto/booking');
const { findGroupForMember, buildGroupView } = require('./groupService');
const { loadRoomsForGroup } = require('./hotelService');
const { findOptionOr404, roomsUnavailable } = require('./savedOptionService');
const { closePendingRequests } = require('./joinRequestService');

const alreadyBooked = () => conflict(ERROR_CODES.ALREADY_BOOKED, 'This group has already booked.');

// The option with its catalog rows and the live price for the CURRENT members
async function priceSavedOption(group, optionId) {
  const option = await findOptionOr404(group, optionId);
  const { roomsById, hotelsById, availability } = await loadRoomsForGroup(group, [option.roomId]);
  const room = roomsById.get(option.roomId);
  const hotel = hotelsById.get(room.hotelId);
  const price = priceOption(room, group, group.memberIds.length, availability);
  return { option, room, hotel, price, availability };
}

async function assertNotBooked(group) {
  if (group.status === 'BOOKED' || (await Booking.exists({ groupId: group.groupId }))) throw alreadyBooked();
}

// Members as { travellerId, name }, owner first then join order (memberIds order)
async function memberNames(group) {
  const people = await Traveller.find(
    { travellerId: { $in: group.memberIds } },
    { _id: 0, travellerId: 1, name: 1 },
  ).lean();
  const names = new Map(people.map((p) => [p.travellerId, p.name]));
  const ordered = [group.ownerId, ...group.memberIds.filter((id) => id !== group.ownerId)];
  return ordered.map((travellerId) => ({ travellerId, name: names.get(travellerId) ?? null }));
}

// ---------------------------------------------------------------- E27 · quote (read-only)

async function quote(groupId, actorId, { optionId }) {
  const group = await findGroupForMember(groupId, actorId);
  await assertNotBooked(group);
  const priced = await priceSavedOption(group, optionId);
  return toBookingQuote({ group, ...priced, members: await memberNames(group) });
}

// ---------------------------------------------------------------- E28 · book

// Reduce roomsLeft by `rooms` on each night, in order, each only if enough are left.
// → { reduced: nights done, failedDate: first night that didn't have enough, or null }
async function reduceNights(roomId, nights, rooms) {
  const reduced = [];
  for (const date of nights) {
    const res = await Availability.updateOne(
      { roomId, date, roomsLeft: { $gte: rooms } },
      { $inc: { roomsLeft: -rooms } },
    );
    if (res.modifiedCount !== 1) return { reduced, failedDate: date };
    reduced.push(date);
  }
  return { reduced, failedDate: null };
}

const restoreNights = (roomId, nights, rooms) =>
  nights.length === 0
    ? null
    : Availability.updateMany({ roomId, date: { $in: nights } }, { $inc: { roomsLeft: rooms } });

async function book(groupId, actorId, { optionId }) {
  const group = await findGroupForMember(groupId, actorId);
  await assertNotBooked(group);
  const { room, hotel, price, availability } = await priceSavedOption(group, optionId);
  if (!price.available) throw roomsUnavailable(price, availability); // nothing changed yet

  const nights = nightsOf(group);
  const memberIds = [...group.memberIds];

  // 1. Claim the booking (one per group)
  let booking;
  try {
    booking = await Booking.create({
      bookingId: await nextId('booking', { year: group.checkIn.slice(0, 4) }),
      groupId,
      optionId,
      hotelId: room.hotelId,
      roomId: room.roomId,
      roomsBooked: price.roomsNeeded,
      nights,
      memberIds,
      totalInr: price.totalInr,
      perMemberInr: price.perMemberInr,
      bookedBy: actorId,
    });
  } catch (err) {
    if (err.code === 11000) throw alreadyBooked(); // a parallel click won
    throw err;
  }

  // 2. Freeze the group, only if nobody joined since we priced it
  const before = await Group.findOneAndUpdate(
    { groupId, status: { $ne: 'BOOKED' }, memberIds: { $eq: memberIds } },
    { $set: { status: 'BOOKED' } },
    { new: false, projection: { _id: 0, status: 1 } },
  ).lean();
  if (!before) {
    await Booking.deleteOne({ bookingId: booking.bookingId });
    throw conflict(
      ERROR_CODES.CONFLICT,
      'The group changed while booking (a member joined). Please try again.',
    );
  }

  // 3. Reduce roomsLeft on every night; 4. undo everything if one night is short
  const { reduced, failedDate } = await reduceNights(room.roomId, nights, price.roomsNeeded);
  if (failedDate) {
    await restoreNights(room.roomId, reduced, price.roomsNeeded);
    await Group.updateOne({ groupId, status: 'BOOKED' }, { $set: { status: before.status } });
    await Booking.deleteOne({ bookingId: booking.bookingId });
    const now = await Availability.findOne(
      { roomId: room.roomId, date: failedDate },
      { _id: 0, roomsLeft: 1 },
    ).lean();
    throw roomsUnavailable(
      { ...price, firstUnavailableDate: failedDate },
      new Map([[`${room.roomId}|${failedDate}`, now ? now.roomsLeft : 0]]),
    );
  }

  // 5. The group is booked: close its pending join requests
  await closePendingRequests(groupId);

  const bookedGroup = await Group.findOne({ groupId }, { _id: 0 }).lean();
  return {
    booking: toBooking(booking.toObject(), { hotel, room }),
    group: await buildGroupView(bookedGroup, actorId),
  };
}

// ---------------------------------------------------------------- E29 · get

async function getBooking(groupId, actorId) {
  const group = await findGroupForMember(groupId, actorId);
  const booking = await Booking.findOne({ groupId }, { _id: 0 }).lean();
  if (!booking) throw notFound('This group has no booking yet.'); // the client reads this as "not booked"
  const { roomsById, hotelsById } = await loadRoomsForGroup(group, [booking.roomId]);
  const room = roomsById.get(booking.roomId);
  return { booking: toBooking(booking, { hotel: hotelsById.get(room.hotelId), room }) };
}

module.exports = { quote, book, getBooking };
