const { AppError, notFound } = require('../errors');

const envelope = (err, requestId) => ({
  error: { code: err.code, message: err.message, details: err.details || [], requestId },
});

// Unknown route under /api/v1
function notFoundRoute(req, _res, next) {
  next(notFound(`No endpoint ${req.method} ${req.originalUrl}.`));
}

// Maps every error to the standard envelope (API spec §3).
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  let appErr = err;

  if (!(err instanceof AppError)) {
    if (err.type === 'entity.parse.failed') {
      appErr = new AppError(400, 'VALIDATION_ERROR', 'The request body is not valid JSON.', [
        { field: 'body', issue: 'is not valid JSON' },
      ]);
    } else if (err.type === 'entity.too.large') {
      appErr = new AppError(400, 'VALIDATION_ERROR', 'The request body is too large.', [
        { field: 'body', issue: 'is too large' },
      ]);
    } else if (err.status === 404 || err.statusCode === 404) {
      appErr = notFound(`Nothing at ${req.originalUrl}.`); // e.g. a missing /static file
    } else {
      // Anything unexpected (including an unhandled duplicate key) is a bug: log it, hide the details.
      console.error(`${req.id} ${req.method} ${req.originalUrl} failed:`, err);
      appErr = new AppError(500, 'INTERNAL', `Something went wrong. Quote ${req.id} when reporting it.`);
    }
  }

  return res.status(appErr.status).json(envelope(appErr, req.id));
}

module.exports = { errorHandler, notFoundRoute };
