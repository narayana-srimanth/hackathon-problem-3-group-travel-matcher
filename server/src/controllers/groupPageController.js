// The Common Group Page (M6): hotels, saved options, votes. Members only.
const { asyncHandler } = require('../middleware/asyncHandler');
const hotelService = require('../services/hotelService');
const options = require('../services/savedOptionService');

module.exports = {
  // E21 · GET /groups/:groupId/hotels
  hotels: asyncHandler(async (req, res) =>
    res.json(await hotelService.searchHotels(req.params.groupId, req.actorId, req.query)),
  ),

  // E22 · POST /groups/:groupId/saved-options
  save: asyncHandler(async (req, res) =>
    res.status(201).json(await options.saveOption(req.params.groupId, req.actorId, req.body)),
  ),

  // E23 · GET /groups/:groupId/saved-options
  list: asyncHandler(async (req, res) =>
    res.json(await options.listOptions(req.params.groupId, req.actorId)),
  ),

  // E24 · DELETE /groups/:groupId/saved-options/:optionId
  remove: asyncHandler(async (req, res) =>
    res.json(await options.deleteOption(req.params.groupId, req.params.optionId, req.actorId)),
  ),

  // E25 · POST …/vote
  vote: asyncHandler(async (req, res) =>
    res.json(await options.addVote(req.params.groupId, req.params.optionId, req.actorId)),
  ),

  // E26 · DELETE …/vote
  unvote: asyncHandler(async (req, res) =>
    res.json(await options.removeVote(req.params.groupId, req.params.optionId, req.actorId)),
  ),
};
