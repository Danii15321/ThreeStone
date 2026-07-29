export const PLAYER_IDS = ['player-one', 'player-two'] as const;
export const RULES_VERSION = '1.0.0' as const;

export type PlayerId = (typeof PLAYER_IDS)[number];
export type GamePhase = 'hidden-choices' | 'first-prediction' | 'second-prediction' | 'finished';
export type Reserve = number;
export type Prediction = number;

export interface ChooseHiddenAction {
  readonly type: 'choose-hidden';
  readonly playerId: PlayerId;
  readonly count: number;
}

export interface PredictAction {
  readonly type: 'predict';
  readonly playerId: PlayerId;
  readonly value: number;
}

export type GameAction = ChooseHiddenAction | PredictAction;

export interface RoundState {
  readonly hiddenChoices: Readonly<Partial<Record<PlayerId, number>>>;
  readonly predictions: Readonly<Partial<Record<PlayerId, Prediction>>>;
}

export interface PublicRoundResult {
  readonly roundNumber: number;
  readonly choices: Readonly<Record<PlayerId, number>>;
  readonly predictions: Readonly<Record<PlayerId, Prediction>>;
  readonly total: number;
  readonly winner: PlayerId | null;
}

export interface GameState {
  readonly gameId: string;
  readonly rulesVersion: typeof RULES_VERSION;
  readonly seed: number;
  readonly sequenceNumber: number;
  readonly phase: GamePhase;
  readonly roundNumber: number;
  readonly initiative: PlayerId;
  readonly reserves: Readonly<Record<PlayerId, Reserve>>;
  readonly round: RoundState;
  readonly revealedRounds: readonly PublicRoundResult[];
  readonly winner: PlayerId | null;
  readonly actionHistory: readonly GameAction[];
  readonly eventHistory: readonly DomainEvent[];
  readonly version: number;
}

export interface CreateGameOptions {
  readonly gameId: string;
  readonly seed: number;
  readonly sequenceNumber: number;
}

export type DomainEvent =
  | {
      readonly type: 'game-created';
      readonly gameId: string;
      readonly initiative: PlayerId;
      readonly rulesVersion: typeof RULES_VERSION;
      readonly seed: number;
    }
  | {
      readonly type: 'hidden-choice-received';
      readonly playerId: PlayerId;
      readonly roundNumber: number;
    }
  | {
      readonly type: 'prediction-announced';
      readonly playerId: PlayerId;
      readonly roundNumber: number;
      readonly value: Prediction;
    }
  | {
      readonly type: 'hands-revealed';
      readonly roundNumber: number;
      readonly choices: Readonly<Record<PlayerId, number>>;
      readonly total: number;
    }
  | {
      readonly type: 'round-won';
      readonly roundNumber: number;
      readonly playerId: PlayerId;
      readonly prediction: Prediction;
    }
  | {
      readonly type: 'round-without-winner';
      readonly roundNumber: number;
      readonly total: number;
    }
  | {
      readonly type: 'reserve-decreased';
      readonly playerId: PlayerId;
      readonly previousReserve: Reserve;
      readonly reserve: Reserve;
    }
  | {
      readonly type: 'initiative-transferred';
      readonly from: PlayerId;
      readonly to: PlayerId;
      readonly nextRoundNumber: number;
    }
  | {
      readonly type: 'game-won';
      readonly gameId: string;
      readonly playerId: PlayerId;
      readonly roundNumber: number;
    };

export type DomainErrorCode =
  | 'invalid-state'
  | 'invalid-action'
  | 'game-finished'
  | 'wrong-phase'
  | 'invalid-hidden-choice'
  | 'hidden-choice-already-submitted'
  | 'not-your-turn'
  | 'invalid-prediction'
  | 'duplicate-prediction';

export interface DomainError {
  readonly code: DomainErrorCode;
  readonly message: string;
}

export type TransitionResult =
  | {
      readonly ok: true;
      readonly state: GameState;
      readonly events: readonly DomainEvent[];
    }
  | {
      readonly ok: false;
      readonly error: DomainError;
    };

export interface GameCreation {
  readonly state: GameState;
  readonly events: readonly DomainEvent[];
}

export type ValidationResult =
  { readonly valid: true } | { readonly valid: false; readonly error: DomainError };

export type ReplayResult =
  | { readonly ok: true; readonly state: GameState }
  | {
      readonly ok: false;
      readonly error: DomainError & { readonly actionIndex: number };
    };

export interface PublicGameView {
  readonly gameId: string;
  readonly rulesVersion: typeof RULES_VERSION;
  readonly phase: GamePhase;
  readonly roundNumber: number;
  readonly initiative: PlayerId;
  readonly reserves: Readonly<Record<PlayerId, Reserve>>;
  readonly choicesReceived: Readonly<Record<PlayerId, boolean>>;
  readonly predictions: Readonly<Partial<Record<PlayerId, Prediction>>>;
  readonly revealedRounds: readonly PublicRoundResult[];
  readonly winner: PlayerId | null;
  readonly version: number;
}

export interface PrivateObservation {
  readonly playerId: PlayerId;
  readonly rulesVersion: typeof RULES_VERSION;
  readonly phase: GamePhase;
  readonly roundNumber: number;
  readonly initiative: PlayerId;
  readonly reserves: Readonly<Record<PlayerId, Reserve>>;
  readonly choicesReceived: Readonly<Record<PlayerId, boolean>>;
  readonly predictions: Readonly<Partial<Record<PlayerId, Prediction>>>;
  readonly revealedRounds: readonly PublicRoundResult[];
  readonly winner: PlayerId | null;
  readonly ownHiddenChoice: number | null;
  readonly legalActions: readonly GameAction[];
}
