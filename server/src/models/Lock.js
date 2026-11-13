const mongoose = require('mongoose');

// Short-lived mutexes, e.g. { _id: 'membership:T-1001' } while that traveller is being approved
// into a group. The unique _id makes acquiring atomic; expiresAt lets a crashed holder's lock be
// taken over (and the TTL index removes old ones in the background).
const lockSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    token: { type: String, required: true }, // only the holder can release it
    expiresAt: { type: Date, required: true },
  },
  { strict: 'throw', versionKey: false },
);
lockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Lock', lockSchema, 'locks');
