const { z } = require('zod');
const { strictBody, pageQuery } = require('./common');
const { ROOM_TYPES } = require('../models/options');

// E21 · GET /groups/:groupId/hotels
const hotelsQuery = z.object({
  sort: z.enum(['perMember', 'rating', 'stars']).default('perMember'),
  minStars: z.coerce.number().int().min(1).max(5).optional(),
  minRating: z.coerce.number().min(0).max(10).optional(),
  maxPerMemberInr: z.coerce.number().min(0).optional(),
  roomType: z.enum(ROOM_TYPES).optional(),
  planFor: z.enum(['CURRENT', 'MAX']).default('CURRENT'),
  ...pageQuery,
});

// E22 · POST /groups/:groupId/saved-options — the server prices it; the client never sends a price
const saveOptionBody = strictBody({
  roomId: z
    .string()
    .trim()
    .regex(/^RM-[A-Z0-9]+(-[A-Z0-9]+)*$/, 'must look like RM-KYO-001-A'),
});

module.exports = { hotelsQuery, saveOptionBody };
