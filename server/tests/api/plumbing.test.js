const express = require('express');
const request = require('supertest');
const { z } = require('zod');
const { createApp } = require('../../src/app');
const asyncHandler = require('../../src/middleware/asyncHandler');
const identify = require('../../src/middleware/identify');
const { validate } = require('../../src/middleware/validate');
const { registerIdParams } = require('../../src/middleware/idParams');
const { paginationQuery, queryList } = require('../../src/validators/common');
const { conflict } = require('../../src/errors');
const Traveller = require('../../src/models/Traveller');

// A throwaway router that exercises each piece of plumbing
const router = registerIdParams(express.Router());
router.get('/t/groups/:groupId', (req, res) => res.json({ groupId: req.params.groupId }));
router.post(
  '/t/echo',
  validate({
    body: z
      .object({
        name: z.string().trim().min(2).max(60),
        gender: z.enum(['FEMALE', 'MALE']),
        maxSize: z.number().int().min(1).max(4),
        interests: z.array(z.string()).min(1),
      })
      .strict(),
  }),
  (req, res) => res.status(201).json(req.valid.body),
);
router.get(
  '/t/list',
  validate({ query: z.object({ ...paginationQuery, tag: queryList(z.enum(['A', 'B'])) }) }),
  (req, res) => res.json(req.valid.query),
);
router.get('/t/me', identify, (req, res) => res.json({ travellerId: req.actor.travellerId }));
router.get('/t/boom', () => {
  throw new Error('secret internals');
});
router.get(
  '/t/async-boom',
  asyncHandler(async () => {
    throw new Error('async internals');
  }),
);
router.get('/t/conflict', () => {
  throw conflict('GROUP_FULL', 'This group has no free place.', [{ field: 'groupId', issue: 'is full' }]);
});

const app = createApp({ routers: [router] });

const expectEnvelope = (res, status, code) => {
  expect(res.status).toBe(status);
  expect(res.body.error).toEqual(
    expect.objectContaining({ code, message: expect.any(String), details: expect.any(Array) }),
  );
  expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
};

describe('request id', () => {
  test('every response carries X-Request-Id', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-request-id']).toMatch(/^req_[0-9a-f]{6}$/);
  });
});

