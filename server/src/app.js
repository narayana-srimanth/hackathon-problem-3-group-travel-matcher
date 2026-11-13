const express = require('express');
const path = require('path');
const env = require('./config/env');
const healthRoutes = require('./routes/health');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // Hotel photos from the data pack (Hotel.image is already /static/hotels/<file>.jpg)
  app.use('/static/hotels', express.static(path.join(env.IMAGES_DIR, 'hotels'), { fallthrough: false }));

  const api = express.Router();
  api.use(healthRoutes);
  app.use('/api/v1', api);

  return app;
}

module.exports = { createApp };
