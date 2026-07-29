import { createDatabase } from '@three-stone/database';

import { AccountExportService } from './application/account-export-service.js';
import { ProfileService } from './application/profile-service.js';
import { SoloResultsService } from './application/solo-results-service.js';
import { createApp } from './app.js';
import { createBetterAuthGateway } from './auth/create-better-auth.js';
import { readEnvironment } from './config/env.js';
import { FixedWindowRateLimiter } from './http/rate-limiter.js';
import { DrizzlePlayerRepository } from './repositories/drizzle-player-repository.js';
import { DrizzleSoloResultRepository } from './repositories/drizzle-solo-result-repository.js';

export function createApiRuntime(source: NodeJS.ProcessEnv = process.env) {
  const environment = readEnvironment(source);
  const database = createDatabase(environment.DATABASE_URL, {
    maxConnections: environment.DATABASE_MAX_CONNECTIONS,
  });
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

  return {
    app,
    close: () => database.close(),
    environment,
  };
}
