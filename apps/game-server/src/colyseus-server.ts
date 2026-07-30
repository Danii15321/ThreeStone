import {
  ErrorCode,
  Room,
  ServerError,
  defineRoom,
  defineServer,
  type Client,
  type Server,
} from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { z } from 'zod';

import {
  AuthoritativeMatch,
  type AdmissionIdentity,
  type MatchConnection,
  type MatchDependencies,
} from './authoritative-match.js';

export const GAME_ROOM_TYPE = 'three_stone';

const roomOptionsSchema = z.strictObject({
  gameId: z.uuid(),
  roomId: z.uuid(),
  seed: z.number().int().safe(),
});

const admissionIdentitySchema = z.strictObject({
  avatarUrl: z.string().max(2_048).nullable(),
  connectionGeneration: z.number().int().positive(),
  playerId: z.enum(['player-one', 'player-two']),
  roomId: z.string().min(8).max(128),
  userId: z.string().min(1).max(128),
  username: z.string().min(1).max(32),
});

export interface ThreeStoneRoom extends Room {
  readonly authoritativeMatch: AuthoritativeMatch;
}

export interface GameServerOptions {
  readonly isReady: () => boolean | Promise<boolean>;
  readonly matchDependencies: MatchDependencies;
}

export function createGameServer(options: GameServerOptions): Server {
  const RoomClass = createThreeStoneRoomClass(options.matchDependencies);
  return defineServer({
    greet: false,
    rooms: {
      [GAME_ROOM_TYPE]: defineRoom(RoomClass),
    },
    transport: new WebSocketTransport({
      pingInterval: 10_000,
      pingMaxRetries: 3,
    }),
    express: (app) => {
      app.get('/health/live', (_request, response) => {
        response.status(200).json({ status: 'ok' });
      });
      app.get('/health/ready', async (_request, response) => {
        const ready = await options.isReady();
        response.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'unavailable' });
      });
    },
  });
}

function createThreeStoneRoomClass(dependencies: MatchDependencies) {
  return class ConfiguredThreeStoneRoom extends Room implements ThreeStoneRoom {
    authoritativeMatch!: AuthoritativeMatch;

    override onCreate(rawOptions: unknown): void {
      const roomOptions = roomOptionsSchema.parse(rawOptions);
      this.roomId = roomOptions.roomId;
      this.maxClients = 2;
      this.maxMessagesPerSecond = 30;
      this.patchRate = null;
      this.autoDispose = false;
      this.authoritativeMatch = new AuthoritativeMatch(roomOptions, dependencies);
      this.onMessage('command', async (client, command: unknown) => {
        await this.authoritativeMatch.receive(client.sessionId, command);
      });
    }

    override async onAuth(_client: Client, rawOptions: unknown): Promise<AdmissionIdentity> {
      const ticket =
        typeof rawOptions === 'object' &&
        rawOptions !== null &&
        'ticket' in rawOptions &&
        typeof rawOptions.ticket === 'string'
          ? rawOptions.ticket
          : null;
      if (ticket === null) {
        throw roomUnavailable();
      }
      const identity = await dependencies.verifyAdmissionTicket(ticket, this.roomId);
      if (identity === null || !this.authoritativeMatch.canAdmit(identity)) {
        throw roomUnavailable();
      }
      return admissionIdentitySchema.parse(identity);
    }

    override onJoin(client: Client, _options: unknown, rawIdentity: unknown): void {
      const identity = admissionIdentitySchema.safeParse(rawIdentity);
      if (!identity.success) {
        throw roomUnavailable();
      }
      const result = this.authoritativeMatch.joinIdentity(clientConnection(client), identity.data);
      if (!result.ok) {
        throw roomUnavailable();
      }
    }

    override onLeave(client: Client): void {
      this.authoritativeMatch.leave(client.sessionId);
    }

    override onBeforeShutdown(): void {
      void this.authoritativeMatch.shutdown('server-shutdown');
      super.onBeforeShutdown();
    }

    override async onDispose(): Promise<void> {
      await this.authoritativeMatch.shutdown('room-disposed');
    }
  };
}

function clientConnection(client: Client): MatchConnection {
  return {
    connectionId: client.sessionId,
    send(type, payload) {
      client.send(type, payload);
    },
  };
}

function roomUnavailable(): ServerError {
  return new ServerError(ErrorCode.AUTH_FAILED, 'Room unavailable.');
}
