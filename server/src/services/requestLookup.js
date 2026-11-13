// A seeker's LATEST join request per group (plan D4). Used by Group.viewer and MatchCard.viewerRequestStatus.
const { JoinRequest } = require('../models');
const { compareIds } = require('../domain/ranking');

// Newest first; requests made in the same millisecond fall back to the higher id
const newestFirst = (a, b) =>
  new Date(b.createdAt) - new Date(a.createdAt) || compareIds(b.requestId, a.requestId);

// → Map groupId → { requestId, groupId, status, createdAt }
async function latestRequestsByGroup(seekerId, groupIds) {
  if (groupIds.length === 0) return new Map();
  const requests = await JoinRequest.find(
    { seekerId, groupId: { $in: groupIds } },
    { _id: 0, requestId: 1, groupId: 1, status: 1, createdAt: 1 },
  ).lean();
  const latest = new Map();
  for (const r of requests.sort(newestFirst)) {
    if (!latest.has(r.groupId)) latest.set(r.groupId, r);
  }
  return latest;
}

module.exports = { newestFirst, latestRequestsByGroup };
