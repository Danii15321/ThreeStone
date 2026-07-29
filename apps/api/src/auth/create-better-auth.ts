import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import type { Database } from '@three-stone/database';
import { schema } from '@three-stone/database';
import { betterAuth } from 'better-auth';
import { username } from 'better-auth/plugins';
import { createHash } from 'node:crypto';

import type { ApiEnvironment } from '../config/env.js';
import type { AuthGateway } from './auth-gateway.js';

const BLOCKED_EMAIL_PATHS = new Set([
  '/api/auth/sign-up/email',
  '/api/auth/sign-in/email',
  '/api/auth/send-verification-email',
  '/api/auth/verify-email',
  '/api/auth/request-password-reset',
  '/api/auth/reset-password',
  '/api/auth/delete-user/callback',
  '/api/auth/is-username-available',
]);

export function createBetterAuthGateway(
  database: Database,
  environment: ApiEnvironment,
): AuthGateway {
  const auth = betterAuth({
    advanced: {
      cookiePrefix: 'three-stone',
      useSecureCookies: environment.NODE_ENV === 'production',
    },
    basePath: '/api/auth',
    baseURL: environment.BETTER_AUTH_URL,
    database: drizzleAdapter(database, {
      provider: 'pg',
      schema: {
        account: schema.account,
        session: schema.session,
        user: schema.user,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
      maxPasswordLength: 128,
      minPasswordLength: 12,
      requireEmailVerification: false,
    },
    logger: {
      level: 'error',
    },
    plugins: [
      username({
        maxUsernameLength: 24,
        minUsernameLength: 3,
        usernameNormalization: normalizeUsername,
        validationOrder: { username: 'post-normalization' },
      }),
    ],
    rateLimit: {
      customRules: {
        '/change-password': { max: 3, window: 60 * 60 },
        '/delete-user': { max: 3, window: 60 * 60 },
        '/sign-in/username': { max: 10, window: 15 * 60 },
        '/sign-up/email': { max: 5, window: 15 * 60 },
        '/update-user': { max: 3, window: 60 * 60 },
      },
      enabled: true,
      max: environment.AUTH_RATE_LIMIT_MAX,
      window: environment.AUTH_RATE_LIMIT_WINDOW_SECONDS,
    },
    session: {
      expiresIn: 7 * 24 * 60 * 60,
      freshAge: 10 * 60,
      updateAge: 24 * 60 * 60,
    },
    secret: environment.BETTER_AUTH_SECRET,
    trustedOrigins: [environment.WEB_ORIGIN],
    user: {
      deleteUser: {
        enabled: true,
      },
    },
  });

  return {
    getSession: async (headers) => {
      const session = await auth.api.getSession({ headers });
      if (session === null || !session.user.username) {
        return null;
      }
      return {
        account: {
          createdAt: session.user.createdAt.toISOString(),
          displayUsername: session.user.displayUsername ?? session.user.username,
          id: session.user.id,
          image: session.user.image ?? null,
          updatedAt: session.user.updatedAt.toISOString(),
          username: session.user.username,
        },
        userId: session.user.id,
      };
    },
    handle: async (request) => {
      const path = new URL(request.url).pathname;
      if (BLOCKED_EMAIL_PATHS.has(path)) {
        return new Response(null, { status: 404 });
      }

      const internalRequest =
        path === '/api/auth/sign-up/username' ? await toInternalSignUpRequest(request) : request;
      return stripCompatibilityEmail(await auth.handler(internalRequest));
    },
  };
}

function normalizeUsername(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

function internalEmail(usernameValue: string): string {
  const digest = createHash('sha256').update(normalizeUsername(usernameValue)).digest('hex');
  return `${digest}@players.invalid`;
}

async function toInternalSignUpRequest(request: Request): Promise<Request> {
  const body: unknown = await request
    .clone()
    .json()
    .catch(() => null);
  const usernameValue =
    typeof body === 'object' &&
    body !== null &&
    'username' in body &&
    typeof (body as { readonly username?: unknown }).username === 'string'
      ? (body as { readonly username: string }).username.trim()
      : '';
  const password =
    typeof body === 'object' &&
    body !== null &&
    'password' in body &&
    typeof (body as { readonly password?: unknown }).password === 'string'
      ? (body as { readonly password: string }).password
      : '';
  const url = new URL(request.url);
  url.pathname = '/api/auth/sign-up/email';
  const headers = new Headers(request.headers);
  headers.delete('content-length');

  return new Request(url, {
    body: JSON.stringify({
      displayUsername: usernameValue,
      email: internalEmail(usernameValue),
      name: usernameValue,
      password,
      username: usernameValue,
    }),
    headers,
    method: 'POST',
  });
}

async function stripCompatibilityEmail(response: Response): Promise<Response> {
  if (!response.headers.get('content-type')?.includes('application/json')) {
    return response;
  }
  const payload: unknown = await response
    .clone()
    .json()
    .catch(() => undefined);
  if (payload === undefined) {
    return response;
  }
  return new Response(JSON.stringify(withoutEmailFields(payload)), {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function withoutEmailFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withoutEmailFields);
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'email' && key !== 'emailVerified')
      .map(([key, entry]) => [key, withoutEmailFields(entry)]),
  );
}
