import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { boot, type ColyseusTestServer } from '@colyseus/testing';

import type { AdmissionIdentity, MatchDependencies } from './authoritative-match.js';
import { GAME_ROOM_TYPE, createGameServer, type ThreeStoneRoom } from './colyseus-server.js';

const ROOM_ID = 'a4e97166-e9e0-49cf-8812-96be1f59687a';
const GAME_ID = 'dce9bd39-d4d2-431d-ad54-a959a42c983d';

function identity(userId: string, playerId: 'player-one' | 'player-two'): AdmissionIdentity {
  return {
    avatarUrl: null,
    connectionGeneration: 1,
    playerId,
    roomId: ROOM_ID,
    userId,
    username: playerId === 'player-one' ? 'Astrid' : 'Bjorn',
  };
}

describe('Colyseus game server', () => {
  let server: ColyseusTestServer;
  let ready = true;
  const saved: unknown[] = [];
  const tickets = new Map<string, AdmissionIdentity>([
    ['network-ticket-one', identity('network-user-one', 'player-one')],
    ['network-ticket-two', identity('network-user-two', 'player-two')],
  ]);
  const dependencies: MatchDependencies = {
    clock: { now: () => 1_775_000_000_000 },
    resultRepository: {
      async save(input) {
        saved.push(input);
        return { kind: 'created' as const };
      },
    },
    async verifyAdmissionTicket(ticket, expectedRoomId) {
      const found = tickets.get(ticket);
      return found?.roomId === expectedRoomId ? found : null;
    },
  };

  beforeAll(async () => {
    server = await boot(
      createGameServer({
        isReady: () => ready,
        matchDependencies: dependencies,
      }),
    );
  });

  afterAll(async () => {
    await server.shutdown();
  });

  it('exposes distinct liveness and readiness probes', async () => {
    await expect(server.http.get('/health/live')).resolves.toMatchObject({
      statusCode: 200,
      data: { status: 'ok' },
    });
    await expect(server.http.get('/health/ready')).resolves.toMatchObject({
      statusCode: 200,
      data: { status: 'ready' },
    });
    ready = false;
    await expect(server.http.get('/health/ready')).rejects.toMatchObject({
      statusCode: 503,
    });
    ready = true;
  });

  it('lets two authenticated Colyseus clients finish one authoritative game', async () => {
    const room = await server.createRoom<ThreeStoneRoom>(GAME_ROOM_TYPE, {
      gameId: GAME_ID,
      roomId: ROOM_ID,
      seed: 71,
    });
    const one = await server.connectTo(room, { ticket: 'network-ticket-one' });
    one.onMessage('room.snapshot', () => undefined);
    one.onMessage('seat.observation', () => undefined);
    const two = await server.connectTo(room, { ticket: 'network-ticket-two' });
    two.onMessage('room.snapshot', () => undefined);
    two.onMessage('seat.observation', () => undefined);
    let commandNumber = 0;
    const send = async (
      client: typeof one,
      type: 'room.ready' | 'round.choose' | 'round.predict',
      payload: { ready: boolean } | { count: number } | { value: number },
    ) => {
      commandNumber += 1;
      const accepted = client.waitForMessage('command.accepted');
      client.send('command', {
        protocolVersion: 2,
        commandId: `network-command-${commandNumber}`,
        roomId: ROOM_ID,
        knownSequence: room.authoritativeMatch.sequence,
        type,
        payload,
      });
      await accepted;
    };

    await send(one, 'room.ready', { ready: true });
    await send(two, 'room.ready', { ready: true });
    for (let round = 0; round < 3; round += 1) {
      await send(one, 'round.choose', { count: 1 });
      await send(two, 'round.choose', { count: 1 });
      if (room.authoritativeMatch.state.initiative === 'player-one') {
        await send(one, 'round.predict', { value: 2 });
        await send(two, 'round.predict', { value: 0 });
      } else {
        await send(two, 'round.predict', { value: 0 });
        await send(one, 'round.predict', { value: 2 });
      }
    }

    expect(room.authoritativeMatch.state).toMatchObject({
      phase: 'finished',
      terminalReason: 'reserve-empty',
      winner: 'player-one',
    });
    expect(saved).toHaveLength(1);
  });
});
