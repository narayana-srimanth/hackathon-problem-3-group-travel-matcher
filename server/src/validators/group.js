const { z } = require('zod');
const { strictBody } = require('./common');
const { tripFields, checkOutAfterCheckIn } = require('./trip');
const { GROUP_SIZE, BUDGET_RANGE } = require('../domain/constants');

// E08 · POST /groups — the owner comes from X-Traveller-Id, never from the body
const createGroupBody = strictBody({
  name: z.string().trim().min(3).max(80),
  ...tripFields,
  maxSize: z.number().int().min(GROUP_SIZE.MIN).max(GROUP_SIZE.MAX), // total people, owner included
  budgetInr: z.number().int().min(BUDGET_RANGE.MIN).max(BUDGET_RANGE.MAX), // approx. per person
  itinerary: z.string().max(2000).default(''),
}).superRefine(checkOutAfterCheckIn);

module.exports = { createGroupBody };
