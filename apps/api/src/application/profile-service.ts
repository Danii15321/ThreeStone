import type {
  PlayerPreferences,
  PlayerProfile,
  UpdatePlayerPreferencesRequest,
  UpdatePlayerProfileRequest,
} from '@three-stone/api-contracts';

import type { AvatarMediaType, PlayerRepository } from '../domain/repositories.js';
import { validateAvatarImage, type ValidatedAvatarImage } from './avatar-image.js';

const DEFAULT_PREFERENCES: UpdatePlayerPreferencesRequest = {
  difficulty: 'standard',
  highContrast: false,
  motion: 'system',
  muted: false,
  soundVolume: 0.8,
  tutorialCompleted: false,
};

export class ProfileService {
  constructor(
    private readonly repository: PlayerRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async getPreferences(userId: string): Promise<PlayerPreferences> {
    return (
      (await this.repository.findPreferences(userId)) ??
      this.repository.savePreferences(userId, DEFAULT_PREFERENCES, this.clock())
    );
  }

  getProfile(userId: string): Promise<PlayerProfile | null> {
    return this.repository.findProfile(userId);
  }

  async getAvatar(
    userId: string,
  ): Promise<{ readonly bytes: Uint8Array; readonly mediaType: AvatarMediaType } | null> {
    const avatar = await this.repository.findAvatar(userId);
    return avatar === null
      ? null
      : {
          bytes: Uint8Array.from(Buffer.from(avatar.base64, 'base64')),
          mediaType: avatar.mediaType,
        };
  }

  updatePreferences(
    userId: string,
    preferences: UpdatePlayerPreferencesRequest,
  ): Promise<PlayerPreferences> {
    return this.repository.savePreferences(userId, preferences, this.clock());
  }

  updateProfile(userId: string, profile: UpdatePlayerProfileRequest): Promise<PlayerProfile> {
    return this.repository.saveProfile(
      userId,
      profile.nickname,
      profile.bio,
      profile.expectedVersion,
      this.clock(),
    );
  }

  updateAvatar(
    userId: string,
    bytes: Uint8Array,
    mediaType: string,
    expectedVersion: number,
  ): Promise<PlayerProfile> {
    const avatar: ValidatedAvatarImage = validateAvatarImage(bytes, mediaType);
    return this.repository.saveAvatar(
      userId,
      {
        base64: Buffer.from(avatar.bytes).toString('base64'),
        mediaType: avatar.mediaType,
      },
      expectedVersion,
      this.clock(),
    );
  }

  deleteAvatar(userId: string, expectedVersion: number): Promise<PlayerProfile> {
    return this.repository.saveAvatar(userId, null, expectedVersion, this.clock());
  }
}
