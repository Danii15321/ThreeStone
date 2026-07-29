import {
  applyGameAction,
  createGame,
  getLegalActions,
  getPrivateObservation,
  getPublicView,
  type DomainEvent,
  type GameAction,
  type GamePhase,
  type GameState,
  type PlayerId,
} from '@three-stone/game-core';
import {
  createSeededRandom,
  decideAction,
  type Difficulty,
  type RandomSource,
} from '@three-stone/game-ai';

const HUMAN_PLAYER: PlayerId = 'player-one';
const AI_PLAYER: PlayerId = 'player-two';

export type SoloCommand =
  | { readonly type: 'choose-hidden'; readonly count: number }
  | { readonly type: 'predict'; readonly value: number };

export interface SoloGameOptions {
  readonly difficulty: Difficulty;
  readonly gameId: string;
  readonly seed: number;
  readonly sequenceNumber: number;
}

export interface SoloSession {
  readonly aiRandomCalls: number;
  readonly difficulty: Difficulty;
  readonly state: GameState;
}

export interface SoloSnapshot {
  readonly choicesReceived: Readonly<{ ai: boolean; human: boolean }>;
  readonly gameId: string;
  readonly humanHiddenChoice: number | null;
  readonly initiative: 'ai' | 'human';
  readonly lastReveal: {
    readonly choices: Readonly<{ ai: number; human: number }>;
    readonly predictions: Readonly<{ ai: number; human: number }>;
    readonly roundNumber: number;
    readonly total: number;
    readonly winner: 'ai' | 'human' | null;
  } | null;
  readonly phase: GamePhase;
  readonly predictions: Readonly<{ ai: number | null; human: number | null }>;
  readonly reserves: Readonly<{ ai: number; human: number }>;
  readonly roundNumber: number;
  readonly winner: 'ai' | 'human' | null;
}

export type SoloTransition =
  | {
      readonly ok: true;
      readonly events: readonly DomainEvent[];
      readonly session: SoloSession;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: 'illegal-human-action' | 'domain-transition-failed';
        readonly message: string;
      };
    };

export function startSoloGame(options: SoloGameOptions): SoloSession {
  return {
    aiRandomCalls: 0,
    difficulty: options.difficulty,
    state: createGame({
      gameId: options.gameId,
      seed: options.seed,
      sequenceNumber: options.sequenceNumber,
    }).state,
  };
}

export function listHumanActions(session: SoloSession): readonly SoloCommand[] {
  return getLegalActions(session.state, HUMAN_PLAYER).map(toSoloCommand);
}

export function playHumanAction(session: SoloSession, command: SoloCommand): SoloTransition {
  const legalAction = getLegalActions(session.state, HUMAN_PLAYER).find((action) =>
    matchesCommand(action, command),
  );
  if (!legalAction) {
    return {
      ok: false,
      error: {
        code: 'illegal-human-action',
        message: "Cette action n'est pas disponible dans la phase actuelle.",
      },
    };
  }

  const humanTransition = applyGameAction(session.state, legalAction);
  if (!humanTransition.ok) {
    return {
      ok: false,
      error: {
        code: 'domain-transition-failed',
        message: humanTransition.error.message,
      },
    };
  }

  return advanceAi(
    {
      ...session,
      state: humanTransition.state,
    },
    humanTransition.events,
  );
}

export function getSoloSnapshot(session: SoloSession): SoloSnapshot {
  const publicView = getPublicView(session.state);
  const humanObservation = getPrivateObservation(session.state, HUMAN_PLAYER);
  const latestRound = publicView.revealedRounds.at(-1);

  return {
    choicesReceived: {
      ai: publicView.choicesReceived[AI_PLAYER],
      human: publicView.choicesReceived[HUMAN_PLAYER],
    },
    gameId: publicView.gameId,
    humanHiddenChoice: humanObservation.ownHiddenChoice,
    initiative: toSeat(publicView.initiative),
    lastReveal: latestRound
      ? {
          choices: {
            ai: latestRound.choices[AI_PLAYER],
            human: latestRound.choices[HUMAN_PLAYER],
          },
          predictions: {
            ai: latestRound.predictions[AI_PLAYER],
            human: latestRound.predictions[HUMAN_PLAYER],
          },
          roundNumber: latestRound.roundNumber,
          total: latestRound.total,
          winner: latestRound.winner ? toSeat(latestRound.winner) : null,
        }
      : null,
    phase: publicView.phase,
    predictions: {
      ai: publicView.predictions[AI_PLAYER] ?? null,
      human: publicView.predictions[HUMAN_PLAYER] ?? null,
    },
    reserves: {
      ai: publicView.reserves[AI_PLAYER],
      human: publicView.reserves[HUMAN_PLAYER],
    },
    roundNumber: publicView.roundNumber,
    winner: publicView.winner ? toSeat(publicView.winner) : null,
  };
}

function advanceAi(session: SoloSession, initialEvents: readonly DomainEvent[]): SoloTransition {
  let nextSession = session;
  let events = [...initialEvents];

  while (
    getLegalActions(nextSession.state, HUMAN_PLAYER).length === 0 &&
    nextSession.state.phase !== 'finished'
  ) {
    const legalActions = getLegalActions(nextSession.state, AI_PLAYER);
    if (legalActions.length === 0) {
      break;
    }

    const countingRandom = createCountingRandom(nextSession.state.seed, nextSession.aiRandomCalls);
    const action = decideAction({
      difficulty: nextSession.difficulty,
      legalActions,
      observation: getPrivateObservation(nextSession.state, AI_PLAYER),
      random: countingRandom.random,
    });
    const transition = applyGameAction(nextSession.state, action);
    if (!transition.ok) {
      return {
        ok: false,
        error: {
          code: 'domain-transition-failed',
          message: transition.error.message,
        },
      };
    }

    nextSession = {
      ...nextSession,
      aiRandomCalls: nextSession.aiRandomCalls + countingRandom.calls(),
      state: transition.state,
    };
    events = [...events, ...transition.events];
  }

  return {
    ok: true,
    events,
    session: nextSession,
  };
}

function createCountingRandom(
  seed: number,
  callsToSkip: number,
): { readonly calls: () => number; readonly random: RandomSource } {
  const source = createSeededRandom(seed ^ 0xa11ce);
  for (let index = 0; index < callsToSkip; index += 1) {
    source.next();
  }

  let calls = 0;
  return {
    calls: () => calls,
    random: {
      next() {
        calls += 1;
        return source.next();
      },
    },
  };
}

function matchesCommand(action: GameAction, command: SoloCommand): boolean {
  return action.type === 'choose-hidden' && command.type === 'choose-hidden'
    ? action.count === command.count
    : action.type === 'predict' && command.type === 'predict' && action.value === command.value;
}

function toSoloCommand(action: GameAction): SoloCommand {
  return action.type === 'choose-hidden'
    ? { type: 'choose-hidden', count: action.count }
    : { type: 'predict', value: action.value };
}

function toSeat(playerId: PlayerId): 'ai' | 'human' {
  return playerId === HUMAN_PLAYER ? 'human' : 'ai';
}
