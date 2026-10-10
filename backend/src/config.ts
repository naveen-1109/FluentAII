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
});

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
};

export function loadConfig(overrides: Partial<Record<string, string>> = {}): Config {
  const parsed = schema.parse({ ...process.env, ...overrides });
  if (parsed.NODE_ENV === 'production') {
    if (!parsed.JWT_SECRET) throw new Error('JWT_SECRET is required in production (min 16 chars).');
    if (parsed.AUTO_VERIFY_CLINICIANS === 'true')
      throw new Error('AUTO_VERIFY_CLINICIANS must be false in production.');
    if (parsed.SPEECH_SERVICE_KEY === 'dev-service-key')
      throw new Error('Set SPEECH_SERVICE_KEY to a private value in production.');
  }
  return {
    env: parsed.NODE_ENV,
    port: parsed.PORT,
    jwtSecret: parsed.JWT_SECRET ?? 'dev-only-secret-change-me-please',
    corsOrigins: parsed.CORS_ORIGIN.split(',').map((s) => s.trim()),
    dataDir: parsed.DATA_DIR,
    speechServiceUrl: parsed.SPEECH_SERVICE_URL,
    speechServiceKey: parsed.SPEECH_SERVICE_KEY,
    maxUploadBytes: parsed.MAX_UPLOAD_MB * 1024 * 1024,
    autoVerifyClinicians: parsed.AUTO_VERIFY_CLINICIANS === 'true',
  };
}
