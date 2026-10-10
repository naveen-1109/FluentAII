import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { ZodError } from 'zod';
import { HttpError, authenticate, requireCustomHeader } from './auth.js';
import type { Config } from './config.js';
import type { DB } from './db.js';
import { TranscriptionQueue } from './jobs.js';
import { authRouter } from './routes/auth.js';
import { careRouter } from './routes/care.js';
import { profileRouter } from './routes/profile.js';
import { sessionsRouter } from './routes/sessions.js';
import type { SpeechClient } from './speechClient.js';

export interface Deps {
  db: DB;
  config: Config;
  speech: SpeechClient;
  queue: TranscriptionQueue;
}

export function createApp(base: Omit<Deps, 'queue'>) {
  const queue = new TranscriptionQueue(base.db, base.speech);
  queue.recoverInterrupted();
  const deps: Deps = { ...base, queue };
  const { db, config } = deps;

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          // recorded audio is previewed from a blob: URL before it is uploaded
          'media-src': ["'self'", 'blob:'],
        },
      },
    }),
  );
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/v1/health', async (_req, res) => {
    res.json({ ok: true, speechService: await base.speech.health() });
  });

  const api = express.Router();
  api.use(requireCustomHeader);
  api.use('/auth', authRouter(deps));
  api.use('/profile', authenticate(db, config.jwtSecret), profileRouter(deps));
  api.use('/sessions', authenticate(db, config.jwtSecret), sessionsRouter(deps));
  api.use('/', authenticate(db, config.jwtSecret), careRouter(deps));
  app.use('/api/v1', api);

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.')));

  // Optionally serve the built frontend (single-process deployment).
  const staticDir = process.env.FRONTEND_DIST
    ? path.resolve(process.env.FRONTEND_DIST)
    : path.resolve(process.cwd(), '../frontend/dist');
  if (config.env !== 'test' && fs.existsSync(path.join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return res.status(400).json({
        error: first?.message ?? 'Invalid input.',
        field: first?.path.join('.'),
      });
    }
    if (err instanceof multer.MulterError) {
      const msg =
        err.code === 'LIMIT_FILE_SIZE'
          ? `File is too large (limit ${Math.round(config.maxUploadBytes / 1048576)} MB).`
          : 'Upload failed.';
      return res.status(413).json({ error: msg });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
  });

  return { app, queue };
}
