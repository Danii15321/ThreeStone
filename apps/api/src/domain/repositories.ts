import type {
  CreateSoloResultRequest,
  PlayerPreferences,
  PlayerProfile,
  SoloGameResult,
  SoloResultHistory,
  SoloResultHistoryQuery,
  SoloStats,
  UpdatePlayerPreferencesRequest,
} from '@three-stone/api-contracts';

export type AvatarMediaType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface PlayerAvatar {
  readonly base64: string;
  readonly mediaType: AvatarMediaType;
}

export interface PlayerRepository {
  findPreferences(userId: string): Promise<PlayerPreferences | null>;
  findProfile(userId: string): Promise<PlayerProfile | null>;
  findAvatar(userId: string): Promise<PlayerAvatar | null>;
  savePreferences(
    userId: string,
    preferences: UpdatePlayerPreferencesRequest,
    now: Date,
  ): Promise<PlayerPreferences>;
  saveProfile(
    userId: string,
    nickname: string,
    bio: string,
    expectedVersion: number,
    now: Date,
  ): Promise<PlayerProfile>;
  saveAvatar(
    userId: string,
    avatar: PlayerAvatar | null,
    expectedVersion: number,
    now: Date,
  ): Promise<PlayerProfile>;
}

export type SaveSoloResultOutcome =
  | { readonly kind: 'contradiction' }
  | { readonly kind: 'created' | 'existing'; readonly result: SoloGameResult };

export interface SoloResultRepository {
  list(userId: string, query: SoloResultHistoryQuery): Promise<SoloResultHistory>;
  save(userId: string, input: CreateSoloResultRequest, now: Date): Promise<SaveSoloResultOutcome>;
  stats(userId: string): Promise<SoloStats>;
}
