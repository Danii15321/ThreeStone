import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  DrizzleMultiplayerLeaseRepository,
  DrizzleMultiplayerResultRepository,
  createDatabase,
} from '@three-stone/database';
import { HmacAdmissionTicketVerifier } from '@three-stone/protocol/node';

import { AdmissionRegistry, type MultiplayerSeat } from './admission-registry.js';
import { createGameServer } from './colyseus-server.js';
import { readGameServerEnvironment } from './config/environment.js';
import { GameServerDrainController } from './game-server-drain-controller.js';
import { GameServerMetrics } from './game-server-metrics.js';
import { RoomLeaseMonitor } from './room-lease-monitor.js';
import { RetryingTerminalResultRepository } from './terminal-result-retrier.js';

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

const environment = readGameServerEnvironment();
const database = createDatabase(environment.DATABASE_URL, {
  maxConnections: environment.DATABASE_MAX_CONNECTIONS,
});
const verifier = new HmacAdmissionTicketVerifier(environment.MULTIPLAYER_TICKET_SECRET);
const admissionRegistry = new AdmissionRegistry({
  clock: Date.now,
  createReservationId: randomUUID,
  firstSeat: (): MultiplayerSeat => (randomInt(2) === 0 ? 'player-one' : 'player-two'),
  serverInstanceId: environment.GAME_SERVER_INSTANCE_ID,
  waitingRoomLifetimeMs: environment.WAITING_ROOM_LIFETIME_SECONDS * 1_000,
});
const leaseMonitor = new RoomLeaseMonitor({
  clock: Date.now,
  leaseLifetimeMs: 120_000,
  registry: admissionRegistry,
  repository: new DrizzleMultiplayerLeaseRepository(database.db),
});
const drainController = new GameServerDrainController();
const metrics = new GameServerMetrics();
const resultRepository = new RetryingTerminalResultRepository(
  new DrizzleMultiplayerResultRepository(database.db),
  {
    onFailure: () => metrics.persistenceFailed(),
  },
);

const server = createGameServer({
  drainController,
  internalAdmission: {
    registry: admissionRegistry,
    secret: environment.GAME_SERVER_INTERNAL_SECRET,
  },
  async isReady() {
    if (!drainController.acceptingAdmissions) {
      return false;
    }
    try {
      await database.queryClient`select 1`;
      return true;
    } catch {
      return false;
    }
  },
  matchDependencies: {
    clock: { now: Date.now },
    createResumeToken: () => randomBytes(32).toString('base64url'),
    leaseHeartbeat: {
      check: (roomId) => leaseMonitor.check(roomId),
      intervalMs: 30_000,
    },
    resultRepository,
    verifyAdmissionTicket: (ticket, roomId) => verifier.verify(ticket, roomId),
  },
  metrics,
  webOrigin: environment.WEB_ORIGIN,
});

server.onBeforeShutdown(() => {
  drainController.start();
});
server.onShutdown(async () => {
  await resultRepository.flush();
  await database.close();
});

await server.listen(environment.GAME_SERVER_PORT, environment.GAME_SERVER_HOST);
