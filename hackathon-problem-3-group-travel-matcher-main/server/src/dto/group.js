// Group document → the API's Group (spec §4). Everything about a group's state (members, free
// places, status, the caller's relation to it) comes back in this one object.
const { nightCount } = require('../domain/dates');
const { toIso } = require('../utils/text');
const { toTravellerSummary } = require('./traveller');
const { NO_RATING } = require('./review');

// The caller's relation, from their membership or their LATEST join request (plan D4):
// OWNER / MEMBER first; then PENDING → PENDING, REJECTED → REJECTED (may request again),
// WITHDRAWN / CLOSED / none → NONE. pendingRequestCount is a number for the owner only.
function viewerOf(group, actorId, latestRequest, pendingCount) {
  if (group.ownerId === actorId) {
    return { relation: 'OWNER', requestId: null, pendingRequestCount: pendingCount || 0 };
  }
  if (group.memberIds.includes(actorId)) {
    return { relation: 'MEMBER', requestId: null, pendingRequestCount: null };
  }
  if (latestRequest && (latestRequest.status === 'PENDING' || latestRequest.status === 'REJECTED')) {
    return { relation: latestRequest.status, requestId: latestRequest.requestId, pendingRequestCount: null };
  }
  return { relation: 'NONE', requestId: null, pendingRequestCount: null };
}

const unknownPerson = (travellerId) => ({ travellerId, name: null, gender: null, homeCity: null });

// ctx: { travellersById: Map, ratingsById: Map (optional), city: { country, timezone } | undefined, viewer }
function toGroup(group, { travellersById, ratingsById, city, viewer }) {
  const person = (id) => travellersById.get(id) || unknownPerson(id);
  const rating = (id) => (ratingsById && ratingsById.get(id)) || NO_RATING;
  const owner = person(group.ownerId);
  const memberCount = group.memberIds.length;
  // owner first, then join order (memberIds is append-only, so its order is the join order)
  const ordered = [
    ...group.memberIds.filter((id) => id === group.ownerId),
    ...group.memberIds.filter((id) => id !== group.ownerId),
  ];

  return {
    groupId: group.groupId,
    name: group.name,
    city: group.city,
    country: city ? city.country : null,
    timezone: city ? city.timezone : null,
    checkIn: group.checkIn,
    checkOut: group.checkOut,
    nights: nightCount(group),
    maxSize: group.maxSize,
    memberCount,
    freeSpots: group.maxSize - memberCount,
    budgetInr: group.budgetInr,
    itinerary: group.itinerary ?? '',
    status: group.status,
    owner: { travellerId: owner.travellerId, name: owner.name, gender: owner.gender, rating: rating(group.ownerId) },
    members: ordered.map((id) => ({
      ...toTravellerSummary(person(id)),
      isOwner: id === group.ownerId,
      rating: rating(id),
    })),
    viewer,
    createdAt: toIso(group.createdAt),
  };
}

module.exports = { viewerOf, toGroup };
