import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { boot, type ColyseusTestServer } from '@colyseus/testing';
import { randomUUID } from 'node:crypto';
import { HmacAdmissionTicketVerifier, issueAdmissionTicket } from '@three-stone/protocol/node';

import type { AdmissionIdentity, MatchDependencies } from './authoritative-match.js';
import { AdmissionRegistry } from './admission-registry.js';
import { GAME_ROOM_TYPE, createGameServer, type ThreeStoneRoom } from './colyseus-server.js';

const ROOM_ID = 'a4e97166-e9e0-49cf-8812-96be1f59687a';
const GAME_ID = 'dce9bd39-d4d2-431d-ad54-a959a42c983d';
const INTERNAL_ROOM_ID = 'bb1807f5-287e-46d9-968c-31495427648a';
const INTERNAL_GAME_ID = 'da191e81-2f2e-4839-975c-909a39be1187';
const INTERNAL_SECRET = 'internal-test'.padEnd(32, '0');
const TICKET_SECRET = 'ticket-test'.padEnd(32, '0');
const NOW = 1_775_000_000_000;

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
  const hmacVerifier = new HmacAdmissionTicketVerifier(TICKET_SECRET, () => NOW);
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
      return found?.roomId === expectedRoomId ? found : hmacVerifier.verify(ticket, expectedRoomId);
    },
  };
  const registry = new AdmissionRegistry({
    clock: () => 1_775_000_000_000,
    createReservationId: randomUUID,
    firstSeat: () => 'player-one',
    serverInstanceId: 'game-server-test',
    waitingRoomLifetimeMs: 60_000,
  });

  beforeAll(async () => {
    server = await boot(
      createGameServer({
        internalAdmission: {
          registry,
          secret: INTERNAL_SECRET,
        },
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

  it('authenticates the internal room reservation channel without exposing codes', async () => {
    const createBody = {
      creatorUserId: 'internal-creator',
      gameId: INTERNAL_GAME_ID,
      inviteCodeHash: 'c'.repeat(64),
      leaseToken: 'creator-lease-token-with-high-entropy',
      roomId: INTERNAL_ROOM_ID,
      seed: 73,
    };
    await expect(
      server.http.post('/internal/v1/rooms', {
        body: createBody,
        headers: {
          'content-type': 'application/json',
          'x-game-server-secret': 'wrong-secret-that-is-long-enough',
        },
      }),
    ).rejects.toMatchObject({ statusCode: 401 });

    const creatorReservation = await server.http.post('/internal/v1/rooms', {
      body: createBody,
      headers: {
        'content-type': 'application/json',
        'x-game-server-secret': INTERNAL_SECRET,
      },
    });
    expect(creatorReservation).toMatchObject({
      statusCode: 201,
      data: {
        playerId: 'player-one',
        roomId: INTERNAL_ROOM_ID,
      },
    });
    const joinerReservation = await server.http.post('/internal/v1/rooms/reserve', {
      body: {
        inviteCodeHash: 'c'.repeat(64),
        leaseToken: 'joiner-lease-token-with-high-entropy',
        userId: 'internal-joiner',
      },
      headers: {
        'content-type': 'application/json',
        'x-game-server-secret': INTERNAL_SECRET,
      },
    });
    expect(joinerReservation).toMatchObject({
      statusCode: 200,
      data: { playerId: 'player-two' },
    });

    const creatorTicket = issueAdmissionTicket(
      ticketClaims(
        'internal-creator',
        'player-one',
        INTERNAL_ROOM_ID,
        Number(creatorReservation.data.connectionGeneration),
      ),
      TICKET_SECRET,
    );
    const joinerTicket = issueAdmissionTicket(
      ticketClaims(
        'internal-joiner',
        'player-two',
        INTERNAL_ROOM_ID,
        Number(joinerReservation.data.connectionGeneration),
      ),
      TICKET_SECRET,
    );
    const creator = await server.sdk.joinById(INTERNAL_ROOM_ID, {
      ticket: creatorTicket,
    });
    creator.onMessage('room.snapshot', () => undefined);
    creator.onMessage('seat.observation', () => undefined);
    const joiner = await server.sdk.joinById(INTERNAL_ROOM_ID, {
      ticket: joinerTicket,
    });
    expect(creator.roomId).toBe(INTERNAL_ROOM_ID);
    expect(joiner.roomId).toBe(INTERNAL_ROOM_ID);

    await expect(
      server.http.post('/internal/v1/rooms/reserve', {
        body: {
          inviteCodeHash: 'c'.repeat(64),
          leaseToken: 'third-lease-token-with-high-entropy',
          userId: 'internal-third',
        },
        headers: {
          'content-type': 'application/json',
          'x-game-server-secret': INTERNAL_SECRET,
        },
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await creator.leave();
    await joiner.leave();
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

function ticketClaims(
  userId: string,
  playerId: 'player-one' | 'player-two',
  roomId: string,
  connectionGeneration: number,
) {
  return {
    avatarUrl: null,
    connectionGeneration,
    expiresAt: NOW + 45_000,
    issuedAt: NOW,
    jti: `${userId}-ticket`,
    playerId,
    roomId,
    userId,
    username: userId,
  };
}
