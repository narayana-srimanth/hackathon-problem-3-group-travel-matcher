const { notFound } = require('../errors');

// Path IDs (API spec §2.1). A malformed ID is treated like an unknown one: 404.
const ID_PARAMS = {
  travellerId: { pattern: /^T-\d+$/, label: 'Traveller' },
  groupId: { pattern: /^G-\d+$/, label: 'Group' },
  searchId: { pattern: /^S-\d+$/, label: 'Search' },
  requestId: { pattern: /^JR-\d+$/, label: 'Join request' },
  optionId: { pattern: /^OPT-\d+$/, label: 'Saved option' },
};

const notFoundMessage = (param, value) => `${ID_PARAMS[param].label} ${value} not found.`;

// Registers a format check for every known :param on a router.
function registerIdParams(router) {
  for (const [param, { pattern }] of Object.entries(ID_PARAMS)) {
    router.param(param, (_req, _res, next, value) =>
      pattern.test(value) ? next() : next(notFound(notFoundMessage(param, value))),
    );
  }
  return router;
}

module.exports = { ID_PARAMS, registerIdParams, notFoundMessage };
