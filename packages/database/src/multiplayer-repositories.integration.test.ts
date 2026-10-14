import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  DrizzleMultiplayerLeaseRepository,
  DrizzleMultiplayerResultRepository,
  createDatabase,
  schema,
  type SaveMultiplayerGameInput,
} from './index.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const database = databaseUrl === undefined ? null : createDatabase(databaseUrl);
const integration = describe.skipIf(database === null);

const NOW = new Date('2026-07-30T12:00:00.000Z');
const GAME_ID = '7fdd4c75-bce5-4bf2-999d-90c92ee9d146';
const BONUS_GAME_ID = '7fdd4c75-bce5-4bf2-999d-90c92ee9d147';
const PAIR_GAME_IDS = [
  '7fdd4c75-bce5-4bf2-999d-90c92ee9d151',
  '7fdd4c75-bce5-4bf2-999d-90c92ee9d152',
  '7fdd4c75-bce5-4bf2-999d-90c92ee9d153',
  '7fdd4c75-bce5-4bf2-999d-90c92ee9d154',
  '7fdd4c75-bce5-4bf2-999d-90c92ee9d155',
  '7fdd4c75-bce5-4bf2-999d-90c92ee9d156',
  '7fdd4c75-bce5-4bf2-999d-90c92ee9d157',
] as const;
const ROOM_ONE = 'd44ae2bf-b633-4ed4-9cc1-e0f6d44c8373';
const ROOM_TWO = 'aed41a89-bcbd-466f-972a-0207443fd3e9';

