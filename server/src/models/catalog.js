// Catalog collections imported from the data pack (read-only, except availability.roomsLeft).
const mongoose = require('mongoose');
const { CATALOG, ROOM_TYPES } = require('./options');

const { Schema } = mongoose;

const citySchema = new Schema(
  {
    name: { type: String, required: true },
    country: { type: String, required: true },
    countryCode: { type: String, required: true },
    timezone: { type: String, required: true },
    sortOrder: { type: Number, required: true }, // catalog order (Japan first)
  },
  CATALOG,
);
citySchema.index({ name: 1 }, { unique: true });

const departureCitySchema = new Schema(
  {
    city: { type: String, required: true },
    airport: { type: String, required: true },
    sortOrder: { type: Number, required: true },
  },
  CATALOG,
);
departureCitySchema.index({ city: 1 }, { unique: true });

const interestSchema = new Schema(
  {
    interest: { type: String, required: true },
    label: { type: String, required: true },
    category: { type: String, required: true },
    sortOrder: { type: Number, required: true }, // file order
  },
  CATALOG,
);
interestSchema.index({ interest: 1 }, { unique: true });

const hotelSchema = new Schema(
  {
    hotelId: { type: String, required: true },
    name: { type: String, required: true },
    aliases: { type: [String], default: [] },
    city: { type: String, required: true },
    area: { type: String, default: '' },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    rating: { type: Number, required: true },
    stars: { type: Number, required: true },
    checkInFrom: { type: String, default: null },
    checkOutUntil: { type: String, default: null },
    familyFriendly: { type: Boolean, default: false },
    image: { type: String, default: null }, // already the served path: /static/hotels/<file>.jpg
  },
  CATALOG,
);
hotelSchema.index({ hotelId: 1 }, { unique: true });
hotelSchema.index({ city: 1 });

const roomSchema = new Schema(
  {
    roomId: { type: String, required: true },
    hotelId: { type: String, required: true },
    roomType: { type: String, enum: ROOM_TYPES, required: true },
    name: { type: String, required: true },
    maxAdults: { type: Number, required: true, min: 1 },
    maxChildren: { type: Number, default: 0 },
    pricePerNightInr: { type: Number, required: true, min: 0 },
    refundable: { type: Boolean, default: false },
  },
  CATALOG,
);
roomSchema.index({ roomId: 1 }, { unique: true });
roomSchema.index({ hotelId: 1 });

const availabilitySchema = new Schema(
  {
    roomId: { type: String, required: true },
    date: { type: String, required: true }, // YYYY-MM-DD, one night
    roomsLeft: { type: Number, required: true, min: 0 }, // reduced by bookings
    initialRoomsLeft: { type: Number, required: true }, // the data pack's value, never changed
  },
  CATALOG,
);
// One row per room per night: the per-night booking update is a single index lookup
availabilitySchema.index({ roomId: 1, date: 1 }, { unique: true });

const City = mongoose.model('City', citySchema, 'cities');
const DepartureCity = mongoose.model('DepartureCity', departureCitySchema, 'departureCities');
const Interest = mongoose.model('Interest', interestSchema, 'interests');
const Hotel = mongoose.model('Hotel', hotelSchema, 'hotels');
const Room = mongoose.model('Room', roomSchema, 'rooms');
const Availability = mongoose.model('Availability', availabilitySchema, 'availability');

module.exports = { City, DepartureCity, Interest, Hotel, Room, Availability };
