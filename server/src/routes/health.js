const express = require('express');
const { isDbUp } = require('../db/connect');

const router = express.Router();

// E01 · GET /health
router.get('/health', async (_req, res, next) => {
  try {
    const time = new Date().toISOString();
    if (await isDbUp()) return res.status(200).json({ status: 'ok', db: 'up', time });
    return res.status(503).json({ status: 'degraded', db: 'down', time });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
