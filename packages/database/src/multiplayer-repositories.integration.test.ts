import { and, eq } from 'drizzle-orm';
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

integration('multiplayer PostgreSQL repositories', () => {
  beforeEach(async () => {
    if (database === null) return;
    await database.db
      .delete(schema.activeMultiplayerLease)
      .where(eq(schema.activeMultiplayerLease.userId, 'multiplayer-user-a'));
    await database.db
      .delete(schema.multiplayerGame)
      .where(eq(schema.multiplayerGame.gameId, GAME_ID));
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
      .where(eq(schema.multiplayerGame.gameId, GAME_ID));
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
