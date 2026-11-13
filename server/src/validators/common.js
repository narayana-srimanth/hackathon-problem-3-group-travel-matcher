const { z } = require('zod');
const { PAGE } = require('../utils/pagination');

// Request bodies reject unknown fields (spec §1: strict schemas).
const strictBody = (shape) => z.object(shape).strict();

// ?page=1&limit=20 — query strings arrive as text, so coerce, then require whole numbers.
const pageQuery = {
  page: z.coerce.number().int().min(1).default(PAGE.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(PAGE.MAX_LIMIT).default(PAGE.DEFAULT_LIMIT),
};

module.exports = { strictBody, pageQuery };
