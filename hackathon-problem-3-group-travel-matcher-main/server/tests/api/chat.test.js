const { useTestApp } = require('../helpers/testApp');
const { joinGroup, signUp, KYOTO_SEARCH } = require('../helpers/scenario');

jest.setTimeout(30000);
const t = useTestApp('chat');

const SARAH = 'T-001'; // owns G-01
const G01 = 'G-01';
const OUTSIDER = 'T-002';

const send = (body, as, groupId = G01) => t.post(`/api/v1/groups/${groupId}/messages`, { body }, as);
const list = (as, qs = '', groupId = G01) => t.get(`/api/v1/groups/${groupId}/messages${qs}`, as);
const bodies = (res) => res.body.items.map((m) => m.body);

let priya;
beforeAll(async () => {
  priya = await joinGroup(t, { groupId: G01, ownerId: SARAH, name: 'Priya Nair' });
});

describe('E33 POST /groups/:groupId/messages', () => {
  test('a member sends a message (trimmed) and gets it back with the sender', async () => {
    const res = await send('  Shall we do Fushimi Inari at sunrise on day 1?  ', SARAH);
    expect(res.status).toBe(201);
    expect(res.body.message).toEqual({
      messageId: expect.stringMatching(/^MSG-\d+$/),
      groupId: G01,
      sender: { travellerId: SARAH, name: 'Sarah Thomas' },
      body: 'Shall we do Fushimi Inari at sunrise on day 1?',
      createdAt: expect.any(String),
    });
  });

  test('approved members can send too; line breaks are kept', async () => {
    const res = await send('Yes!\nI can book the tea house for day 2.', priya);
    expect(res.status).toBe(201);
    expect(res.body.message.body).toBe('Yes!\nI can book the tea house for day 2.');
  });

  test.each([
    ['empty', ''],
    ['only spaces', '   '],
    ['too long', 'x'.repeat(2001)],
  ])('400 VALIDATION_ERROR: %s', async (_label, body) => {
    const res = await send(body, SARAH);
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('body');
  });

  test('unknown fields and missing body → 400', async () => {
    expect((await t.post(`/api/v1/groups/${G01}/messages`, { body: 'hi', pinned: true }, SARAH)).status).toBe(400);
    expect((await t.post(`/api/v1/groups/${G01}/messages`, {}, SARAH)).status).toBe(400);
  });

  test('members only: 403 outsider, 403 pending seeker, 404 unknown group, 401 no identity', async () => {
    expect((await send('hello', OUTSIDER)).status).toBe(403);

    // A seeker whose request is still pending is not a member yet
    const seeker = await signUp(t, 'Kavya Iyer');
    const searchId = (await t.post('/api/v1/searches', KYOTO_SEARCH, seeker)).body.search.searchId;
    expect((await t.post(`/api/v1/groups/${G01}/join-requests`, { searchId }, seeker)).status).toBe(201);
    expect((await send('can I see the chat?', seeker)).status).toBe(403);
    expect((await list(seeker)).status).toBe(403);

    expect((await send('hello', SARAH, 'G-9999')).status).toBe(404);
    expect((await send('hello')).status).toBe(401);
  });
});

describe('E34 GET /groups/:groupId/messages', () => {
  const ids = [];
  beforeAll(async () => {
    // 5 more, so the group has 7 messages in total
    for (let i = 1; i <= 5; i += 1) {
      const res = await send(`plan ${i}`, i % 2 ? SARAH : priya);
      ids.push(res.body.message.messageId);
    }
  });

  test('latest messages, oldest first, for every member', async () => {
    const res = await list(priya);
    expect(res.status).toBe(200);
    expect(res.body.hasMore).toBe(false);
    expect(bodies(res)).toEqual([
      'Shall we do Fushimi Inari at sunrise on day 1?',
      'Yes!\nI can book the tea house for day 2.',
      'plan 1',
      'plan 2',
      'plan 3',
      'plan 4',
      'plan 5',
    ]);
    expect(res.body.items[3].sender).toEqual({ travellerId: priya, name: 'Priya Nair' });
  });

  test('limit keeps the newest and says there is more', async () => {
    const res = await list(SARAH, '?limit=2');
    expect(bodies(res)).toEqual(['plan 4', 'plan 5']);
    expect(res.body.hasMore).toBe(true);
  });

  test('before= loads earlier messages (oldest first)', async () => {
    const res = await list(SARAH, `?before=${ids[3]}&limit=2`); // before "plan 4"
    expect(bodies(res)).toEqual(['plan 2', 'plan 3']);
    expect(res.body.hasMore).toBe(true);
    const first = await list(SARAH, `?before=${ids[0]}&limit=10`); // before "plan 1"
    expect(first.body.items).toHaveLength(2);
    expect(first.body.hasMore).toBe(false);
  });

  test('after= returns only newer messages (polling), oldest first', async () => {
    const res = await list(SARAH, `?after=${ids[2]}`); // after "plan 3"
    expect(bodies(res)).toEqual(['plan 4', 'plan 5']);
    expect(res.body.hasMore).toBe(false);
    expect((await list(SARAH, `?after=${ids[4]}`)).body.items).toEqual([]); // nothing new
    const capped = await list(SARAH, `?after=${ids[0]}&limit=2`);
    expect(bodies(capped)).toEqual(['plan 2', 'plan 3']);
    expect(capped.body.hasMore).toBe(true);
  });

  test("one group's messages never show in another group", async () => {
    const owner = (await t.get('/api/v1/groups/G-02', SARAH)).body.group.owner.travellerId;
    await send('G-02 only', owner, 'G-02');
    expect(bodies(await list(SARAH))).not.toContain('G-02 only');
    expect(bodies(await list(owner, '', 'G-02'))).toEqual(['G-02 only']);
  });

  test('400: bad cursor, both cursors, bad limit', async () => {
    expect((await list(SARAH, '?after=42')).status).toBe(400);
    expect((await list(SARAH, `?after=${ids[0]}&before=${ids[1]}`)).status).toBe(400);
    expect((await list(SARAH, '?limit=0')).status).toBe(400);
    expect((await list(SARAH, '?limit=101')).status).toBe(400);
  });

  test('outsiders → 403', async () => {
    expect((await list(OUTSIDER)).status).toBe(403);
  });
});
