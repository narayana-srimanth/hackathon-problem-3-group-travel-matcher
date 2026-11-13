const express = require('express');
const path = require('path');
const env = require('./config/env');
const { requestId } = require('./middleware/requestId');
const { errorHandler, notFoundRoute } = require('./middleware/errorHandler');
const apiRoutes = require('./routes');

// `mount(api)` lets tests attach extra routes to /api/v1 on the real middleware stack.
function createApp({ mount } = {}) {
  const app = express();
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(express.json({ limit: '100kb' }));

  // Hotel photos from the data pack (Hotel.image is already /static/hotels/<file>.jpg)
  app.use('/static/hotels', express.static(path.join(env.IMAGES_DIR, 'hotels'), { fallthrough: false }));
  // City photos (City.image from E03 is already /static/cities/<slug>.jpg)
  app.use('/static/cities', express.static(env.CITY_IMAGES_DIR, { fallthrough: false }));

  const api = express.Router();
  api.use(apiRoutes);
  if (mount) mount(api);
  app.use('/api/v1', api);

  app.use(notFoundRoute);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
