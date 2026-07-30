import { describe, expect, it, vi } from 'vitest';

import { HttpGameServerAdmissionGateway } from './http-game-server-admission-gateway.js';

const RESERVATION = {
  connectionGeneration: 1,
  playerId: 'player-one' as const,
  reservationId: 'reservation-123',
  roomId: '019b15db-9829-7b46-a6a5-6cfcb1ca84c5',
  serverInstanceId: 'game-server-test',
};

describe('HttpGameServerAdmissionGateway', () => {
  it('transmet les secrets uniquement dans les en-têtes et le corps', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json(RESERVATION, { status: 201 }));
    const gateway = new HttpGameServerAdmissionGateway({
      baseUrl: 'http://127.0.0.1:2567',
      fetch,
      secret: 'internal-secret-that-is-long-enough',
    });

    await expect(
      gateway.createRoom({
        creatorUserId: 'creator',
        gameId: '019b15db-9829-7b46-a6a5-6cfcb1ca84c4',
        inviteCodeHash: 'a'.repeat(64),
        leaseExpiresAt: 1_775_000_120_000,
        leaseToken: 'private-lease-token',
        roomId: RESERVATION.roomId,
        seed: 42,
      }),
    ).resolves.toEqual(RESERVATION);

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('http://127.0.0.1:2567/internal/v1/rooms');
    expect(String(url)).not.toContain('private-lease-token');
    expect(init?.headers).toMatchObject({
      'content-type': 'application/json',
      'x-game-server-secret': 'internal-secret-that-is-long-enough',
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      inviteCodeHash: 'a'.repeat(64),
      leaseToken: 'private-lease-token',
    });
  });

  it('rend les salons inconnus, expirés et pleins indiscernables', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ error: 'ROOM_UNAVAILABLE' }, { status: 409 }));
    const gateway = new HttpGameServerAdmissionGateway({
      baseUrl: 'http://127.0.0.1:2567/',
      fetch,
      secret: 'internal-secret-that-is-long-enough',
    });

    await expect(
      gateway.reserveSeat({
        inviteCodeHash: 'b'.repeat(64),
        leaseExpiresAt: 1_775_000_120_000,
        leaseToken: 'private-lease-token',
        userId: 'joiner',
      }),
    ).resolves.toBeNull();
  });

  it('refuse une réponse interne mal formée', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ roomId: RESERVATION.roomId }));
    const gateway = new HttpGameServerAdmissionGateway({
      baseUrl: 'http://127.0.0.1:2567',
      fetch,
      secret: 'internal-secret-that-is-long-enough',
    });

    await expect(
      gateway.refreshSeat({ roomId: RESERVATION.roomId, userId: 'creator' }),
    ).rejects.toThrow('Invalid game-server admission response');
  });

  it('libère une réservation avec une requête authentifiée', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(null, {
        status: 204,
      }),
    );
    const gateway = new HttpGameServerAdmissionGateway({
      baseUrl: 'http://127.0.0.1:2567',
      fetch,
      secret: 'internal-secret-that-is-long-enough',
    });

    await expect(
      gateway.releaseSeat({
        reservationId: RESERVATION.reservationId,
        roomId: RESERVATION.roomId,
        userId: 'creator',
      }),
    ).resolves.toBeUndefined();
  });
});
