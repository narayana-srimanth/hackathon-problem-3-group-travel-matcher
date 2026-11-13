// Co-traveller reviews (trust): after a trip ends, each member can rate each other member once,
// 1–5 stars with an optional comment. Ratings are public to every signed-in traveller, so people
// can check a host or seeker before travelling with them.
//
// When: from the group's check-out date (destination local calendar) onwards.
// Who:  members of the same group (owner included); never yourself; pending/declined seekers never.
const { Review, Traveller, Group } = require('../models');
const { ID_COLLATION } = require('../models/options');
const { nextId } = require('../db/counters');
const { todayIn } = require('../domain/clock');
const { formatLongDate } = require('../domain/messages');
const { badRequest, conflict, notFound, unprocessable, ERROR_CODES } = require('../errors');
const { paginate, toPage } = require('../utils/pagination');
const { toTravellerSummary } = require('../dto/traveller');
const { toReview, toReviewTrip } = require('../dto/review');
const { ratingsFor, ratingOf } = require('./ratings');
const { findGroupForMember } = require('./groupService');
const { cityMap } = require('./metaService');

const unique = (list) => [...new Set(list)];

// → { opensOn, open }: reviews open on check-out day, in the destination's timezone
async function reviewWindow(group) {
  const city = (await cityMap([group.city])).get(group.city);
  const today = todayIn(city ? city.timezone : null);
  return { opensOn: group.checkOut, open: today >= group.checkOut };
}

// E30 — the actor rates one co-traveller of this (finished) trip
async function createReview(groupId, actorId, body) {
  const group = await findGroupForMember(groupId, actorId); // 404 unknown, 403 not a member
  if (body.revieweeId === actorId) {
    throw badRequest("revieweeId: you can't rate yourself", [
      { field: 'revieweeId', issue: "you can't rate yourself" },
    ]);
  }
  if (!group.memberIds.includes(body.revieweeId)) {
    throw badRequest(`revieweeId: '${body.revieweeId}' was not a member of this trip`, [
      { field: 'revieweeId', issue: 'was not a member of this trip' },
    ]);
  }
  const { opensOn, open } = await reviewWindow(group);
  if (!open) {
    throw unprocessable(
      ERROR_CODES.TRIP_NOT_ENDED,
      `You can rate your co-travellers from ${formatLongDate(opensOn)}, when this trip ends.`,
      [{ field: 'groupId', issue: `reviews open on ${opensOn}` }],
    );
  }

  try {
    const review = await Review.create({
      reviewId: await nextId('review'),
      groupId,
      reviewerId: actorId,
      revieweeId: body.revieweeId,
      rating: body.rating,
      comment: body.comment ?? '',
    });
    return { review: toReview(review.toObject()) };
  } catch (err) {
    if (err.code === 11000) {
      throw conflict(ERROR_CODES.ALREADY_REVIEWED, 'You have already rated this co-traveller for this trip.');
    }
    throw err;
  }
}

// E31 — for a member: is reviewing open, and their own review of each co-traveller (or null)
async function groupReviewStatus(groupId, actorId) {
  const group = await findGroupForMember(groupId, actorId);
  const others = group.memberIds.filter((id) => id !== actorId);
  const [{ opensOn, open }, people, mine, ratings] = await Promise.all([
    reviewWindow(group),
    Traveller.find({ travellerId: { $in: others } }, { _id: 0, travellerId: 1, name: 1, gender: 1, homeCity: 1 }).lean(),
    Review.find({ groupId, reviewerId: actorId }, { _id: 0 }).lean(),
    ratingsFor(others),
  ]);
  const personById = new Map(people.map((p) => [p.travellerId, p]));
  const mineByReviewee = new Map(mine.map((r) => [r.revieweeId, r]));
  return {
    groupId,
    opensOn,
    open,
    coTravellers: others
      .filter((id) => personById.has(id))
      .map((id) => ({
        traveller: { ...toTravellerSummary(personById.get(id)), rating: ratings.get(id) },
        myReview: mineByReviewee.has(id) ? toReview(mineByReviewee.get(id)) : null,
      })),
  };
}

// E32 — any signed-in traveller: a traveller's rating and the reviews about them, newest first
async function listForTraveller(travellerId, { page, limit }) {
  if (!(await Traveller.exists({ travellerId }))) throw notFound(`Unknown traveller '${travellerId}'.`);
  const filter = { revieweeId: travellerId };
  const { skip } = paginate({ page, limit });
  const [reviews, total, rating] = await Promise.all([
    Review.find(filter, { _id: 0 })
      .collation(ID_COLLATION)
      .sort({ createdAt: -1, reviewId: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments(filter),
    ratingOf(travellerId),
  ]);
  const [reviewers, groups] = await Promise.all([
    Traveller.find(
      { travellerId: { $in: unique(reviews.map((r) => r.reviewerId)) } },
      { _id: 0, travellerId: 1, name: 1, gender: 1, homeCity: 1 },
    ).lean(),
    Group.find(
      { groupId: { $in: unique(reviews.map((r) => r.groupId)) } },
      { _id: 0, groupId: 1, name: 1, city: 1, checkIn: 1, checkOut: 1 },
    ).lean(),
  ]);
  const reviewerById = new Map(reviewers.map((t) => [t.travellerId, t]));
  const groupById = new Map(groups.map((g) => [g.groupId, g]));
  const items = reviews.map((r) => ({
    review: toReview(r),
    reviewer: reviewerById.has(r.reviewerId) ? toTravellerSummary(reviewerById.get(r.reviewerId)) : null,
    trip: groupById.has(r.groupId) ? toReviewTrip(groupById.get(r.groupId)) : null,
  }));
  return { rating, ...toPage(items, page, limit, total) };
}

module.exports = { createReview, groupReviewStatus, listForTraveller };
