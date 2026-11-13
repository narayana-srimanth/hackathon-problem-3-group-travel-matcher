const mongoose = require('mongoose');
const { USER_DATA, GENDERS, GENDER_PREFERENCES } = require('./options');

const travellerSchema = new mongoose.Schema(
  {
    travellerId: { type: String, required: true }, // T-001 seeded, T-1001+ new
    name: { type: String, required: true, trim: true },
    age: { type: Number, default: null },
    gender: { type: String, enum: GENDERS, required: true },
    homeCity: { type: String, required: true },
    homeAirport: { type: String, required: true }, // derived from homeCity
    interests: { type: [String], required: true },
    genderPreference: { type: String, enum: GENDER_PREFERENCES, required: true },
  },
  USER_DATA,
);
travellerSchema.index({ travellerId: 1 }, { unique: true });

module.exports = mongoose.model('Traveller', travellerSchema, 'travellers');
