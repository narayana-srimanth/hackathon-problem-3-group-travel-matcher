// Readable sequential ids from the `counters` collection. Each counter starts at 0 and the id
// number is `start + seq`, so new ids (T-1001, G-1001, …) never collide with seed ids (T-001, G-01)
// and the first booking is BK-2027-000001. One atomic $inc per id: safe under concurrency.

const Counter = require('../models/Counter');

const ID_KINDS = Object.freeze({
  traveller: { start: 1000, format: (n) => `T-${n}` },
  group: { start: 1000, format: (n) => `G-${n}` },
  search: { start: 1000, format: (n) => `S-${n}` },
  joinRequest: { start: 1000, format: (n) => `JR-${n}` },
  option: { start: 1000, format: (n) => `OPT-${n}` },
  // BK-<stay year>-<6-digit sequence>
  booking: {
    start: 0,
    format: (n, { year }) => {
      if (!year) throw new Error('nextId("booking") needs { year }');
      return `BK-${year}-${String(n).padStart(6, '0')}`;
    },
  },
});

async function nextId(kind, options = {}) {
  const spec = ID_KINDS[kind];
  if (!spec) throw new Error(`Unknown id kind '${kind}'`);
  const counter = await Counter.findOneAndUpdate(
    { _id: kind },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, lean: true },
  );
  return spec.format(spec.start + counter.seq, options);
}

module.exports = { ID_KINDS, nextId };
