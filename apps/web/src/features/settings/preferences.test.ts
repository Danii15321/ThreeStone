import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type PreferenceStorage,
} from './preferences.js';

function createMemoryStorage(initialValue?: string): PreferenceStorage & {
  readonly values: Map<string, string>;
} {
  const values = new Map<string, string>();
  if (initialValue !== undefined) {
    values.set('three-stone.preferences.v1', initialValue);
  }

  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe('local preferences', () => {
  it('uses accessible defaults when no value is stored', () => {
    expect(loadPreferences(createMemoryStorage())).toEqual(DEFAULT_PREFERENCES);
  });

  it('ignores malformed or unsupported stored values', () => {
    expect(loadPreferences(createMemoryStorage('{not-json'))).toEqual(DEFAULT_PREFERENCES);
    expect(
      loadPreferences(
        createMemoryStorage(
          JSON.stringify({
            difficulty: 'impossible',
            motion: 'lots',
            muted: 'no',
          }),
        ),
      ),
    ).toEqual(DEFAULT_PREFERENCES);
  });

  it('round-trips only the supported preference fields', () => {
    const storage = createMemoryStorage();
    const preferences = {
      difficulty: 'hard' as const,
      highContrast: true,
      motion: 'reduced' as const,
      muted: true,
      showReactions: false,
      soundVolume: 0.35,
      tutorialCompleted: true,
    };

    savePreferences(storage, preferences);

    expect(loadPreferences(storage)).toEqual(preferences);
    expect(JSON.parse(storage.values.get('three-stone.preferences.v1') ?? '{}')).toEqual(
      preferences,
    );
  });

  it('migrates stored v1 preferences by filling newly supported accessibility fields', () => {
    expect(
      loadPreferences(
        createMemoryStorage(
          JSON.stringify({
            difficulty: 'easy',
            motion: 'full',
            muted: true,
          }),
        ),
      ),
    ).toEqual({
      ...DEFAULT_PREFERENCES,
      difficulty: 'easy',
      motion: 'full',
      muted: true,
    });
  });
});
