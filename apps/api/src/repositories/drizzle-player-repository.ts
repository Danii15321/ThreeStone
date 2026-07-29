import {
  playerPreferencesSchema,
  playerProfileSchema,
  type PlayerPreferences,
  type PlayerProfile,
  type UpdatePlayerPreferencesRequest,
} from '@three-stone/api-contracts';
import type { Database } from '@three-stone/database';
import { schema } from '@three-stone/database';
import { and, eq } from 'drizzle-orm';

import { ConflictError } from '../domain/errors.js';
import type { PlayerAvatar, PlayerRepository } from '../domain/repositories.js';

export class DrizzlePlayerRepository implements PlayerRepository {
  constructor(private readonly database: Database) {}

  async findPreferences(userId: string): Promise<PlayerPreferences | null> {
    const [row] = await this.database
      .select()
      .from(schema.playerPreferences)
      .where(eq(schema.playerPreferences.userId, userId))
      .limit(1);

    return row === undefined
      ? null
      : playerPreferencesSchema.parse({
          ...row,
          updatedAt: row.updatedAt.toISOString(),
        });
  }

  async findProfile(userId: string): Promise<PlayerProfile | null> {
    const [row] = await this.database
      .select()
      .from(schema.playerProfile)
      .where(eq(schema.playerProfile.userId, userId))
      .limit(1);

    return row === undefined ? null : toPlayerProfile(row);
  }

  async findAvatar(userId: string): Promise<PlayerAvatar | null> {
    const [row] = await this.database
      .select({
        base64: schema.playerProfile.avatarData,
        mediaType: schema.playerProfile.avatarMediaType,
      })
      .from(schema.playerProfile)
      .where(eq(schema.playerProfile.userId, userId))
      .limit(1);

    return row?.base64 === null || row?.base64 === undefined || row.mediaType === null
      ? null
      : {
          base64: row.base64,
          mediaType: row.mediaType as PlayerAvatar['mediaType'],
        };
  }

  async savePreferences(
    userId: string,
    preferences: UpdatePlayerPreferencesRequest,
    now: Date,
  ): Promise<PlayerPreferences> {
    const [row] = await this.database
      .insert(schema.playerPreferences)
      .values({ ...preferences, updatedAt: now, userId })
      .onConflictDoUpdate({
        set: { ...preferences, updatedAt: now },
        target: schema.playerPreferences.userId,
      })
      .returning();

    if (row === undefined) {
      throw new Error('PostgreSQL did not return the saved preferences.');
    }

    return playerPreferencesSchema.parse({
      ...row,
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  async saveProfile(
    userId: string,
    nickname: string,
    bio: string,
    expectedVersion: number,
    now: Date,
  ): Promise<PlayerProfile> {
    const [created] =
      expectedVersion === 0
        ? await this.database
            .insert(schema.playerProfile)
            .values({ bio, createdAt: now, nickname, updatedAt: now, userId, version: 1 })
            .onConflictDoNothing({ target: schema.playerProfile.userId })
            .returning()
        : [];

    const [row] =
      created === undefined
        ? await this.database
            .update(schema.playerProfile)
            .set({ bio, nickname, updatedAt: now, version: expectedVersion + 1 })
            .where(
              and(
                eq(schema.playerProfile.userId, userId),
                eq(schema.playerProfile.version, expectedVersion),
              ),
            )
            .returning()
        : [created];

    if (row === undefined) {
      throw new ConflictError(
        'PROFILE_VERSION_CONFLICT',
        'The profile was modified by another request.',
      );
    }

    return toPlayerProfile(row);
  }

  async saveAvatar(
    userId: string,
    avatar: PlayerAvatar | null,
    expectedVersion: number,
    now: Date,
  ): Promise<PlayerProfile> {
    const avatarValues = {
      avatarData: avatar?.base64 ?? null,
      avatarMediaType: avatar?.mediaType ?? null,
    };
    const [created] =
      expectedVersion === 0
        ? await this.database
            .insert(schema.playerProfile)
            .values({
              ...avatarValues,
              bio: '',
              createdAt: now,
              nickname: 'Player',
              updatedAt: now,
              userId,
              version: 1,
            })
            .onConflictDoNothing({ target: schema.playerProfile.userId })
            .returning()
        : [];

    const [row] =
      created === undefined
        ? await this.database
            .update(schema.playerProfile)
            .set({
              ...avatarValues,
              updatedAt: now,
              version: expectedVersion + 1,
            })
            .where(
              and(
                eq(schema.playerProfile.userId, userId),
                eq(schema.playerProfile.version, expectedVersion),
              ),
            )
            .returning()
        : [created];

    if (row === undefined) {
      throw new ConflictError(
        'PROFILE_VERSION_CONFLICT',
        'The profile was modified by another request.',
      );
    }

    return toPlayerProfile(row);
  }
}

function toPlayerProfile(row: typeof schema.playerProfile.$inferSelect): PlayerProfile {
  return playerProfileSchema.parse({
    bio: row.bio,
    createdAt: row.createdAt.toISOString(),
    hasAvatar: row.avatarData !== null,
    nickname: row.nickname,
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  });
}
