const { useTestApp } = require('../helpers/testApp');

jest.setTimeout(30000);
const t = useTestApp('travellers');

const PRIYA = Object.freeze({
  name: 'Priya Nair',
  age: 26,
  gender: 'FEMALE',
  homeCity: 'Mumbai',
  interests: ['TEMPLES', 'STREET_FOOD', 'ADVENTURE'],
  genderPreference: 'SAME_GENDER',
});
const signUp = (body) => t.post('/api/v1/travellers', body);
const fieldsOf = (res) => res.body.error.details.map((d) => d.field);

describe('E04 POST /travellers (sign up)', () => {
  beforeAll(() => t.reset());

  test('201 with a generated id and the derived home airport', async () => {
    const res = await signUp(PRIYA);
    expect(res.status).toBe(201);
    expect(res.body.traveller).toEqual({
      travellerId: 'T-1001',
      name: 'Priya Nair',
      age: 26,
      gender: 'FEMALE',
      homeCity: 'Mumbai',
      homeAirport: 'BOM',
      interests: ['TEMPLES', 'STREET_FOOD', 'ADVENTURE'],
      genderPreference: 'SAME_GENDER',
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    });
  });

  test('the next sign-up gets the next id, and the profile persists (GET /me)', async () => {
    const res = await signUp({ ...PRIYA, name: 'Ravi Kumar', gender: 'MALE', homeCity: 'Delhi' });
    expect(res.body.traveller).toMatchObject({ travellerId: 'T-1002', homeAirport: 'DEL' });
    const me = await t.get('/api/v1/me', 'T-1002');
    expect(me.status).toBe(200);
    expect(me.body.traveller).toEqual(res.body.traveller);
  });

  test('age is optional (null), the name is trimmed, duplicate interests are removed', async () => {
    const { age: _age, ...noAge } = PRIYA;
    const res = await signUp({ ...noAge, name: '  Meera  ', interests: ['TEMPLES', 'TEMPLES', 'HIKING'] });
    expect(res.status).toBe(201);
    expect(res.body.traveller).toMatchObject({ age: null, name: 'Meera', interests: ['TEMPLES', 'HIKING'] });
  });

  test.each([
    ['name too short', { name: 'P' }, 'name'],
    ['name too long', { name: 'x'.repeat(61) }, 'name'],
    ['name only spaces', { name: '   ' }, 'name'],
    ['unknown gender', { gender: 'OTHER' }, 'gender'],
    ['unknown preference', { genderPreference: 'FEMALE_ONLY' }, 'genderPreference'],
    ['no interests', { interests: [] }, 'interests'],
    ['17 interests', { interests: Array.from({ length: 17 }, (_, i) => `I${i}`) }, 'interests'],
    ['age under 18', { age: 17 }, 'age'],
    ['age over 99', { age: 100 }, 'age'],
    ['age not whole', { age: 26.5 }, 'age'],
    ['age as text', { age: '26' }, 'age'],
  ])('400 VALIDATION_ERROR: %s', async (_name, change, field) => {
    const res = await signUp({ ...PRIYA, ...change });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(fieldsOf(res)).toContain(field);
  });

  test('400 for a missing required field', async () => {
    const { gender: _gender, ...noGender } = PRIYA;
    const res = await signUp(noGender);
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ field: 'gender', issue: 'is required' }]);
  });

  test('400 for an unknown field (no gender preference typos, no passwords)', async () => {
    const res = await signUp({ ...PRIYA, password: 'secret' });
    expect(res.status).toBe(400);
    expect(fieldsOf(res)).toEqual(['password']);
  });

  test('400 for a home city that is not a departure city', async () => {
    const res = await signUp({ ...PRIYA, homeCity: 'Pune' });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { field: 'homeCity', issue: "'Pune' is not one of Bengaluru, Delhi, Mumbai, Chennai" },
    ]);
  });

  test('400 naming each unknown interest', async () => {
    const res = await signUp({ ...PRIYA, interests: ['TEMPLES', 'SKYDIVING', 'KARAOKE'] });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { field: 'interests.1', issue: "'SKYDIVING' is not a known interest" },
      { field: 'interests.2', issue: "'KARAOKE' is not a known interest" },
    ]);
  });

  test('a rejected sign-up does not use up an id', async () => {
    await signUp({ ...PRIYA, homeCity: 'Pune' });
    const res = await signUp(PRIYA);
    expect(res.body.traveller.travellerId).toBe('T-1004');
  });
});

