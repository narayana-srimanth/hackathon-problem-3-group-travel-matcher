const crypto = require('crypto');
const env = require('../config/env');

// Gives every request an id (req_8f2c1a), returns it as X-Request-Id and logs one line per request.
function requestId(req, res, next) {
  req.id = `req_${crypto.randomBytes(3).toString('hex')}`;
  res.setHeader('X-Request-Id', req.id);
  if (env.NODE_ENV !== 'test') {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      console.log(`${req.id} ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
    });
  }
  next();
}

module.exports = requestId;
