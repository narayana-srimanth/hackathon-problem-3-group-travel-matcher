// Join requests (M5). The server re-checks all 6 rules when a request is made and capacity again
// at approval. An owner can never overfill a group, even with two approvals in parallel:
// every state change is a conditional, atomic update.
//
//   –        create (E15)   → PENDING                      seeker
//   PENDING  approve (E18)  → APPROVED, seeker added        owner
//   PENDING  reject (E19)   → REJECTED                      owner
//   PENDING  withdraw (E20) → WITHDRAWN                     seeker
//   PENDING  group FULL/BOOKED → CLOSED                     system
//   PENDING  seeker joined another group on overlapping nights → CLOSED   system
//
// A traveller is never in two groups on the same night: E15 refuses such a request, and E18
// re-checks it under a per-traveller lock (two owners approving the same seeker at once).
const { Group, JoinRequest, Traveller } = require('../models');
const { ID_COLLATION } = require('../models/options');
const { nextId } = require('../db/counters');
const { withLock } = require('../db/locks');
const { staysOverlap } = require('../domain/dates');
const { ERROR_CODES, conflict, forbidden, notFound, unprocessable } = require('../errors');
const { notEligibleDetails } = require('../domain/matching');
const { compareIds } = require('../domain/ranking');
const { paginate, toPage } = require('../utils/pagination');
const { toJoinRequest, toRequestGroupSummary } = require('../dto/joinRequest');
const { toTraveller } = require('../dto/traveller');
const { findGroupOr404, buildGroupView } = require('./groupService');
const { findOwnSearch } = require('./searchService');
const { evaluateGroup } = require('./matchService');
const { findOverlappingMembership, datesConflict } = require('./membership');

const unique = (list) => [...new Set(list)];
const CLOSE = () => ({ $set: { status: 'CLOSED', decidedBy: null, decidedAt: new Date() } });

const errors = {
  ownGroup: () => conflict(ERROR_CODES.OWN_GROUP, 'This is your own group.'),
  alreadyMember: () => conflict(ERROR_CODES.ALREADY_MEMBER, 'You are already a member of this group.'),
  groupClosed: () => conflict(ERROR_CODES.GROUP_CLOSED, 'This group has already booked its stay.'),
  groupFull: () => conflict(ERROR_CODES.GROUP_FULL, 'This group has no free place left.'),
  duplicate: () =>
    conflict(ERROR_CODES.DUPLICATE_REQUEST, 'You already have a pending request for this group.'),
  notPending: (status) =>
    conflict(ERROR_CODES.REQUEST_NOT_PENDING, `This request is no longer pending (it is ${status}).`),
  youOverlap: (clash) => datesConflict('You are already in another group on overlapping nights.', clash),
  seekerOverlaps: (clash) =>
    datesConflict('This traveller has already joined another group on overlapping nights.', clash),
};

async function findRequestOr404(requestId) {
  const request = await JoinRequest.findOne({ requestId }, { _id: 0 }).lean();
  if (!request) throw notFound(`Unknown join request '${requestId}'.`);
  return request;
}

// PENDING → CLOSED for every pending request of a group that just became FULL (or BOOKED).
// → the ids actually closed, in id order
async function closePendingRequests(groupId) {
  const pending = await JoinRequest.find({ groupId, status: 'PENDING' }, { _id: 0, requestId: 1 }).lean();
  if (pending.length === 0) return [];
  const ids = pending.map((r) => r.requestId);
  return closeRequests(ids);
}

// PENDING → CLOSED for these ids; → the ids actually closed (some may have been decided meanwhile)
async function closeRequests(ids) {
  if (ids.length === 0) return [];
  await JoinRequest.updateMany({ requestId: { $in: ids }, status: 'PENDING' }, CLOSE());
  const closed = await JoinRequest.find(
    { requestId: { $in: ids }, status: 'CLOSED' },
    { _id: 0, requestId: 1 },
  ).lean();
  return closed.map((r) => r.requestId).sort(compareIds);
}

