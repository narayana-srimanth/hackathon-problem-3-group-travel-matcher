const env = require('../../src/config/env');
const { useTestApp } = require('../helpers/testApp');
const { signUp, joinGroup, KYOTO_SEARCH } = require('../helpers/scenario');

jest.setTimeout(30000);
const t = useTestApp('reviews');

const SARAH = 'T-001'; // owns G-01: Kyoto, 10–15 Apr 2027
const G01 = 'G-01';
const OUTSIDER = 'T-002';
const NO_RATING = { average: null, count: 0 };

const review = (body, as, groupId = G01) => t.post(`/api/v1/groups/${groupId}/reviews`, body, as);
const status = (as, groupId = G01) => t.get(`/api/v1/groups/${groupId}/reviews`, as);
const profileReviews = (id, as = OUTSIDER, qs = '') => t.get(`/api/v1/travellers/${id}/reviews${qs}`, as);

// Pretend "today" is this date for the test (null = the real clock)
const setToday = (iso) => {
  env.TODAY = iso;
};

let priya; // approved into G-01
beforeAll(async () => {
  priya = await joinGroup(t, { groupId: G01, ownerId: SARAH, name: 'Priya Rao' });
});
afterEach(() => setToday(null));

describe('before the trip ends', () => {
  test('real clock (2026): reviews are closed', async () => {
    const res = await status(SARAH);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ groupId: G01, opensOn: '2027-04-15', open: false });
  });

  test('the day before check-out → 422 TRIP_NOT_ENDED', async () => {
    setToday('2027-04-14');
    const res = await review({ revieweeId: priya, rating: 5 }, SARAH);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('TRIP_NOT_ENDED');
    expect(res.body.error.message).toMatch(/15 April 2027/);
  });
});

describe('E30 POST /groups/:groupId/reviews (trip over)', () => {
  test('both members can rate each other from check-out day', async () => {
    setToday('2027-04-15');
    const res = await review({ revieweeId: priya, rating: 5, comment: '  Great company, always on time.  ' }, SARAH);
    expect(res.status).toBe(201);
    expect(res.body.review).toEqual({
      reviewId: expect.stringMatching(/^RV-\d+$/),
      groupId: G01,
      reviewerId: SARAH,
      revieweeId: priya,
      rating: 5,
      comment: 'Great company, always on time.',
      createdAt: expect.any(String),
    });

    const back = await review({ revieweeId: SARAH, rating: 4 }, priya);
    expect(back.status).toBe(201);
    expect(back.body.review.comment).toBeNull();
  });

  test('a second review of the same person for the same trip → 409 ALREADY_REVIEWED', async () => {
    setToday('2027-05-01');
    const res = await review({ revieweeId: priya, rating: 1 }, SARAH);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_REVIEWED');
  });

  test.each([
    ['yourself', () => ({ revieweeId: SARAH, rating: 5 }), 'revieweeId'],
    ['someone not on the trip', () => ({ revieweeId: OUTSIDER, rating: 5 }), 'revieweeId'],
    ['rating above 5', () => ({ revieweeId: priya, rating: 6 }), 'rating'],
    ['rating below 1', () => ({ revieweeId: priya, rating: 0 }), 'rating'],
    ['half stars', () => ({ revieweeId: priya, rating: 4.5 }), 'rating'],
    ['a long comment', () => ({ revieweeId: priya, rating: 4, comment: 'x'.repeat(501) }), 'comment'],
  ])('400 VALIDATION_ERROR: %s', async (_label, body, field) => {
    setToday('2027-04-20');
    const res = await review(body(), SARAH);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].field).toBe(field);
  });

  test('unknown body fields → 400', async () => {
    setToday('2027-04-20');
    const res = await review({ revieweeId: priya, rating: 4, stars: 4 }, SARAH);
    expect(res.status).toBe(400);
  });

  test('only members can review: 403 outsider, 404 unknown group, 401 no identity', async () => {
    setToday('2027-04-20');
    expect((await review({ revieweeId: priya, rating: 3 }, OUTSIDER)).status).toBe(403);
    expect((await review({ revieweeId: priya, rating: 3 }, SARAH, 'G-9999')).status).toBe(404);
    expect((await review({ revieweeId: priya, rating: 3 })).status).toBe(401);
  });
});

