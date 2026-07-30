import { describe, expect, it } from 'vitest';

import { readGameServerEnvironment } from './environment.js';

describe('game-server environment', () => {
  it('reads safe local defaults and required secrets', () => {
    expect(
      readGameServerEnvironment({
        DATABASE_URL: 'postgres://player:password@localhost:5432/three_stone_game',
        GAME_SERVER_INTERNAL_SECRET: 'an-internal-secret-that-is-long-enough',
        MULTIPLAYER_TICKET_SECRET: 'a-development-secret-that-is-long-enough',
      }),
    ).toMatchObject({
      GAME_SERVER_HOST: '0.0.0.0',
      GAME_SERVER_INSTANCE_ID: 'game-server-local',
      GAME_SERVER_PORT: 2567,
      NODE_ENV: 'development',
      WAITING_ROOM_LIFETIME_SECONDS: 900,
    });
  });

  it('rejects short ticket secrets and invalid ports', () => {
    expect(() =>
      readGameServerEnvironment({
        DATABASE_URL: 'postgres://player:password@localhost:5432/three_stone_game',
        GAME_SERVER_PORT: '0',
        GAME_SERVER_INTERNAL_SECRET: 'short',
        MULTIPLAYER_TICKET_SECRET: 'short',
      }),
    ).toThrow();
  });
});
