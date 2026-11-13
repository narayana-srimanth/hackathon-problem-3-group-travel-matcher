const mongoose = require('mongoose');
const { USER_DATA } = require('./options');

const snapshotSchema = new mongoose.Schema(
  {
    memberCount: { type: Number, required: true },
    roomsNeeded: { type: Number, required: true },
    nights: { type: Number, required: true },
    pricePerNightInr: { type: Number, required: true },
    totalInr: { type: Number, required: true },
    perMemberInr: { type: Number, required: true },
  },
  { _id: false, strict: 'throw' },
);

const savedOptionSchema = new mongoose.Schema(
  {
    optionId: { type: String, required: true }, // OPT-1001+
    groupId: { type: String, required: true },
    hotelId: { type: String, required: true },
    roomId: { type: String, required: true },
    savedBy: { type: String, required: true },
    votes: { type: [String], default: [] }, // member ids
    snapshot: { type: snapshotSchema, required: true }, // price at save time; reads reprice live
  },
  USER_DATA,
);
savedOptionSchema.index({ optionId: 1 }, { unique: true });
savedOptionSchema.index({ groupId: 1, roomId: 1 }, { unique: true }); // the same room can't be saved twice

module.exports = mongoose.model('SavedOption', savedOptionSchema, 'savedOptions');
