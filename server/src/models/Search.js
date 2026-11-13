const mongoose = require('mongoose');
const { USER_DATA, GENDERS, GENDER_PREFERENCES } = require('./options');

// A stored snapshot of one seeker search. The rules use the SEARCH's dates, budget and
// interests, not the profile's; join requests point back at the search they came from.
const searchSchema = new mongoose.Schema(
  {
    searchId: { type: String, required: true }, // S-1001+
    travellerId: { type: String, required: true },
    homeCity: { type: String, required: true },
    city: { type: String, required: true },
    checkIn: { type: String, required: true },
    checkOut: { type: String, required: true },
    interests: { type: [String], required: true },
    budgetInr: { type: Number, required: true },
    gender: { type: String, enum: GENDERS, required: true }, // copied from the profile
    genderPreference: { type: String, enum: GENDER_PREFERENCES, required: true },
  },
  USER_DATA,
);
searchSchema.index({ searchId: 1 }, { unique: true });
searchSchema.index({ travellerId: 1, createdAt: -1 });

module.exports = mongoose.model('Search', searchSchema, 'searches');
