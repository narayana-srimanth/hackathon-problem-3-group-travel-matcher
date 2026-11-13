// One traveller can't be in two groups on the same night (any city): memberships whose stays share
// at least one night conflict. Back-to-back trips (check-out 15 Apr, check-in 15 Apr) are fine.
const { Group } = require('../models');
const { staysOverlap } = require('../domain/dates');
const { formatRange } = require('../domain/messages');
const { conflict, ERROR_CODES } = require('../errors');

const STAY_FIELDS = { _id: 0, groupId: 1, name: 1, city: 1, checkIn: 1, checkOut: 1 };

// The groups the traveller is in (as owner or member)
const membershipsOf = (travellerId) => Group.find({ memberIds: travellerId }, STAY_FIELDS).lean();

// → the first group the traveller is in whose stay overlaps `stay` (ignoring `stay` itself), or null
async function findOverlappingMembership(travellerId, stay) {
  const groups = await membershipsOf(travellerId);
  return groups.find((g) => g.groupId !== stay.groupId && staysOverlap(g, stay)) || null;
}

// 409 DATES_CONFLICT naming the clashing group
const datesConflict = (message, clash) =>
  conflict(ERROR_CODES.DATES_CONFLICT, message, [
    {
      groupId: clash.groupId,
      issue: `Already in ${clash.name} (${clash.city}, ${formatRange(clash.checkIn, clash.checkOut)})`,
    },
  ]);

module.exports = { membershipsOf, findOverlappingMembership, datesConflict };
