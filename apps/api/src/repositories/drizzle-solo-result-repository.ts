import {
  soloGameResultSchema,
  soloResultHistorySchema,
  soloStatsSchema,
  type CreateSoloResultRequest,
  type SoloGameResult,
  type SoloResultHistory,
  type SoloResultHistoryQuery,
  type SoloStats,
} from '@three-stone/api-contracts';
import type { Database } from '@three-stone/database';
import { schema } from '@three-stone/database';
import { and, count, desc, eq, sql } from 'drizzle-orm';

import type { SaveSoloResultOutcome, SoloResultRepository } from '../domain/repositories.js';

function fingerprint(input: CreateSoloResultRequest): string {
  return [
    input.aiFinalReserve,
    input.completedAt,
    input.difficulty,
    input.gameId,
    input.humanFinalReserve,
    input.roundsPlayed,
    input.rulesVersion,
    input.winner,
  ].join('|');
}

function mapResult(row: typeof schema.gameRecord.$inferSelect): SoloGameResult {
  return soloGameResultSchema.parse({
    ...(row.terminalPayload as Record<string, unknown>),
    recordedAt: row.recordedAt.toISOString(),
    source: 'solo-client',
  });
}

export class DrizzleSoloResultRepository implements SoloResultRepository {
  constructor(private readonly database: Database) {}

  async list(userId: string, query: SoloResultHistoryQuery): Promise<SoloResultHistory> {
    const [rows, totalRows] = await Promise.all([
      this.database
        .select()
        .from(schema.gameRecord)
        .where(and(eq(schema.gameRecord.userId, userId), eq(schema.gameRecord.mode, 'solo')))
        .orderBy(desc(schema.gameRecord.completedAt), desc(schema.gameRecord.gameId))
        .limit(query.limit)
        .offset(query.offset),
      this.database
        .select({ value: count() })
        .from(schema.gameRecord)
        .where(and(eq(schema.gameRecord.userId, userId), eq(schema.gameRecord.mode, 'solo'))),
    ]);

    return soloResultHistorySchema.parse({
      items: rows.map(mapResult),
      limit: query.limit,
      offset: query.offset,
      total: totalRows[0]?.value ?? 0,
    });
  }

  async save(
    userId: string,
    input: CreateSoloResultRequest,
    now: Date,
  ): Promise<SaveSoloResultOutcome> {
    const inputFingerprint = fingerprint(input);

    return this.database.transaction(async (transaction) => {
      const [inserted] = await transaction
        .insert(schema.gameRecord)
        .values({
          completedAt: new Date(input.completedAt),
          difficulty: input.difficulty,
          fingerprint: inputFingerprint,
          gameId: input.gameId,
          mode: 'solo',
          recordedAt: now,
          roundsPlayed: input.roundsPlayed,
          rulesVersion: input.rulesVersion,
          source: 'solo-client',
          terminalPayload: input,
          userId,
          winner: input.winner,
        })
        .onConflictDoNothing({ target: schema.gameRecord.gameId })
        .returning();

      if (inserted !== undefined) {
        await transaction.insert(schema.gameParticipant).values([
          {
            finalReserve: input.humanFinalReserve,
            gameId: input.gameId,
            outcome: input.winner === 'human' ? 'win' : 'loss',
            seat: 'human',
            userId,
          },
          {
            finalReserve: input.aiFinalReserve,
            gameId: input.gameId,
            outcome: input.winner === 'ai' ? 'win' : 'loss',
            seat: 'ai',
            userId: null,
          },
        ]);

        return { kind: 'created', result: mapResult(inserted) };
      }

      const [existing] = await transaction
        .select()
        .from(schema.gameRecord)
        .where(eq(schema.gameRecord.gameId, input.gameId))
        .limit(1);

      if (
        existing === undefined ||
        existing.userId !== userId ||
        existing.fingerprint !== inputFingerprint
      ) {
        return { kind: 'contradiction' };
      }

      return { kind: 'existing', result: mapResult(existing) };
    });
  }

  async stats(userId: string): Promise<SoloStats> {
    const [row] = await this.database
      .select({
        averageRounds: sql<number>`coalesce(avg(${schema.gameRecord.roundsPlayed}), 0)::float8`,
        gamesPlayed: count(),
        wins: sql<number>`count(*) filter (where ${schema.gameRecord.winner} = 'human')::int`,
      })
      .from(schema.gameRecord)
      .where(and(eq(schema.gameRecord.userId, userId), eq(schema.gameRecord.mode, 'solo')));

    const gamesPlayed = row?.gamesPlayed ?? 0;
    const wins = row?.wins ?? 0;

    return soloStatsSchema.parse({
      averageRounds: row?.averageRounds ?? 0,
      gamesPlayed,
      losses: gamesPlayed - wins,
      winRate: gamesPlayed === 0 ? 0 : wins / gamesPlayed,
      wins,
    });
  }
}
