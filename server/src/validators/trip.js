// City + dates, shared by group posts (E08) and searches (E11).
// Step 1 (here, 400 VALIDATION_ERROR): types, real dates, checkOut after checkIn.
// Step 2 (metaService.assertInDataRange, 422 OUT_OF_DATA_RANGE): city is one of the 5,
// dates inside the data window. All 400 checks run before any 422 check (plan D3).
const { z } = require('zod');
const { isValidIsoDate } = require('../domain/dates');

const isoDate = z.string().refine(isValidIsoDate, 'must be a real date in YYYY-MM-DD format');

const tripFields = {
  city: z.string().trim().min(1),
  checkIn: isoDate,
  checkOut: isoDate,
};

// Runs only when every field already has the right shape (zod skips refinements otherwise)
function checkOutAfterCheckIn(trip, ctx) {
  if (trip.checkOut <= trip.checkIn) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['checkOut'], message: 'must be after checkIn' });
  }
}

module.exports = { isoDate, tripFields, checkOutAfterCheckIn };
