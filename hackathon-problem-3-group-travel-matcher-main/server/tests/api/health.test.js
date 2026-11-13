const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../../src/app');
const { connectDB, disconnectDB } = require('../../src/db/connect');

const app = createApp();

describe('E01 GET /api/v1/health', () => {
  test('503 degraded when MongoDB is not connected', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', db: 'down' });
    expect(Number.isNaN(Date.parse(res.body.time))).toBe(false);
  });

  const uri = process.env.TEST_MONGO_URI;
  (uri ? describe : describe.skip)('with MongoDB (set TEST_MONGO_URI)', () => {
    beforeAll(() => connectDB(uri));
    afterAll(() => disconnectDB());

    test('200 ok when MongoDB answers', async () => {
      expect(mongoose.connection.readyState).toBe(1);
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'ok', db: 'up' });
    });
  });
});

describe('GET /static/hotels', () => {
  test('serves a hotel image from the data pack', async () => {
    const res = await request(app).get('/static/hotels/HOTEL-BUSINESS-1.jpg');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
  });
});

describe('GET /static/cities', () => {
  test.each(['tokyo', 'kyoto', 'osaka', 'dubai', 'abu-dhabi'])('serves the %s city photo', async (slug) => {
    const res = await request(app).get(`/static/cities/${slug}.jpg`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
  });
});
