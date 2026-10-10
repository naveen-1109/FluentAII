import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import type { DB } from './db.js';

export type Role = 'patient' | 'clinician';
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  fullName: string;
  registered: boolean;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export const COOKIE_NAME = 'fluentai_token';
const TOKEN_TTL_SEC = 7 * 24 * 3600;

export const hashPassword = (pw: string) => bcrypt.hash(pw, 11);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export function signToken(secret: string, user: { id: string; role: Role }): string {
  return jwt.sign({ sub: user.id, role: user.role }, secret, { expiresIn: TOKEN_TTL_SEC });
}

export function cookieOptions(isProd: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProd,
    maxAge: TOKEN_TTL_SEC * 1000,
    path: '/',
  };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function authenticate(db: DB, secret: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const token =
      (req.cookies?.[COOKIE_NAME] as string | undefined) ??
      (header?.startsWith('Bearer ') ? header.slice(7) : undefined);
    if (!token) return next(new HttpError(401, 'Not signed in.'));
    try {
      const payload = jwt.verify(token, secret) as { sub: string };
      const row = db
        .prepare('SELECT id, email, role, full_name, registered FROM users WHERE id = ?')
        .get(payload.sub) as
        | { id: string; email: string; role: Role; full_name: string; registered: number }
        | undefined;
      if (!row) return next(new HttpError(401, 'Account no longer exists.'));
      req.user = {
        id: row.id,
        email: row.email,
        role: row.role,
        fullName: row.full_name,
        registered: !!row.registered,
      };
      next();
    } catch {
      next(new HttpError(401, 'Session expired. Please sign in again.'));
    }
  };
}

export const requireRole = (role: Role) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(new HttpError(401, 'Not signed in.'));
  if (req.user.role !== role) return next(new HttpError(403, 'Not allowed for your account type.'));
  next();
};

export const requireRegistered = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user?.registered) return next(new HttpError(403, 'Please complete registration first.'));
  next();
};

// CSRF defence in depth for cookie auth: state-changing requests must carry a
// custom header that cross-site forms cannot set.
export function requireCustomHeader(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.headers['x-requested-with'] !== 'fluentai')
    return next(new HttpError(403, 'Missing required request header.'));
  next();
}
