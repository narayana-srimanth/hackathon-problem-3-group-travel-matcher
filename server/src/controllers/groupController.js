const { asyncHandler } = require('../middleware/asyncHandler');
const groupService = require('../services/groupService');

module.exports = {
  // E08 · POST /groups
  create: asyncHandler(async (req, res) =>
    res.status(201).json(await groupService.createGroup(req.body, req.actorId)),
  ),

  // E09 · GET /groups/:groupId
  get: asyncHandler(async (req, res) =>
    res.json(await groupService.getGroup(req.params.groupId, req.actorId)),
  ),

  // E10 · GET /me/groups
  mine: asyncHandler(async (req, res) => res.json(await groupService.myGroups(req.actorId))),
};
