// "Today" as a calendar date (YYYY-MM-DD) in a destination's own timezone, so a trip in Tokyo
// ends on Tokyo's calendar. env.TODAY (if set) overrides the real date for local testing.
const env = require('../config/env');
const { isValidIsoDate } = require('./dates');

function todayIn(timezone, now = new Date()) {
  if (env.TODAY) {
    if (!isValidIsoDate(env.TODAY)) throw new Error(`TODAY must be a real YYYY-MM-DD date, got '${env.TODAY}'`);
    return env.TODAY;
  }
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

module.exports = { todayIn };
