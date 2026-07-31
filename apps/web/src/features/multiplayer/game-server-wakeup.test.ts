import { describe, expect, it, vi } from 'vitest';

import { wakeGameServer } from './game-server-wakeup.js';

describe('game-server wakeup', () => {
  it('converts the public WebSocket endpoint into the readiness endpoint', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }));

    await wakeGameServer('wss://three-stone-game-server.onrender.com', { fetcher });

    expect(fetcher).toHaveBeenCalledWith(
      'https://three-stone-game-server.onrender.com/health/ready',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('retries transient cold-start failures until the service is ready', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('cold'))
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const wait = vi.fn(async () => undefined);

    await wakeGameServer('wss://three-stone-game-server.onrender.com', {
      fetcher,
      maxAttempts: 3,
      wait,
    });

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it('reports an unavailable prototype after the retry budget', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 503 }));

    await expect(
      wakeGameServer('wss://three-stone-game-server.onrender.com', {
        fetcher,
        maxAttempts: 2,
        wait: async () => undefined,
      }),
    ).rejects.toThrow('GAME_SERVER_WAKE_TIMEOUT');
  });
});
