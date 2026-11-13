const env = require('../config/env');
const { AppError, ERROR_CODES, badRequest, conflict, notFound, internal } = require('../errors');

// Turns anything thrown into an AppError.
function toAppError(err) {
  if (err instanceof AppError) return err;

  // body-parser (express.json)
  if (err.type === 'entity.parse.failed') {
    return badRequest('Request body is not valid JSON.', [{ field: 'body', issue: 'is not valid JSON' }]);
  }
  if (err.type === 'entity.too.large') {
    return badRequest('Request body is too large.', [{ field: 'body', issue: 'is larger than 100kb' }]);
  }

  // A Mongo duplicate key that no service turned into a specific code
  if (err.code === 11000) return conflict(ERROR_CODES.CONFLICT, 'This resource already exists.');

  // http-errors style (serve-static, body-parser charset/encoding errors)
  const status = err.status || err.statusCode;
  if (status === 404) return notFound();
  if (status >= 400 && status < 500) return badRequest(err.message || 'Bad request.');

  return internal();
}

// Express recognises an error handler by its 4-argument signature
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const appError = toAppError(err);
  if (appError.status >= 500 && env.NODE_ENV !== 'test') {
    console.error(`[${req.id}] ${req.method} ${req.originalUrl}`, err);
  }

  return res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      details: appError.details,
      requestId: req.id,
    },
  });
}

// Catch-all for unknown routes
function notFoundRoute(req, _res, next) {
  next(notFound(`No route for ${req.method} ${req.path}.`));
}

module.exports = { errorHandler, notFoundRoute, toAppError };