describe('E31 GET /groups/:groupId/reviews', () => {
  test("a member's own reviews of each co-traveller", async () => {
    setToday('2027-04-15');
    const res = await status(SARAH);
    expect(res.status).toBe(200);
    expect(res.body.open).toBe(true);
    expect(res.body.coTravellers).toHaveLength(1);
    expect(res.body.coTravellers[0].traveller).toMatchObject({
      travellerId: priya,
      name: 'Priya Rao',
      rating: { average: 5, count: 1 },
    });
    expect(res.body.coTravellers[0].myReview).toMatchObject({ rating: 5, reviewerId: SARAH });
  });

  test('outsiders → 403', async () => {
    expect((await status(OUTSIDER)).status).toBe(403);
  });
});

describe('E32 GET /travellers/:travellerId/reviews', () => {
  test('rating summary plus each review with its reviewer and trip, visible to anyone signed in', async () => {
    const res = await profileReviews(priya);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rating: { average: 5, count: 1 }, page: 1, total: 1 });
    expect(res.body.items[0]).toEqual({
      review: expect.objectContaining({ rating: 5, reviewerId: SARAH, revieweeId: priya }),
      reviewer: { travellerId: SARAH, name: 'Sarah Thomas', gender: 'FEMALE', homeCity: 'Bengaluru' },
      trip: { groupId: G01, name: 'Kyoto Spring Temples', city: 'Kyoto', checkIn: '2027-04-10', checkOut: '2027-04-15' },
    });
  });

  test('no reviews yet → empty page and no average', async () => {
    const res = await profileReviews(OUTSIDER, SARAH);
    expect(res.body).toMatchObject({ rating: NO_RATING, items: [], total: 0 });
  });

  test('the average is rounded to one decimal', async () => {
    // A third member joins, the trip ends, and they rate Sarah 5 → (4 + 5) / 2 = 4.5
    const meera = await joinGroup(t, { groupId: G01, ownerId: SARAH, name: 'Meera Nair' });
    setToday('2027-04-16');
    expect((await review({ revieweeId: SARAH, rating: 5 }, meera)).status).toBe(201);
    const res = await profileReviews(SARAH);
    expect(res.body.rating).toEqual({ average: 4.5, count: 2 });
    expect(res.body.items[0].review.reviewerId).toBe(meera); // newest first
  });

  test('404 unknown traveller, 400 bad paging, 401 no identity', async () => {
    expect((await profileReviews('T-9999')).status).toBe(404);
    expect((await profileReviews(SARAH, OUTSIDER, '?limit=0')).status).toBe(400);
    expect((await t.get(`/api/v1/travellers/${SARAH}/reviews`)).status).toBe(401);
  });
});

describe('ratings shown wherever people decide whom to travel with', () => {
  test('E06 profile', async () => {
    const res = await t.get(`/api/v1/travellers/${SARAH}`, OUTSIDER);
    expect(res.body.rating).toEqual({ average: 4.5, count: 2 });
  });

  test('E09 group: owner and every member', async () => {
    const g = (await t.get(`/api/v1/groups/${G01}`, OUTSIDER)).body.group;
    expect(g.owner.rating).toEqual({ average: 4.5, count: 2 });
    expect(g.members.find((m) => m.travellerId === priya).rating).toEqual({ average: 5, count: 1 });
    expect(g.members.every((m) => m.rating && typeof m.rating.count === 'number')).toBe(true);
  });

  test("E13 match cards: the host's rating", async () => {
    const seeker = await signUp(t, 'Anita Das');
    const res = await t.post('/api/v1/searches', { ...KYOTO_SEARCH, checkIn: '2027-04-10', checkOut: '2027-04-13' }, seeker);
    const cards = res.body.matches.items;
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.owner.rating && typeof c.owner.rating.count === 'number')).toBe(true);
    const g01 = cards.find((c) => c.groupId === G01);
    if (g01) expect(g01.owner.rating).toEqual({ average: 4.5, count: 2 });
  });

  test("E16 join requests: the seeker's rating, for the owner", async () => {
    const seeker = await signUp(t, 'Kavya Iyer');
    const searchId = (await t.post('/api/v1/searches', KYOTO_SEARCH, seeker)).body.search.searchId;
    await t.post('/api/v1/groups/G-08/join-requests', { searchId }, seeker);
    const owner = (await t.get('/api/v1/groups/G-08', seeker)).body.group.owner.travellerId;
    const res = await t.get('/api/v1/groups/G-08/join-requests', owner);
    const item = res.body.items.find((i) => i.request.seekerId === seeker);
    expect(item.seeker.rating).toEqual(NO_RATING);
  });
});
