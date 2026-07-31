import { describe, expect, it } from 'vitest';

import {
  accountMetadataSchema,
  createMultiplayerRoomResponseSchema,
  createSoloResultRequestSchema,
  joinMultiplayerRoomRequestSchema,
  multiplayerGameHistorySchema,
  multiplayerGameSummarySchema,
  updatePlayerPreferencesRequestSchema,
  updatePlayerProfileRequestSchema,
} from './index.js';

describe('public API contracts', () => {
  it('exposes a username without leaking Better Auth compatibility email fields', () => {
    const account = accountMetadataSchema.parse({
      createdAt: '2026-07-29T10:00:00.000Z',
      displayUsername: 'Stone_Player',
      id: 'player-1',
      image: null,
      name: 'Stone_Player',
      updatedAt: '2026-07-29T10:00:00.000Z',
      username: 'stone_player',
    });

    expect(account).toMatchObject({
      displayUsername: 'Stone_Player',
      username: 'stone_player',
    });
    expect(account).not.toHaveProperty('email');
    expect(account).not.toHaveProperty('emailVerified');
  });

  it.each([
    'ab',
    'a'.repeat(25),
    'safe\u0000name',
    'emoji😀',
    '-Alice',
    'Alice_One',
    '12345',
    ' AdMiN ',
  ])('rejects the invalid nickname %s', (nickname) => {
    expect(
      updatePlayerProfileRequestSchema.safeParse({ expectedVersion: 0, nickname }).success,
    ).toBe(false);
  });

  it('normalizes Unicode nicknames without imposing global uniqueness', () => {
    expect(
      updatePlayerProfileRequestSchema.parse({
        bio: '',
        expectedVersion: 0,
        nickname: '  Ａlice   Étoile  ',
      }),
    ).toEqual({
      bio: '',
      expectedVersion: 0,
      nickname: 'Alice Étoile',
    });
  });

  it('normalizes a bounded player bio', () => {
    expect(
      updatePlayerProfileRequestSchema.parse({
        bio: '  Stratège patient.\r\nToujours prêt pour une revanche.  ',
        expectedVersion: 1,
        nickname: 'Valid Player',
      }),
    ).toMatchObject({
      bio: 'Stratège patient.\nToujours prêt pour une revanche.',
    });
    expect(
      updatePlayerProfileRequestSchema.safeParse({
        bio: 'a'.repeat(281),
        expectedVersion: 1,
        nickname: 'Valid Player',
      }).success,
    ).toBe(false);
  });

  it('accepts a bounded and explicit preferences document', () => {
    expect(
      updatePlayerPreferencesRequestSchema.parse({
        difficulty: 'standard',
        highContrast: false,
        motion: 'system',
        muted: false,
        soundVolume: 0.75,
        tutorialCompleted: true,
      }),
    ).toEqual({
      difficulty: 'standard',
      highContrast: false,
      motion: 'system',
      muted: false,
      soundVolume: 0.75,
      tutorialCompleted: true,
    });
  });

  it('rejects a non-terminal or contradictory result', () => {
    const result = createSoloResultRequestSchema.safeParse({
      aiFinalReserve: 0,
      completedAt: '2026-07-29T10:00:00.000Z',
      difficulty: 'standard',
      gameId: '9443e13b-05d3-4b24-a5cb-77c4ca048b1f',
      humanFinalReserve: 2,
      roundsPlayed: 4,
      rulesVersion: '1.0.0',
      winner: 'human',
    });

    expect(result.success).toBe(false);
  });

  it('normalizes non-ambiguous invite codes and keeps tickets in response bodies', () => {
    expect(joinMultiplayerRoomRequestSchema.parse({ code: ' abcd23 ' })).toEqual({
      code: 'ABCD23',
    });
    expect(joinMultiplayerRoomRequestSchema.safeParse({ code: 'ROOM01' }).success).toBe(false);
    expect(
      createMultiplayerRoomResponseSchema.parse({
        gameServerUrl: 'ws://127.0.0.1:2567',
        inviteCode: 'ABCD23',
        playerId: 'player-one',
        roomId: 'a4e97166-e9e0-49cf-8812-96be1f59687a',
        ticket: 'signed-admission-ticket-that-is-long-enough',
        ticketExpiresAt: '2026-07-30T15:00:45.000Z',
      }),
    ).not.toHaveProperty('ticketUrl');
  });
});

describe('multiplayer history contracts', () => {
  it('validates a participant-only transcript without retaining a deleted identity', () => {
    const game = multiplayerGameSummarySchema.parse({
      completedAt: '2026-07-30T18:00:00.000Z',
      gameId: 'b8f16c4b-ed5c-43de-a679-ce0b4724a83c',
      initialInitiative: 'player-one',
      localSeat: 'player-two',
      participants: {
        'player-one': {
          deleted: true,
          displayName: 'Joueur supprimé',
          finalReserve: 0,
          outcome: 'win',
          stonesAfter: 24,
          stonesBefore: 0,
          stonesDelta: 24,
        },
        'player-two': {
          deleted: false,
          displayName: 'Bjorn',
          finalReserve: 2,
          outcome: 'loss',
          stonesAfter: -24,
          stonesBefore: 0,
          stonesDelta: -24,
        },
      },
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
    });

    expect(game.participants['player-one']).toEqual({
      deleted: true,
      displayName: 'Joueur supprimé',
      finalReserve: 0,
      outcome: 'win',
      stonesAfter: 24,
      stonesBefore: 0,
      stonesDelta: 24,
    });
    expect(JSON.stringify(game)).not.toContain('userId');
    expect(
      multiplayerGameHistorySchema.parse({ items: [game], limit: 20, offset: 0, total: 1 }),
    ).toMatchObject({ total: 1 });
  });
});
