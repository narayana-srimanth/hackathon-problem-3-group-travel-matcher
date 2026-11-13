const { asyncHandler } = require('../middleware/asyncHandler');
const bookingService = require('../services/bookingService');

module.exports = {
  // E27 · POST /groups/:groupId/booking/quote
  quote: asyncHandler(async (req, res) =>
    res.json(await bookingService.quote(req.params.groupId, req.actorId, req.body)),
  ),

  // E28 · POST /groups/:groupId/booking
  book: asyncHandler(async (req, res) =>
    res.status(201).json(await bookingService.book(req.params.groupId, req.actorId, req.body)),
  ),

  // E29 · GET /groups/:groupId/booking
  get: asyncHandler(async (req, res) =>
    res.json(await bookingService.getBooking(req.params.groupId, req.actorId)),
  ),
};
