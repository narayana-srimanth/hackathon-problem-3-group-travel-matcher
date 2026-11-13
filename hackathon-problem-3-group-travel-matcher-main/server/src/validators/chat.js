const { z } = require('zod');
const { strictBody } = require('./common');
const { CHAT } = require('../domain/constants');

const MESSAGE_ID = /^MSG-\d+$/;
const cursor = z.string().trim().regex(MESSAGE_ID, 'must be a message id such as MSG-1001');

// E33 · POST /groups/:groupId/messages
const messageBody = strictBody({
  body: z.string().trim().min(1).max(CHAT.BODY_MAX),
});

// E34 · GET /groups/:groupId/messages?after=|before=&limit=
//   neither  → the latest `limit` messages
//   after    → newer than that message (polling), oldest first
//   before   → older than that message ("load earlier"), oldest first
const messagesQuery = z
  .object({
    after: cursor.optional(),
    before: cursor.optional(),
    limit: z.coerce.number().int().min(1).max(CHAT.MAX_LIMIT).default(CHAT.DEFAULT_LIMIT),
  })
  .refine((q) => !(q.after && q.before), { path: ['after'], message: 'use after or before, not both' });

module.exports = { messageBody, messagesQuery };