// After a seeker joins `group`: close their other PENDING requests whose groups overlap it.
// → the ids closed (they belong to other groups' inboxes)
async function closeOverlappingRequests(seekerId, group) {
  const pending = await JoinRequest.find(
    { seekerId, status: 'PENDING', groupId: { $ne: group.groupId } },
    { _id: 0, requestId: 1, groupId: 1 },
  ).lean();
  if (pending.length === 0) return [];
  const stays = await Group.find(
    { groupId: { $in: unique(pending.map((r) => r.groupId)) } },
    { _id: 0, groupId: 1, checkIn: 1, checkOut: 1 },
  ).lean();
  const clashing = new Set(stays.filter((g) => staysOverlap(g, group)).map((g) => g.groupId));
  return closeRequests(pending.filter((r) => clashing.has(r.groupId)).map((r) => r.requestId));
}

// ---------------------------------------------------------------- E15 · create ("Interested")

async function createJoinRequest(groupId, body, actorId) {
  // The spec's order; the first failure is returned
  const group = await findGroupOr404(groupId); // 404
  const search = await findOwnSearch(body.searchId, actorId); // 404 / 403
  if (group.ownerId === actorId) throw errors.ownGroup();
  if (group.memberIds.includes(actorId)) throw errors.alreadyMember();
  if (group.status === 'BOOKED') throw errors.groupClosed();
  if (group.status === 'FULL' || group.memberIds.length >= group.maxSize) throw errors.groupFull();
  const clash = await findOverlappingMembership(actorId, group);
  if (clash) throw errors.youOverlap(clash); // 409 DATES_CONFLICT

  const { evaluation, score } = await evaluateGroup(search, group);
  if (!evaluation.eligible) {
    throw unprocessable(
      ERROR_CODES.NOT_ELIGIBLE,
      "You don't match this group.",
      notEligibleDetails(evaluation),
    );
  }
  if (await JoinRequest.exists({ groupId, seekerId: actorId, status: 'PENDING' })) throw errors.duplicate();

  let created;
  try {
    created = await JoinRequest.create({
      requestId: await nextId('joinRequest'),
      groupId,
      seekerId: actorId,
      searchId: search.searchId,
      message: body.message,
      matchSnapshot: {
        sharedNights: evaluation.facts.sharedNights,
        sharedInterests: evaluation.facts.shared,
        budgetDiffInr: evaluation.facts.diffInr,
        score,
      },
    });
  } catch (err) {
    // the partial unique index: a double-click raced past the check above
    if (err.code === 11000) throw errors.duplicate();
    throw err;
  }

  // Race guard: if, between our checks and the insert, an approval filled the group (or a booking
  // closed it, or the seeker was approved into an overlapping group), that step's "close the
  // PENDING requests" may have run before our insert existed. Re-check and close ours if so.
  const [current, lateClash] = await Promise.all([
    Group.findOne({ groupId }, { _id: 0 }).lean(),
    findOverlappingMembership(actorId, group),
  ]);
  if (current.status !== 'OPEN' || lateClash) {
    await JoinRequest.updateOne({ requestId: created.requestId, status: 'PENDING' }, CLOSE());
    if (current.status === 'BOOKED') throw errors.groupClosed();
    if (current.status !== 'OPEN') throw errors.groupFull();
    throw errors.youOverlap(lateClash);
  }

  return { request: toJoinRequest(created.toObject()), group: await buildGroupView(current, actorId) };
}

// ---------------------------------------------------------------- E16 · owner inbox

