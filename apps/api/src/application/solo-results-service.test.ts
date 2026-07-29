import type {
  CreateSoloResultRequest,
  SoloGameResult,
  SoloResultHistoryQuery,
} from '@three-stone/api-contracts';
import { describe, expect, it } from 'vitest';

import { ConflictError } from '../domain/errors.js';
import type { SaveSoloResultOutcome, SoloResultRepository } from '../domain/repositories.js';
import { SoloResultsService } from './solo-results-service.js';

const NOW = new Date('2026-07-29T10:01:00.000Z');
const result: CreateSoloResultRequest = {
  aiFinalReserve: 2,
  completedAt: '2026-07-29T10:00:00.000Z',
  difficulty: 'standard',
  gameId: '9443e13b-05d3-4b24-a5cb-77c4ca048b1f',
  humanFinalReserve: 0,
  roundsPlayed: 4,
  rulesVersion: '1.0.0',
  winner: 'human',
};

class MemorySoloResultRepository implements SoloResultRepository {
  readonly records = new Map<string, { ownerId: string; result: SoloGameResult }>();

  async list(userId: string, query: SoloResultHistoryQuery) {
    const items = [...this.records.values()]
      .filter((record) => record.ownerId === userId)
      .map((record) => record.result);
    return { items, limit: query.limit, offset: query.offset, total: items.length };
  }

  async save(
    userId: string,
    input: CreateSoloResultRequest,
    now: Date,
  ): Promise<SaveSoloResultOutcome> {
    const existing = this.records.get(input.gameId);
    if (existing) {
      return JSON.stringify(existing.result, ['gameId', 'winner']) ===
        JSON.stringify(
          { ...input, recordedAt: existing.result.recordedAt, source: 'solo-client' },
          ['gameId', 'winner'],
        )
        ? { kind: 'existing', result: existing.result }
        : { kind: 'contradiction' };
    }

    const saved: SoloGameResult = {
      ...input,
      recordedAt: now.toISOString(),
      source: 'solo-client',
    };
    this.records.set(input.gameId, { ownerId: userId, result: saved });
    return { kind: 'created', result: saved };
  }

  async stats(userId: string) {
    const results = [...this.records.values()].filter((record) => record.ownerId === userId);
    const wins = results.filter((record) => record.result.winner === 'human').length;
    return {
      averageRounds:
        results.length === 0
          ? 0
          : results.reduce((sum, record) => sum + record.result.roundsPlayed, 0) / results.length,
      gamesPlayed: results.length,
      losses: results.length - wins,
      winRate: results.length === 0 ? 0 : wins / results.length,
      wins,
    };
  }
}

describe('SoloResultsService', () => {
  it('returns the same record when a terminal result is retried', async () => {
    const service = new SoloResultsService(new MemorySoloResultRepository(), () => NOW);

    const first = await service.record('user-a', result);
    const retried = await service.record('user-a', result);

    expect(retried).toEqual(first);
  });

  it('refuses a contradictory reuse of a stable game id', async () => {
    const service = new SoloResultsService(new MemorySoloResultRepository(), () => NOW);
    await service.record('user-a', result);

    await expect(
      service.record('user-a', {
        ...result,
        aiFinalReserve: 0,
        humanFinalReserve: 1,
        winner: 'ai',
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('keeps history and statistics isolated by authenticated user', async () => {
    const service = new SoloResultsService(new MemorySoloResultRepository(), () => NOW);
    await service.record('user-a', result);

    await expect(service.history('user-b', { limit: 20, offset: 0 })).resolves.toMatchObject({
      items: [],
      total: 0,
    });
    await expect(service.stats('user-b')).resolves.toMatchObject({
      gamesPlayed: 0,
      winRate: 0,
    });
  });
});
