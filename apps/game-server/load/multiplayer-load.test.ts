import { randomUUID } from 'node:crypto';

import { boot, type ColyseusTestServer } from '@colyseus/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AdmissionIdentity, MatchDependencies } from '../src/authoritative-match.js';
import { GAME_ROOM_TYPE, createGameServer, type ThreeStoneRoom } from '../src/colyseus-server.js';
import { GameServerMetrics } from '../src/game-server-metrics.js';

const ROOM_COUNT = 20;

describe('multiplayer capacity gate', () => {
  let server: ColyseusTestServer;
  const identities = new Map<string, AdmissionIdentity>();
  const metrics = new GameServerMetrics();
  const dependencies: MatchDependencies = {
    clock: { now: Date.now },
    resultRepository: {
      async save(input) {
        return { gameId: input.gameId, kind: 'created' as const };
      },
    },
    async verifyAdmissionTicket(ticket, expectedRoomId) {
      const identity = identities.get(ticket);
      return identity?.roomId === expectedRoomId ? identity : null;
    },
  };

  beforeAll(async () => {
    server = await boot(
      createGameServer({
        isReady: () => true,
        matchDependencies: dependencies,
        metrics,
      }),
    );
  });

  afterAll(async () => {
    await server.shutdown();
  });

  it('accepts representative commands across 20 rooms and 40 connections under 500 ms p95', async () => {
    const sessions = await Promise.all(
      Array.from({ length: ROOM_COUNT }, async (_, index) => {
        const roomId = randomUUID();
        const room = await server.createRoom<ThreeStoneRoom>(GAME_ROOM_TYPE, {
          gameId: randomUUID(),
          roomId,
          seed: index + 101,
        });
        const ticketOne = `load-ticket-${index}-one`;
        const ticketTwo = `load-ticket-${index}-two`;
        identities.set(ticketOne, loadIdentity(roomId, index, 'player-one'));
        identities.set(ticketTwo, loadIdentity(roomId, index, 'player-two'));
        const one = await server.connectTo(room, { ticket: ticketOne });
        const two = await server.connectTo(room, { ticket: ticketTwo });
        for (const client of [one, two]) {
          client.onMessage('room.snapshot', () => undefined);
          client.onMessage('seat.observation', () => undefined);
          client.onMessage('room.resume-token', () => undefined);
        }
        return { index, one, room, roomId, two };
      }),
    );

    await Promise.all(
      sessions.map(async ({ index, one, room, roomId, two }) => {
        await sendAccepted(room, one, roomId, `load-${index}-ready-one`, 'room.ready', {
          ready: true,
        });
        await sendAccepted(room, two, roomId, `load-${index}-ready-two`, 'room.ready', {
          ready: true,
        });
        await sendAccepted(room, one, roomId, `load-${index}-choice-one`, 'round.choose', {
          count: 1,
        });
        const snapshotPromise = two.waitForMessage('room.snapshot');
        two.send('sync', { protocolVersion: 2 });
        const snapshot = await snapshotPromise;
        expect(snapshot).toMatchObject({ roomId });
        expect(JSON.stringify(snapshot)).not.toContain('hiddenChoice');
        expect(JSON.stringify(snapshot)).not.toMatch(
          sessions
            .filter((session) => session.roomId !== roomId)
            .map((session) => session.roomId)
            .join('|'),
        );
      }),
    );

    expect(metrics.snapshot()).toMatchObject({
      activeConnections: 40,
      commandAcceptance: {
        count: ROOM_COUNT * 3,
      },
    });
    expect(metrics.snapshot().commandAcceptance.p95Ms).toBeLessThan(500);

    await Promise.all(sessions.flatMap(({ one, two }) => [one.leave(), two.leave()]));
  }, 60_000);
});

function loadIdentity(
  roomId: string,
  index: number,
  playerId: 'player-one' | 'player-two',
): AdmissionIdentity {
  return {
    avatarUrl: null,
    connectionGeneration: 1,
    playerId,
    roomId,
    userId: `load-user-${index}-${playerId}`,
    username: `Load ${index} ${playerId}`,
  };
}

async function sendAccepted(
  room: ThreeStoneRoom,
  client: {
    send(type: string, payload: unknown): void;
    waitForMessage(type: string): Promise<unknown>;
  },
  roomId: string,
  commandId: string,
  type: 'room.ready' | 'round.choose',
  payload: { ready: boolean } | { count: number },
): Promise<void> {
  const accepted = client.waitForMessage('command.accepted');
  client.send('command', {
    commandId,
    knownSequence: room.authoritativeMatch.sequence,
    payload,
    protocolVersion: 2,
    roomId,
    type,
  });
  await expect(accepted).resolves.toMatchObject({ commandId });
}
