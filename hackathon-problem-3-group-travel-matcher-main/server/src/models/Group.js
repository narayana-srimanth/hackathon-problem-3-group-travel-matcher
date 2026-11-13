const mongoose = require('mongoose');
const { USER_DATA, GROUP_STATUSES } = require('./options');

const groupSchema = new mongoose.Schema(
  {
    groupId: { type: String, required: true }, // G-01 seeded, G-1001+ new
    name: { type: String, required: true, trim: true },
    ownerId: { type: String, required: true },
    // Owner included. Append-only, so array order is join order.
    memberIds: { type: [String], required: true },
    city: { type: String, required: true },
    checkIn: { type: String, required: true }, // YYYY-MM-DD, destination local date
    checkOut: { type: String, required: true },
    maxSize: { type: Number, required: true, min: 1 }, // total people, owner included
    budgetInr: { type: Number, required: true },
    itinerary: { type: String, default: '' },
    // FULL exactly when memberIds.length === maxSize (unless BOOKED); written atomically with memberIds
    status: { type: String, enum: GROUP_STATUSES, default: 'OPEN' },
  },
  USER_DATA,
);
groupSchema.index({ groupId: 1 }, { unique: true });
groupSchema.index({ city: 1, status: 1, checkIn: 1 }); // match search
groupSchema.index({ memberIds: 1 }); // "my groups"
groupSchema.index({ ownerId: 1 });

module.exports = mongoose.model('Group', groupSchema, 'groups');
