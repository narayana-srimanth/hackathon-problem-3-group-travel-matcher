const request = require('supertest');
const { z } = require('zod');
const { createApp } = require('../../src/app');
const { createRouter } = require('../../src/middleware/params');
const { validate } = require('../../src/middleware/validate');
const { makeIdentify } = require('../../src/middleware/identify');
const { asyncHandler } = require('../../src/middleware/asyncHandler');
const { strictBody, pageQuery } = require('../../src/validators/common');
const { slicePage } = require('../../src/utils/pagination');
const { forbidden, conflict } = require('../../src/errors');

const SARAH = { travellerId: 'T-001', name: 'Sarah Thomas' };
const findTraveller = jest.fn(async (id) => (id === 'T-001' ? SARAH : null));

// Probe routes mounted on the real middleware stack
const app = createApp({
  mount(api) {
    const r = createRouter();
    r.post(
      '/_probe/echo',
      validate({ body: strictBody({ name: z.string().trim().min(2), age: z.number().int().optional() }) }),
      (req, res) => res.status(201).json({ body: req.body }),
    );
    r.get('/_probe/list', validate({ query: z.object(pageQuery) }), (req, res) =>
      res.json(slicePage([1, 2, 3, 4, 5], req.query.page, req.query.limit)),
    );
    r.get('/_probe/groups/:groupId/options/:optionId', (req, res) => res.json(req.params));
    r.get('/_probe/me', makeIdentify(findTraveller), (req, res) => res.json({ actorId: req.actorId }));
    r.get('/_probe/forbidden', () => {
      throw forbidden();
    });
    r.get(
      '/_probe/conflict',
      asyncHandler(async () => {
        throw conflict('GROUP_FULL', 'This group is full.');
      }),
    );
    r.get(
      '/_probe/boom',
      asyncHandler(async () => {
        throw new Error('secret internals');
      }),
    );
    r.get(
      '/_probe/dupkey',
      asyncHandler(async () => {
        throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      }),
    );
    api.use(r);
  },
});

function expectEnvelope(res, status, code) {
  expect(res.status).toBe(status);
  expect(res.body.error).toMatchObject({ code });
  expect(typeof res.body.error.message).toBe('string');
  expect(Array.isArray(res.body.error.details)).toBe(true);
  expect(res.body.error.requestId).toMatch(/^req_[0-9a-f]{6}$/);
  expect(res.headers['x-request-id']).toBe(res.body.error.requestId);
}

describe('request id', () => {
  test('every response carries X-Request-Id', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-request-id']).toMatch(/^req_[0-9a-f]{6}$/);
  });

  test('ids differ between requests', async () => {
    const a = await request(app).get('/api/v1/health');
    const b = await request(app).get('/api/v1/health');
    expect(a.headers['x-request-id']).not.toBe(b.headers['x-request-id']);
  });
});

describe('error envelope', () => {
  test('unknown API route → 404 NOT_FOUND', async () => {
    expectEnvelope(await request(app).get('/api/v1/nope'), 404, 'NOT_FOUND');
  });

  test('unknown non-API route → 404 NOT_FOUND', async () => {
    expectEnvelope(await request(app).get('/whatever'), 404, 'NOT_FOUND');
  });

  test('missing hotel image → 404 NOT_FOUND', async () => {
    expectEnvelope(await request(app).get('/static/hotels/NOPE.jpg'), 404, 'NOT_FOUND');
  });

  test('missing city image → 404 NOT_FOUND', async () => {
    expectEnvelope(await request(app).get('/static/cities/nope.jpg'), 404, 'NOT_FOUND');
  });

  test('AppError thrown synchronously keeps its status and code', async () => {
    expectEnvelope(await request(app).get('/api/v1/_probe/forbidden'), 403, 'FORBIDDEN');
  });

  test('AppError from an async handler keeps its status and code', async () => {
    const res = await request(app).get('/api/v1/_probe/conflict');
    expectEnvelope(res, 409, 'GROUP_FULL');
    expect(res.body.error.message).toBe('This group is full.');
  });

  test('unexpected error → 500 INTERNAL without leaking the message', async () => {
    const res = await request(app).get('/api/v1/_probe/boom');
    expectEnvelope(res, 500, 'INTERNAL');
    expect(res.body.error.message).not.toContain('secret');
  });

  test('unhandled Mongo duplicate key → 409 CONFLICT', async () => {
    expectEnvelope(await request(app).get('/api/v1/_probe/dupkey'), 409, 'CONFLICT');
  });

  test('malformed JSON body → 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/_probe/echo')
      .set('Content-Type', 'application/json')
      .send('{"name": ');
    expectEnvelope(res, 400, 'VALIDATION_ERROR');
    expect(res.body.error.details).toEqual([{ field: 'body', issue: 'is not valid JSON' }]);
  });
});

