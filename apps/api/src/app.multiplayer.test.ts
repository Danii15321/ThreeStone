import { describe, expect, it, vi } from 'vitest';

import {
  RoomUnavailableError,
  type MultiplayerAdmissionService,
} from './application/multiplayer-admission-service.js';
import { createApp } from './app.js';
import { FixedWindowRateLimiter } from './http/rate-limiter.js';
import { createTestDependencies } from './test-support/create-test-dependencies.js';

const ROOM_ID = '019b15db-9829-7b46-a6a5-6cfcb1ca84c5';
const ADMISSION = {
  gameServerUrl: 'ws://127.0.0.1:2567',
  playerId: 'player-one' as const,
  roomId: ROOM_ID,
  ticket: 'signed-admission-ticket-that-is-long-enough-for-the-contract',
  ticketExpiresAt: '2026-07-30T17:00:45.000Z',
};

type AdmissionApi = Pick<MultiplayerAdmissionService, 'create' | 'join' | 'refresh'>;

function multiplayerDependencies(
  options: {
    readonly admission?: AdmissionApi;
    readonly limit?: number;
    readonly userId?: string;
  } = {},
) {
  const admission: AdmissionApi = options.admission ?? {
    create: vi.fn(async () => ({ ...ADMISSION, inviteCode: 'ABCD23' })),
    join: vi.fn(async () => ADMISSION),
    refresh: vi.fn(async () => ADMISSION),
  };
  return {
    ...createTestDependencies(options.userId === undefined ? {} : { userId: options.userId }),
    multiplayerAdmissionService: admission,
    multiplayerRateLimiter: new FixedWindowRateLimiter(options.limit ?? 30, 60_000),
  };
}

describe('multiplayer admission routes', () => {
  it('requires an authenticated account', async () => {
    const app = createApp(multiplayerDependencies());

    const response = await app.request('/api/multiplayer/rooms', { method: 'POST' });

    expect(response.status).toBe(401);
  });

  it('creates a private room and returns its ticket only in the body', async () => {
    const app = createApp(multiplayerDependencies({ userId: 'creator' }));

    const response = await app.request('/api/multiplayer/rooms', { method: 'POST' });

    expect(response.status).toBe(201);
    expect(response.url).not.toContain('ticket');
    await expect(response.json()).resolves.toEqual({
      ...ADMISSION,
      inviteCode: 'ABCD23',
    });
  });

  it('attaches an authenticated profile avatar URL to the game-server identity', async () => {
    const create = vi.fn(async () => ({ ...ADMISSION, inviteCode: 'ABCD23' }));
    const dependencies = multiplayerDependencies({
      admission: { create, join: vi.fn(), refresh: vi.fn() },
      userId: 'avatar-player',
    });
    const app = createApp(dependencies);
    await app.request('/api/profile', {
      body: JSON.stringify({ bio: '', expectedVersion: 0, nickname: 'Avatar Player' }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    });
    await app.request('/api/profile/avatar?expectedVersion=1', {
      body: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      headers: { 'content-type': 'image/png' },
      method: 'PUT',
    });

    await app.request('/api/multiplayer/rooms', { method: 'POST' });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        image: 'http://localhost/api/players/avatar-player/avatar',
      }),
    );
  });

  it('normalizes a valid invite code before joining', async () => {
    const join = vi.fn(async () => ADMISSION);
    const app = createApp(
      multiplayerDependencies({
        admission: {
          create: vi.fn(),
          join,
          refresh: vi.fn(),
        },
        userId: 'joiner',
      }),
    );

    const response = await app.request('/api/multiplayer/join', {
      body: JSON.stringify({ code: ' abcd23 ' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(join).toHaveBeenCalledWith(expect.objectContaining({ id: 'joiner' }), 'ABCD23');
  });

  it.each(['unknown-room', 'expired-room', 'full-room'])(
    'returns the same public error for %s',
    async () => {
      const unavailable = vi.fn(async () => {
        throw new RoomUnavailableError();
      });
      const app = createApp(
        multiplayerDependencies({
          admission: {
            create: vi.fn(),
            join: unavailable,
            refresh: vi.fn(),
          },
          userId: 'joiner',
        }),
      );

      const response = await app.request('/api/multiplayer/join', {
        body: JSON.stringify({ code: 'ABCD23' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const body = (await response.json()) as {
        readonly error: { readonly code: string; readonly message: string };
      };

      expect(response.status).toBe(409);
      expect(body.error).toMatchObject({
        code: 'ROOM_UNAVAILABLE',
        message: 'Impossible de rejoindre ce salon',
      });
    },
  );

  it('refreshes a short-lived ticket for the leased room', async () => {
    const refresh = vi.fn(async () => ADMISSION);
    const app = createApp(
      multiplayerDependencies({
        admission: {
          create: vi.fn(),
          join: vi.fn(),
          refresh,
        },
        userId: 'creator',
      }),
    );

    const response = await app.request(`/api/multiplayer/rooms/${ROOM_ID}/ticket`, {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(refresh).toHaveBeenCalledWith(expect.objectContaining({ id: 'creator' }), ROOM_ID);
  });

  it('limits admission attempts by account and network address', async () => {
    const app = createApp(multiplayerDependencies({ limit: 2, userId: 'rate-limited-player' }));

    expect((await app.request('/api/multiplayer/rooms', { method: 'POST' })).status).toBe(201);
    expect((await app.request('/api/multiplayer/rooms', { method: 'POST' })).status).toBe(201);
    const rejected = await app.request('/api/multiplayer/rooms', { method: 'POST' });

    expect(rejected.status).toBe(429);
  });
});
