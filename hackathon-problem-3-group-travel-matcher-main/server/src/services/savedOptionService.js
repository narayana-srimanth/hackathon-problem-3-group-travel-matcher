// Save & compare (M6): members save hotel options, vote, and see the group's alignment.
// Prices are always recomputed live for the current members and current roomsLeft; the snapshot
// keeps what it cost when saved, and `stale` says the member count has changed since.
const { SavedOption, Room, Hotel } = require('../models');
const { nextId } = require('../db/counters');
const { ERROR_CODES, conflict, forbidden, notFound, unprocessable } = require('../errors');
const { priceOption, availabilityKey } = require('../domain/pricing');
const { compareIds } = require('../domain/ranking');
const { formatDay } = require('../domain/messages');
const { toSavedOption } = require('../dto/hotel');
const { findGroupForMember } = require('./groupService');
const { availabilityMap, loadRoomsForGroup } = require('./hotelService');
const { nightsOf } = require('../domain/dates');

const groupClosed = () =>
  conflict(ERROR_CODES.GROUP_CLOSED, 'This group has booked; its saved options are frozen.');

// 422 ROOMS_UNAVAILABLE naming the first night without enough rooms (details[0].date)
function roomsUnavailable(price, availability) {
  const date = price.firstUnavailableDate;
  const roomsLeft = availability.get(availabilityKey(price.roomId, date)) ?? 0;
  const issue =
    roomsLeft === 0
      ? `Sold out on ${formatDay(date)}`
      : `Only ${roomsLeft} left on ${formatDay(date)}; ${price.roomsNeeded} needed`;
  return unprocessable(
    ERROR_CODES.ROOMS_UNAVAILABLE,
    'This room is not available on every night of the stay.',
    [{ date, roomsLeft, roomsNeeded: price.roomsNeeded, issue }],
  );
}

// option documents → SavedOption DTOs with live prices. 3 queries for any number of options.
async function buildOptionViews(group, options) {
  if (options.length === 0) return [];
  const { roomsById, hotelsById, availability } = await loadRoomsForGroup(
    group,
    options.map((o) => o.roomId),
  );
  return options.map((o) => {
    const room = roomsById.get(o.roomId);
    return toSavedOption(o, {
      hotel: hotelsById.get(room.hotelId),
      room,
      group,
      live: priceOption(room, group, group.memberIds.length, availability),
    });
  });
}

async function findOptionOr404(group, optionId) {
  const option = await SavedOption.findOne({ optionId, groupId: group.groupId }, { _id: 0 }).lean();
  if (!option) throw notFound(`Unknown saved option '${optionId}' in group ${group.groupId}.`);
  return option;
}

// E22
async function saveOption(groupId, actorId, { roomId }) {
  const group = await findGroupForMember(groupId, actorId);
  const room = await Room.findOne({ roomId }, { _id: 0 }).lean();
  const hotel = room && (await Hotel.findOne({ hotelId: room.hotelId }, { _id: 0, city: 1 }).lean());
  if (!room || !hotel || hotel.city !== group.city) {
    throw notFound(`Unknown room '${roomId}' in ${group.city}.`);
  }
  if (group.status === 'BOOKED') throw groupClosed();
  if (await SavedOption.exists({ groupId, roomId })) {
    throw conflict(ERROR_CODES.ALREADY_SAVED, 'This room is already a saved option for the group.');
  }

  const memberCount = group.memberIds.length;
  const availability = await availabilityMap([roomId], nightsOf(group));
  const price = priceOption(room, group, memberCount, availability);
  if (!price.available) throw roomsUnavailable(price, availability);

  let created;
  try {
    created = await SavedOption.create({
      optionId: await nextId('option'),
      groupId,
      hotelId: room.hotelId,
      roomId,
      savedBy: actorId,
      votes: [actorId], // the saver's vote is added automatically
      snapshot: {
        memberCount,
        roomsNeeded: price.roomsNeeded,
        nights: price.nights,
        pricePerNightInr: price.pricePerNightInr,
        totalInr: price.totalInr,
        perMemberInr: price.perMemberInr,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      throw conflict(ERROR_CODES.ALREADY_SAVED, 'This room is already a saved option for the group.');
    }
    throw err;
  }
  const [option] = await buildOptionViews(group, [created.toObject()]);
  return { option };
}

// E23 — votes ↓, then live perMemberInr ↑, then optionId
async function listOptions(groupId, actorId) {
  const group = await findGroupForMember(groupId, actorId);
  const options = await SavedOption.find({ groupId }, { _id: 0 }).lean();
  const items = (await buildOptionViews(group, options)).sort(
    (a, b) =>
      b.voteCount - a.voteCount ||
      a.live.perMemberInr - b.live.perMemberInr ||
      compareIds(a.optionId, b.optionId),
  );
  return { items };
}

// E24 — the member who saved it, or the owner
async function deleteOption(groupId, optionId, actorId) {
  const group = await findGroupForMember(groupId, actorId);
  const option = await findOptionOr404(group, optionId);
  if (option.savedBy !== actorId && group.ownerId !== actorId) {
    throw forbidden('Only the member who saved this option, or the group owner, can remove it.');
  }
  if (group.status === 'BOOKED') throw groupClosed();
  await SavedOption.deleteOne({ optionId, groupId });
  return { deleted: optionId };
}

// E25 / E26 — idempotent: voting twice still counts once
async function setVote(groupId, optionId, actorId, vote) {
  const group = await findGroupForMember(groupId, actorId);
  await findOptionOr404(group, optionId);
  if (group.status === 'BOOKED') throw groupClosed();
  const update = vote ? { $addToSet: { votes: actorId } } : { $pull: { votes: actorId } };
  const updated = await SavedOption.findOneAndUpdate({ optionId, groupId }, update, {
    new: true,
    projection: { _id: 0 },
  }).lean();
  if (!updated) throw notFound(`Unknown saved option '${optionId}' in group ${groupId}.`); // deleted meanwhile
  const [option] = await buildOptionViews(group, [updated]);
  return { option };
}

module.exports = {
  roomsUnavailable,
  buildOptionViews,
  findOptionOr404,
  saveOption,
  listOptions,
  deleteOption,
  addVote: (groupId, optionId, actorId) => setVote(groupId, optionId, actorId, true),
  removeVote: (groupId, optionId, actorId) => setVote(groupId, optionId, actorId, false),
};
