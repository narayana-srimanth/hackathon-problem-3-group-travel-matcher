const express = require('express');
const path = require('path');
const env = require('./config/env');
const requestId = require('./middleware/requestId');
const requireJson = require('./middleware/requireJson');
const { errorHandler, notFoundRoute } = require('./middleware/errorHandler');
const healthRoutes = require('./routes/health');

// routers: extra routers mounted under /api/v1 (feature routers are added here phase by phase;
// tests can pass their own).
function createApp({ routers = [] } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false); // API responses are live data

  app.use(requestId);
  app.use(requireJson);
  app.use(express.json({ limit: '100kb' }));

  // Hotel photos from the data pack (Hotel.image is already /static/hotels/<file>.jpg)
  app.use('/static/hotels', express.static(path.join(env.IMAGES_DIR, 'hotels'), { fallthrough: false }));

  const api = express.Router();
  api.use(healthRoutes);
  for (const router of routers) api.use(router);
  api.use(notFoundRoute);
  app.use('/api/v1', api);

  app.use(notFoundRoute); // anything outside /api/v1 and /static
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
