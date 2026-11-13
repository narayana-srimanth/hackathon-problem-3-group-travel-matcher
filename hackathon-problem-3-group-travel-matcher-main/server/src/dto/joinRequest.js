// JoinRequest (spec §4)
const { toIso } = require('../utils/text');

const toJoinRequest = (r) => ({
  requestId: r.requestId,
  groupId: r.groupId,
  seekerId: r.seekerId,
  searchId: r.searchId,
  status: r.status,
  message: r.message ?? null,
  matchSnapshot: {
    sharedNights: r.matchSnapshot.sharedNights,
    sharedInterests: r.matchSnapshot.sharedInterests,
    budgetDiffInr: r.matchSnapshot.budgetDiffInr,
    score: r.matchSnapshot.score,
  },
  createdAt: toIso(r.createdAt),
  decidedAt: toIso(r.decidedAt),
  decidedBy: r.decidedBy ?? null,
});

// The group summary in the seeker's "My requests" list (E17)
const toRequestGroupSummary = (group, ownerName) => ({
  groupId: group.groupId,
  name: group.name,
  city: group.city,
  checkIn: group.checkIn,
  checkOut: group.checkOut,
  owner: { name: ownerName ?? null },
});

module.exports = { toJoinRequest, toRequestGroupSummary };
