const { asyncHandler } = require('../middleware/asyncHandler');
const metaService = require('../services/metaService');

module.exports = {
  // E02
  interests: asyncHandler(async (_req, res) => res.json(await metaService.listInterests())),
  // E03
  destinations: asyncHandler(async (_req, res) => res.json(await metaService.getDestinations())),
};
