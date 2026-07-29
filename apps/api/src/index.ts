import { serve } from '@hono/node-server';
import { createDatabase } from '@three-stone/database';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

import { AccountExportService } from './application/account-export-service.js';
import { ProfileService } from './application/profile-service.js';
import { SoloResultsService } from './application/solo-results-service.js';
import { createApp } from './app.js';
import { createBetterAuthGateway } from './auth/create-better-auth.js';
import { readEnvironment } from './config/env.js';
import { FixedWindowRateLimiter } from './http/rate-limiter.js';
import { DrizzlePlayerRepository } from './repositories/drizzle-player-repository.js';
import { DrizzleSoloResultRepository } from './repositories/drizzle-solo-result-repository.js';

try {
  loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch (error: unknown) {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    (error as { readonly code?: unknown }).code !== 'ENOENT'
  ) {
    throw error;
  }
}

const environment = readEnvironment();
const database = createDatabase(environment.DATABASE_URL);
const profileService = new ProfileService(new DrizzlePlayerRepository(database.db));
const resultsService = new SoloResultsService(new DrizzleSoloResultRepository(database.db));
const app = createApp({
  accountExportService: new AccountExportService(profileService, resultsService),
  authGateway: createBetterAuthGateway(database.db, environment),
  authRateLimiter: new FixedWindowRateLimiter(
    environment.AUTH_RATE_LIMIT_MAX,
    environment.AUTH_RATE_LIMIT_WINDOW_SECONDS * 1_000,
  ),
  maxRequestBodyBytes: environment.MAX_REQUEST_BODY_BYTES,
  profileService,
  readinessProbe: async () => {
    await database.queryClient`select 1`;
    return true;
  },
  resultsService,
  webOrigin: environment.WEB_ORIGIN,
});

const server = serve({
  fetch: app.fetch,
  hostname: environment.API_HOST,
  port: environment.API_PORT,
});

async function shutdown(signal: string) {
  console.info(`${signal} received; closing the API server.`);
  server.close((error) => {
    if (error) {
      console.error('API shutdown failed.', error);
      process.exitCode = 1;
    }
  });
  await database.close();
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});
