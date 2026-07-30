import {
  accountExportSchema,
  apiErrorResponseSchema,
  createSoloResultRequestSchema,
  healthResponseSchema,
  joinMultiplayerRoomRequestSchema,
  joinMultiplayerRoomResponseSchema,
  playerPreferencesSchema,
  playerProfileSchema,
  readinessResponseSchema,
  soloGameResultSchema,
  soloResultHistoryQuerySchema,
  soloResultHistorySchema,
  soloStatsSchema,
  updatePlayerPreferencesRequestSchema,
  updatePlayerProfileRequestSchema,
  createMultiplayerRoomResponseSchema,
  type AccountMetadata,
  type ApiErrorCode,
} from '@three-stone/api-contracts';
import { getConnInfo } from '@hono/node-server/conninfo';
import { createHash } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z, ZodError, type ZodType } from 'zod';

import type { AccountExportService } from './application/account-export-service.js';
import { AvatarValidationError, MAX_AVATAR_BYTES } from './application/avatar-image.js';
import {
  RoomUnavailableError,
  type MultiplayerAdmissionService,
} from './application/multiplayer-admission-service.js';
import type { ProfileService } from './application/profile-service.js';
import type { SoloResultsService } from './application/solo-results-service.js';
import type { AuthGateway } from './auth/auth-gateway.js';
import { ConflictError } from './domain/errors.js';
import { FixedWindowRateLimiter, type RateLimiter } from './http/rate-limiter.js';

interface ApiVariables {
  account: AccountMetadata;
  requestId: string;
  userId: string;
}

type ApiContext = Context<{ Variables: ApiVariables }>;
const profileVersionQuerySchema = z.coerce.number().int().nonnegative();

export interface ApiDependencies {
  accountExportService: AccountExportService;
  authGateway: AuthGateway;
  authRateLimiter: RateLimiter;
  maxRequestBodyBytes: number;
  multiplayerAdmissionService: Pick<MultiplayerAdmissionService, 'create' | 'join' | 'refresh'>;
  multiplayerRateLimiter: RateLimiter;
  profileService: ProfileService;
  readinessProbe: () => Promise<boolean>;
  resultsService: SoloResultsService;
  webOrigin: string;
}

function errorResponse(
  context: ApiContext,
  status: ContentfulStatusCode,
  code: ApiErrorCode,
  message: string,
  details?: Record<string, string[]>,
) {
  const payload = apiErrorResponseSchema.parse({
    error: {
      code,
      ...(details === undefined ? {} : { details }),
      message,
      requestId: context.get('requestId'),
    },
  });
  return context.json(payload, status);
}

async function parseJson<T>(context: ApiContext, schema: ZodType<T>): Promise<T> {
  return schema.parse(await context.req.json());
}

function clientKey(context: ApiContext): string {
  try {
    return getConnInfo(context).remote.address ?? 'unknown-client';
  } catch {
    return 'unknown-client';
  }
}

