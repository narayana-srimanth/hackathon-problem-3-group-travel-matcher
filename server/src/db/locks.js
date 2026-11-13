// withLock(key, fn): run fn while holding a database-wide mutex for `key`.
// Used to serialise approvals of the SAME traveller into different groups (the overlap check and
// the member add must not interleave). Different keys never wait for each other.
const crypto = require('crypto');
const Lock = require('../models/Lock');
const { conflict, ERROR_CODES } = require('../errors');

const LOCK_TTL_MS = 10000; // a crashed holder blocks this key for at most 10 s
const WAIT_STEP_MS = 25;
const MAX_WAIT_MS = 3000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function tryAcquire(key, token) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);
  try {
    await Lock.create({ _id: key, token, expiresAt });
    return true;
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
  // Held by someone else: take it over only if it has expired
  const takenOver = await Lock.findOneAndUpdate(
    { _id: key, expiresAt: { $lt: now } },
    { $set: { token, expiresAt } },
  ).lean();
  return Boolean(takenOver);
}

async function withLock(key, fn) {
  const token = crypto.randomBytes(8).toString('hex');
  const deadline = Date.now() + MAX_WAIT_MS;
  while (!(await tryAcquire(key, token))) {
    if (Date.now() > deadline) {
      throw conflict(
        ERROR_CODES.CONFLICT,
        'Another change for this traveller is in progress. Please try again.',
      );
    }
    await sleep(WAIT_STEP_MS);
  }
  try {
    return await fn();
  } finally {
    await Lock.deleteOne({ _id: key, token });
  }
}

module.exports = { withLock, LOCK_TTL_MS };
