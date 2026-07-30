import type {
  CreateSoloResultRequest,
  MultiplayerGameHistoryQuery,
  PlayerPreferences,
  PlayerProfile,
  SoloGameResult,
  SoloResultHistoryQuery,
  UpdatePlayerPreferencesRequest,
} from '@three-stone/api-contracts';

import { AccountExportService } from '../application/account-export-service.js';
import { ProfileService } from '../application/profile-service.js';
import { MultiplayerHistoryService } from '../application/multiplayer-history-service.js';
import { SoloResultsService } from '../application/solo-results-service.js';
import type { ApiDependencies } from '../app.js';
import type { AuthGateway } from '../auth/auth-gateway.js';
import type {
  PlayerAvatar,
  MultiplayerHistoryRepository,
  PlayerRepository,
  SaveSoloResultOutcome,
  SoloResultRepository,
} from '../domain/repositories.js';
import { FixedWindowRateLimiter } from '../http/rate-limiter.js';

const NOW = new Date('2026-07-29T10:00:00.000Z');

class TestPlayerRepository implements PlayerRepository {
  private readonly avatars = new Map<string, PlayerAvatar>();
  private readonly preferences = new Map<string, PlayerPreferences>();
  private readonly profiles = new Map<string, PlayerProfile>();

  async findPreferences(userId: string) {
    return this.preferences.get(userId) ?? null;
  }

  async findProfile(userId: string) {
    return this.profiles.get(userId) ?? null;
  }

  async findAvatar(userId: string) {
    return this.avatars.get(userId) ?? null;
  }

  async savePreferences(userId: string, preferences: UpdatePlayerPreferencesRequest, now: Date) {
    const saved = { ...preferences, updatedAt: now.toISOString() };
    this.preferences.set(userId, saved);
    return saved;
  }

  async saveProfile(
    userId: string,
    nickname: string,
    bio: string,
    expectedVersion: number,
    now: Date,
  ) {
    const current = this.profiles.get(userId);
    const saved = {
      createdAt: current?.createdAt ?? now.toISOString(),
      bio,
      hasAvatar: current?.hasAvatar ?? false,
      nickname,
      updatedAt: now.toISOString(),
      version: expectedVersion + 1,
    };
    this.profiles.set(userId, saved);
    return saved;
  }

  async saveAvatar(
    userId: string,
    avatar: PlayerAvatar | null,
    expectedVersion: number,
    now: Date,
  ) {
    if (avatar === null) {
      this.avatars.delete(userId);
    } else {
      this.avatars.set(userId, avatar);
    }
    const current = this.profiles.get(userId);
    const saved = {
      bio: current?.bio ?? '',
      createdAt: current?.createdAt ?? now.toISOString(),
      hasAvatar: avatar !== null,
      nickname: current?.nickname ?? 'Player',
      updatedAt: now.toISOString(),
      version: expectedVersion + 1,
    };
    this.profiles.set(userId, saved);
    return saved;
  }
}

class TestResultRepository implements SoloResultRepository {
  async list(userId: string, query: SoloResultHistoryQuery) {
    void userId;
    return { items: [], limit: query.limit, offset: query.offset, total: 0 };
  }

  async save(
    userId: string,
    input: CreateSoloResultRequest,
    now: Date,
  ): Promise<SaveSoloResultOutcome> {
    void userId;
    const result: SoloGameResult = {
      ...input,
      recordedAt: now.toISOString(),
      source: 'solo-client',
    };
    return { kind: 'created', result };
  }

  async stats(userId: string) {
    void userId;
    return { averageRounds: 0, gamesPlayed: 0, losses: 0, winRate: 0, wins: 0 };
  }
}

class TestMultiplayerHistoryRepository implements MultiplayerHistoryRepository {
  async list(userId: string, query: MultiplayerGameHistoryQuery) {
    void userId;
    return { items: [], limit: query.limit, offset: query.offset, total: 0 };
  }
}

export function createTestDependencies(
  options: {
    readonly authRateLimit?: number;
    readonly userId?: string;
  } = {},
): ApiDependencies {
  const authGateway: AuthGateway = {
    getSession: async () =>
      options.userId === undefined
        ? null
        : {
            account: {
              createdAt: NOW.toISOString(),
              displayUsername: options.userId === 'export-owner' ? 'ExportOwner' : 'TestPlayer',
              id: options.userId,
              image: null,
              updatedAt: NOW.toISOString(),
              username: options.userId === 'export-owner' ? 'exportowner' : 'testplayer',
            },
            userId: options.userId,
          },
    handle: async () => new Response(null, { status: 204 }),
  };
  const profileService = new ProfileService(new TestPlayerRepository(), () => NOW);
  const resultsService = new SoloResultsService(new TestResultRepository(), () => NOW);

  return {
    accountExportService: new AccountExportService(profileService, resultsService, () => NOW),
    authGateway,
    authRateLimiter: new FixedWindowRateLimiter(options.authRateLimit ?? 10, 60_000),
    maxRequestBodyBytes: 32_768,
    multiplayerAdmissionService: {
      create: async () => {
        throw new Error('Unexpected multiplayer create call in this test.');
      },
      join: async () => {
        throw new Error('Unexpected multiplayer join call in this test.');
      },
      refresh: async () => {
        throw new Error('Unexpected multiplayer refresh call in this test.');
      },
    },
    multiplayerHistoryService: new MultiplayerHistoryService(
      new TestMultiplayerHistoryRepository(),
    ),
    multiplayerRateLimiter: new FixedWindowRateLimiter(30, 60_000),
    profileService,
    readinessProbe: async () => true,
    resultsService,
    webOrigin: 'http://localhost:5173',
  };
}
