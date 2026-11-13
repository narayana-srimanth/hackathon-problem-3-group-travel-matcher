const { z } = require('zod');
const { strictBody } = require('./common');

// E27 / E28 — the option to quote or book; an unknown or malformed id is a 404
const bookingBody = strictBody({ optionId: z.string().trim().min(1) });

module.exports = { bookingBody };
