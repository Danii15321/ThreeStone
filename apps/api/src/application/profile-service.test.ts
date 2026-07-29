import type {
  PlayerPreferences,
  PlayerProfile,
  UpdatePlayerPreferencesRequest,
} from '@three-stone/api-contracts';
import { describe, expect, it } from 'vitest';

import { ConflictError } from '../domain/errors.js';
import type { PlayerAvatar, PlayerRepository } from '../domain/repositories.js';
import { ProfileService } from './profile-service.js';

class MemoryPlayerRepository implements PlayerRepository {
  readonly preferences = new Map<string, PlayerPreferences>();
  readonly profiles = new Map<string, PlayerProfile>();
  readonly avatars = new Map<string, PlayerAvatar>();

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
    if ((current?.version ?? 0) !== expectedVersion) {
      throw new ConflictError('PROFILE_VERSION_CONFLICT', 'Profile version conflict.');
    }
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
    const current = this.profiles.get(userId);
    if ((current?.version ?? 0) !== expectedVersion) {
      throw new ConflictError('PROFILE_VERSION_CONFLICT', 'Profile version conflict.');
    }
    if (avatar === null) this.avatars.delete(userId);
    else this.avatars.set(userId, avatar);
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

const NOW = new Date('2026-07-29T10:00:00.000Z');

describe('ProfileService', () => {
  it('creates isolated defaults lazily for each authenticated user', async () => {
    const repository = new MemoryPlayerRepository();
    const service = new ProfileService(repository, () => NOW);

    await expect(service.getPreferences('user-a')).resolves.toMatchObject({
      difficulty: 'standard',
      motion: 'system',
      soundVolume: 0.8,
    });
    await service.updatePreferences('user-a', {
      difficulty: 'hard',
      highContrast: true,
      motion: 'reduce',
      muted: true,
      soundVolume: 0.2,
      tutorialCompleted: true,
    });

    await expect(service.getPreferences('user-b')).resolves.toMatchObject({
      difficulty: 'standard',
      motion: 'system',
      soundVolume: 0.8,
    });
  });

  it('allows two users to choose the same normalized nickname', async () => {
    const repository = new MemoryPlayerRepository();
    const service = new ProfileService(repository, () => NOW);

    await service.updateProfile('user-a', {
      bio: 'Joue avec patience.',
      expectedVersion: 0,
      nickname: 'Joueur Étoile',
    });
    await service.updateProfile('user-b', {
      bio: '',
      expectedVersion: 0,
      nickname: 'Joueur Étoile',
    });

    await expect(service.getProfile('user-a')).resolves.toMatchObject({
      nickname: 'Joueur Étoile',
      bio: 'Joue avec patience.',
      version: 1,
    });
    await expect(service.getProfile('user-b')).resolves.toMatchObject({
      nickname: 'Joueur Étoile',
      version: 1,
    });
  });

  it('refuses a stale profile update instead of overwriting a concurrent change', async () => {
    const service = new ProfileService(new MemoryPlayerRepository(), () => NOW);
    await service.updateProfile('user-a', {
      bio: '',
      expectedVersion: 0,
      nickname: 'First Name',
    });

    await expect(
      service.updateProfile('user-a', {
        bio: 'Écriture obsolète',
        expectedVersion: 0,
        nickname: 'Stale Name',
      }),
    ).rejects.toMatchObject({ code: 'PROFILE_VERSION_CONFLICT' });
  });
});
