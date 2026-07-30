import { describe, expect, it } from 'vitest';

import { readEnvironment } from './env.js';

const requiredEnvironment = {
  BETTER_AUTH_SECRET: 'test-secret-with-at-least-32-characters',
  DATABASE_URL: 'postgres://user:password@localhost:5432/three_stone',
  GAME_SERVER_INTERNAL_SECRET: 'internal-test-secret-with-at-least-32-chars',
  MULTIPLAYER_TICKET_SECRET: 'ticket-test-secret-with-at-least-32-characters',
};

describe('readEnvironment', () => {
  it('keeps the local database pool default', () => {
    expect(readEnvironment(requiredEnvironment)).toMatchObject({
      DATABASE_MAX_CONNECTIONS: 10,
      GAME_SERVER_INSTANCE_ID: 'game-server-local',
      GAME_SERVER_INTERNAL_URL: 'http://127.0.0.1:2567',
      GAME_SERVER_PUBLIC_URL: 'ws://127.0.0.1:2567',
      MULTIPLAYER_RATE_LIMIT_MAX: 30,
    });
  });

  it('accepts a bounded serverless database pool size', () => {
    expect(
      readEnvironment({
        ...requiredEnvironment,
        DATABASE_MAX_CONNECTIONS: '1',
      }).DATABASE_MAX_CONNECTIONS,
    ).toBe(1);
  });

  it('uses the stable Vercel origin for production cookies and CORS', () => {
    const environment = readEnvironment({
      ...requiredEnvironment,
      VERCEL_ENV: 'production',
      VERCEL_PROJECT_PRODUCTION_URL: 'three-stone.example.vercel.app',
      VERCEL_URL: 'three-stone-deployment.example.vercel.app',
    });

    expect(environment.BETTER_AUTH_URL).toBe('https://three-stone.example.vercel.app');
    expect(environment.WEB_ORIGIN).toBe('https://three-stone.example.vercel.app');
  });

  it('uses the current Vercel URL in preview', () => {
    const environment = readEnvironment({
      ...requiredEnvironment,
      VERCEL_ENV: 'preview',
      VERCEL_PROJECT_PRODUCTION_URL: 'three-stone.example.vercel.app',
      VERCEL_URL: 'three-stone-preview.example.vercel.app',
    });

    expect(environment.BETTER_AUTH_URL).toBe('https://three-stone-preview.example.vercel.app');
    expect(environment.WEB_ORIGIN).toBe('https://three-stone-preview.example.vercel.app');
  });
});
