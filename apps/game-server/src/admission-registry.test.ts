import { describe, expect, it } from 'vitest';

import { AdmissionRegistry } from './admission-registry.js';

const ROOM_ID = 'a4e97166-e9e0-49cf-8812-96be1f59687a';
const GAME_ID = 'dce9bd39-d4d2-431d-ad54-a959a42c983d';
const CODE_HASH = 'a'.repeat(64);
const LEASE_EXPIRES_AT = 1_775_000_120_000;

function setup() {
  let now = 1_775_000_000_000;
  let id = 0;
  const registry = new AdmissionRegistry({
    clock: () => now,
    createReservationId: () => `reservation-${++id}`,
    firstSeat: () => 'player-two',
    serverInstanceId: 'game-server-local',
    waitingRoomLifetimeMs: 60_000,
  });
  const created = registry.create({
    creatorUserId: 'creator',
    gameId: GAME_ID,
    inviteCodeHash: CODE_HASH,
    leaseExpiresAt: LEASE_EXPIRES_AT,
    leaseToken: 'creator-lease-token',
    roomId: ROOM_ID,
  });
  return {
    created,
    expire: () => {
      now += 60_001;
    },
    registry,
  };
}

describe('AdmissionRegistry', () => {
  it('assigns the creator seat and reserves the opposite seat atomically', () => {
    const { created, registry } = setup();

    const joined = registry.reserveByCode({
      inviteCodeHash: CODE_HASH,
      leaseExpiresAt: LEASE_EXPIRES_AT,
      leaseToken: 'joiner-lease-token',
      userId: 'joiner',
    });
    const third = registry.reserveByCode({
      inviteCodeHash: CODE_HASH,
      leaseExpiresAt: LEASE_EXPIRES_AT,
      leaseToken: 'third-lease-token',
      userId: 'third',
    });

    expect(created).toMatchObject({
      playerId: 'player-two',
      roomId: ROOM_ID,
    });
    expect(joined).toMatchObject({
      playerId: 'player-one',
      roomId: ROOM_ID,
    });
    expect(third).toBeNull();
  });

  it('returns the same generic absence for unknown and expired codes', () => {
    const { expire, registry } = setup();

    expect(
      registry.reserveByCode({
        inviteCodeHash: 'b'.repeat(64),
        leaseExpiresAt: LEASE_EXPIRES_AT,
        leaseToken: 'unknown',
        userId: 'unknown',
      }),
    ).toBeNull();
    expire();
    expect(
      registry.reserveByCode({
        inviteCodeHash: CODE_HASH,
        leaseExpiresAt: LEASE_EXPIRES_AT,
        leaseToken: 'expired',
        userId: 'late-player',
      }),
    ).toBeNull();
  });

  it('increments the connection generation when the same account requests a new ticket', () => {
    const { created, registry } = setup();

    const refreshed = registry.refreshSeat(ROOM_ID, 'creator');

    expect(refreshed).toMatchObject({
      playerId: created?.playerId,
      connectionGeneration: 2,
      reservationId: created?.reservationId,
    });
  });

  it('releases only the matching provisional reservation and reopens the invite', () => {
    const { registry } = setup();
    const joined = registry.reserveByCode({
      inviteCodeHash: CODE_HASH,
      leaseExpiresAt: LEASE_EXPIRES_AT,
      leaseToken: 'joiner-lease-token',
      userId: 'joiner',
    });

    expect(
      registry.releaseSeat({
        reservationId: 'wrong-reservation',
        roomId: ROOM_ID,
        userId: 'joiner',
      }),
    ).toEqual({ released: false, roomRemoved: false });
    expect(
      registry.releaseSeat({
        reservationId: joined!.reservationId,
        roomId: ROOM_ID,
        userId: 'joiner',
      }),
    ).toEqual({ released: true, roomRemoved: false });
    expect(
      registry.reserveByCode({
        inviteCodeHash: CODE_HASH,
        leaseExpiresAt: LEASE_EXPIRES_AT,
        leaseToken: 'replacement-lease-token',
        userId: 'replacement',
      }),
    ).toMatchObject({ playerId: 'player-one' });
  });
});
