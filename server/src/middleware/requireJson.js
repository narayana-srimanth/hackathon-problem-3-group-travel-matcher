const { validationError } = require('../errors');

// "Requests with a body must send Content-Type: application/json" (API spec §1).
function requireJson(req, _res, next) {
  const hasBody = Number(req.headers['content-length']) > 0 || req.headers['transfer-encoding'] !== undefined;
  if (hasBody && !req.is('application/json')) {
    return next(
      validationError('Send the request body as JSON with Content-Type: application/json.', [
        { field: 'Content-Type', issue: 'must be application/json' },
      ]),
    );
  }
  return next();
}

module.exports = requireJson;
