import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express, { type Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import type { AppConfig } from './config/env';
import type { Db } from './db/types';
import { requireAuth, type TokenVerifier } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { meRouter } from './routes/me';
import { buildOpenApiDocument } from './routes/openapi';
import { organizationsRouter } from './routes/organizations';
import { workRouter } from './routes/work';
import { dispatchRouter } from './routes/dispatch';
import { notificationsRouter } from './routes/notifications';

export interface AppDeps {
  db: Db;
  config: AppConfig;
  logger: Logger;
  verifyToken: TokenVerifier;
}

const REQUEST_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

export function createApp(deps: AppDeps): Express {
  const { config, logger, db } = deps;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY ? 1 : false);

  app.use((req, res, next) => {
    const incoming = req.header('x-request-id');
    req.id = incoming && REQUEST_ID_RE.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-request-id', req.id);
    next();
  });
  app.use(pinoHttp({ logger, genReqId: (req) => (req as express.Request).id, autoLogging: config.NODE_ENV !== 'test' }));
  app.use(helmet());
  app.use(
    cors({
      // Native mobile clients send no Origin header; browsers are limited to the allow-list.
      origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id', 'Idempotency-Key'],
      exposedHeaders: ['X-Request-Id'],
    }),
  );
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/ready', async (_req, res) => {
    try {
      await db.ping();
      res.json({ status: 'ready', checks: { database: 'ok' } });
    } catch (err) {
      logger.warn({ err }, 'readiness check failed');
      res.status(503).json({ status: 'not_ready', checks: { database: 'error' } });
    }
  });
  app.get('/api/v1/openapi.json', (_req, res) => {
    res.json(buildOpenApiDocument());
  });

  const v1 = express.Router();
  v1.use(
    rateLimit({
      windowMs: 60_000,
      limit: config.RATE_LIMIT_PER_MINUTE,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (req, res) => {
        res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests', requestId: req.id } });
      },
    }),
  );
  v1.use(requireAuth(deps.verifyToken));
  v1.use(meRouter(deps));
  v1.use(organizationsRouter(deps));
  v1.use(workRouter(deps));
  v1.use(dispatchRouter(deps));
  v1.use(notificationsRouter(deps));
  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
