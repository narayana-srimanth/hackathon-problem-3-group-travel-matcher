// One error type for every expected failure. The error handler turns it into the
// standard envelope: { error: { code, message, details, requestId } } (API spec §3).
class AppError extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const validationError = (message, details = []) => new AppError(400, 'VALIDATION_ERROR', message, details);
const unauthenticated = (message = 'Send your traveller ID in the X-Traveller-Id header.') =>
  new AppError(401, 'UNAUTHENTICATED', message);
const forbidden = (message = 'You are not allowed to do this.') => new AppError(403, 'FORBIDDEN', message);
const notFound = (message = 'Not found.') => new AppError(404, 'NOT_FOUND', message);
const conflict = (code, message, details = []) => new AppError(409, code, message, details);
const unprocessable = (code, message, details = []) => new AppError(422, code, message, details);

module.exports = { AppError, validationError, unauthenticated, forbidden, notFound, conflict, unprocessable };
