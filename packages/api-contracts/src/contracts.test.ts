import { describe, expect, it } from 'vitest';

import {
  accountMetadataSchema,
  createMultiplayerRoomResponseSchema,
  createSoloResultRequestSchema,
  joinMultiplayerRoomRequestSchema,
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
