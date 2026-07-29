import type {
  CreateSoloResultRequest,
  SoloGameResult,
  SoloResultHistory,
  SoloResultHistoryQuery,
  SoloStats,
} from '@three-stone/api-contracts';

import { ConflictError } from '../domain/errors.js';
import type { SoloResultRepository } from '../domain/repositories.js';

export class SoloResultsService {
  constructor(
    private readonly repository: SoloResultRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  history(userId: string, query: SoloResultHistoryQuery): Promise<SoloResultHistory> {
    return this.repository.list(userId, query);
  }

  async record(userId: string, input: CreateSoloResultRequest): Promise<SoloGameResult> {
    const outcome = await this.repository.save(userId, input, this.clock());

    if (outcome.kind === 'contradiction') {
      throw new ConflictError(
        'GAME_RESULT_CONTRADICTION',
        'This game identifier is already associated with a different result.',
      );
    }

    return outcome.result;
  }

  stats(userId: string): Promise<SoloStats> {
    return this.repository.stats(userId);
  }
}
