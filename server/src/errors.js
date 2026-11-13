// Every non-2xx response is built from an AppError (API spec §3).
// Services throw these; the errorHandler turns them into the standard envelope.

const ERROR_CODES = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  OWN_GROUP: 'OWN_GROUP',
  ALREADY_MEMBER: 'ALREADY_MEMBER',
  DUPLICATE_REQUEST: 'DUPLICATE_REQUEST',
  GROUP_FULL: 'GROUP_FULL',
  GROUP_CLOSED: 'GROUP_CLOSED',
  REQUEST_NOT_PENDING: 'REQUEST_NOT_PENDING',
  ALREADY_SAVED: 'ALREADY_SAVED',
  ALREADY_BOOKED: 'ALREADY_BOOKED',
  CONFLICT: 'CONFLICT', // fallback for a duplicate key no service handled
  OUT_OF_DATA_RANGE: 'OUT_OF_DATA_RANGE',
  NOT_ELIGIBLE: 'NOT_ELIGIBLE',
  ROOMS_UNAVAILABLE: 'ROOMS_UNAVAILABLE',
  INTERNAL: 'INTERNAL',
});

class AppError extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (message, details = []) =>
  new AppError(400, ERROR_CODES.VALIDATION_ERROR, message, details);

const unauthenticated = (message = 'Send a valid X-Traveller-Id header.') =>
  new AppError(401, ERROR_CODES.UNAUTHENTICATED, message);

const forbidden = (message = "You aren't allowed to do this.") =>
  new AppError(403, ERROR_CODES.FORBIDDEN, message);

const notFound = (message = 'Not found.') => new AppError(404, ERROR_CODES.NOT_FOUND, message);

const conflict = (code, message, details = []) => new AppError(409, code, message, details);

const unprocessable = (code, message, details = []) => new AppError(422, code, message, details);

const internal = (message = 'Something went wrong. Quote the requestId when you report it.') =>
  new AppError(500, ERROR_CODES.INTERNAL, message);

module.exports = {
  ERROR_CODES,
  AppError,
  badRequest,
  unauthenticated,
  forbidden,
  notFound,
  conflict,
  unprocessable,
  internal,
};
