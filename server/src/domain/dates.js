// Dates are 'YYYY-MM-DD' strings in the destination's local calendar. For arithmetic they become
// integer day numbers (days since 1970-01-01, computed in UTC), so no timezone can shift them.
// A stay is [checkIn, checkOut): its nights are checkIn … checkOut − 1.

const { DATA_WINDOW } = require('./constants');

const DAY_MS = 86400000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

const fromDay = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);

// Rejects impossible dates such as 2027-04-31 or 2027-02-29 (the round trip changes them)
const isValidIsoDate = (s) => typeof s === 'string' && ISO_DATE.test(s) && fromDay(toDay(s)) === s;

const addDays = (iso, n) => fromDay(toDay(iso) + n);

const nightCount = (stay) => toDay(stay.checkOut) - toDay(stay.checkIn);

const nightsOf = (stay) =>
  Array.from({ length: Math.max(0, nightCount(stay)) }, (_, i) => fromDay(toDay(stay.checkIn) + i));

// The shared part of two stays as [from, to) day numbers; to ≤ from when they don't overlap
function overlap(a, b) {
  return {
    from: Math.max(toDay(a.checkIn), toDay(b.checkIn)),
    to: Math.min(toDay(a.checkOut), toDay(b.checkOut)),
  };
}

const sharedNights = (a, b) => {
  const { from, to } = overlap(a, b);
  return Math.max(0, to - from);
};

// { sharedFrom, sharedTo } with sharedTo = the day after the last shared night; null if none
function sharedRange(a, b) {
  const { from, to } = overlap(a, b);
  return to > from ? { sharedFrom: fromDay(from), sharedTo: fromDay(to) } : null;
}

// The whole stay is inside the data window (checkOut may equal the window's last day)
const inDataWindow = (stay) => stay.checkIn >= DATA_WINDOW.from && stay.checkOut <= DATA_WINDOW.to;

module.exports = {
  toDay,
  fromDay,
  isValidIsoDate,
  addDays,
  nightCount,
  nightsOf,
  sharedNights,
  sharedRange,
  inDataWindow,
};
