import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { HttpError } from './auth.js';
import type { Config } from './config.js';
import type { DB } from './db.js';
import { nowIso } from './db.js';
import { newId } from './util.js';

export interface AdminUser { id: string; email: string; fullName: string }

declare module 'express-serve-static-core' {
  interface Request {
    admin?: AdminUser;
  }
}

/** Separate cookie from the patient/clinician one, so the two sessions never mix. */
export const ADMIN_COOKIE = 'fluentai_admin';
const ADMIN_TTL_SEC = 12 * 3600;
const AUDIENCE = 'fluentai-admin';

export const signAdminToken = (secret: string, id: string) =>
  jwt.sign({ sub: id, role: 'admin' }, secret, { expiresIn: ADMIN_TTL_SEC, audience: AUDIENCE });

export const adminCookieOptions = (isProd: boolean) => ({
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: isProd,
  maxAge: ADMIN_TTL_SEC * 1000,
  path: '/',
});

export function authenticateAdmin(db: DB, secret: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = req.cookies?.[ADMIN_COOKIE] as string | undefined;
    if (!token) return next(new HttpError(401, 'Admin sign-in required.'));
    try {
      const p = jwt.verify(token, secret, { audience: AUDIENCE }) as { sub: string; role: string };
      if (p.role !== 'admin') throw new Error('not admin');
      const row = db.prepare('SELECT id, email, full_name FROM admins WHERE id = ?').get(p.sub) as
        | { id: string; email: string; full_name: string }
        | undefined;
      if (!row) return next(new HttpError(401, 'Admin account no longer exists.'));
      req.admin = { id: row.id, email: row.email, fullName: row.full_name };
      next();
    } catch {
      next(new HttpError(401, 'Admin session expired. Please sign in again.'));
    }
  };
}

/** Creates the admin from config, or updates its password/name if the config changed. */
export function ensureAdmin(db: DB, admin: Config['admin']) {
  if (!admin) return;
  const row = db.prepare('SELECT id, password_hash, full_name FROM admins WHERE email = ?').get(admin.email) as
    | { id: string; password_hash: string; full_name: string }
    | undefined;
  if (!row) {
    db.prepare('INSERT INTO admins (id, email, password_hash, full_name, created_at) VALUES (?,?,?,?,?)').run(
      newId(), admin.email, bcrypt.hashSync(admin.password, 11), admin.name, nowIso(),
    );
    return;
  }
  if (!bcrypt.compareSync(admin.password, row.password_hash))
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(admin.password, 11), row.id);
  if (row.full_name !== admin.name) db.prepare('UPDATE admins SET full_name = ? WHERE id = ?').run(admin.name, row.id);
}
