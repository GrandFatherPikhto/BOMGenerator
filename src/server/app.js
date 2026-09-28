// Express application factory.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import cors from 'cors';
import express from 'express';

import boardsRouter from './routes/boards.js';
import categoriesRouter from './routes/categories.js';
import commonPurchasesRouter from './routes/commonPurchases.js';
import productsRouter from './routes/products.js';
import sellersRouter from './routes/sellers.js';
import settingsRouter from './routes/settings.js';
import uiStateRouter from './routes/uiState.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }
  let status = error.status || 500;
  let message = error.message || 'Internal Server Error';

  // Multer file-size / upload errors.
  if (error.code === 'LIMIT_FILE_SIZE') {
    status = 400;
    message = 'The uploaded file is too large (limit 20 MB)';
  }
  if (status >= 500) {
    console.error(error);
  }
  res.status(status).json({ error: message, details: error.details });
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/boards', boardsRouter);
  app.use('/api/sellers', sellersRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/common-purchases', commonPurchasesRouter);
  app.use('/api/ui-state', uiStateRouter);

  // Serve the built client in production.
  if (process.env.NODE_ENV === 'production') {
    const clientDir = path.resolve(here, '../../dist/client');
    app.use(express.static(clientDir));
    app.get(/^(?!\/api).*/, (req, res) => {
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
