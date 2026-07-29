import { z } from 'zod';

import { gameDifficultySchema } from './preferences.js';

const reserveSchema = z.number().int().min(0).max(3);

export const soloResultWinnerSchema = z.enum(['human', 'ai']);

export const createSoloResultRequestSchema = z
  .object({
    aiFinalReserve: reserveSchema,
    completedAt: z.iso.datetime(),
    difficulty: gameDifficultySchema,
    gameId: z.uuid(),
    humanFinalReserve: reserveSchema,
    roundsPlayed: z.number().int().min(1).max(10_000),
    rulesVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    winner: soloResultWinnerSchema,
  })
  .superRefine((result, context) => {
    const winnerReserve =
      result.winner === 'human' ? result.humanFinalReserve : result.aiFinalReserve;
    const loserReserve =
      result.winner === 'human' ? result.aiFinalReserve : result.humanFinalReserve;

    if (winnerReserve !== 0 || loserReserve === 0) {
      context.addIssue({
        code: 'custom',
        message: 'A terminal solo result must have exactly one winner with an empty reserve.',
        path: ['winner'],
      });
    }
  });

export const soloGameResultSchema = createSoloResultRequestSchema.extend({
  recordedAt: z.iso.datetime(),
  source: z.literal('solo-client'),
});

export const soloResultHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const soloResultHistorySchema = z.object({
  items: z.array(soloGameResultSchema),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const soloStatsSchema = z.object({
  averageRounds: z.number().nonnegative(),
  gamesPlayed: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1),
  wins: z.number().int().nonnegative(),
});

export type CreateSoloResultRequest = z.infer<typeof createSoloResultRequestSchema>;
export type SoloGameResult = z.infer<typeof soloGameResultSchema>;
export type SoloResultHistory = z.infer<typeof soloResultHistorySchema>;
export type SoloResultHistoryQuery = z.infer<typeof soloResultHistoryQuerySchema>;
export type SoloStats = z.infer<typeof soloStatsSchema>;