describe('E05 GET /travellers ("Continue as…")', () => {
  beforeAll(() => t.reset());

  test('the 24 seeded personas, sorted by id, 20 per page', async () => {
    const res = await t.get('/api/v1/travellers');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 20, total: 24 });
    expect(res.body.items).toHaveLength(20);
    expect(res.body.items[0]).toEqual({
      travellerId: 'T-001',
      name: 'Sarah Thomas',
      gender: 'FEMALE',
      homeCity: 'Bengaluru',
    });
  });

  test('pagination', async () => {
    const res = await t.get('/api/v1/travellers?page=2&limit=10');
    expect(res.body.items.map((x) => x.travellerId)).toEqual(
      Array.from({ length: 10 }, (_, i) => `T-0${11 + i}`),
    );
    expect(res.body).toMatchObject({ page: 2, limit: 10, total: 24 });
  });

  test('query is a case-insensitive name substring', async () => {
    const res = await t.get('/api/v1/travellers?query=SAR');
    expect(res.status).toBe(200);
    expect(res.body.items.map((x) => x.travellerId)).toContain('T-001');
    expect(res.body.items.every((x) => /sar/i.test(x.name))).toBe(true);
    expect(res.body.total).toBe(res.body.items.length);
  });

  test('regex characters in the query are matched literally', async () => {
    const res = await t.get(`/api/v1/travellers?query=${encodeURIComponent('.*(')}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  test('new sign-ups sort after the seed by number (T-024 < T-1001)', async () => {
    await signUp(PRIYA);
    const res = await t.get('/api/v1/travellers?page=2&limit=20');
    expect(res.body.items.map((x) => x.travellerId)).toEqual(['T-021', 'T-022', 'T-023', 'T-024', 'T-1001']);
  });

  test.each(['?page=0', '?limit=51', '?page=x'])('400 for %s', async (qs) => {
    const res = await t.get(`/api/v1/travellers${qs}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('E06 GET /travellers/:travellerId', () => {
  beforeAll(() => t.reset());

  test('a profile with the groups the traveller owns', async () => {
    const res = await t.get('/api/v1/travellers/T-001', 'T-002');
    expect(res.status).toBe(200);
    expect(res.body.traveller).toMatchObject({
      travellerId: 'T-001',
      name: 'Sarah Thomas',
      age: 27,
      homeAirport: 'BLR',
    });
    expect(res.body.groups).toEqual([
      {
        groupId: 'G-01',
        name: 'Kyoto Spring Temples',
        city: 'Kyoto',
        checkIn: '2027-04-10',
        checkOut: '2027-04-15',
        role: 'OWNER',
      },
    ]);
  });

  test('a non-owner member is listed as MEMBER', async () => {
    const g05 = t.pack.groups.find((g) => g.groupId === 'G-05');
    const member = g05.memberIds.find((id) => id !== g05.ownerId);
    const res = await t.get(`/api/v1/travellers/${member}`, 'T-001');
    expect(res.body.groups).toContainEqual(expect.objectContaining({ groupId: 'G-05', role: 'MEMBER' }));
  });

  test('a traveller in no group has an empty list', async () => {
    const created = await signUp(PRIYA);
    const res = await t.get(`/api/v1/travellers/${created.body.traveller.travellerId}`, 'T-001');
    expect(res.body.groups).toEqual([]);
  });

  test('401 without the identity header', async () => {
    const res = await t.get('/api/v1/travellers/T-001');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test.each(['T-999', 'T-abc'])('404 for unknown or malformed %s', async (id) => {
    const res = await t.get(`/api/v1/travellers/${id}`, 'T-001');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('E07 GET /me', () => {
  test('returns the caller', async () => {
    const res = await t.get('/api/v1/me', 'T-001');
    expect(res.status).toBe(200);
    expect(res.body.traveller).toMatchObject({ travellerId: 'T-001', name: 'Sarah Thomas' });
    expect(Object.keys(res.body.traveller).sort()).toEqual([
      'age',
      'createdAt',
      'gender',
      'genderPreference',
      'homeAirport',
      'homeCity',
      'interests',
      'name',
      'travellerId',
    ]);
  });

  test('401 without the header, and for an id that no longer exists (after a reset)', async () => {
    expect((await t.get('/api/v1/me')).status).toBe(401);
    expect((await t.get('/api/v1/me', 'T-5000')).body.error.code).toBe('UNAUTHENTICATED');
  });
});
