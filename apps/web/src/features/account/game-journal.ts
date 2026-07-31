interface JournalSource {
  readonly completedAt: string;
  readonly gameId: string;
}

export type GameJournalEntry<Solo extends JournalSource, Multiplayer extends JournalSource> =
  | { readonly game: Solo; readonly mode: 'solo' }
  | { readonly game: Multiplayer; readonly mode: 'multiplayer' };

export function mergeGameJournal<Solo extends JournalSource, Multiplayer extends JournalSource>(
  soloGames: readonly Solo[],
  multiplayerGames: readonly Multiplayer[],
  limit: number,
): GameJournalEntry<Solo, Multiplayer>[] {
  return [
    ...soloGames.map((game) => ({ game, mode: 'solo' as const })),
    ...multiplayerGames.map((game) => ({ game, mode: 'multiplayer' as const })),
  ]
    .sort(
      (left, right) =>
        new Date(right.game.completedAt).getTime() - new Date(left.game.completedAt).getTime(),
    )
    .slice(0, Math.max(0, limit));
}
