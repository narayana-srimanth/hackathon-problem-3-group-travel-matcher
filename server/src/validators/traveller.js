const { z } = require('zod');
const { strictBody, pageQuery } = require('./common');
const { GENDERS, GENDER_PREFERENCES } = require('../models/options');

// Shared by sign-up and search: 1–16 interest ids, duplicates removed (first occurrence kept)
const interestList = z
  .array(z.string().trim().min(1))
  .min(1)
  .max(16)
  .transform((ids) => [...new Set(ids)]);

// E04 · POST /travellers
const signUpBody = strictBody({
  name: z.string().trim().min(2).max(60),
  gender: z.enum(GENDERS),
  homeCity: z.string().trim().min(1),
  interests: interestList,
  genderPreference: z.enum(GENDER_PREFERENCES),
  age: z.number().int().min(18).max(99).nullable().optional(),
});

// E05 · GET /travellers?query=&page=&limit=
const listTravellersQuery = z.object({
  query: z.string().trim().max(60).optional(),
  ...pageQuery,
});

module.exports = { interestList, signUpBody, listTravellersQuery };
