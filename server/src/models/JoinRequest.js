const mongoose = require('mongoose');
const { USER_DATA, REQUEST_STATUSES } = require('./options');

const matchSnapshotSchema = new mongoose.Schema(
  {
    sharedNights: { type: Number, required: true },
    sharedInterests: { type: [String], required: true },
    budgetDiffInr: { type: Number, required: true },
    score: { type: Number, required: true },
  },
  { _id: false, strict: 'throw' },
);

const joinRequestSchema = new mongoose.Schema(
  {
    requestId: { type: String, required: true }, // JR-1001+
    groupId: { type: String, required: true },
    seekerId: { type: String, required: true },
    searchId: { type: String, required: true },
    status: { type: String, enum: REQUEST_STATUSES, default: 'PENDING' },
    message: { type: String, default: null },
    matchSnapshot: { type: matchSnapshotSchema, required: true },
    decidedBy: { type: String, default: null },
    decidedAt: { type: Date, default: null },
  },
  USER_DATA,
);
joinRequestSchema.index({ requestId: 1 }, { unique: true });
joinRequestSchema.index({ groupId: 1, status: 1 }); // owner inbox and badge
joinRequestSchema.index({ seekerId: 1, createdAt: -1 }); // "my requests"
// The database itself blocks a second PENDING request for the same group and seeker
joinRequestSchema.index(
  { groupId: 1, seekerId: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' }, name: 'one_pending_per_seeker' },
);

module.exports = mongoose.model('JoinRequest', joinRequestSchema, 'joinRequests');