describe('validate (body)', () => {
  const post = (body) => request(app).post('/api/v1/_probe/echo').send(body);

  test('valid body is parsed (trimmed) and passed on', async () => {
    const res = await post({ name: '  Priya ', age: 26 });
    expect(res.status).toBe(201);
    expect(res.body.body).toEqual({ name: 'Priya', age: 26 });
  });

  test('missing required field → 400 with field details', async () => {
    const res = await post({ age: 26 });
    expectEnvelope(res, 400, 'VALIDATION_ERROR');
    expect(res.body.error.details).toEqual([{ field: 'name', issue: 'is required' }]);
  });

  test('issues are worded in plain English', async () => {
    const issueOf = async (body, field) =>
      (await post(body)).body.error.details.find((d) => d.field === field).issue;
    expect(await issueOf({ name: 'P' }, 'name')).toBe('must be at least 2 characters');
    expect(await issueOf({ name: 'Priya', age: 'old' }, 'age')).toBe('must be a number');
    expect(await issueOf({ name: 'Priya', age: 26.5 }, 'age')).toBe('must be a whole number');
    expect(await issueOf({ name: 42 }, 'name')).toBe('must be text');
  });

  test('unknown field → 400 naming the field', async () => {
    const res = await post({ name: 'Priya', gender: 'FEMALE' });
    expectEnvelope(res, 400, 'VALIDATION_ERROR');
    expect(res.body.error.details).toEqual([{ field: 'gender', issue: 'is not an allowed field' }]);
  });

  test('several problems are all listed', async () => {
    const res = await post({ name: 'P', age: 'old', extra: 1 });
    expectEnvelope(res, 400, 'VALIDATION_ERROR');
    expect(res.body.error.details.map((d) => d.field).sort()).toEqual(['age', 'extra', 'name']);
    expect(res.body.error.message).toMatch(/and 2 more/);
  });

  test('a JSON array instead of an object → 400', async () => {
    expectEnvelope(await post([{ name: 'Priya' }]), 400, 'VALIDATION_ERROR');
  });

  test('no body at all → 400 (required fields missing)', async () => {
    expectEnvelope(await request(app).post('/api/v1/_probe/echo'), 400, 'VALIDATION_ERROR');
  });

  test('non-JSON Content-Type → 400', async () => {
    const res = await request(app)
      .post('/api/v1/_probe/echo')
      .set('Content-Type', 'text/plain')
      .send('name=Priya');
    expectEnvelope(res, 400, 'VALIDATION_ERROR');
    expect(res.body.error.details[0].field).toBe('Content-Type');
  });
});

describe('validate (query) + pagination', () => {
  const list = (qs) => request(app).get(`/api/v1/_probe/list${qs}`);

  test('defaults to page 1, limit 20', async () => {
    const res = await list('');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [1, 2, 3, 4, 5], page: 1, limit: 20, total: 5 });
  });

  test('coerces strings and slices', async () => {
    const res = await list('?page=2&limit=2');
    expect(res.body).toEqual({ items: [3, 4], page: 2, limit: 2, total: 5 });
  });

  test('a page past the end is empty, total unchanged', async () => {
    const res = await list('?page=9&limit=2');
    expect(res.body).toEqual({ items: [], page: 9, limit: 2, total: 5 });
  });

  test('unknown query params are ignored', async () => {
    expect((await list('?foo=bar')).status).toBe(200);
  });

  test.each([['?page=0'], ['?limit=51'], ['?limit=0'], ['?page=abc'], ['?limit=1.5'], ['?page=']])(
    '%s → 400 VALIDATION_ERROR',
    async (qs) => {
      expectEnvelope(await list(qs), 400, 'VALIDATION_ERROR');
    },
  );
});

describe('path-parameter guards', () => {
  test('well-formed ids pass through', async () => {
    const res = await request(app).get('/api/v1/_probe/groups/G-01/options/OPT-1001');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ groupId: 'G-01', optionId: 'OPT-1001' });
  });

  test.each([['/groups/G-abc/options/OPT-1'], ['/groups/G-01/options/OPT-'], ['/groups/g-01/options/OPT-1']])(
    'malformed id %s → 404 NOT_FOUND',
    async (path) => {
      expectEnvelope(await request(app).get(`/api/v1/_probe${path}`), 404, 'NOT_FOUND');
    },
  );
});

describe('identify', () => {
  const me = () => request(app).get('/api/v1/_probe/me');

  beforeEach(() => findTraveller.mockClear());

  test('known traveller → req.actor set', async () => {
    const res = await me().set('X-Traveller-Id', 'T-001');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ actorId: 'T-001' });
  });

  test('missing header → 401 UNAUTHENTICATED', async () => {
    expectEnvelope(await me(), 401, 'UNAUTHENTICATED');
  });

  test('unknown traveller → 401 UNAUTHENTICATED', async () => {
    expectEnvelope(await me().set('X-Traveller-Id', 'T-9999'), 401, 'UNAUTHENTICATED');
  });

  test('malformed id → 401 without a database lookup', async () => {
    expectEnvelope(await me().set('X-Traveller-Id', 'robert'), 401, 'UNAUTHENTICATED');
    expect(findTraveller).not.toHaveBeenCalled();
  });
});