async function listGroupRequests(groupId, actorId, { status, page, limit }) {
  const group = await findGroupOr404(groupId);
  if (group.ownerId !== actorId) throw forbidden('Only the group owner can see its join requests.');

  const filter = status === 'ALL' ? { groupId } : { groupId, status };
  const { skip } = paginate({ page, limit });
  const [requests, total] = await Promise.all([
    JoinRequest.find(filter, { _id: 0 })
      .collation(ID_COLLATION)
      .sort({ createdAt: 1, requestId: 1 }) // oldest first: first come, first served
      .skip(skip)
      .limit(limit)
      .lean(),
    JoinRequest.countDocuments(filter),
  ]);
  const seekers = await Traveller.find(
    { travellerId: { $in: unique(requests.map((r) => r.seekerId)) } },
    { _id: 0 },
  ).lean();
  const seekersById = new Map(seekers.map((s) => [s.travellerId, s]));

  const items = requests.map((r) => ({
    request: toJoinRequest(r),
    seeker: seekersById.has(r.seekerId) ? toTraveller(seekersById.get(r.seekerId)) : null,
  }));
  return toPage(items, page, limit, total);
}

// ---------------------------------------------------------------- E17 · "My requests"

async function listMyRequests(actorId, { status, page, limit }) {
  const filter = status === 'ALL' ? { seekerId: actorId } : { seekerId: actorId, status };
  const { skip } = paginate({ page, limit });
  const [requests, total] = await Promise.all([
    JoinRequest.find(filter, { _id: 0 })
      .collation(ID_COLLATION)
      .sort({ createdAt: -1, requestId: -1 }) // newest first
      .skip(skip)
      .limit(limit)
      .lean(),
    JoinRequest.countDocuments(filter),
  ]);
  const groups = await Group.find(
    { groupId: { $in: unique(requests.map((r) => r.groupId)) } },
    { _id: 0, groupId: 1, name: 1, city: 1, checkIn: 1, checkOut: 1, ownerId: 1 },
  ).lean();
  const owners = await Traveller.find(
    { travellerId: { $in: unique(groups.map((g) => g.ownerId)) } },
    { _id: 0, travellerId: 1, name: 1 },
  ).lean();
  const groupsById = new Map(groups.map((g) => [g.groupId, g]));
  const ownerNames = new Map(owners.map((o) => [o.travellerId, o.name]));

  const items = requests.map((r) => {
    const g = groupsById.get(r.groupId);
    return {
      request: toJoinRequest(r),
      group: g ? toRequestGroupSummary(g, ownerNames.get(g.ownerId)) : null,
    };
  });
  return toPage(items, page, limit, total);
}

// ---------------------------------------------------------------- E18 · approve

// Why an approval can't go ahead on a request that isn't PENDING. A CLOSED request was closed by
// the system (group booked, group full, or the seeker joined an overlapping group), so say which;
// anything else is REQUEST_NOT_PENDING.
async function notPendingError(request, group) {
  if (request.status === 'CLOSED') {
    if (group.status === 'BOOKED') return errors.groupClosed();
    if (group.status === 'FULL') return errors.groupFull();
    const clash = await findOverlappingMembership(request.seekerId, group);
    if (clash) return errors.seekerOverlaps(clash);
  }
  return errors.notPending(request.status);
}

// The capacity guard and the member append in ONE atomic update: it only matches while the group
// is OPEN, has a free place and doesn't contain the seeker, and it sets FULL in the same write.
const addMemberIfRoom = (groupId, seekerId) =>
  Group.findOneAndUpdate(
    {
      groupId,
      status: 'OPEN',
      memberIds: { $ne: seekerId },
      $expr: { $lt: [{ $size: '$memberIds' }, '$maxSize'] },
    },
    [
      { $set: { memberIds: { $concatArrays: ['$memberIds', [seekerId]] } } },
      { $set: { status: { $cond: [{ $gte: [{ $size: '$memberIds' }, '$maxSize'] }, 'FULL', 'OPEN'] } } },
    ],
    { new: true, projection: { _id: 0 } },
  ).lean();

// APPROVED → CLOSED: the claim in step 1 succeeded but the seeker can't be added after all
const unclaim = (requestId) => JoinRequest.updateOne({ requestId, status: 'APPROVED' }, CLOSE());

