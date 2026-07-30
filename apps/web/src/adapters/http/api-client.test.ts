import { describe, expect, it, vi } from 'vitest';

import { ApiClient } from './api-client.js';

describe('API client boundary', () => {
  it('uses username-only authentication routes and payloads', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (String(input).endsWith('/get-session')) {
        return new Response(
          JSON.stringify({
            session: { expiresAt: '2026-08-05T00:00:00.000Z' },
            user: {
              displayUsername: 'Stone_Player',
              id: 'player-1',
              name: 'Stone_Player',
              username: 'stone_player',
            },
          }),
        );
      }
      return new Response('{}');
    });
    const client = new ApiClient('http://localhost:3001', fetcher);

    await client.signUp({ password: 'correct-horse-123', username: 'Stone_Player' });
    const session = await client.signIn({
      password: 'correct-horse-123',
      username: 'Stone_Player',
    });

    expect(fetcher).toHaveBeenCalledWith(
      'http://localhost:3001/api/auth/sign-up/username',
      expect.objectContaining({
        body: JSON.stringify({ password: 'correct-horse-123', username: 'Stone_Player' }),
      }),
    );
    expect(fetcher).toHaveBeenCalledWith(
      'http://localhost:3001/api/auth/sign-in/username',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    const signInCall = fetcher.mock.calls.find(([url]) =>
      String(url).endsWith('/api/auth/sign-in/username'),
    );
    expect(JSON.parse(String(signInCall?.[1]?.body))).toEqual({
      password: 'correct-horse-123',
      rememberMe: true,
      username: 'Stone_Player',
    });
    expect(session?.user.username).toBe('stone_player');
  });

  it('updates the username and uploads an avatar through dedicated endpoints', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (String(input).endsWith('/get-session')) {
        return new Response(
          JSON.stringify({
            session: { expiresAt: '2026-08-05T00:00:00.000Z' },
            user: {
              displayUsername: 'New_Player',
              id: 'player-1',
              name: 'New_Player',
              username: 'new_player',
            },
          }),
        );
      }
      if (String(input).includes('/profile/avatar')) {
        return new Response(
          JSON.stringify({
            bio: '',
            createdAt: '2026-07-29T00:00:00.000Z',
            hasAvatar: true,
            nickname: 'Player',
            updatedAt: '2026-07-29T00:00:01.000Z',
            version: 2,
          }),
        );
      }
      return new Response('{}');
    });
    const client = new ApiClient('http://localhost:3001', fetcher);
    const avatar = new File([Uint8Array.from([137, 80, 78, 71])], 'avatar.png', {
      type: 'image/png',
    });

    const session = await client.updateUsername('New_Player');
    const profile = await client.uploadAvatar(avatar, 1);

    expect(session?.user.username).toBe('new_player');
    expect(profile.hasAvatar).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      'http://localhost:3001/api/auth/update-user',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetcher).toHaveBeenCalledWith(
      'http://localhost:3001/api/profile/avatar?expectedVersion=1',
      expect.objectContaining({
        body: avatar,
        headers: expect.objectContaining({ 'content-type': 'image/png' }),
        method: 'PUT',
      }),
    );
  });

  it('invokes the native fetch function with the browser global as its receiver', async () => {
    const browserFetch = vi.fn(async function (this: unknown) {
      if (this !== globalThis) {
        throw new TypeError('Illegal invocation');
      }
      return new Response(
        JSON.stringify({
          bio: '',
          createdAt: '2026-07-29T00:00:00.000Z',
          hasAvatar: false,
          nickname: 'Daniel',
          updatedAt: '2026-07-29T00:00:00.000Z',
          version: 1,
        }),
      );
    });
    vi.stubGlobal('fetch', browserFetch);

    try {
      await new ApiClient('http://localhost:3001').getProfile();
      expect(browserFetch).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('always sends authenticated requests with credentials and JSON headers', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          bio: '',
          createdAt: '2026-07-29T00:00:00.000Z',
          hasAvatar: false,
          nickname: 'Daniel',
          updatedAt: '2026-07-29T00:00:00.000Z',
          version: 1,
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    const client = new ApiClient('http://localhost:3001', fetcher);

    await client.getProfile();

    expect(fetcher).toHaveBeenCalledWith(
      'http://localhost:3001/api/profile',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
      }),
    );
  });

  it('rejects an invalid response instead of trusting its TypeScript shape', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ nickname: '<script>' })));

    await expect(new ApiClient('http://localhost:3001', fetcher).getProfile()).rejects.toThrow(
      'Invalid API response',
    );
  });

  it('maps structured server errors without exposing request bodies', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'AUTHENTICATION_REQUIRED',
            message: 'A valid session is required.',
            requestId: 'req-123',
          },
        }),
        { status: 401 },
      ),
    );

    const request = new ApiClient('http://localhost:3001', fetcher).getProfile();

    await expect(request).rejects.toEqual(
      expect.objectContaining({
        code: 'AUTHENTICATION_REQUIRED',
        requestId: 'req-123',
        status: 401,
      }),
    );
  });

  it('posts a terminal result using the stable game id', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          aiFinalReserve: 2,
          completedAt: '2026-07-29T00:00:00.000Z',
          difficulty: 'standard',
          gameId: '00000000-0000-4000-8000-000000000001',
          humanFinalReserve: 0,
          recordedAt: '2026-07-29T00:00:01.000Z',
          roundsPlayed: 5,
          rulesVersion: '1.0.0',
          source: 'solo-client',
          winner: 'human',
        }),
      ),
    );
    const client = new ApiClient('http://localhost:3001', fetcher);

    await client.recordSoloResult({
      aiFinalReserve: 2,
      completedAt: '2026-07-29T00:00:00.000Z',
      difficulty: 'standard',
      gameId: '00000000-0000-4000-8000-000000000001',
      humanFinalReserve: 0,
      roundsPlayed: 5,
      rulesVersion: '1.0.0',
      winner: 'human',
    });

    expect(fetcher).toHaveBeenCalledWith(
      'http://localhost:3001/api/results/solo',
      expect.objectContaining({
        body: expect.stringContaining('00000000-0000-4000-8000-000000000001'),
        method: 'POST',
      }),
    );
  });

  it('creates, joins and refreshes a multiplayer admission through body-only tickets', async () => {
    const admission = {
      gameServerUrl: 'ws://127.0.0.1:2567',
      playerId: 'player-one',
      roomId: '019b15db-9829-7b46-a6a5-6cfcb1ca84c5',
      ticket: 'signed-admission-ticket-that-is-long-enough-for-the-contract',
      ticketExpiresAt: '2026-07-30T18:00:45.000Z',
    };
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      return new Response(
        JSON.stringify(
          url.endsWith('/api/multiplayer/rooms')
            ? { ...admission, inviteCode: 'ABCD23' }
            : admission,
        ),
        { status: url.endsWith('/api/multiplayer/rooms') ? 201 : 200 },
      );
    });
    const client = new ApiClient('http://localhost:3001', fetcher);

    await expect(client.createMultiplayerRoom()).resolves.toMatchObject({
      inviteCode: 'ABCD23',
    });
    await expect(client.joinMultiplayerRoom('abcd23')).resolves.toMatchObject({
      roomId: admission.roomId,
    });
    await expect(client.refreshMultiplayerTicket(admission.roomId)).resolves.toMatchObject({
      ticket: admission.ticket,
    });

    expect(fetcher.mock.calls.map(([url]) => String(url))).not.toContain(
      expect.stringContaining(admission.ticket),
    );
    expect(fetcher).toHaveBeenCalledWith(
      'http://localhost:3001/api/multiplayer/join',
      expect.objectContaining({
        body: JSON.stringify({ code: 'abcd23' }),
        method: 'POST',
      }),
    );
  });

  it('loads the authenticated multiplayer transcript history', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ items: [], limit: 5, offset: 0, total: 0 })),
      );
    const client = new ApiClient('http://localhost:3001', fetcher);

    await expect(client.getMultiplayerHistory(5)).resolves.toMatchObject({ total: 0 });
    expect(fetcher).toHaveBeenCalledWith(
      'http://localhost:3001/api/results/multiplayer?limit=5&offset=0',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    );
  });
});
