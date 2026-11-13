const Traveller = require('../models/Traveller');
const { unauthenticated } = require('../errors');

// Auth: traveller. Loads the actor from X-Traveller-Id; missing or unknown → 401 (API spec §1).
async function identify(req, _res, next) {
  try {
    const id = (req.get('X-Traveller-Id') || '').trim();
    if (!id) return next(unauthenticated());
    const actor = /^T-\d+$/.test(id) ? await Traveller.findOne({ travellerId: id }).lean() : null;
    if (!actor)
      return next(unauthenticated(`Traveller ${id} does not exist. Sign up or pick another traveller.`));
    req.actor = actor;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = identify;
