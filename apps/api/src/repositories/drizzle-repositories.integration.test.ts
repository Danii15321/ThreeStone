import { createDatabase, DrizzleMultiplayerResultRepository, schema } from '@three-stone/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { AccountExportService } from '../application/account-export-service.js';
import { ProfileService } from '../application/profile-service.js';
import { SoloResultsService } from '../application/solo-results-service.js';
import { DrizzlePlayerRepository } from './drizzle-player-repository.js';
import { DrizzleMultiplayerHistoryRepository } from './drizzle-multiplayer-history-repository.js';
import { DrizzleSoloResultRepository } from './drizzle-solo-result-repository.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const database = databaseUrl === undefined ? null : createDatabase(databaseUrl);
const integration = describe.skipIf(database === null);

const NOW = new Date('2026-07-29T10:00:00.000Z');
const RESULT = {
  aiFinalReserve: 2,
  completedAt: '2026-07-29T09:59:00.000Z',
  difficulty: 'standard' as const,
  gameId: '9443e13b-05d3-4b24-a5cb-77c4ca048b1f',
  humanFinalReserve: 0,
  roundsPlayed: 4,
  rulesVersion: '1.0.0',
  winner: 'human' as const,
};
const MULTIPLAYER_GAME_ID = 'b8f16c4b-ed5c-43de-a679-ce0b4724a83c';

