import { z } from 'zod';

const gameServerEnvironmentSchema = z
  .object({
    DATABASE_MAX_CONNECTIONS: z.coerce.number().int().min(1).max(20).default(10),
    DATABASE_URL: z.url(),
    GAME_SERVER_HOST: z.string().min(1).default('0.0.0.0'),
    GAME_SERVER_INSTANCE_ID: z.string().min(1).max(128).default('game-server-local'),
    GAME_SERVER_INTERNAL_SECRET: z.string().min(32),
    GAME_SERVER_PORT: z.coerce.number().int().min(1).max(65_535).default(2567),
    MULTIPLAYER_TICKET_SECRET: z.string().min(32),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    WAITING_ROOM_LIFETIME_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
    WEB_ORIGIN: z.url().default('http://localhost:5173'),
  })
  .superRefine((environment, context) => {
    if (
      environment.NODE_ENV === 'production' &&
      new URL(environment.WEB_ORIGIN).protocol !== 'https:'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'WEB_ORIGIN must use HTTPS in production.',
        path: ['WEB_ORIGIN'],
      });
    }
  });

export type GameServerEnvironment = z.infer<typeof gameServerEnvironmentSchema>;

export function readGameServerEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): GameServerEnvironment {
  return gameServerEnvironmentSchema.parse({
    ...source,
    GAME_SERVER_PORT: source.GAME_SERVER_PORT ?? source.PORT,
  });
}
