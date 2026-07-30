import { describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import { createTestDependencies } from './test-support/create-test-dependencies.js';

describe('v1 API boundaries', () => {
  it('requires a session on account-owned routes', async () => {
    const response = await createApp(createTestDependencies()).request('/api/profile');

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'AUTHENTICATION_REQUIRED',
      },
    });
  });

  it('exports only non-secret account-owned application data', async () => {
    const dependencies = createTestDependencies({ userId: 'export-owner' });
    const response = await createApp(dependencies).request('/api/account/export');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain('account-export.json');
    const body = await response.json();
    expect(body).toMatchObject({
      account: {
        displayUsername: 'ExportOwner',
        id: 'export-owner',
        username: 'exportowner',
      },
      profile: null,
      results: [],
      schemaVersion: '1.0.0',
      stats: { gamesPlayed: 0 },
    });
    expect(JSON.stringify(body)).not.toMatch(/cookie|password|session|token/i);
  });

  it('accepts credentials only for the configured origin', async () => {
    const app = createApp(createTestDependencies());
    const allowed = await app.request('/api/health/live', {
      headers: { Origin: 'http://localhost:5173' },
    });
    const denied = await app.request('/api/health/live', {
      headers: { Origin: 'https://attacker.example' },
    });

    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('allows the client CSRF marker in an authenticated preflight', async () => {
    const response = await createApp(createTestDependencies()).request('/api/profile', {
      headers: {
        'access-control-request-headers': 'content-type,x-requested-with',
        'access-control-request-method': 'PATCH',
        origin: 'http://localhost:5173',
      },
      method: 'OPTIONS',
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-headers')).toContain('x-requested-with');
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('does not accept a user id supplied by the client', async () => {
    const dependencies = createTestDependencies({ userId: 'session-owner' });
    const response = await createApp(dependencies).request('/api/profile', {
      body: JSON.stringify({ expectedVersion: 0, nickname: 'ValidName', userId: 'victim' }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    });

    expect(response.status).toBe(422);
  });

  it('stores and serves a validated private avatar for the session owner', async () => {
    const app = createApp(createTestDependencies({ userId: 'avatar-owner' }));
    const profile = await app.request('/api/profile', {
      body: JSON.stringify({ bio: '', expectedVersion: 0, nickname: 'Avatar Player' }),
      headers: {
        'content-type': 'application/json',
        'x-requested-with': 'three-stone-web',
      },
      method: 'PATCH',
    });
    expect(profile.status).toBe(200);

    const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const upload = await app.request('/api/profile/avatar?expectedVersion=1', {
      body: pngSignature,
      headers: {
        'content-type': 'image/png',
        'x-requested-with': 'three-stone-web',
      },
      method: 'PUT',
    });

    expect(upload.status).toBe(200);
    await expect(upload.json()).resolves.toMatchObject({ hasAvatar: true, version: 2 });

    const stored = await app.request('/api/profile/avatar');
    expect(stored.status).toBe(200);
    expect(stored.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await stored.arrayBuffer())).toEqual(pngSignature);

    const participantAvatar = await app.request('/api/players/avatar-owner/avatar');
    expect(participantAvatar.status).toBe(200);
    expect(new Uint8Array(await participantAvatar.arrayBuffer())).toEqual(pngSignature);
  });

  it('rejects an avatar whose bytes do not match its declared format', async () => {
    const response = await createApp(createTestDependencies({ userId: 'avatar-owner' })).request(
      '/api/profile/avatar?expectedVersion=0',
      {
        body: new Uint8Array([1, 2, 3]),
        headers: {
          'content-type': 'image/png',
          'x-requested-with': 'three-stone-web',
        },
        method: 'PUT',
      },
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
  });

  it('returns unavailable when PostgreSQL readiness fails', async () => {
    const dependencies = createTestDependencies();
    dependencies.readinessProbe = async () => false;

    const response = await createApp(dependencies).request('/api/health/ready');

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      checks: { database: 'unavailable' },
      service: 'api',
      status: 'unavailable',
    });
  });

  it('rate limits repeated sensitive auth requests without echoing credentials', async () => {
    const app = createApp(createTestDependencies({ authRateLimit: 2 }));
    const request = () =>
      app.request('/api/auth/sign-in/username', {
        body: JSON.stringify({ password: 'not-for-logs', username: 'PrivatePlayer' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

    expect((await request()).status).toBe(204);
    expect((await request()).status).toBe(204);
    const limited = await request();
    expect(limited.status).toBe(429);
    expect(await limited.text()).not.toContain('PrivatePlayer');
  });

  it('rate limits sign-in by a non-reversible normalized account key', async () => {
    const app = createApp(createTestDependencies({ authRateLimit: 100 }));
    const request = (username: string) =>
      app.request('/api/auth/sign-in/username', {
        body: JSON.stringify({ password: 'not-for-logs', username }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

    for (const username of [
      'Player_One',
      ' player_one ',
      'PLAYER_ONE',
      'player_one',
      'Player_One',
      ' player_one ',
      'PLAYER_ONE',
      'player_one',
      'Player_One',
      'PLAYER_ONE',
    ]) {
      expect((await request(username)).status).toBe(204);
    }
    const limited = await request('player_one');
    expect(limited.status).toBe(429);
    expect(await limited.text()).not.toContain('player_one');
  });
});