const RESULT: SaveMultiplayerGameInput = {
  completedAt: new Date('2026-07-30T11:59:00.000Z'),
  gameId: GAME_ID,
  initialInitiative: 'player-one',
  participants: [
    {
      finalReserve: 0,
      outcome: 'win',
      seat: 'player-one',
      userId: 'multiplayer-user-a',
    },
    {
      finalReserve: 2,
      outcome: 'loss',
      seat: 'player-two',
      userId: 'multiplayer-user-b',
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
  seed: 17,
  terminalReason: 'reserve-empty',
  winner: 'player-one',
};

function resultAt(input: {
  readonly completedAt: Date;
  readonly gameId: string;
  readonly swapUsers?: boolean;
}): SaveMultiplayerGameInput {
  const firstUserId = input.swapUsers === true ? 'multiplayer-user-b' : 'multiplayer-user-a';
  const secondUserId = input.swapUsers === true ? 'multiplayer-user-a' : 'multiplayer-user-b';
  return {
    ...RESULT,
    completedAt: input.completedAt,
    gameId: input.gameId,
    participants: [
      { ...RESULT.participants[0], userId: firstUserId },
      { ...RESULT.participants[1], userId: secondUserId },
    ],
  };
}

const BONUS_RESULT: SaveMultiplayerGameInput = {
  ...RESULT,
  completedAt: new Date('2026-07-30T11:58:00.000Z'),
  gameId: BONUS_GAME_ID,
  rounds: [
    {
      choices: { 'player-one': 1, 'player-two': 0 },
      initiative: 'player-one',
      predictions: { 'player-one': 2, 'player-two': 1 },
      reservesAfter: { 'player-one': 3, 'player-two': 2 },
      roundNumber: 1,
      total: 1,
      winner: 'player-two',
    },
    {
      choices: { 'player-one': 1, 'player-two': 0 },
      initiative: 'player-two',
      predictions: { 'player-one': 2, 'player-two': 1 },
      reservesAfter: { 'player-one': 3, 'player-two': 1 },
      roundNumber: 2,
      total: 1,
      winner: 'player-two',
    },
    {
      choices: { 'player-one': 1, 'player-two': 1 },
      initiative: 'player-one',
      predictions: { 'player-one': 2, 'player-two': 3 },
      reservesAfter: { 'player-one': 2, 'player-two': 1 },
      roundNumber: 3,
      total: 2,
      winner: 'player-one',
    },
    {
      choices: { 'player-one': 1, 'player-two': 1 },
      initiative: 'player-two',
      predictions: { 'player-one': 2, 'player-two': 3 },
      reservesAfter: { 'player-one': 1, 'player-two': 1 },
      roundNumber: 4,
      total: 2,
      winner: 'player-one',
    },
    {
      choices: { 'player-one': 1, 'player-two': 1 },
      initiative: 'player-one',
      predictions: { 'player-one': 2, 'player-two': 3 },
      reservesAfter: { 'player-one': 0, 'player-two': 1 },
      roundNumber: 5,
      total: 2,
      winner: 'player-one',
    },
  ],
};

integration('multiplayer PostgreSQL repositories', () => {
  beforeEach(async () => {
    if (database === null) return;
    await database.db
      .delete(schema.activeMultiplayerLease)
      .where(eq(schema.activeMultiplayerLease.userId, 'multiplayer-user-a'));
    await database.db
      .delete(schema.multiplayerGame)
      .where(inArray(schema.multiplayerGame.gameId, [GAME_ID, BONUS_GAME_ID, ...PAIR_GAME_IDS]));
    await database.db
      .delete(schema.playerStones)
      .where(eq(schema.playerStones.userId, 'multiplayer-user-a'));
    await database.db
      .delete(schema.playerStones)
      .where(eq(schema.playerStones.userId, 'multiplayer-user-b'));
    await database.db.delete(schema.user).where(eq(schema.user.id, 'multiplayer-user-a'));
    await database.db.delete(schema.user).where(eq(schema.user.id, 'multiplayer-user-b'));
    await database.db.insert(schema.user).values([
      {
        createdAt: NOW,
        email: 'multiplayer-a@example.test',
        emailVerified: true,
        id: 'multiplayer-user-a',
        name: 'Astrid',
        updatedAt: NOW,
      },
      {
        createdAt: NOW,
        email: 'multiplayer-b@example.test',
        emailVerified: true,
        id: 'multiplayer-user-b',
        name: 'Bjorn',
        updatedAt: NOW,
      },
    ]);
  });

  afterAll(async () => {
    if (database === null) return;
    await database.db
      .delete(schema.multiplayerGame)
      .where(inArray(schema.multiplayerGame.gameId, [GAME_ID, BONUS_GAME_ID, ...PAIR_GAME_IDS]));
    await database.db.delete(schema.user).where(eq(schema.user.id, 'multiplayer-user-a'));
    await database.db.delete(schema.user).where(eq(schema.user.id, 'multiplayer-user-b'));
    await database.close();
  });

  it('acquires one lease atomically and lets another room take it only after expiry', async () => {
    if (database === null) return;
    const leases = new DrizzleMultiplayerLeaseRepository(database.db);

    await expect(
      leases.acquire({
        expiresAt: new Date(NOW.getTime() + 120_000),
        leaseTokenHash: 'token-a',
        now: NOW,
        roomId: ROOM_ONE,
        serverInstanceId: 'server-a',
        userId: 'multiplayer-user-a',
      }),
    ).resolves.toBe('acquired');
    await expect(
      leases.acquire({
        expiresAt: new Date(NOW.getTime() + 120_010),
        leaseTokenHash: 'token-b',
        now: new Date(NOW.getTime() + 10),
        roomId: ROOM_TWO,
        serverInstanceId: 'server-b',
        userId: 'multiplayer-user-a',
      }),
    ).resolves.toBe('conflict');
    await expect(
      leases.acquire({
        expiresAt: new Date(NOW.getTime() + 240_001),
        leaseTokenHash: 'token-b',
        now: new Date(NOW.getTime() + 120_001),
        roomId: ROOM_TWO,
        serverInstanceId: 'server-b',
        userId: 'multiplayer-user-a',
      }),
    ).resolves.toBe('acquired');
    await expect(
      leases.renew({
        expiresAt: new Date(NOW.getTime() + 300_000),
        leaseTokenHash: 'token-a',
        now: new Date(NOW.getTime() + 120_002),
        roomId: ROOM_ONE,
        userId: 'multiplayer-user-a',
      }),
    ).resolves.toBe(false);
  });

  it('renews and releases only with the current room and token', async () => {
    if (database === null) return;
    const leases = new DrizzleMultiplayerLeaseRepository(database.db);
    await leases.acquire({
      expiresAt: new Date(NOW.getTime() + 120_000),
      leaseTokenHash: 'token-a',
      now: NOW,
      roomId: ROOM_ONE,
      serverInstanceId: 'server-a',
      userId: 'multiplayer-user-a',
    });

    await expect(
      leases.renew({
        expiresAt: new Date(NOW.getTime() + 150_000),
        leaseTokenHash: 'token-a',
        now: new Date(NOW.getTime() + 30_000),
        roomId: ROOM_ONE,
        userId: 'multiplayer-user-a',
      }),
    ).resolves.toBe(true);
    await expect(leases.release('multiplayer-user-a', ROOM_ONE, 'wrong-token')).resolves.toBe(
      false,
    );
    await expect(leases.release('multiplayer-user-a', ROOM_ONE, 'token-a')).resolves.toBe(true);
    await expect(leases.findActive('multiplayer-user-a', NOW)).resolves.toBeNull();
  });

  it('persists one terminal result and its rounds without duplicate effects', async () => {
    if (database === null) return;
    const results = new DrizzleMultiplayerResultRepository(database.db);

    await expect(results.save(RESULT, NOW)).resolves.toMatchObject({ kind: 'created' });
    await expect(results.save(RESULT, NOW)).resolves.toMatchObject({ kind: 'existing' });
    await expect(
      results.save(
        {
          ...RESULT,
          rounds: [{ ...RESULT.rounds[0]!, total: 4 }],
        },
        NOW,
      ),
    ).resolves.toEqual({ kind: 'contradiction' });

    await expect(
      database.db
        .select()
        .from(schema.multiplayerRound)
        .where(eq(schema.multiplayerRound.gameId, GAME_ID)),
    ).resolves.toHaveLength(1);

    const stones = await database.db
      .select()
      .from(schema.playerStones)
      .where(and(eq(schema.playerStones.ratedGames, 1), eq(schema.playerStones.updatedAt, NOW)));
    expect(stones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stones: 24, userId: 'multiplayer-user-a' }),
        expect.objectContaining({ stones: -24, userId: 'multiplayer-user-b' }),
      ]),
    );

    const participants = await database.db
      .select()
      .from(schema.multiplayerParticipant)
      .where(eq(schema.multiplayerParticipant.gameId, GAME_ID));
    expect(participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stonesAfter: 24,
          stonesBefore: 0,
          stonesDelta: 24,
          seat: 'player-one',
        }),
        expect.objectContaining({
          stonesAfter: -24,
          stonesBefore: 0,
          stonesDelta: -24,
          seat: 'player-two',
        }),
      ]),
    );
  });

  it('persists the authoritative reward breakdown and can leave the loser net positive', async () => {
    if (database === null) return;
    const results = new DrizzleMultiplayerResultRepository(database.db);
    await database.db.insert(schema.playerStones).values([
      {
        ratedGames: 0,
        stones: 500,
        updatedAt: NOW,
        userId: 'multiplayer-user-a',
      },
      {
        ratedGames: 0,
        stones: -500,
        updatedAt: NOW,
        userId: 'multiplayer-user-b',
      },
    ]);

    await expect(results.save(BONUS_RESULT, NOW)).resolves.toMatchObject({ kind: 'created' });

    await expect(
      database.db
        .select({ rated: schema.multiplayerGame.rated })
        .from(schema.multiplayerGame)
        .where(eq(schema.multiplayerGame.gameId, BONUS_GAME_ID)),
    ).resolves.toEqual([{ rated: true }]);

    const participants = await database.db
      .select()
      .from(schema.multiplayerParticipant)
      .where(eq(schema.multiplayerParticipant.gameId, BONUS_GAME_ID));
    expect(participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          coeurDePierre: true,
          mainDePierreOccurrences: 0,
          oeilEnPierre: true,
          seat: 'player-one',
          stonesAfter: 516,
          stonesBaseDelta: 1,
          stonesBefore: 500,
          stonesBonus: 15,
          stonesDelta: 16,
        }),
        expect.objectContaining({
          coeurDePierre: false,
          mainDePierreOccurrences: 2,
          oeilEnPierre: false,
          seat: 'player-two',
          stonesAfter: -495,
          stonesBaseDelta: -1,
          stonesBefore: -500,
          stonesBonus: 6,
          stonesDelta: 5,
        }),
      ]),
    );
  });

  it('rates only five duels per unordered pair in a sliding 24-hour window', async () => {
    if (database === null) return;
    const results = new DrizzleMultiplayerResultRepository(database.db);

    for (const [index, gameId] of PAIR_GAME_IDS.slice(0, 5).entries()) {
      const recordedAt = new Date(NOW.getTime() + index * 60_000);
      await expect(
        results.save(
          resultAt({
            completedAt: recordedAt,
            gameId,
            swapUsers: index % 2 === 1,
          }),
          recordedAt,
        ),
      ).resolves.toMatchObject({ kind: 'created' });
    }

    const sixthRecordedAt = new Date(NOW.getTime() + 5 * 60_000);
    const sixth = resultAt({
      completedAt: sixthRecordedAt,
      gameId: PAIR_GAME_IDS[5],
      swapUsers: true,
    });
    await expect(results.save(sixth, sixthRecordedAt)).resolves.toMatchObject({ kind: 'created' });
    await expect(results.save(sixth, sixthRecordedAt)).resolves.toMatchObject({ kind: 'existing' });

    const firstSixRatings = await database.db
      .select({ gameId: schema.multiplayerGame.gameId, rated: schema.multiplayerGame.rated })
      .from(schema.multiplayerGame)
      .where(inArray(schema.multiplayerGame.gameId, PAIR_GAME_IDS.slice(0, 6)));
    expect(firstSixRatings.filter((game) => game.rated)).toHaveLength(5);
    expect(firstSixRatings).toContainEqual({ gameId: PAIR_GAME_IDS[5], rated: false });

    const sixthParticipants = await database.db
      .select()
      .from(schema.multiplayerParticipant)
      .where(eq(schema.multiplayerParticipant.gameId, PAIR_GAME_IDS[5]));
    expect(sixthParticipants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stonesBaseDelta: 0,
          stonesBonus: 0,
          stonesDelta: 0,
        }),
      ]),
    );

    const afterSix = await database.db
      .select()
      .from(schema.playerStones)
      .where(inArray(schema.playerStones.userId, ['multiplayer-user-a', 'multiplayer-user-b']));
    expect(afterSix).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ratedGames: 5, userId: 'multiplayer-user-a' }),
        expect.objectContaining({ ratedGames: 5, userId: 'multiplayer-user-b' }),
      ]),
    );

    const boundary = new Date(NOW.getTime() + 24 * 60 * 60_000);
    await expect(
      results.save(
        resultAt({
          completedAt: boundary,
          gameId: PAIR_GAME_IDS[6],
        }),
        boundary,
      ),
    ).resolves.toMatchObject({ kind: 'created' });

    await expect(
      database.db
        .select({ rated: schema.multiplayerGame.rated })
        .from(schema.multiplayerGame)
        .where(eq(schema.multiplayerGame.gameId, PAIR_GAME_IDS[6])),
    ).resolves.toEqual([{ rated: true }]);
  });

  it('anonymizes only the deleted participant in the shared result', async () => {
    if (database === null) return;
    const results = new DrizzleMultiplayerResultRepository(database.db);
    await results.save(RESULT, NOW);

    await database.db.delete(schema.user).where(eq(schema.user.id, 'multiplayer-user-a'));

    const participants = await database.db
      .select()
      .from(schema.multiplayerParticipant)
      .where(eq(schema.multiplayerParticipant.gameId, GAME_ID));
    expect(
      participants.find((participant) => participant.seat === 'player-one')?.userId,
    ).toBeNull();
    expect(participants.find((participant) => participant.seat === 'player-two')?.userId).toBe(
      'multiplayer-user-b',
    );
    expect(
      await database.db
        .select()
        .from(schema.multiplayerGame)
        .where(
          and(
            eq(schema.multiplayerGame.gameId, GAME_ID),
            eq(schema.multiplayerGame.winner, 'player-one'),
          ),
        ),
    ).toHaveLength(1);
  });
});