export function createApp(dependencies?: ApiDependencies) {
  const app = new Hono<{ Variables: ApiVariables }>();
  const accountRateLimiters = new Map<string, RateLimiter>([
    ['/api/auth/delete-user', new FixedWindowRateLimiter(3, 60 * 60 * 1_000)],
    ['/api/auth/sign-in/username', new FixedWindowRateLimiter(10, 15 * 60 * 1_000)],
    ['/api/auth/update-user', new FixedWindowRateLimiter(3, 60 * 60 * 1_000)],
  ]);

  app.use('*', requestId());
  app.use('*', secureHeaders());

  if (dependencies !== undefined) {
    app.use(
      '/api/*',
      cors({
        allowHeaders: ['content-type', 'x-requested-with'],
        allowMethods: ['DELETE', 'GET', 'OPTIONS', 'PATCH', 'POST', 'PUT'],
        credentials: true,
        origin: (origin) => (origin === dependencies.webOrigin ? origin : ''),
      }),
    );
    const standardBodyLimit = bodyLimit({
      maxSize: dependencies.maxRequestBodyBytes,
      onError: (context) =>
        errorResponse(
          context,
          413,
          'PAYLOAD_TOO_LARGE',
          'The request body exceeds the allowed size.',
        ),
    });
    const avatarBodyLimit = bodyLimit({
      maxSize: MAX_AVATAR_BYTES,
      onError: (context) =>
        errorResponse(
          context,
          413,
          'PAYLOAD_TOO_LARGE',
          'The avatar image exceeds the allowed size.',
        ),
    });
    app.use('/api/*', (context, next) =>
      (context.req.path === '/api/profile/avatar' ? avatarBodyLimit : standardBodyLimit)(
        context,
        next,
      ),
    );

    app.use('/api/account/*', authenticate(dependencies.authGateway));
    app.use('/api/profile', authenticate(dependencies.authGateway));
    app.use('/api/profile/*', authenticate(dependencies.authGateway));
    app.use('/api/preferences', authenticate(dependencies.authGateway));
    app.use('/api/multiplayer/*', authenticate(dependencies.authGateway));
    app.use('/api/results/*', authenticate(dependencies.authGateway));
    app.use('/api/stats/*', authenticate(dependencies.authGateway));

    app.on(['POST', 'PUT', 'PATCH', 'DELETE'], '/api/auth/*', async (context) => {
      if (!dependencies.authRateLimiter.consume(clientKey(context))) {
        return errorResponse(
          context,
          429,
          'RATE_LIMITED',
          'Too many authentication attempts. Try again later.',
        );
      }
      const accountLimiter = accountRateLimiters.get(context.req.path);
      const accountKey =
        accountLimiter === undefined ? null : await privateAccountKey(context).catch(() => null);
      if (
        accountLimiter !== undefined &&
        accountKey !== null &&
        !accountLimiter.consume(accountKey)
      ) {
        return errorResponse(
          context,
          429,
          'RATE_LIMITED',
          'Too many authentication attempts. Try again later.',
        );
      }
      return dependencies.authGateway.handle(context.req.raw);
    });
    app.get('/api/auth/*', (context) => dependencies.authGateway.handle(context.req.raw));

    app.on('POST', '/api/multiplayer/*', async (context, next) => {
      const networkAllowed = dependencies.multiplayerRateLimiter.consume(
        `network:${clientKey(context)}`,
      );
      const accountAllowed = dependencies.multiplayerRateLimiter.consume(
        `account:${context.get('userId')}`,
      );
      if (!networkAllowed || !accountAllowed) {
        return errorResponse(
          context,
          429,
          'RATE_LIMITED',
          'Trop de tentatives multijoueurs. Réessayez plus tard.',
        );
      }
      await next();
    });

    app.post('/api/multiplayer/rooms', async (context) => {
      const admission = await dependencies.multiplayerAdmissionService.create(
        context.get('account'),
      );
      return context.json(createMultiplayerRoomResponseSchema.parse(admission), 201);
    });
    app.post('/api/multiplayer/join', async (context) => {
      const input = await parseJson(context, joinMultiplayerRoomRequestSchema);
      const admission = await dependencies.multiplayerAdmissionService.join(
        context.get('account'),
        input.code,
      );
      return context.json(joinMultiplayerRoomResponseSchema.parse(admission));
    });
    app.post('/api/multiplayer/rooms/:roomId/ticket', async (context) => {
      const roomId = z.uuid().parse(context.req.param('roomId'));
      const admission = await dependencies.multiplayerAdmissionService.refresh(
        context.get('account'),
        roomId,
      );
      return context.json(joinMultiplayerRoomResponseSchema.parse(admission));
    });

    app.get('/api/health/ready', async (context) => {
      const ready = await dependencies.readinessProbe().catch(() => false);
      const payload = readinessResponseSchema.parse({
        checks: { database: ready ? 'ok' : 'unavailable' },
        service: 'api',
        status: ready ? 'ready' : 'unavailable',
      });
      return context.json(payload, ready ? 200 : 503);
    });

    app.get('/api/profile', async (context) => {
      const profile = await dependencies.profileService.getProfile(context.get('userId'));
      return profile === null
        ? errorResponse(context, 404, 'NOT_FOUND', 'The player profile has not been created yet.')
        : context.json(playerProfileSchema.parse(profile));
    });
    app.patch('/api/profile', async (context) => {
      const input = await parseJson(context, updatePlayerProfileRequestSchema);
      const profile = await dependencies.profileService.updateProfile(context.get('userId'), input);
      return context.json(playerProfileSchema.parse(profile));
    });
    app.get('/api/profile/avatar', async (context) => {
      const avatar = await dependencies.profileService.getAvatar(context.get('userId'));
      if (avatar === null) {
        return errorResponse(context, 404, 'NOT_FOUND', 'The player has no avatar.');
      }
      return new Response(avatar.bytes, {
        headers: {
          'cache-control': 'private, max-age=3600',
          'content-type': avatar.mediaType,
          'x-content-type-options': 'nosniff',
        },
      });
    });
    app.put('/api/profile/avatar', async (context) => {
      const expectedVersion = profileVersionQuerySchema.parse(context.req.query('expectedVersion'));
      const mediaType = context.req.header('content-type')?.split(';')[0] ?? '';
      const bytes = new Uint8Array(await context.req.arrayBuffer());
      const profile = await dependencies.profileService.updateAvatar(
        context.get('userId'),
        bytes,
        mediaType,
        expectedVersion,
      );
      return context.json(playerProfileSchema.parse(profile));
    });
    app.delete('/api/profile/avatar', async (context) => {
      const expectedVersion = profileVersionQuerySchema.parse(context.req.query('expectedVersion'));
      const profile = await dependencies.profileService.deleteAvatar(
        context.get('userId'),
        expectedVersion,
      );
      return context.json(playerProfileSchema.parse(profile));
    });

    app.get('/api/preferences', async (context) =>
      context.json(
        playerPreferencesSchema.parse(
          await dependencies.profileService.getPreferences(context.get('userId')),
        ),
      ),
    );
    app.put('/api/preferences', async (context) => {
      const input = await parseJson(context, updatePlayerPreferencesRequestSchema);
      const preferences = await dependencies.profileService.updatePreferences(
        context.get('userId'),
        input,
      );
      return context.json(playerPreferencesSchema.parse(preferences));
    });

    app.post('/api/results/solo', async (context) => {
      const input = await parseJson(context, createSoloResultRequestSchema);
      const result = await dependencies.resultsService.record(context.get('userId'), input);
      return context.json(soloGameResultSchema.parse(result));
    });
    app.get('/api/results/solo', async (context) => {
      const query = soloResultHistoryQuerySchema.parse(context.req.query());
      const history = await dependencies.resultsService.history(context.get('userId'), query);
      return context.json(soloResultHistorySchema.parse(history));
    });
    app.get('/api/stats/solo', async (context) =>
      context.json(
        soloStatsSchema.parse(await dependencies.resultsService.stats(context.get('userId'))),
      ),
    );
    app.get('/api/account/export', async (context) => {
      const accountExport = await dependencies.accountExportService.export(
        context.get('userId'),
        context.get('account'),
      );
      return context.json(accountExportSchema.parse(accountExport), 200, {
        'content-disposition': 'attachment; filename="three-stone-account-export.json"',
      });
    });
  }

  app.get('/api/health/live', (context) =>
    context.json(healthResponseSchema.parse({ service: 'api', status: 'ok' })),
  );

  app.notFound((context) => errorResponse(context, 404, 'NOT_FOUND', 'Resource not found.'));

  app.onError((error, context) => {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      const details =
        error instanceof ZodError
          ? error.issues.reduce<Record<string, string[]>>((result, issue) => {
              const key = String(issue.path[0] ?? '_root');
              result[key] = [...(result[key] ?? []), issue.message];
              return result;
            }, {})
          : undefined;
      return errorResponse(context, 422, 'VALIDATION_ERROR', 'The request is invalid.', details);
    }
    if (error instanceof ConflictError) {
      return errorResponse(context, 409, 'CONFLICT', error.message);
    }
    if (error instanceof RoomUnavailableError) {
      return errorResponse(context, 409, 'ROOM_UNAVAILABLE', error.message);
    }
    if (error instanceof AvatarValidationError) {
      return errorResponse(context, 422, 'VALIDATION_ERROR', error.message);
    }

    console.error(
      JSON.stringify({
        errorName: error.name,
        method: context.req.method,
        path: context.req.path,
        requestId: context.get('requestId'),
      }),
    );
    return errorResponse(context, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
  });

  return app;
}

async function privateAccountKey(context: ApiContext): Promise<string | null> {
  if (context.req.path === '/api/auth/delete-user') {
    const cookie = context.req.header('cookie');
    return cookie === undefined ? null : createHash('sha256').update(cookie).digest('base64url');
  }

  const body: unknown = await context.req.raw.clone().json();
  if (
    typeof body !== 'object' ||
    body === null ||
    !('username' in body) ||
    typeof (body as { readonly username?: unknown }).username !== 'string'
  ) {
    return null;
  }
  return createHash('sha256')
    .update((body as { readonly username: string }).username.trim().toLocaleLowerCase('en-US'))
    .digest('base64url');
}

function authenticate(authGateway: AuthGateway) {
  return async (context: ApiContext, next: () => Promise<void>) => {
    const session = await authGateway.getSession(context.req.raw.headers);
    if (session === null) {
      return errorResponse(context, 401, 'AUTHENTICATION_REQUIRED', 'A valid session is required.');
    }
    context.set('account', session.account);
    context.set('userId', session.userId);
    await next();
  };
}
