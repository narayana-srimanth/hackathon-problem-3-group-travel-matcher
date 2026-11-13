const { asyncHandler } = require('../middleware/asyncHandler');
const travellerService = require('../services/travellerService');
const { toTraveller } = require('../dto/traveller');

module.exports = {
  // E04 · POST /travellers
  signUp: asyncHandler(async (req, res) => res.status(201).json(await travellerService.signUp(req.body))),

  // E05 · GET /travellers
  list: asyncHandler(async (req, res) => res.json(await travellerService.listTravellers(req.query))),

  // E06 · GET /travellers/:travellerId
  profile: asyncHandler(async (req, res) =>
    res.json(await travellerService.getProfile(req.params.travellerId)),
  ),

  // E07 · GET /me — identify already loaded the actor
  me: (req, res) => res.json({ traveller: toTraveller(req.actor) }),
};
