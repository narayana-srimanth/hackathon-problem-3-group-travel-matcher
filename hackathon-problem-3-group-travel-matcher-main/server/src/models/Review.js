const mongoose = require('mongoose');
const { USER_DATA } = require('./options');
const { REVIEW } = require('../domain/constants');

// One traveller's rating of one co-traveller, for one trip they were both members of.
const reviewSchema = new mongoose.Schema(
  {
    reviewId: { type: String, required: true }, // RV-1001+
    groupId: { type: String, required: true },
    reviewerId: { type: String, required: true },
    revieweeId: { type: String, required: true },
    rating: { type: Number, required: true, min: REVIEW.RATING_MIN, max: REVIEW.RATING_MAX },
    comment: { type: String, default: '' },
  },
  USER_DATA,
);
reviewSchema.index({ reviewId: 1 }, { unique: true });
// The "once per co-traveller per trip" rule, enforced by the database (safe under concurrency)
reviewSchema.index({ groupId: 1, reviewerId: 1, revieweeId: 1 }, { unique: true });
reviewSchema.index({ revieweeId: 1, createdAt: -1 }); // a profile's reviews, newest first

module.exports = mongoose.model('Review', reviewSchema, 'reviews');
