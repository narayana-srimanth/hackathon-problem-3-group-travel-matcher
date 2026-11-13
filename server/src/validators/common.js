const { z } = require('zod');
const { PAGE } = require('../domain/constants');

// Query strings arrive as text: accept digits only, then range-check the number.
const queryInt = ({ min, max, def }) =>
  z
    .string()
    .regex(/^-?\d+$/, 'must be an integer')
    .optional()
    .transform((v) => (v === undefined ? def : Number(v)))
    .pipe(
      def === undefined ? z.number().int().min(min).max(max).optional() : z.number().int().min(min).max(max),
    );

// A query param that may be repeated (?x=A&x=B) or given once; always returns an array.
const queryList = (item) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v === undefined ? [] : [].concat(v)))
    .pipe(z.array(item));

const paginationQuery = {
  page: queryInt({ min: 1, max: 1000000, def: 1 }),
  limit: queryInt({ min: 1, max: PAGE.max, def: PAGE.default }),
};

module.exports = { queryInt, queryList, paginationQuery };
