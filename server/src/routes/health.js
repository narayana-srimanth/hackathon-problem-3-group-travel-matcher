const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { isDbUp } = require('../db/connect');

const router = express.Router();

// E01 · GET /health (its body is fixed by the spec, not the error envelope)
router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const time = new Date().toISOString();
    if (await isDbUp()) return res.status(200).json({ status: 'ok', db: 'up', time });
    return res.status(503).json({ status: 'degraded', db: 'down', time });
  }),
);

module.exports = router;