integration('Drizzle repositories against PostgreSQL', () => {
  beforeEach(async () => {
    if (database === null) return;
    await database.db
      .delete(schema.multiplayerGame)
      .where(eq(schema.multiplayerGame.gameId, MULTIPLAYER_GAME_ID));
    await database.db.delete(schema.user).where(eq(schema.user.id, 'user-a'));
    await database.db.delete(schema.user).where(eq(schema.user.id, 'user-b'));
    await database.db.insert(schema.user).values([
      {
        createdAt: NOW,
        email: 'first@example.test',
        emailVerified: true,
        id: 'user-a',
        name: 'First',
        displayUsername: 'StoneMaster',
        updatedAt: NOW,
        username: 'stonemaster',
      },
      {
        createdAt: NOW,
        email: 'second@example.test',
        emailVerified: true,
        id: 'user-b',
        name: 'Second',
        displayUsername: 'RuneKeeper',
        updatedAt: NOW,
        username: 'runekeeper',
      },
    ]);
  });

  afterAll(async () => {
    if (database === null) return;
    await database.db
      .delete(schema.multiplayerGame)
      .where(eq(schema.multiplayerGame.gameId, MULTIPLAYER_GAME_ID));
    await database.db.delete(schema.user).where(eq(schema.user.id, 'user-a'));
    await database.db.delete(schema.user).where(eq(schema.user.id, 'user-b'));
    await database.close();
  });

  it('persists duplicate Unicode nicknames and isolated preferences', async () => {
    if (database === null) return;
    const repository = new DrizzlePlayerRepository(database.db);

    await repository.saveProfile('user-a', 'Joueur Étoile', 'Prêt à jouer.', 0, NOW);
    await repository.saveProfile('user-b', 'Joueur Étoile', '', 0, NOW);
    await repository.savePreferences(
      'user-a',
      {
        difficulty: 'hard',
        highContrast: true,
        motion: 'reduce',
        muted: true,
        soundVolume: 0.25,
        tutorialCompleted: true,
      },
      NOW,
    );

    await expect(repository.findProfile('user-b')).resolves.toMatchObject({
      nickname: 'Joueur Étoile',
      bio: '',
      hasAvatar: false,
      version: 1,
    });
    await expect(repository.findPreferences('user-b')).resolves.toBeNull();
  });

  it('rejects a stale optimistic profile update', async () => {
    if (database === null) return;
    const repository = new DrizzlePlayerRepository(database.db);
    await repository.saveProfile('user-a', 'First Name', '', 0, NOW);

    await expect(repository.saveProfile('user-a', 'Stale Name', '', 0, NOW)).rejects.toMatchObject({
      code: 'PROFILE_VERSION_CONFLICT',
    });
  });

  it('persists avatar data with the profile optimistic version', async () => {
    if (database === null) return;
    const repository = new DrizzlePlayerRepository(database.db);
    await repository.saveProfile('user-a', 'First Name', 'Tacticien.', 0, NOW);
    const avatar = {
      base64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64'),
      mediaType: 'image/png' as const,
    };

    await expect(repository.saveAvatar('user-a', avatar, 1, NOW)).resolves.toMatchObject({
      bio: 'Tacticien.',
      hasAvatar: true,
      version: 2,
    });
    await expect(repository.findAvatar('user-a')).resolves.toEqual(avatar);
  });

  it('makes terminal solo results idempotent and rejects contradictions', async () => {
    if (database === null) return;
    const repository = new DrizzleSoloResultRepository(database.db);

    await expect(repository.save('user-a', RESULT, NOW)).resolves.toMatchObject({
      kind: 'created',
    });
    await expect(repository.save('user-a', RESULT, NOW)).resolves.toMatchObject({
      kind: 'existing',
    });
    await expect(
      repository.save(
        'user-a',
        {
          ...RESULT,
          aiFinalReserve: 0,
          humanFinalReserve: 2,
          winner: 'ai',
        },
        NOW,
      ),
    ).resolves.toEqual({ kind: 'contradiction' });

    await expect(repository.stats('user-a')).resolves.toEqual({
      averageRounds: 4,
      gamesPlayed: 1,
      losses: 0,
      winRate: 1,
      wins: 1,
    });
    await expect(repository.stats('user-b')).resolves.toMatchObject({ gamesPlayed: 0 });
  });

  it('deletes application data when the Better Auth user is deleted', async () => {
    if (database === null) return;
    const repository = new DrizzleSoloResultRepository(database.db);
    await repository.save('user-a', RESULT, NOW);

    await database.db.delete(schema.user).where(eq(schema.user.id, 'user-a'));

    await expect(repository.stats('user-a')).resolves.toMatchObject({ gamesPlayed: 0 });
  });

  it('exports only the authenticated owner data', async () => {
    if (database === null) return;
    const profiles = new ProfileService(new DrizzlePlayerRepository(database.db), () => NOW);
    const results = new SoloResultsService(new DrizzleSoloResultRepository(database.db), () => NOW);
    const exporter = new AccountExportService(profiles, results, () => NOW);
    await results.record('user-a', RESULT);

    const exported = await exporter.export('user-b', {
      createdAt: NOW.toISOString(),
      displayUsername: 'Second',
      id: 'user-b',
      image: null,
      updatedAt: NOW.toISOString(),
      username: 'second',
    });

    expect(exported.results).toEqual([]);
    expect(exported.stats.gamesPlayed).toBe(0);
    expect(JSON.stringify(exported)).not.toContain('first@example.test');
  });

  it('returns the same transcript only to participants and anonymizes a deleted opponent', async () => {
    if (database === null) return;
    const results = new DrizzleMultiplayerResultRepository(database.db);
    const history = new DrizzleMultiplayerHistoryRepository(database.db);
    await new DrizzlePlayerRepository(database.db).saveProfile('user-b', 'Player', '', 0, NOW);
    await results.save(
      {
        completedAt: NOW,
        gameId: MULTIPLAYER_GAME_ID,
        initialInitiative: 'player-one',
        participants: [
          {
            finalReserve: 0,
            outcome: 'win',
            seat: 'player-one',
            userId: 'user-a',
          },
          {
            finalReserve: 2,
            outcome: 'loss',
            seat: 'player-two',
            userId: 'user-b',
          },
        ],
        protocolVersion: 2,
        rounds: [
          {
            choices: { 'player-one': 1, 'player-two': 2 },
            initiative: 'player-one',
            predictions: { 'player-one': 3, 'player-two': 4 },
            reservesAfter: { 'player-one': 0, 'player-two': 2 },
            roundNumber: 1,
            total: 3,
            winner: 'player-one',
          },
        ],
        rulesVersion: '1.0.0',
        seed: 47,
        terminalReason: 'reserve-empty',
        winner: 'player-one',
      },
      NOW,
    );

    const first = await history.list('user-a', { limit: 10, offset: 0 });
    const second = await history.list('user-b', { limit: 10, offset: 0 });
    const outsider = await history.list('user-c', { limit: 10, offset: 0 });

    expect(first.items[0]?.rounds).toEqual(second.items[0]?.rounds);
    expect(first.items[0]?.localSeat).toBe('player-one');
    expect(first.items[0]?.participants['player-two']).toMatchObject({
      displayName: 'RuneKeeper',
    });
    expect(first.items[0]?.participants['player-one']).toMatchObject({
      stonesAfter: 24,
      stonesBefore: 0,
      stonesDelta: 24,
    });
    expect(second.items[0]?.localSeat).toBe('player-two');
    await expect(history.stats('user-a')).resolves.toEqual({
      gamesPlayed: 1,
      stones: 24,
    });
    await expect(history.stats('user-b')).resolves.toEqual({
      gamesPlayed: 1,
      stones: -24,
    });
    expect(outsider.total).toBe(0);

    await database.db.delete(schema.user).where(eq(schema.user.id, 'user-a'));
    const anonymized = await history.list('user-b', { limit: 10, offset: 0 });
    expect(anonymized.items[0]?.participants['player-one']).toMatchObject({
      deleted: true,
      displayName: 'Joueur supprimé',
    });
    expect(JSON.stringify(anonymized)).not.toContain('First');
    expect(JSON.stringify(anonymized)).not.toContain('user-a');
  });
});
