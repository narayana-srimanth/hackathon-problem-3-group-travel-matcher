const express = require('express');
const { notFound } = require('../errors');

// Path-parameter formats (API spec §2.1). A malformed id is treated like an unknown one: 404.
const ID_PATTERNS = Object.freeze({
  travellerId: /^T-\d+$/,
  groupId: /^G-\d+$/,
  searchId: /^S-\d+$/,
  requestId: /^JR-\d+$/,
  optionId: /^OPT-\d+$/,
});

const LABELS = {
  travellerId: 'traveller',
  groupId: 'group',
  searchId: 'search',
  requestId: 'join request',
  optionId: 'saved option',
};

function registerIdParams(router) {
  for (const [name, pattern] of Object.entries(ID_PATTERNS)) {
    router.param(name, (_req, _res, next, value) =>
      pattern.test(value) ? next() : next(notFound(`Unknown ${LABELS[name]} '${value}'.`)),
    );
  }
  return router;
}

// Every route file uses this, so the id guards run before any handler.
const createRouter = () => registerIdParams(express.Router());

module.exports = { ID_PATTERNS, registerIdParams, createRouter };
