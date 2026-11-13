const { z } = require('zod');
const { strictBody, pageQuery } = require('./common');
const { REVIEW } = require('../domain/constants');

// E30 · POST /groups/:groupId/reviews
const reviewBody = strictBody({
  revieweeId: z.string().trim().regex(/^T-\d+$/, 'must be a traveller id such as T-001'),
  rating: z.number().int().min(REVIEW.RATING_MIN).max(REVIEW.RATING_MAX),
  comment: z.string().trim().max(REVIEW.COMMENT_MAX).optional(),
});

// E32 · GET /travellers/:travellerId/reviews
const reviewsQuery = z.object({ ...pageQuery });

module.exports = { reviewBody, reviewsQuery };
