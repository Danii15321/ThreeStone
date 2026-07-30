import type { PlayerId } from '@three-stone/game-core';

export interface TerminalResultRepository {
  save(
    input: {
      readonly completedAt: Date;
      readonly gameId: string;
      readonly initialInitiative: PlayerId;
      readonly participants: readonly [
        {
          readonly finalReserve: number;
          readonly outcome: 'win' | 'loss';
          readonly seat: PlayerId;
          readonly userId: string;
        },
        {
          readonly finalReserve: number;
          readonly outcome: 'win' | 'loss';
          readonly seat: PlayerId;
          readonly userId: string;
        },
      ];
      readonly protocolVersion: number;
      readonly rounds: readonly {
        readonly choices: Readonly<Record<PlayerId, number>>;
        readonly initiative: PlayerId;
        readonly predictions: Readonly<Record<PlayerId, number>>;
        readonly reservesAfter: Readonly<Record<PlayerId, number>>;
        readonly roundNumber: number;
        readonly total: number;
        readonly winner: PlayerId | null;
      }[];
      readonly rulesVersion: string;
      readonly seed: number;
      readonly terminalReason:
        'reserve-empty' | 'hidden-choice-timeout' | 'prediction-timeout' | 'abandon' | 'disconnect';
      readonly winner: PlayerId;
    },
    recordedAt: Date,
  ): Promise<{ readonly kind: 'contradiction' } | { readonly kind: 'created' | 'existing' }>;
}
