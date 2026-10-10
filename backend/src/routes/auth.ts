import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import { z } from 'zod';
import {
  COOKIE_NAME,
  HttpError,
  authenticate,
  cookieOptions,
  hashPassword,
  signToken,
  verifyPassword,
  type Role,
} from '../auth.js';
import type { Deps } from '../app.js';
import { nowIso } from '../db.js';
import { newId } from '../util.js';

const signupSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.email().max(200),
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
  role: z.enum(['patient', 'clinician']),
  acceptTerms: z.literal(true, { error: 'You must accept the terms to continue.' }),
});
const loginSchema = z.object({ email: z.email(), password: z.string().min(1) });

// bcrypt hash of a random string, used to equalise timing for unknown emails
const DUMMY_HASH = '$2b$11$1x9m7Wm6c8cQ0y1kqJmZ0uQ9rOnT3m5s0kD4s2dZl3H7vO0o4m9Ke';

export function authRouter({ db, config }: Deps) {
  const r = Router();
  const isProd = config.env === 'production';
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.env === 'test' ? 1000 : 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
  });

  const publicUser = (id: string) => {
    const u = db
      .prepare('SELECT id, email, role, full_name, registered FROM users WHERE id = ?')
      .get(id) as { id: string; email: string; role: Role; full_name: string; registered: number };
    let verification: string | null = null;
    if (u.role === 'clinician') {
      const c = db
        .prepare('SELECT verification_status FROM clinician_profiles WHERE user_id = ?')
        .get(id) as { verification_status: string } | undefined;
      verification = c?.verification_status ?? null;
    }
    return {
      id: u.id,
      email: u.email,
      role: u.role,
      fullName: u.full_name,
      registered: !!u.registered,
      verification,
    };
  };

  r.post('/signup', limiter, async (req, res) => {
    const body = signupSchema.parse(req.body);
    const exists = db.prepare('SELECT 1 FROM users WHERE email = ?').get(body.email);
    if (exists) throw new HttpError(409, 'An account with this email already exists.');
    const id = newId();
    db.prepare(
      `INSERT INTO users (id, email, password_hash, role, full_name, registered, created_at)
       VALUES (?,?,?,?,?,0,?)`,
    ).run(id, body.email, await hashPassword(body.password), body.role, body.fullName, nowIso());
    res.cookie(COOKIE_NAME, signToken(config.jwtSecret, { id, role: body.role }), cookieOptions(isProd));
    res.status(201).json({ user: publicUser(id) });
  });

  r.post('/login', limiter, async (req, res) => {
    const body = loginSchema.parse(req.body);
    const row = db
      .prepare('SELECT id, role, password_hash FROM users WHERE email = ?')
      .get(body.email) as { id: string; role: Role; password_hash: string } | undefined;
    const ok = await verifyPassword(body.password, row?.password_hash ?? DUMMY_HASH);
    if (!row || !ok) throw new HttpError(401, 'Email or password is incorrect.');
    res.cookie(COOKIE_NAME, signToken(config.jwtSecret, row), cookieOptions(isProd));
    res.json({ user: publicUser(row.id) });
  });

  r.post('/logout', (_req, res) => {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  });

  const auth = authenticate(db, config.jwtSecret);

  r.get('/me', auth, (req, res) => {
    res.json({ user: publicUser(req.user!.id) });
  });

  // Permanent deletion of the account and all stored recordings (privacy right).
  r.delete('/me', auth, async (req, res) => {
    const { password } = z.object({ password: z.string().min(1) }).parse(req.body);
    const row = db
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(req.user!.id) as { password_hash: string };
    if (!(await verifyPassword(password, row.password_hash)))
      throw new HttpError(401, 'Password is incorrect.');
    const files = db
      .prepare('SELECT audio_path FROM sessions WHERE patient_id = ?')
      .all(req.user!.id) as { audio_path: string }[];
    for (const f of files) fs.rmSync(f.audio_path, { force: true });
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user!.id);
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  });

  return r;
}
