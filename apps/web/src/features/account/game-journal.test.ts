import { describe, expect, it } from 'vitest';

import { mergeGameJournal } from './game-journal.js';

describe('game journal', () => {
  it('merges solo and multiplayer games in reverse chronological order', () => {
    const journal = mergeGameJournal(
      [
        { completedAt: '2026-07-30T10:00:00.000Z', gameId: 'solo-old' },
        { completedAt: '2026-07-30T12:00:00.000Z', gameId: 'solo-new' },
      ],
      [{ completedAt: '2026-07-30T11:00:00.000Z', gameId: 'multi-middle' }],
      5,
    );

    expect(journal.map((entry) => `${entry.mode}:${entry.game.gameId}`)).toEqual([
      'solo:solo-new',
      'multiplayer:multi-middle',
      'solo:solo-old',
    ]);
  });

  it('applies one shared display limit after merging both modes', () => {
    const journal = mergeGameJournal(
      [{ completedAt: '2026-07-30T10:00:00.000Z', gameId: 'solo' }],
      [{ completedAt: '2026-07-30T11:00:00.000Z', gameId: 'multi' }],
      1,
    );

    expect(journal).toHaveLength(1);
    expect(journal[0]?.mode).toBe('multiplayer');
  });
});
