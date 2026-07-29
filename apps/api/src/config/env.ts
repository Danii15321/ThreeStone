import { z } from 'zod';

const environmentSchema = z.object({
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url().default('http://localhost:3001'),
  DATABASE_MAX_CONNECTIONS: z.coerce.number().int().min(1).max(100).default(10),
  DATABASE_URL: z.url(),
  MAX_REQUEST_BODY_BYTES: z.coerce.number().int().min(1_024).default(32_768),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
});

export type ApiEnvironment = z.infer<typeof environmentSchema>;

export function readEnvironment(source: NodeJS.ProcessEnv = process.env): ApiEnvironment {
  const platformOrigin = vercelOrigin(source);
  return environmentSchema.parse({
    ...source,
    BETTER_AUTH_URL: source.BETTER_AUTH_URL ?? platformOrigin,
    WEB_ORIGIN: source.WEB_ORIGIN ?? platformOrigin,
  });
}

function vercelOrigin(source: NodeJS.ProcessEnv): string | undefined {
  const hostname =
    source.VERCEL_ENV === 'production' ? source.VERCEL_PROJECT_PRODUCTION_URL : source.VERCEL_URL;
  return hostname === undefined ? undefined : `https://${hostname}`;
}
