import { describe, expect, it } from 'vitest';

import {
  buildSoloResultPayload,
  fromRemotePreferences,
  toRemotePreferences,
} from './account-sync.js';

describe('account synchronization mappings', () => {
  it('maps local accessibility and difficulty choices to the API vocabulary', () => {
    expect(
      toRemotePreferences({
        difficulty: 'normal',
        highContrast: true,
        motion: 'reduced',
        muted: true,
        showReactions: false,
        soundVolume: 0.4,
        tutorialCompleted: true,
      }),
    ).toEqual({
      difficulty: 'standard',
      highContrast: true,
      motion: 'reduce',
      muted: true,
      soundVolume: 0.4,
      tutorialCompleted: true,
    });
  });

  it('imports supported remote preferences without losing safe local defaults', () => {
    expect(
      fromRemotePreferences({
        difficulty: 'hard',
        highContrast: true,
        motion: 'system',
        muted: false,
        soundVolume: 0.4,
        tutorialCompleted: true,
        updatedAt: '2026-07-29T00:00:00.000Z',
      }),
    ).toEqual({
      difficulty: 'hard',
      highContrast: true,
      motion: 'system',
      muted: false,
      showReactions: true,
      soundVolume: 0.4,
      tutorialCompleted: true,
    });
  });

  it('builds a terminal result with the domain rules version and stable game id', () => {
    expect(
      buildSoloResultPayload(
        {
          gameId: '00000000-0000-4000-8000-000000000001',
          phase: 'finished',
          reserves: { ai: 2, human: 0 },
          roundNumber: 7,
          winner: 'human',
        },
        'normal',
        new Date('2026-07-29T00:00:00.000Z'),
      ),
    ).toEqual({
      aiFinalReserve: 2,
      completedAt: '2026-07-29T00:00:00.000Z',
      difficulty: 'standard',
      gameId: '00000000-0000-4000-8000-000000000001',
      humanFinalReserve: 0,
      roundsPlayed: 7,
      rulesVersion: '1.0.0',
      winner: 'human',
    });
  });
});
