// Express application factory.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import cors from 'cors';
import express from 'express';

import { requireAuth } from './lib/session.js';
import authRouter from './routes/auth.js';
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

/** Minimal security headers (kept dependency-free on purpose). */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
}

/**
 * CORS is needed only when the client is served from another origin. By default
 * the app is same-origin (Vite proxies /api in development, Express serves the
 * build in production), so cross-origin access has to be opted into explicitly
 * with `CORS_ORIGIN`.
 */
function corsMiddleware() {
  const origins = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 0 ? cors({ origin: origins, credentials: true }) : null;
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  const corsHandler = corsMiddleware();
  if (corsHandler) {
    app.use(corsHandler);
  }
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  // Open: sign in/out. Everything below it requires a session when auth is on.
  app.use('/api/auth', authRouter);

  app.use('/api/boards', requireAuth, boardsRouter);
  app.use('/api/sellers', requireAuth, sellersRouter);
  app.use('/api/products', requireAuth, productsRouter);
  app.use('/api/categories', requireAuth, categoriesRouter);
  app.use('/api/settings', requireAuth, settingsRouter);
  app.use('/api/common-purchases', requireAuth, commonPurchasesRouter);
  app.use('/api/ui-state', requireAuth, uiStateRouter);

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
