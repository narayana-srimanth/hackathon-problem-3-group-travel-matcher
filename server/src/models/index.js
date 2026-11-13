const Traveller = require('./Traveller');
const Group = require('./Group');
const Search = require('./Search');
const JoinRequest = require('./JoinRequest');
const SavedOption = require('./SavedOption');
const Booking = require('./Booking');
const Counter = require('./Counter');
const Lock = require('./Lock');
const { City, DepartureCity, Interest, Hotel, Room, Availability } = require('./catalog');

// All 14 collections (reset drops exactly these)
const ALL_MODELS = [
  City,
  DepartureCity,
  Interest,
  Hotel,
  Room,
  Availability,
  Traveller,
  Group,
  Search,
  JoinRequest,
  SavedOption,
  Booking,
  Counter,
  Lock,
];

// Creates missing indexes and drops ones no longer in the schemas
async function syncAllIndexes() {
  for (const Model of ALL_MODELS) {
    await Model.syncIndexes();
  }
}

module.exports = {
  Traveller,
  Group,
  Search,
  JoinRequest,
  SavedOption,
  Booking,
  Counter,
  Lock,
  City,
  DepartureCity,
  Interest,
  Hotel,
  Room,
  Availability,
  ALL_MODELS,
  syncAllIndexes,
};
