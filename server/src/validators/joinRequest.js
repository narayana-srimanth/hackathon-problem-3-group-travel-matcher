const { z } = require('zod');
const { strictBody, pageQuery } = require('./common');
const { REQUEST_STATUSES } = require('../models/options');

// E15 · POST /groups/:groupId/join-requests
const createJoinRequestBody = strictBody({
  searchId: z.string().trim().min(1), // an unknown or malformed id is a 404, like every other id
  message: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((m) => (m ? m : null)), // '' and missing both mean "no message"
});

const statusFilter = (defaultStatus) => z.enum([...REQUEST_STATUSES, 'ALL']).default(defaultStatus);

// E16 · owner inbox: PENDING by default, ALL for history
const groupRequestsQuery = z.object({ status: statusFilter('PENDING'), ...pageQuery });

// E17 · "My requests": everything by default (plan D5)
const myRequestsQuery = z.object({ status: statusFilter('ALL'), ...pageQuery });

module.exports = { createJoinRequestBody, groupRequestsQuery, myRequestsQuery };
