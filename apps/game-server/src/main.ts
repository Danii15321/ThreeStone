import { randomInt, randomUUID } from 'node:crypto';

import { DrizzleMultiplayerResultRepository, createDatabase } from '@three-stone/database';
import { HmacAdmissionTicketVerifier } from '@three-stone/protocol/node';

import { AdmissionRegistry, type MultiplayerSeat } from './admission-registry.js';
import { createGameServer } from './colyseus-server.js';
import { readGameServerEnvironment } from './config/environment.js';

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
let acceptingConnections = true;

const server = createGameServer({
  internalAdmission: {
    registry: admissionRegistry,
    secret: environment.GAME_SERVER_INTERNAL_SECRET,
  },
  async isReady() {
    if (!acceptingConnections) {
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
    resultRepository: new DrizzleMultiplayerResultRepository(database.db),
    verifyAdmissionTicket: (ticket, roomId) => verifier.verify(ticket, roomId),
  },
});

server.onBeforeShutdown(() => {
  acceptingConnections = false;
});
server.onShutdown(async () => {
  await database.close();
});

await server.listen(environment.GAME_SERVER_PORT, environment.GAME_SERVER_HOST);
