// Review and RatingSummary (spec §4)
const { toIso } = require('../utils/text');

const NO_RATING = Object.freeze({ average: null, count: 0 });

const toReview = (r) => ({
  reviewId: r.reviewId,
  groupId: r.groupId,
  reviewerId: r.reviewerId,
  revieweeId: r.revieweeId,
  rating: r.rating,
  comment: r.comment || null,
  createdAt: toIso(r.createdAt),
});

// The trip a review is about, as shown next to it on a profile
const toReviewTrip = (g) => ({
  groupId: g.groupId,
  name: g.name,
  city: g.city,
  checkIn: g.checkIn,
  checkOut: g.checkOut,
});

module.exports = { NO_RATING, toReview, toReviewTrip };
