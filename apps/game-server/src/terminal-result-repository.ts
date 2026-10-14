import type { PlayerId } from '@three-stone/game-core';
import type { StonesSettlement } from '@three-stone/protocol';

export type TerminalResultSaveOutcome =
  | { readonly kind: 'contradiction' }
  | {
      readonly gameId?: string;
      readonly kind: 'created' | 'existing';
      /**
       * Absent only while a retrying adapter has acknowledged a transient
       * outage. Durable repositories return the authoritative settlement.
       */
      readonly settlement?: StonesSettlement;
    };

export interface TerminalResultRepository {
  onSettlement?(gameId: string, listener: (settlement: StonesSettlement) => void): () => void;
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
  ): Promise<TerminalResultSaveOutcome>;
}
