const mongoose = require('mongoose');

// { _id: 'traveller' | 'group' | 'search' | 'joinRequest' | 'option' | 'booking', seq }
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { strict: 'throw', versionKey: false },
);

module.exports = mongoose.model('Counter', counterSchema, 'counters');
