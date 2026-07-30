import { z } from 'zod';

const gameServerEnvironmentSchema = z.object({
  DATABASE_MAX_CONNECTIONS: z.coerce.number().int().min(1).max(20).default(10),
  DATABASE_URL: z.url(),
  GAME_SERVER_HOST: z.string().min(1).default('0.0.0.0'),
  GAME_SERVER_PORT: z.coerce.number().int().min(1).max(65_535).default(2567),
  MULTIPLAYER_TICKET_SECRET: z.string().min(32),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type GameServerEnvironment = z.infer<typeof gameServerEnvironmentSchema>;

export function readGameServerEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): GameServerEnvironment {
  return gameServerEnvironmentSchema.parse(source);
}
