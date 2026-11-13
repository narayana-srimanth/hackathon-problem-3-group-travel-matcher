// Shared schema options. strict: 'throw' rejects unknown fields instead of silently dropping them.
// Mongo's _id is never exposed: the DTO mappers return business keys only.

const CATALOG = Object.freeze({ strict: 'throw', versionKey: false });
const USER_DATA = Object.freeze({ strict: 'throw', versionKey: false, timestamps: true });

// Sort ids by their numbers: T-001 … T-024, then T-1001 … T-10000 (plain text order breaks at T-10000)
const ID_COLLATION = Object.freeze({ locale: 'en', numericOrdering: true });

const GENDERS = ['FEMALE', 'MALE'];
const GENDER_PREFERENCES = ['ANY', 'SAME_GENDER'];
const GROUP_STATUSES = ['OPEN', 'FULL', 'BOOKED'];
const REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'CLOSED'];
const ROOM_TYPES = ['SINGLE', 'TWIN', 'DOUBLE', 'TRIPLE', 'FAMILY', 'FAMILY_SUITE'];

module.exports = {
  CATALOG,
  USER_DATA,
  ID_COLLATION,
  GENDERS,
  GENDER_PREFERENCES,
  GROUP_STATUSES,
  REQUEST_STATUSES,
  ROOM_TYPES,
};
