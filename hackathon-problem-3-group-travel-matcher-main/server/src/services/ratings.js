// Rating summaries ({ average, count }) from co-traveller reviews. Its own module (models only)
// so group, match, request and profile responses can all attach ratings without import cycles.
const { Review } = require('../models');
const { NO_RATING } = require('../dto/review');

const round1 = (n) => Math.round(n * 10) / 10;

// travellerIds → Map(id → { average, count }); travellers with no reviews get NO_RATING.
// One aggregate whatever the list length.
async function ratingsFor(travellerIds) {
  const ids = [...new Set(travellerIds.filter(Boolean))];
  const rows =
    ids.length === 0
      ? []
      : await Review.aggregate([
          { $match: { revieweeId: { $in: ids } } },
          { $group: { _id: '$revieweeId', average: { $avg: '$rating' }, count: { $sum: 1 } } },
        ]);
  const byId = new Map(rows.map((r) => [r._id, { average: round1(r.average), count: r.count }]));
  return new Map(ids.map((id) => [id, byId.get(id) || NO_RATING]));
}

async function ratingOf(travellerId) {
  return (await ratingsFor([travellerId])).get(travellerId);
}

module.exports = { ratingsFor, ratingOf };
