import type {
  MultiplayerGameHistory,
  MultiplayerGameHistoryQuery,
  MultiplayerStats,
} from '@three-stone/api-contracts';

import type { MultiplayerHistoryRepository } from '../domain/repositories.js';

export class MultiplayerHistoryService {
  constructor(private readonly repository: MultiplayerHistoryRepository) {}

  list(userId: string, query: MultiplayerGameHistoryQuery): Promise<MultiplayerGameHistory> {
    return this.repository.list(userId, query);
  }

  stats(userId: string): Promise<MultiplayerStats> {
    return this.repository.stats(userId);
  }
}
