import { randomBytes, randomInt, randomUUID } from 'node:crypto';

import { DrizzleMultiplayerLeaseRepository, createDatabase } from '@three-stone/database';

import { HttpGameServerAdmissionGateway } from './adapters/http-game-server-admission-gateway.js';
import { AccountExportService } from './application/account-export-service.js';
import { MultiplayerAdmissionService } from './application/multiplayer-admission-service.js';
import { MultiplayerHistoryService } from './application/multiplayer-history-service.js';
import { ProfileService } from './application/profile-service.js';
import { SoloResultsService } from './application/solo-results-service.js';
import { createApp } from './app.js';
import { createBetterAuthGateway } from './auth/create-better-auth.js';
import { readEnvironment } from './config/env.js';
import { FixedWindowRateLimiter } from './http/rate-limiter.js';
import { DrizzlePlayerRepository } from './repositories/drizzle-player-repository.js';
import { DrizzleMultiplayerHistoryRepository } from './repositories/drizzle-multiplayer-history-repository.js';
import { DrizzleSoloResultRepository } from './repositories/drizzle-solo-result-repository.js';

export function createApiRuntime(source: NodeJS.ProcessEnv = process.env) {
  const environment = readEnvironment(source);
  const database = createDatabase(environment.DATABASE_URL, {
    maxConnections: environment.DATABASE_MAX_CONNECTIONS,
  });
  const profileService = new ProfileService(new DrizzlePlayerRepository(database.db));
  const resultsService = new SoloResultsService(new DrizzleSoloResultRepository(database.db));
  const multiplayerAdmissionService = new MultiplayerAdmissionService({
    clock: () => new Date(),
    createInviteCode,
    createLeaseToken: () => randomBytes(32).toString('base64url'),
    createUuid: randomUUID,
    gameServer: new HttpGameServerAdmissionGateway({
      baseUrl: environment.GAME_SERVER_INTERNAL_URL,
      secret: environment.GAME_SERVER_INTERNAL_SECRET,
    }),
    gameServerUrl: environment.GAME_SERVER_PUBLIC_URL,
    leases: new DrizzleMultiplayerLeaseRepository(database.db),
    serverInstanceId: environment.GAME_SERVER_INSTANCE_ID,
    ticketSecret: environment.MULTIPLAYER_TICKET_SECRET,
  });
  const app = createApp({
    accountExportService: new AccountExportService(profileService, resultsService),
    authGateway: createBetterAuthGateway(database.db, environment),
    authRateLimiter: new FixedWindowRateLimiter(
      environment.AUTH_RATE_LIMIT_MAX,
      environment.AUTH_RATE_LIMIT_WINDOW_SECONDS * 1_000,
    ),
    maxRequestBodyBytes: environment.MAX_REQUEST_BODY_BYTES,
    multiplayerAdmissionService,
    multiplayerHistoryService: new MultiplayerHistoryService(
      new DrizzleMultiplayerHistoryRepository(database.db),
    ),
    multiplayerRateLimiter: new FixedWindowRateLimiter(
      environment.MULTIPLAYER_RATE_LIMIT_MAX,
      environment.MULTIPLAYER_RATE_LIMIT_WINDOW_SECONDS * 1_000,
    ),
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

const INVITE_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function createInviteCode(): string {
  return Array.from(
    { length: 6 },
    () => INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)],
  ).join('');
}
