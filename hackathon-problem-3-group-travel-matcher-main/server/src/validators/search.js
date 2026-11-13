const { z } = require('zod');
const { strictBody, pageQuery } = require('./common');
const { tripFields, checkOutAfterCheckIn } = require('./trip');
const { interestList } = require('./traveller');
const { BUDGET_RANGE, PAGE } = require('../domain/constants');
const { GENDER_PREFERENCES } = require('../models/options');

// E11 · POST /searches — `gender` is NOT accepted (strict → 400); it is copied from the profile
const createSearchBody = strictBody({
  homeCity: z.string().trim().min(1),
  ...tripFields,
  interests: interestList,
  budgetInr: z.number().int().min(BUDGET_RANGE.MIN).max(BUDGET_RANGE.MAX),
  genderPreference: z.enum(GENDER_PREFERENCES),
  limit: z.number().int().min(1).max(PAGE.MAX_LIMIT).default(PAGE.DEFAULT_LIMIT), // page size of the embedded results
}).superRefine(checkOutAfterCheckIn);

// ?sharedInterest=A&sharedInterest=B arrives as a string or an array
const repeatable = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (v === undefined ? [] : [...new Set([].concat(v))]));

// E13 · GET /searches/:searchId/matches — G1 filters, applied after the 6 rules
const matchesQuery = z.object({
  ...pageQuery,
  sharedInterest: repeatable,
  genderComposition: z.enum(['ALL_FEMALE', 'ALL_MALE', 'MIXED']).optional(),
});

module.exports = { createSearchBody, matchesQuery };
