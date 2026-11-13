const { asyncHandler } = require('../middleware/asyncHandler');
const searchService = require('../services/searchService');

module.exports = {
  // E11 · POST /searches
  create: asyncHandler(async (req, res) =>
    res.status(201).json(await searchService.createSearch(req.body, req.actor)),
  ),

  // E12 · GET /searches/:searchId
  get: asyncHandler(async (req, res) =>
    res.json(await searchService.getSearch(req.params.searchId, req.actorId)),
  ),

  // E13 · GET /searches/:searchId/matches
  matches: asyncHandler(async (req, res) =>
    res.json(await searchService.getMatches(req.params.searchId, req.actorId, req.query)),
  ),

  // E14 · GET /searches/:searchId/groups/:groupId/evaluation
  evaluation: asyncHandler(async (req, res) =>
    res.json(await searchService.getEvaluation(req.params.searchId, req.params.groupId, req.actorId)),
  ),
};
