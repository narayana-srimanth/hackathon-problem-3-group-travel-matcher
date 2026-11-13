const { isDbUp } = require('../db/connect');
const { asyncHandler } = require('../middleware/asyncHandler');
const { createRouter } = require('../middleware/params');

const router = createRouter();

// E01 · GET /health — the one non-2xx response that doesn't use the error envelope (spec §5)
router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const time = new Date().toISOString();
    if (await isDbUp()) return res.status(200).json({ status: 'ok', db: 'up', time });
    return res.status(503).json({ status: 'degraded', db: 'down', time });
  }),
);

module.exports = router;
