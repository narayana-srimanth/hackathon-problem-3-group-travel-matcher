// Group posts (M2): create, read, "my groups". Every response carries full Group objects,
// built in batch so a list costs a fixed number of queries (no N+1).
const { Group, Traveller, JoinRequest } = require('../models');
const { ID_COLLATION } = require('../models/options');
const { nextId } = require('../db/counters');
const { forbidden, notFound } = require('../errors');
const { toGroup, viewerOf } = require('../dto/group');
const { assertInDataRange, cityMap } = require('./metaService');
const { latestRequestsByGroup } = require('./requestLookup');
const { ratingsFor } = require('./ratings');

const unique = (list) => [...new Set(list)];

// groups (lean documents) → Group DTOs for this caller. 5 queries, whatever the list length.
async function buildGroupViews(groups, actorId) {
  if (groups.length === 0) return [];
  const groupIds = groups.map((g) => g.groupId);
  const ownedIds = groups.filter((g) => g.ownerId === actorId).map((g) => g.groupId);
  const people = unique(groups.flatMap((g) => [g.ownerId, ...g.memberIds]));

  const [travellers, cities, latestRequest, pendingCounts, ratingsById] = await Promise.all([
    Traveller.find(
      { travellerId: { $in: people } },
      { _id: 0, travellerId: 1, name: 1, gender: 1, homeCity: 1 },
    ).lean(),
    cityMap(unique(groups.map((g) => g.city))),
    latestRequestsByGroup(actorId, groupIds),
    ownedIds.length > 0
      ? JoinRequest.aggregate([
          { $match: { groupId: { $in: ownedIds }, status: 'PENDING' } },
          { $group: { _id: '$groupId', count: { $sum: 1 } } },
        ])
      : [],
    ratingsFor(people),
  ]);

  const travellersById = new Map(travellers.map((t) => [t.travellerId, t]));
  const pendingByGroup = new Map(pendingCounts.map((p) => [p._id, p.count]));

  return groups.map((g) =>
    toGroup(g, {
      travellersById,
      ratingsById,
      city: cities.get(g.city),
      viewer: viewerOf(g, actorId, latestRequest.get(g.groupId), pendingByGroup.get(g.groupId)),
    }),
  );
}

async function buildGroupView(group, actorId) {
  const [view] = await buildGroupViews([group], actorId);
  return view;
}

async function findGroupOr404(groupId) {
  const group = await Group.findOne({ groupId }, { _id: 0 }).lean();
  if (!group) throw notFound(`Unknown group '${groupId}'.`);
  return group;
}

// The Common Group Page is members only: 404 unknown group, 403 for anyone not in it
async function findGroupForMember(groupId, actorId) {
  const group = await findGroupOr404(groupId);
  if (!group.memberIds.includes(actorId)) throw forbidden('Only members of this group can do this.');
  return group;
}

// E08 — the actor becomes owner and first member. Body is shape-valid (zod); the data range is checked here.
async function createGroup(body, actorId) {
  await assertInDataRange(body);
  const created = await Group.create({
    groupId: await nextId('group'),
    name: body.name,
    ownerId: actorId,
    memberIds: [actorId],
    city: body.city,
    checkIn: body.checkIn,
    checkOut: body.checkOut,
    maxSize: body.maxSize,
    budgetInr: body.budgetInr,
    itinerary: body.itinerary,
    status: body.maxSize === 1 ? 'FULL' : 'OPEN', // a group of 1 is full from the start
  });
  return { group: await buildGroupView(created.toObject(), actorId) };
}

// E09 — anyone signed in can view a group post
async function getGroup(groupId, actorId) {
  return { group: await buildGroupView(await findGroupOr404(groupId), actorId) };
}

// E10 — owned / memberOf, each by checkIn ↑ then groupId ↑; the badge total for the creator
async function myGroups(actorId) {
  const groups = await Group.find({ memberIds: actorId }, { _id: 0 })
    .collation(ID_COLLATION)
    .sort({ checkIn: 1, groupId: 1 })
    .lean();
  const views = await buildGroupViews(groups, actorId);
  const owned = views.filter((g) => g.viewer.relation === 'OWNER');
  return {
    owned,
    memberOf: views.filter((g) => g.viewer.relation === 'MEMBER'),
    totalPendingRequests: owned.reduce((sum, g) => sum + g.viewer.pendingRequestCount, 0),
  };
}

module.exports = {
  buildGroupViews,
  buildGroupView,
  findGroupOr404,
  findGroupForMember,
  createGroup,
  getGroup,
  myGroups,
};
