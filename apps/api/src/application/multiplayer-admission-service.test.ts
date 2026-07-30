import { describe, expect, it } from 'vitest';

import type { AccountMetadata } from '@three-stone/api-contracts';
import { HmacAdmissionTicketVerifier } from '@three-stone/protocol/node';

import {
  MultiplayerAdmissionService,
  RoomUnavailableError,
  type GameServerAdmissionGateway,
  type MultiplayerLeaseGateway,
} from './multiplayer-admission-service.js';

const NOW = new Date('2026-07-30T15:00:00.000Z');
const TICKET_SECRET = 'test-multiplayer-ticket-secret-at-least-32-bytes';
const ROOM_ID = 'a4e97166-e9e0-49cf-8812-96be1f59687a';
const GAME_ID = 'dce9bd39-d4d2-431d-ad54-a959a42c983d';
const JTI = 'e7fba96d-9ec0-46c8-bdea-96b01f10a1b4';

const ACCOUNT: AccountMetadata = {
  createdAt: NOW.toISOString(),
  displayUsername: 'Astrid',
  id: 'user-one',
  image: null,
  updatedAt: NOW.toISOString(),
  username: 'astrid',
};

class FakeLeases implements MultiplayerLeaseGateway {
  acquireError: Error | null = null;
  readonly calls: string[] = [];
  outcome: 'acquired' | 'existing' | 'conflict' = 'acquired';

  async acquire() {
    this.calls.push('lease.acquire');
    if (this.acquireError !== null) {
      throw this.acquireError;
    }
    return this.outcome;
  }

  async findActive() {
    this.calls.push('lease.find');
    return { roomId: ROOM_ID };
  }

  async release() {
    this.calls.push('lease.release');
    return true;
  }
}

class FakeGameServer implements GameServerAdmissionGateway {
  readonly calls: string[] = [];
  createResult: {
    readonly connectionGeneration: number;
    readonly playerId: 'player-one' | 'player-two';
    readonly reservationId: string;
    readonly roomId: string;
    readonly serverInstanceId: string;
  } | null = {
    connectionGeneration: 1,
    playerId: 'player-two',
    reservationId: 'reservation-one',
    roomId: ROOM_ID,
    serverInstanceId: 'game-server-local',
  };
  joinResult = this.createResult;

  async createRoom() {
    this.calls.push('server.create');
    return this.createResult;
  }

  async reserveSeat() {
    this.calls.push('server.reserve');
    return this.joinResult;
  }

  async refreshSeat() {
    this.calls.push('server.refresh');
    return this.joinResult;
  }

  async releaseSeat() {
    this.calls.push('server.release');
  }
}

function setup() {
  const leases = new FakeLeases();
  const gameServer = new FakeGameServer();
  const ids = [ROOM_ID, GAME_ID, JTI];
  const service = new MultiplayerAdmissionService({
    clock: () => NOW,
    createInviteCode: () => 'ABCD23',
    createLeaseToken: () => 'raw-lease-token-with-high-entropy',
    createUuid: () => ids.shift() ?? JTI,
    gameServer,
    gameServerUrl: 'ws://127.0.0.1:2567',
    leases,
    serverInstanceId: 'game-server-local',
    ticketSecret: TICKET_SECRET,
  });
  return { gameServer, leases, service };
}

describe('MultiplayerAdmissionService', () => {
  it('acquires the lease before creating a room and returns a 45 second body ticket', async () => {
    const { gameServer, leases, service } = setup();

    const response = await service.create(ACCOUNT);

    expect(leases.calls).toEqual(['lease.acquire']);
    expect(gameServer.calls).toEqual(['server.create']);
    expect(response).toMatchObject({
      gameServerUrl: 'ws://127.0.0.1:2567',
      inviteCode: 'ABCD23',
      playerId: 'player-two',
      roomId: ROOM_ID,
      ticketExpiresAt: '2026-07-30T15:00:45.000Z',
    });
    expect(response.ticket).not.toContain('ABCD23');
    const verifier = new HmacAdmissionTicketVerifier(TICKET_SECRET, () => NOW.getTime());
    await expect(verifier.verify(response.ticket, ROOM_ID)).resolves.toMatchObject({
      userId: 'user-one',
      username: 'Astrid',
    });
  });

  it('releases a provisional lease when room creation fails', async () => {
    const { gameServer, leases, service } = setup();
    gameServer.createResult = null;

    await expect(service.create(ACCOUNT)).rejects.toBeInstanceOf(RoomUnavailableError);

    expect(leases.calls).toEqual(['lease.acquire', 'lease.release']);
  });

  it('releases a provisional seat when another active room owns the account lease', async () => {
    const { gameServer, leases, service } = setup();
    leases.outcome = 'conflict';

    await expect(service.join(ACCOUNT, 'ABCD23')).rejects.toMatchObject({
      message: 'Impossible de rejoindre ce salon',
    });

    expect(gameServer.calls).toEqual(['server.reserve', 'server.release']);
    expect(leases.calls).toEqual(['lease.acquire']);
  });

  it('releases a provisional seat when lease storage is unavailable', async () => {
    const { gameServer, leases, service } = setup();
    leases.acquireError = new Error('database unavailable');

    await expect(service.join(ACCOUNT, 'ABCD23')).rejects.toBeInstanceOf(RoomUnavailableError);

    expect(gameServer.calls).toEqual(['server.reserve', 'server.release']);
  });

  it('uses the same public failure for unknown, expired and full invite codes', async () => {
    const { gameServer, service } = setup();
    gameServer.joinResult = null;

    await expect(service.join(ACCOUNT, 'ABCD23')).rejects.toEqual(new RoomUnavailableError());
  });

  it('refreshes a seat ticket without moving the account to another room', async () => {
    const { gameServer, leases, service } = setup();

    const response = await service.refresh(ACCOUNT, ROOM_ID);

    expect(response).toMatchObject({ roomId: ROOM_ID, playerId: 'player-two' });
    expect(gameServer.calls).toEqual(['server.refresh']);
    expect(leases.calls).toEqual(['lease.find']);
  });
});
