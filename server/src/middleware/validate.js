const { validationError } = require('../errors');

const TYPE_NAMES = {
  string: 'a string',
  number: 'a number',
  integer: 'an integer',
  boolean: 'true or false',
  array: 'a list',
  object: 'an object',
};
const ZOD_DEFAULTS = new Set(['Invalid', 'Invalid input']);

const join = (path) => path.join('.');

// zod issue → { field, issue } with short, human wording
function toDetails(issue, prefix = []) {
  const path = [...prefix, ...issue.path];
  const field = join(path);
  const custom = !ZOD_DEFAULTS.has(issue.message) ? issue.message : null;
  switch (issue.code) {
    case 'unrecognized_keys':
      return issue.keys.map((k) => ({ field: join([...path, k]), issue: 'is not an allowed field' }));
    case 'invalid_type':
      if (issue.received === 'undefined') return [{ field, issue: 'is required' }];
      return [{ field, issue: `must be ${TYPE_NAMES[issue.expected] || issue.expected}` }];
    case 'invalid_enum_value':
      return [{ field, issue: `must be one of ${issue.options.join(', ')}` }];
    case 'too_small':
    case 'too_big': {
      const small = issue.code === 'too_small';
      const bound = small ? issue.minimum : issue.maximum;
      const word = small
        ? issue.inclusive
          ? 'at least'
          : 'more than'
        : issue.inclusive
          ? 'at most'
          : 'less than';
      if (issue.type === 'string') return [{ field, issue: `must be ${word} ${bound} characters` }];
      if (issue.type === 'array') return [{ field, issue: `must have ${word} ${bound} items` }];
      return [{ field, issue: `must be ${word} ${bound}` }];
    }
    case 'invalid_union':
      return [{ field, issue: 'has an invalid value' }];
    default:
      return [{ field, issue: custom || 'has an invalid value' }];
  }
}

function describe(details) {
  const [first] = details;
  const text = first.field ? `${first.field} ${first.issue}` : first.issue;
  return details.length > 1 ? `${text} (and ${details.length - 1} more)` : text;
}

// validate({ params, query, body }) with zod schemas. Parsed values go to req.valid.
// Body schemas should be .strict() (unknown fields → 400); query schemas strip unknown params.
function validate(schemas) {
  return (req, _res, next) => {
    const details = [];
    const valid = {};
    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part] ?? {});
      if (result.success) valid[part] = result.data;
      else for (const issue of result.error.issues) details.push(...toDetails(issue));
    }
    if (details.length) return next(validationError(describe(details), details));
    req.valid = valid;
    return next();
  };
}

module.exports = { validate, toDetails };
