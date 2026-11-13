const { asyncHandler } = require('../middleware/asyncHandler');
const service = require('../services/joinRequestService');

module.exports = {
  // E15 · POST /groups/:groupId/join-requests
  create: asyncHandler(async (req, res) =>
    res.status(201).json(await service.createJoinRequest(req.params.groupId, req.body, req.actorId)),
  ),

  // E16 · GET /groups/:groupId/join-requests
  listForGroup: asyncHandler(async (req, res) =>
    res.json(await service.listGroupRequests(req.params.groupId, req.actorId, req.query)),
  ),

  // E17 · GET /me/join-requests
  listMine: asyncHandler(async (req, res) => res.json(await service.listMyRequests(req.actorId, req.query))),

  // E18 · POST /join-requests/:requestId/approve
  approve: asyncHandler(async (req, res) =>
    res.json(await service.approveRequest(req.params.requestId, req.actorId)),
  ),

  // E19 · POST /join-requests/:requestId/reject
  reject: asyncHandler(async (req, res) =>
    res.json(await service.rejectRequest(req.params.requestId, req.actorId)),
  ),

  // E20 · POST /join-requests/:requestId/withdraw
  withdraw: asyncHandler(async (req, res) =>
    res.json(await service.withdrawRequest(req.params.requestId, req.actorId)),
  ),
};
