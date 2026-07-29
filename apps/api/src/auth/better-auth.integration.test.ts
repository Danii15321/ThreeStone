import { createDatabase, schema } from '@three-stone/database';
import { inArray } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import type { ApiEnvironment } from '../config/env.js';
import { createBetterAuthGateway } from './create-better-auth.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const database = databaseUrl === undefined ? null : createDatabase(databaseUrl);
const integration = describe.skipIf(database === null);
const integrationTestAuthSecret = '0'.repeat(32);

const environment: ApiEnvironment = {
  API_HOST: '127.0.0.1',
  API_PORT: 3001,
  AUTH_RATE_LIMIT_MAX: 100,
  AUTH_RATE_LIMIT_WINDOW_SECONDS: 60,
  BETTER_AUTH_SECRET: integrationTestAuthSecret,
  BETTER_AUTH_URL: 'http://localhost:3001',
  DATABASE_URL: databaseUrl ?? 'postgres://unused',
  MAX_REQUEST_BODY_BYTES: 32_768,
  NODE_ENV: 'test',
  WEB_ORIGIN: 'http://localhost:5173',
};

function jsonRequest(path: string, body: object, cookie?: string) {
  return new Request(`http://localhost:3001/api/auth/${path}`, {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      origin: environment.WEB_ORIGIN,
      ...(cookie === undefined ? {} : { cookie }),
    },
    method: 'POST',
  });
}

integration('Better Auth PostgreSQL lifecycle', () => {
  beforeEach(async () => {
    if (database === null) return;
    await database.db
      .delete(schema.user)
      .where(inArray(schema.user.username, ['deleted_player', 'renamed_player', 'stone_player']));
  });

  afterAll(async () => {
    await database?.close();
  });

  it('signs up and signs in with one case-insensitive unique username', async () => {
    if (database === null) return;
    const auth = createBetterAuthGateway(database.db, environment);
    const password = 'correct-horse-123';

    const signUp = await auth.handle(
      jsonRequest('sign-up/username', {
        password,
        username: 'Stone_Player',
      }),
    );
    expect(signUp.status).toBe(200);
    expect(signUp.headers.get('set-cookie')).toContain('HttpOnly');

    const duplicate = await auth.handle(
      jsonRequest('sign-up/username', {
        password,
        username: 'STONE_PLAYER',
      }),
    );
    expect(duplicate.status).not.toBe(200);

    const signIn = await auth.handle(
      jsonRequest('sign-in/username', { password, username: 'STONE_PLAYER' }),
    );
    expect(signIn.status).toBe(200);
    const cookie = signIn.headers.get('set-cookie')?.split(';')[0] ?? '';
    const session = await auth.getSession(new Headers({ cookie }));

    expect(session?.account).toMatchObject({
      displayUsername: 'Stone_Player',
      username: 'stone_player',
    });
    expect(session?.account).not.toHaveProperty('email');
    expect(session?.account).not.toHaveProperty('emailVerified');
  });

  it.each([
    'sign-up/email',
    'sign-in/email',
    'send-verification-email',
    'request-password-reset',
    'reset-password',
  ])('does not expose the legacy email route %s', async (path) => {
    if (database === null) return;
    const auth = createBetterAuthGateway(database.db, environment);

    const response = await auth.handle(jsonRequest(path, {}));

    expect(response.status).toBe(404);
  });

  it('updates the unique login username while preserving the active session', async () => {
    if (database === null) return;
    const auth = createBetterAuthGateway(database.db, environment);
    const password = 'correct-horse-123';
    const signUp = await auth.handle(
      jsonRequest('sign-up/username', {
        password,
        username: 'Stone_Player',
      }),
    );
    const cookie = signUp.headers.get('set-cookie')?.split(';')[0] ?? '';

    const update = await auth.handle(
      jsonRequest(
        'update-user',
        {
          displayUsername: 'Renamed_Player',
          name: 'Renamed_Player',
          username: 'Renamed_Player',
        },
        cookie,
      ),
    );

    expect(update.status).toBe(200);
    await expect(auth.getSession(new Headers({ cookie }))).resolves.toMatchObject({
      account: {
        displayUsername: 'Renamed_Player',
        username: 'renamed_player',
      },
    });
    expect(
      (await auth.handle(jsonRequest('sign-in/username', { password, username: 'Renamed_Player' })))
        .status,
    ).toBe(200);
  });

  it('changes the password for an authenticated player and revokes other sessions', async () => {
    if (database === null) return;
    const auth = createBetterAuthGateway(database.db, environment);
    const currentPassword = 'correct-horse-123';
    const newPassword = 'new-correct-horse-456';

    const signUp = await auth.handle(
      jsonRequest('sign-up/username', {
        password: currentPassword,
        username: 'Stone_Player',
      }),
    );
    const cookie = signUp.headers.get('set-cookie')?.split(';')[0] ?? '';

    const change = await auth.handle(
      jsonRequest(
        'change-password',
        {
          currentPassword,
          newPassword,
          revokeOtherSessions: true,
        },
        cookie,
      ),
    );
    expect(change.status).toBe(200);
    expect(
      (
        await auth.handle(
          jsonRequest('sign-in/username', {
            password: currentPassword,
            username: 'Stone_Player',
          }),
        )
      ).status,
    ).not.toBe(200);
    expect(
      (
        await auth.handle(
          jsonRequest('sign-in/username', {
            password: newPassword,
            username: 'Stone_Player',
          }),
        )
      ).status,
    ).toBe(200);
  });

  it('hard-deletes identity, sessions and application data after password confirmation', async () => {
    if (database === null) return;
    const auth = createBetterAuthGateway(database.db, environment);
    const password = 'correct-horse-123';

    const signUp = await auth.handle(
      jsonRequest('sign-up/username', {
        password,
        username: 'Deleted_Player',
      }),
    );
    const cookie = signUp.headers.get('set-cookie')?.split(';')[0] ?? '';
    const session = await auth.getSession(new Headers({ cookie }));
    expect(session).not.toBeNull();
    await database.db.insert(schema.playerProfile).values({
      createdAt: new Date(),
      nickname: 'Deleted_Player',
      updatedAt: new Date(),
      userId: session?.userId ?? '',
      version: 1,
    });

    const deletion = await auth.handle(jsonRequest('delete-user', { password }, cookie));

    expect(deletion.status).toBe(200);
    await expect(
      database.db
        .select()
        .from(schema.user)
        .where(inArray(schema.user.username, ['deleted_player'])),
    ).resolves.toEqual([]);
    await expect(
      database.db
        .select()
        .from(schema.playerProfile)
        .where(inArray(schema.playerProfile.userId, [session?.userId ?? ''])),
    ).resolves.toEqual([]);
  });
});
