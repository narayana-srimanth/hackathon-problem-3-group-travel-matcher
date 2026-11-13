const mongoose = require('mongoose');
const { USER_DATA } = require('./options');

const bookingSchema = new mongoose.Schema(
  {
    bookingId: { type: String, required: true }, // BK-2027-000001
    groupId: { type: String, required: true },
    optionId: { type: String, required: true },
    hotelId: { type: String, required: true },
    roomId: { type: String, required: true },
    roomsBooked: { type: Number, required: true },
    nights: { type: [String], required: true }, // exactly the nights whose roomsLeft was reduced
    memberIds: { type: [String], required: true }, // snapshot at booking time
    totalInr: { type: Number, required: true },
    perMemberInr: { type: Number, required: true },
    status: { type: String, enum: ['CONFIRMED'], default: 'CONFIRMED' },
    bookedBy: { type: String, required: true },
  },
  USER_DATA,
);
bookingSchema.index({ bookingId: 1 }, { unique: true });
bookingSchema.index({ groupId: 1 }, { unique: true }); // one booking per group, the double-click guard

module.exports = mongoose.model('Booking', bookingSchema, 'bookings');
