const crypto = require('crypto');

// Gives every request an id (req_ + 6 hex chars). It goes in the X-Request-Id
// header, in every error envelope, and in the server log for 5xx errors.
function requestId(req, res, next) {
  req.id = `req_${crypto.randomBytes(3).toString('hex')}`;
  res.set('X-Request-Id', req.id);
  next();
}

module.exports = { requestId };
