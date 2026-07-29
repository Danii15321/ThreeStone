import type {
  CreateSoloResultRequest,
  PlayerPreferences,
  UpdatePlayerPreferencesRequest,
} from '@three-stone/api-contracts';
import { RULES_VERSION } from '@three-stone/game-core';

import type { SoloSnapshot } from '../solo-game/solo-game-controller.js';
import type { Difficulty, UserPreferences } from '../settings/preferences.js';

export function toRemotePreferences(preferences: UserPreferences): UpdatePlayerPreferencesRequest {
  return {
    difficulty: preferences.difficulty === 'normal' ? 'standard' : preferences.difficulty,
    highContrast: preferences.highContrast,
    motion:
      preferences.motion === 'reduced'
        ? 'reduce'
        : preferences.motion === 'system'
          ? 'system'
          : 'no-preference',
    muted: preferences.muted,
    soundVolume: preferences.soundVolume,
    tutorialCompleted: preferences.tutorialCompleted,
  };
}

export function fromRemotePreferences(preferences: PlayerPreferences): UserPreferences {
  return {
    difficulty: preferences.difficulty === 'standard' ? 'normal' : preferences.difficulty,
    highContrast: preferences.highContrast,
    motion:
      preferences.motion === 'reduce'
        ? 'reduced'
        : preferences.motion === 'system'
          ? 'system'
          : 'full',
    muted: preferences.muted,
    soundVolume: preferences.soundVolume,
    tutorialCompleted: preferences.tutorialCompleted,
  };
}

export function buildSoloResultPayload(
  snapshot: Pick<SoloSnapshot, 'gameId' | 'phase' | 'reserves' | 'roundNumber' | 'winner'>,
  difficulty: Difficulty,
  completedAt: Date,
): CreateSoloResultRequest {
  if (snapshot.phase !== 'finished' || snapshot.winner === null) {
    throw new Error('Only a terminal solo game can be synchronized.');
  }

  return {
    aiFinalReserve: snapshot.reserves.ai,
    completedAt: completedAt.toISOString(),
    difficulty: difficulty === 'normal' ? 'standard' : difficulty,
    gameId: snapshot.gameId,
    humanFinalReserve: snapshot.reserves.human,
    roundsPlayed: snapshot.roundNumber,
    rulesVersion: RULES_VERSION,
    winner: snapshot.winner,
  };
}
