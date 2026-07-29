export type Difficulty = 'easy' | 'normal' | 'hard';
export type MotionPreference = 'full' | 'reduced' | 'system';

export interface UserPreferences {
  readonly difficulty: Difficulty;
  readonly highContrast: boolean;
  readonly motion: MotionPreference;
  readonly muted: boolean;
  readonly soundVolume: number;
  readonly tutorialCompleted: boolean;
}

export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  difficulty: 'normal',
  highContrast: false,
  motion: 'system',
  muted: false,
  soundVolume: 0.8,
  tutorialCompleted: false,
};

const STORAGE_KEY = 'three-stone.preferences.v1';
const DIFFICULTIES = new Set<Difficulty>(['easy', 'normal', 'hard']);
const MOTION_PREFERENCES = new Set<MotionPreference>(['full', 'reduced', 'system']);

function parsePreferences(value: unknown): UserPreferences | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.muted !== 'boolean' ||
    typeof candidate.difficulty !== 'string' ||
    !DIFFICULTIES.has(candidate.difficulty as Difficulty) ||
    typeof candidate.motion !== 'string' ||
    !MOTION_PREFERENCES.has(candidate.motion as MotionPreference)
  ) {
    return null;
  }

  const highContrast =
    candidate.highContrast === undefined
      ? DEFAULT_PREFERENCES.highContrast
      : candidate.highContrast;
  const soundVolume =
    candidate.soundVolume === undefined ? DEFAULT_PREFERENCES.soundVolume : candidate.soundVolume;
  const tutorialCompleted =
    candidate.tutorialCompleted === undefined
      ? DEFAULT_PREFERENCES.tutorialCompleted
      : candidate.tutorialCompleted;
  if (
    typeof highContrast !== 'boolean' ||
    typeof tutorialCompleted !== 'boolean' ||
    typeof soundVolume !== 'number' ||
    !Number.isFinite(soundVolume) ||
    soundVolume < 0 ||
    soundVolume > 1
  ) {
    return null;
  }

  return {
    difficulty: candidate.difficulty as Difficulty,
    highContrast,
    motion: candidate.motion as MotionPreference,
    muted: candidate.muted,
    soundVolume,
    tutorialCompleted,
  };
}

export function loadPreferences(storage: PreferenceStorage): UserPreferences {
  const storedValue = storage.getItem(STORAGE_KEY);
  if (storedValue === null) {
    return DEFAULT_PREFERENCES;
  }

  try {
    const candidate: unknown = JSON.parse(storedValue);
    return parsePreferences(candidate) ?? DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(storage: PreferenceStorage, preferences: UserPreferences): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
