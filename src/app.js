import cors from 'cors';
import express from 'express';
import { authenticate, requireAdmin, requireReadyUser } from './auth.js';
import { errorHandler, HttpError } from './errors.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { budgetRouter } from './routes/budget.js';
import { meRouter } from './routes/me.js';
import { proposalsRouter } from './routes/proposals.js';
import { secretSantaRouter } from './routes/secretSanta.js';

export function createApp({ db, config }) {
  const app = express();
  app.disable('x-powered-by');

  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '10kb' }));
  app.use(authenticate(db));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/auth', authRouter({ db, config }));
  app.use('/api/me', meRouter({ db, config }));
  app.use('/api/proposals', requireReadyUser, proposalsRouter({ db, config }));
  app.use('/api/budget', requireReadyUser, budgetRouter({ db }));
  app.use('/api/secret-santa', requireReadyUser, secretSantaRouter({ db }));
  app.use('/api/admin', requireReadyUser, requireAdmin, adminRouter({ db, config }));

  app.use(() => {
    throw new HttpError(404, 'Esta ruta no existe.');
  });
  app.use(errorHandler);

  return app;
}
