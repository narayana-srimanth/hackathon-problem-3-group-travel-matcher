const mongoose = require('mongoose');

const travellerSchema = new mongoose.Schema(
  {
    travellerId: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    age: { type: Number, default: null, min: 18, max: 99 },
    gender: { type: String, required: true, enum: ['FEMALE', 'MALE'] },
    homeCity: { type: String, required: true },
    homeAirport: { type: String, required: true },
    interests: { type: [String], required: true },
    genderPreference: { type: String, required: true, enum: ['ANY', 'SAME_GENDER'] },
  },
  { collection: 'travellers', timestamps: true, strict: 'throw' },
);

module.exports = mongoose.models.Traveller || mongoose.model('Traveller', travellerSchema);
