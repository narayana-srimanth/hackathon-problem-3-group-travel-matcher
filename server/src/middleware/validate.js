const { badRequest } = require('../errors');

// zod issues → API details: [{ field, issue }]
function zodIssuesToDetails(issues, source) {
  const details = [];
  for (const issue of issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        details.push({ field: [...issue.path, key].join('.'), issue: 'is not an allowed field' });
      }
    } else {
      details.push({ field: issue.path.join('.') || source, issue: issue.message });
    }
  }
  return details;
}

function summarise(details) {
  const first = `${details[0].field}: ${details[0].issue}`;
  return details.length === 1 ? first : `${first} (and ${details.length - 1} more)`;
}

function hasBody(req) {
  const length = req.headers['content-length'];
  return req.headers['transfer-encoding'] !== undefined || (length !== undefined && length !== '0');
}

// validate({ body, query }) — zod schemas. Bodies must be .strict() (unknown field → 400);
// queries are not strict (unknown query params are ignored, plan D6) and use coercion.
// On success the parsed values replace req.body / req.query.
function validate({ body, query } = {}) {
  return (req, _res, next) => {
    const details = [];

    if (body) {
      if (hasBody(req) && !req.is('application/json')) {
        return next(
          badRequest('Content-Type must be application/json.', [
            { field: 'Content-Type', issue: 'must be application/json' },
          ]),
        );
      }
      const result = body.safeParse(req.body ?? {});
      if (result.success) req.body = result.data;
      else details.push(...zodIssuesToDetails(result.error.issues, 'body'));
    }

    if (query) {
      const result = query.safeParse(req.query ?? {});
      if (result.success) req.query = result.data;
      else details.push(...zodIssuesToDetails(result.error.issues, 'query'));
    }

    if (details.length > 0) return next(badRequest(summarise(details), details));
    return next();
  };
}

module.exports = { validate, zodIssuesToDetails };
