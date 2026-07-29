import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const user = pgTable(
  'user',
  {
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    id: text('id').primaryKey(),
    image: text('image'),
    name: text('name').notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull(),
    username: text('username'),
    displayUsername: text('display_username'),
  },
  (table) => [
    uniqueIndex('user_email_unique').on(table.email),
    uniqueIndex('user_username_unique').on(table.username),
  ],
);

export const session = pgTable(
  'session',
  {
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }).notNull(),
    id: text('id').primaryKey(),
    ipAddress: text('ip_address'),
    token: text('token').notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull(),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [
    uniqueIndex('session_token_unique').on(table.token),
    index('session_user_id_idx').on(table.userId),
  ],
);

export const account = pgTable(
  'account',
  {
    accessToken: text('access_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      mode: 'date',
      withTimezone: true,
    }),
    accountId: text('account_id').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull(),
    id: text('id').primaryKey(),
    idToken: text('id_token'),
    password: text('password'),
    providerId: text('provider_id').notNull(),
    refreshToken: text('refresh_token'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      mode: 'date',
      withTimezone: true,
    }),
    scope: text('scope'),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('account_user_id_idx').on(table.userId)],
);

export const verification = pgTable(
  'verification',
  {
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }).notNull(),
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }),
    value: text('value').notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const playerProfile = pgTable(
  'player_profile',
  {
    avatarData: text('avatar_data'),
    avatarMediaType: text('avatar_media_type'),
    bio: text('bio').notNull().default(''),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull(),
    nickname: text('nickname').notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull(),
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    check('player_profile_bio_check', sql`char_length(${table.bio}) <= 280`),
    check(
      'player_profile_avatar_pair_check',
      sql`(${table.avatarData} is null) = (${table.avatarMediaType} is null)`,
    ),
    check(
      'player_profile_avatar_media_type_check',
      sql`${table.avatarMediaType} is null or ${table.avatarMediaType} in ('image/jpeg', 'image/png', 'image/webp')`,
    ),
    check('player_profile_nickname_check', sql`char_length(${table.nickname}) > 0`),
    check('player_profile_version_check', sql`${table.version} > 0`),
  ],
);

export const playerPreferences = pgTable(
  'player_preferences',
  {
    difficulty: text('difficulty').notNull().default('standard'),
    highContrast: boolean('high_contrast').notNull().default(false),
    motion: text('motion').notNull().default('system'),
    muted: boolean('muted').notNull().default(false),
    soundVolume: real('sound_volume').notNull().default(0.8),
    tutorialCompleted: boolean('tutorial_completed').notNull().default(false),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull(),
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [
    check(
      'player_preferences_difficulty_check',
      sql`${table.difficulty} in ('easy', 'standard', 'hard')`,
    ),
    check(
      'player_preferences_motion_check',
      sql`${table.motion} in ('system', 'reduce', 'no-preference')`,
    ),
    check('player_preferences_sound_volume_check', sql`${table.soundVolume} between 0 and 1`),
  ],
);

export const gameRecord = pgTable(
  'game_record',
  {
    completedAt: timestamp('completed_at', { mode: 'date', withTimezone: true }).notNull(),
    difficulty: text('difficulty').notNull(),
    fingerprint: text('fingerprint').notNull(),
    gameId: uuid('game_id').primaryKey(),
    mode: text('mode').notNull().default('solo'),
    recordedAt: timestamp('recorded_at', { mode: 'date', withTimezone: true }).notNull(),
    roundsPlayed: integer('rounds_played').notNull(),
    rulesVersion: text('rules_version').notNull(),
    source: text('source').notNull().default('solo-client'),
    terminalPayload: jsonb('terminal_payload').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    winner: text('winner').notNull(),
  },
  (table) => [
    check('game_record_difficulty_check', sql`${table.difficulty} in ('easy', 'standard', 'hard')`),
    check('game_record_mode_check', sql`${table.mode} = 'solo'`),
    check('game_record_rounds_check', sql`${table.roundsPlayed} between 1 and 10000`),
    check('game_record_source_check', sql`${table.source} = 'solo-client'`),
    check('game_record_winner_check', sql`${table.winner} in ('human', 'ai')`),
    index('game_record_user_completed_idx').on(table.userId, table.completedAt),
    index('game_record_user_winner_idx').on(table.userId, table.winner),
  ],
);

export const gameParticipant = pgTable(
  'game_participant',
  {
    finalReserve: integer('final_reserve').notNull(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => gameRecord.gameId, { onDelete: 'cascade' }),
    outcome: text('outcome').notNull(),
    seat: text('seat').notNull(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [
    check('game_participant_final_reserve_check', sql`${table.finalReserve} between 0 and 3`),
    check('game_participant_outcome_check', sql`${table.outcome} in ('win', 'loss')`),
    check('game_participant_seat_check', sql`${table.seat} in ('human', 'ai')`),
    primaryKey({ columns: [table.gameId, table.seat] }),
    index('game_participant_user_id_idx').on(table.userId),
  ],
);