describe('error envelope', () => {
  test('unknown API route → 404 NOT_FOUND', async () => {
    const res = await request(app).get('/api/v1/nope');
    expectEnvelope(res, 404, 'NOT_FOUND');
  });

  test('unknown path outside the API → 404 NOT_FOUND', async () => {
    expectEnvelope(await request(app).get('/nope'), 404, 'NOT_FOUND');
  });

  test('missing static file → 404 NOT_FOUND', async () => {
    expectEnvelope(await request(app).get('/static/hotels/NOPE.jpg'), 404, 'NOT_FOUND');
  });

  test('AppError keeps its status, code and details', async () => {
    const res = await request(app).get('/api/v1/t/conflict');
    expectEnvelope(res, 409, 'GROUP_FULL');
    expect(res.body.error.details).toEqual([{ field: 'groupId', issue: 'is full' }]);
  });

  describe('unexpected errors', () => {
    let spy;
    beforeEach(() => {
      spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => spy.mockRestore());

    test.each(['/api/v1/t/boom', '/api/v1/t/async-boom'])(
      '%s → 500 INTERNAL without internals',
      async (url) => {
        const res = await request(app).get(url);
        expectEnvelope(res, 500, 'INTERNAL');
        expect(res.body.error.message).toContain(res.body.error.requestId);
        expect(JSON.stringify(res.body)).not.toMatch(/internals/);
        expect(spy).toHaveBeenCalled();
      },
    );
  });
});

describe('request body', () => {
  const good = { name: '  Priya Nair ', gender: 'FEMALE', maxSize: 3, interests: ['TEMPLES'] };

  test('valid body passes, strings trimmed', async () => {
    const res = await request(app).post('/api/v1/t/echo').send(good);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Priya Nair');
  });

  test('malformed JSON → 400', async () => {
    const res = await request(app)
      .post('/api/v1/t/echo')
      .set('Content-Type', 'application/json')
      .send('{"name":');
    expectEnvelope(res, 400, 'VALIDATION_ERROR');
  });

  test('a body that is not JSON → 400', async () => {
    const res = await request(app)
      .post('/api/v1/t/echo')
      .set('Content-Type', 'text/plain')
      .send('name=Priya');
    expectEnvelope(res, 400, 'VALIDATION_ERROR');
    expect(res.body.error.details[0].field).toBe('Content-Type');
  });

  test('unknown fields → 400, one detail per field', async () => {
    const res = await request(app)
      .post('/api/v1/t/echo')
      .send({ ...good, ownerId: 'T-002', price: 1 });
    expectEnvelope(res, 400, 'VALIDATION_ERROR');
    expect(res.body.error.details).toEqual([
      { field: 'ownerId', issue: 'is not an allowed field' },
      { field: 'price', issue: 'is not an allowed field' },
    ]);
  });

  test('missing, wrong type, bad enum, out of range → readable details', async () => {
    const res = await request(app)
      .post('/api/v1/t/echo')
      .send({ gender: 'OTHER', maxSize: 2.5, interests: [] });
    expectEnvelope(res, 400, 'VALIDATION_ERROR');
    expect(res.body.error.details).toEqual([
      { field: 'name', issue: 'is required' },
      { field: 'gender', issue: 'must be one of FEMALE, MALE' },
      { field: 'maxSize', issue: 'must be an integer' },
      { field: 'interests', issue: 'must have at least 1 items' },
    ]);
    expect(res.body.error.message).toBe('name is required (and 3 more)');
  });

  test('number bounds', async () => {
    const res = await request(app)
      .post('/api/v1/t/echo')
      .send({ ...good, maxSize: 5 });
    expect(res.body.error.details).toEqual([{ field: 'maxSize', issue: 'must be at most 4' }]);
    expect(res.body.error.message).toBe('maxSize must be at most 4');
  });
});

describe('query and pagination', () => {
  test('defaults to page 1, limit 20; unknown params ignored', async () => {
    const res = await request(app).get('/api/v1/t/list?foo=bar');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ page: 1, limit: 20, tag: [] });
  });

  test('numbers are parsed; a repeated param becomes a list', async () => {
    const res = await request(app).get('/api/v1/t/list?page=2&limit=50&tag=A&tag=B');
    expect(res.body).toEqual({ page: 2, limit: 50, tag: ['A', 'B'] });
  });

  test.each([
    ['page=0', 'page', 'must be at least 1'],
    ['limit=51', 'limit', 'must be at most 50'],
    ['limit=abc', 'limit', 'must be an integer'],
    ['limit=2.5', 'limit', 'must be an integer'],
    ['tag=C', 'tag.0', 'must be one of A, B'],
  ])('%s → 400', async (qs, field, issue) => {
    const res = await request(app).get(`/api/v1/t/list?${qs}`);
    expectEnvelope(res, 400, 'VALIDATION_ERROR');
    expect(res.body.error.details).toEqual([{ field, issue }]);
  });
});

describe('path IDs', () => {
  test('well-formed ID passes', async () => {
    const res = await request(app).get('/api/v1/t/groups/G-1001');
    expect(res.body).toEqual({ groupId: 'G-1001' });
  });

  test.each(['G-abc', 'g-01', 'T-001', 'G-'])('malformed %s → 404 NOT_FOUND', async (id) => {
    const res = await request(app).get(`/api/v1/t/groups/${id}`);
    expectEnvelope(res, 404, 'NOT_FOUND');
    expect(res.body.error.message).toBe(`Group ${id} not found.`);
  });
});

describe('identify (X-Traveller-Id)', () => {
  const sarah = { travellerId: 'T-001', name: 'Sarah Thomas' };
  let findOne;
  beforeEach(() => {
    findOne = jest.spyOn(Traveller, 'findOne').mockImplementation(({ travellerId }) => ({
      lean: async () => (travellerId === 'T-001' ? sarah : null),
    }));
  });
  afterEach(() => findOne.mockRestore());

  test('known traveller → actor attached', async () => {
    const res = await request(app).get('/api/v1/t/me').set('X-Traveller-Id', 'T-001');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ travellerId: 'T-001' });
  });

  test('missing header → 401', async () => {
    expectEnvelope(await request(app).get('/api/v1/t/me'), 401, 'UNAUTHENTICATED');
    expect(findOne).not.toHaveBeenCalled();
  });

  test('unknown traveller → 401', async () => {
    const res = await request(app).get('/api/v1/t/me').set('X-Traveller-Id', 'T-9999');
    expectEnvelope(res, 401, 'UNAUTHENTICATED');
  });

  test('malformed id → 401 without a DB lookup', async () => {
    const res = await request(app).get('/api/v1/t/me').set('X-Traveller-Id', '{"$ne":null}');
    expectEnvelope(res, 401, 'UNAUTHENTICATED');
    expect(findOne).not.toHaveBeenCalled();
  });
});
