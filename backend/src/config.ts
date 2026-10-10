import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  JWT_SECRET: z.string().min(16).optional(),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATA_DIR: z.string().default(path.resolve(process.cwd(), 'data')),
  SPEECH_SERVICE_URL: z.string().url().default('http://127.0.0.1:8000'),
  SPEECH_SERVICE_KEY: z.string().default('dev-service-key'),
  MAX_UPLOAD_MB: z.coerce.number().default(25),
  // Dev convenience only: lets new clinician accounts appear in the directory
  // without manual licence checking. Must be false in production.
  AUTO_VERIFY_CLINICIANS: z.enum(['true', 'false']).default('false'),
  // Admin panel account, created or updated from these values when the server starts.
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_NAME: z.string().default('FluentAI Admin'),
  // Optional: lets Claude write personal coaching for the fluency roadmap (patients opt in).
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5-5'),
  ANTHROPIC_BASE_URL: z.string().url().default('https://api.anthropic.com'),
});

/** Used only in development when ADMIN_EMAIL / ADMIN_PASSWORD are not set. Refused in production. */
export const DEV_ADMIN = { email: 'admin@fluentai.local', password: 'FluentAdmin#2026' };

export type Config = {
  env: 'development' | 'test' | 'production';
  port: number;
  jwtSecret: string;
  corsOrigins: string[];
  dataDir: string;
  speechServiceUrl: string;
  speechServiceKey: string;
  maxUploadBytes: number;
  autoVerifyClinicians: boolean;
  admin: { email: string; password: string; name: string } | null;
  anthropicApiKey: string | undefined;
  anthropicModel: string;
  anthropicBaseUrl: string;
};

export function loadConfig(overrides: Partial<Record<string, string>> = {}): Config {
  const parsed = schema.parse({ ...process.env, ...overrides });
  if (parsed.NODE_ENV === 'production') {
    if (!parsed.JWT_SECRET) throw new Error('JWT_SECRET is required in production (min 16 chars).');
    if (parsed.AUTO_VERIFY_CLINICIANS === 'true')
      throw new Error('AUTO_VERIFY_CLINICIANS must be false in production.');
    if (parsed.SPEECH_SERVICE_KEY === 'dev-service-key')
      throw new Error('Set SPEECH_SERVICE_KEY to a private value in production.');
    if (parsed.ADMIN_PASSWORD !== undefined &&
        (parsed.ADMIN_PASSWORD.length < 12 || parsed.ADMIN_PASSWORD === DEV_ADMIN.password))
      throw new Error('ADMIN_PASSWORD must be at least 12 characters and not the development default in production.');
  }
  let admin: Config['admin'] = null;
  if (parsed.ADMIN_EMAIL && parsed.ADMIN_PASSWORD) {
    admin = { email: parsed.ADMIN_EMAIL.trim(), password: parsed.ADMIN_PASSWORD, name: parsed.ADMIN_NAME };
  } else if (parsed.NODE_ENV === 'development') {
    admin = { ...DEV_ADMIN, name: parsed.ADMIN_NAME };
  }
  return {
    env: parsed.NODE_ENV,
    port: parsed.PORT,
    jwtSecret: parsed.JWT_SECRET ?? 'dev-only-secret-change-me-please',
    corsOrigins: parsed.CORS_ORIGIN.split(',').map((s) => s.trim().replace(/\/+$/, '')),
    dataDir: parsed.DATA_DIR,
    speechServiceUrl: parsed.SPEECH_SERVICE_URL,
    speechServiceKey: parsed.SPEECH_SERVICE_KEY,
    maxUploadBytes: parsed.MAX_UPLOAD_MB * 1024 * 1024,
    autoVerifyClinicians: parsed.AUTO_VERIFY_CLINICIANS === 'true',
    admin,
    anthropicApiKey: parsed.ANTHROPIC_API_KEY?.trim() || undefined,
    anthropicModel: parsed.ANTHROPIC_MODEL,
    anthropicBaseUrl: parsed.ANTHROPIC_BASE_URL.replace(/\/+$/, ''),
  };
}
