const Traveller = require('../models/Traveller');
const { unauthenticated } = require('../errors');
const { ID_PATTERNS } = require('./params');

const findTravellerById = (travellerId) => Traveller.findOne({ travellerId }, { _id: 0 }).lean();

// Reads X-Traveller-Id, loads that traveller and sets req.actor / req.actorId.
// Missing header, malformed id or unknown traveller → 401 UNAUTHENTICATED (spec §1).
function makeIdentify(findTraveller = findTravellerById) {
  return async function identify(req, _res, next) {
    try {
      const travellerId = (req.get('X-Traveller-Id') || '').trim();
      if (!travellerId) return next(unauthenticated('Missing X-Traveller-Id header.'));

      const traveller = ID_PATTERNS.travellerId.test(travellerId) ? await findTraveller(travellerId) : null;
      if (!traveller) return next(unauthenticated(`Unknown traveller '${travellerId}'.`));

      req.actor = traveller;
      req.actorId = traveller.travellerId;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

const identify = makeIdentify();

module.exports = { identify, makeIdentify };
