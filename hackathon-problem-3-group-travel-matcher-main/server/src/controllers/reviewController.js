// Co-traveller reviews (E30–E32)
const { asyncHandler } = require('../middleware/asyncHandler');
const reviews = require('../services/reviewService');

module.exports = {
  // E30 · POST /groups/:groupId/reviews
  create: asyncHandler(async (req, res) =>
    res.status(201).json(await reviews.createReview(req.params.groupId, req.actorId, req.body)),
  ),

  // E31 · GET /groups/:groupId/reviews
  groupStatus: asyncHandler(async (req, res) =>
    res.json(await reviews.groupReviewStatus(req.params.groupId, req.actorId)),
  ),

  // E32 · GET /travellers/:travellerId/reviews
  forTraveller: asyncHandler(async (req, res) =>
    res.json(await reviews.listForTraveller(req.params.travellerId, req.query)),
  ),
};
