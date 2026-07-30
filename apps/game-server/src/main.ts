import { DrizzleMultiplayerResultRepository, createDatabase } from '@three-stone/database';
import { HmacAdmissionTicketVerifier } from '@three-stone/protocol/node';

import { createGameServer } from './colyseus-server.js';
import { readGameServerEnvironment } from './config/environment.js';

const environment = readGameServerEnvironment();
const database = createDatabase(environment.DATABASE_URL, {
  maxConnections: environment.DATABASE_MAX_CONNECTIONS,
});
const verifier = new HmacAdmissionTicketVerifier(environment.MULTIPLAYER_TICKET_SECRET);
let acceptingConnections = true;

const server = createGameServer({
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