async function approveRequest(requestId, actorId) {
  const request = await findRequestOr404(requestId);
  const group = await findGroupOr404(request.groupId);
  if (group.ownerId !== actorId) throw forbidden('Only the group owner can approve requests.');
  if (request.status !== 'PENDING') throw await notPendingError(request, group);
  if (group.status === 'BOOKED') throw errors.groupClosed();

  // Approvals of the same seeker (into different groups) run one at a time, so the overlap check
  // below and the member add can't interleave with another owner's approval of this seeker.
  return withLock(`membership:${request.seekerId}`, async () => {
    // Step 1: claim the request (only one caller can move it out of PENDING)
    const claimed = await JoinRequest.findOneAndUpdate(
      { requestId, status: 'PENDING' },
      { $set: { status: 'APPROVED', decidedBy: actorId, decidedAt: new Date() } },
      { new: true, projection: { _id: 0 } },
    ).lean();
    if (!claimed) {
      const [latest, latestGroup] = await Promise.all([
        findRequestOr404(requestId),
        findGroupOr404(group.groupId),
      ]);
      throw await notPendingError(latest, latestGroup);
    }

    // Step 2: the seeker must not have joined another group on overlapping nights meanwhile
    const clash = await findOverlappingMembership(claimed.seekerId, group);
    if (clash) {
      await unclaim(requestId);
      throw errors.seekerOverlaps(clash); // 409 DATES_CONFLICT
    }

    // Step 3: add the member only if there is still room (atomic capacity guard)
    const updated = await addMemberIfRoom(group.groupId, claimed.seekerId);
    if (!updated) {
      // The last place went first (or the group booked): this request is CLOSED, not APPROVED
      await unclaim(requestId);
      const current = await findGroupOr404(group.groupId);
      if (current.status === 'BOOKED') throw errors.groupClosed();
      if (current.memberIds.includes(claimed.seekerId)) throw errors.alreadyMember();
      throw errors.groupFull();
    }

    // Step 4: clean up. This group's other requests if it's now FULL, and the seeker's own
    // pending requests to groups that overlap this trip (they can never be approved now).
    const [closedRequestIds, closedSeekerRequestIds] = await Promise.all([
      updated.status === 'FULL' ? closePendingRequests(group.groupId) : [],
      closeOverlappingRequests(claimed.seekerId, updated),
    ]);
    return {
      request: toJoinRequest(claimed),
      group: await buildGroupView(updated, actorId),
      closedRequestIds,
      closedSeekerRequestIds,
    };
  });
}

// ---------------------------------------------------------------- E19 / E20 · reject, withdraw

// PENDING → `status` only if still PENDING; otherwise 409 REQUEST_NOT_PENDING
async function decide(requestId, status, decidedBy) {
  const updated = await JoinRequest.findOneAndUpdate(
    { requestId, status: 'PENDING' },
    { $set: { status, decidedBy, decidedAt: new Date() } },
    { new: true, projection: { _id: 0 } },
  ).lean();
  if (!updated) throw errors.notPending((await findRequestOr404(requestId)).status);
  return { request: toJoinRequest(updated) };
}

async function rejectRequest(requestId, actorId) {
  const request = await findRequestOr404(requestId);
  const group = await findGroupOr404(request.groupId);
  if (group.ownerId !== actorId) throw forbidden('Only the group owner can reject requests.');
  return decide(requestId, 'REJECTED', actorId);
}

async function withdrawRequest(requestId, actorId) {
  const request = await findRequestOr404(requestId);
  if (request.seekerId !== actorId)
    throw forbidden('Only the traveller who sent this request can withdraw it.');
  return decide(requestId, 'WITHDRAWN', actorId);
}

module.exports = {
  closePendingRequests,
  createJoinRequest,
  listGroupRequests,
  listMyRequests,
  approveRequest,
  rejectRequest,
  withdrawRequest,
};
