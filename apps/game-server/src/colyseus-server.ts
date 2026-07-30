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
import type { Application } from 'express';
import { z } from 'zod';

import {
  AuthoritativeMatch,
  type AdmissionIdentity,
  type MatchConnection,
  type MatchDependencies,
} from './authoritative-match.js';
import {
  configureInternalAdmissionHttp,
  type InternalAdmissionHttpOptions,
} from './internal-admission-http.js';
import type { GameServerDrainController } from './game-server-drain-controller.js';
import type { GameServerMetrics } from './game-server-metrics.js';
import { MAX_WEBSOCKET_PAYLOAD_BYTES, isWebSocketOriginAllowed } from './websocket-security.js';

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
const syncRequestSchema = z.strictObject({
  protocolVersion: z.literal(2),
});
const resumeTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43,256}$/);

export interface ThreeStoneRoom extends Room {
  readonly authoritativeMatch: AuthoritativeMatch;
}

export interface GameServerOptions {
  readonly drainController?: GameServerDrainController;
  readonly internalAdmission?: InternalAdmissionHttpOptions;
  readonly isReady: () => boolean | Promise<boolean>;
  readonly matchDependencies: MatchDependencies;
  readonly metrics?: GameServerMetrics;
  readonly webOrigin?: string;
}

export function createGameServer(options: GameServerOptions): Server {
  const matchDependencies: MatchDependencies = {
    ...options.matchDependencies,
    ...(options.drainController === undefined ? {} : { drainController: options.drainController }),
    ...(options.metrics === undefined ? {} : { metrics: options.metrics }),
  };
  const RoomClass = createThreeStoneRoomClass(matchDependencies);
  const internalAdmission =
    options.internalAdmission === undefined
      ? undefined
      : {
          ...options.internalAdmission,
          ...(options.drainController === undefined
            ? {}
            : { drainController: options.drainController }),
          ...(options.metrics === undefined ? {} : { metrics: options.metrics }),
        };
  return defineServer({
    greet: false,
    rooms: {
      [GAME_ROOM_TYPE]: defineRoom(RoomClass),
    },
    transport: new WebSocketTransport({
      maxPayload: MAX_WEBSOCKET_PAYLOAD_BYTES,
      pingInterval: 10_000,
      pingMaxRetries: 3,
      ...(options.webOrigin === undefined
        ? {}
        : {
            verifyClient: ({ origin }: { readonly origin: string | undefined }) =>
              isWebSocketOriginAllowed(origin, options.webOrigin!),
          }),
    }),
    express: (app) => {
      if (internalAdmission !== undefined) {
        configureInternalAdmissionHttp(app, internalAdmission);
      }
      configureHealthRoutes(app, options.isReady);
    },
  });
}

function configureHealthRoutes(app: Application, isReady: () => boolean | Promise<boolean>): void {
  app.get('/health/live', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });
  app.get('/health/ready', async (_request, response) => {
    const ready = await isReady();
    response.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'unavailable' });
  });
}

function createThreeStoneRoomClass(dependencies: MatchDependencies) {
  return class ConfiguredThreeStoneRoom extends Room implements ThreeStoneRoom {
    authoritativeMatch!: AuthoritativeMatch;
    private readonly joinedConnections = new Set<string>();
    private unregisterDrain: (() => void) | null = null;

    override onCreate(rawOptions: unknown): void {
      const roomOptions = roomOptionsSchema.parse(rawOptions);
      this.roomId = roomOptions.roomId;
      this.maxClients = 2;
      this.maxMessagesPerSecond = 30;
      this.patchRate = null;
      this.autoDispose = false;
      this.authoritativeMatch = new AuthoritativeMatch(roomOptions, dependencies);
      this.unregisterDrain =
        dependencies.drainController?.registerRoom(this.roomId, (reason) =>
          this.authoritativeMatch.shutdown(reason),
        ) ?? null;
      this.onMessage('command', async (client, command: unknown) => {
        await this.authoritativeMatch.receive(client.sessionId, command);
      });
      this.onMessage('sync', (client, request: unknown) => {
        if (syncRequestSchema.safeParse(request).success) {
          this.authoritativeMatch.syncConnection(client.sessionId);
        }
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
      const resumeToken =
        typeof rawOptions === 'object' &&
        rawOptions !== null &&
        'resumeToken' in rawOptions &&
        typeof rawOptions.resumeToken === 'string'
          ? rawOptions.resumeToken
          : null;
      if ((ticket === null) === (resumeToken === null)) {
        throw roomUnavailable();
      }
      if (resumeToken !== null && !resumeTokenSchema.safeParse(resumeToken).success) {
        dependencies.metrics?.resumeFailed();
        throw roomUnavailable();
      }
      const identity =
        resumeToken === null
          ? await dependencies.verifyAdmissionTicket(ticket!, this.roomId)
          : this.authoritativeMatch.consumeResumeToken(resumeToken);
      if (resumeToken !== null) {
        if (identity === null) {
          dependencies.metrics?.resumeFailed();
        } else {
          dependencies.metrics?.resumeSucceeded();
        }
      }
      if (identity === null || !this.authoritativeMatch.canAdmit(identity)) {
        throw roomUnavailable();
      }
      return admissionIdentitySchema.parse({
        avatarUrl: identity.avatarUrl,
        connectionGeneration: identity.connectionGeneration,
        playerId: identity.playerId,
        roomId: identity.roomId,
        userId: identity.userId,
        username: identity.username,
      });
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
      this.joinedConnections.add(client.sessionId);
      dependencies.metrics?.connectionOpened();
    }

    override onLeave(client: Client): void {
      this.authoritativeMatch.leave(client.sessionId);
      if (this.joinedConnections.delete(client.sessionId)) {
        dependencies.metrics?.connectionClosed();
      }
    }

    override onBeforeShutdown(): void {
      void this.authoritativeMatch.shutdown('server-shutdown');
      super.onBeforeShutdown();
    }

    override async onDispose(): Promise<void> {
      this.unregisterDrain?.();
      this.unregisterDrain = null;
      await this.authoritativeMatch.shutdown('room-disposed');
    }
  };
}

function clientConnection(client: Client): MatchConnection {
  return {
    connectionId: client.sessionId,
    close() {
      client.leave(4_000, 'Room closed.');
    },
    send(type, payload) {
      client.send(type, payload);
    },
  };
}

function roomUnavailable(): ServerError {
  return new ServerError(ErrorCode.AUTH_FAILED, 'Room unavailable.');
}
