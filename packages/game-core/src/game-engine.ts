import { hasBothPlayers } from './projections.js';
import {
  PLAYER_IDS,
  RULES_VERSION,
  type ChooseHiddenAction,
  type CreateGameOptions,
  type DomainError,
  type DomainEvent,
  type GameAction,
  type GameCreation,
  type GamePhase,
  type GameState,
  type PlayerId,
  type PredictAction,
  type PublicRoundResult,
  type ReplayResult,
  type TransitionResult,
  type ValidationResult,
} from './types.js';

const EMPTY_ROUND = Object.freeze({
  hiddenChoices: Object.freeze({}),
  predictions: Object.freeze({}),
});

export function createGame(options: CreateGameOptions): GameCreation {
  if (
    options.gameId.length === 0 ||
    !Number.isSafeInteger(options.seed) ||
    !Number.isSafeInteger(options.sequenceNumber) ||
    options.sequenceNumber < 1
  ) {
    throw new TypeError('Game creation requires a non-empty id and safe integer seed/sequence.');
  }

  const initiative: PlayerId = options.sequenceNumber % 2 === 1 ? 'player-one' : 'player-two';
  const event: DomainEvent = {
    type: 'game-created',
    gameId: options.gameId,
    initiative,
    rulesVersion: RULES_VERSION,
    seed: options.seed,
  };
  const state = freezeState({
    gameId: options.gameId,
    rulesVersion: RULES_VERSION,
    seed: options.seed,
    sequenceNumber: options.sequenceNumber,
    phase: 'hidden-choices',
    roundNumber: 1,
    initiative,
    reserves: { 'player-one': 3, 'player-two': 3 },
    round: EMPTY_ROUND,
    revealedRounds: [],
    winner: null,
    actionHistory: [],
    eventHistory: [event],
    version: 0,
  });
  return { state, events: [event] };
}

export function createNextGame(
  previousGame: GameState,
  options: Pick<CreateGameOptions, 'gameId' | 'seed'>,
): GameCreation {
  return createGame({
    ...options,
    sequenceNumber: previousGame.sequenceNumber + 1,
  });
}

export function applyGameAction(state: GameState, action: unknown): TransitionResult {
  const validation = validateGameState(state);
  if (!validation.valid) {
    return { ok: false, error: validation.error };
  }
  if (!isGameAction(action)) {
    return failure('invalid-action', 'The submitted value is not a supported game action.');
  }
  if (state.phase === 'finished') {
    return failure('game-finished', 'A finished game cannot accept another action.');
  }
  if (action.type === 'choose-hidden') {
    return applyHiddenChoice(state, action);
  }
  return applyPrediction(state, action);
}

function applyHiddenChoice(state: GameState, action: ChooseHiddenAction): TransitionResult {
  if (state.phase !== 'hidden-choices') {
    return failure('wrong-phase', 'Hidden choices are only accepted during hidden choice.');
  }
  if (
    !Number.isInteger(action.count) ||
    action.count < 0 ||
    action.count > state.reserves[action.playerId]
  ) {
    return failure(
      'invalid-hidden-choice',
      'A hidden choice must be an integer between zero and the player reserve.',
    );
  }
  if (state.round.hiddenChoices[action.playerId] !== undefined) {
    return failure(
      'hidden-choice-already-submitted',
      'This player already submitted a hidden choice for the round.',
    );
  }

  const hiddenChoices = {
    ...state.round.hiddenChoices,
    [action.playerId]: action.count,
  };
  const event: DomainEvent = {
    type: 'hidden-choice-received',
    playerId: action.playerId,
    roundNumber: state.roundNumber,
  };
  return success(state, action, [event], {
    phase: hasBothPlayers(hiddenChoices) ? 'first-prediction' : 'hidden-choices',
    round: {
      hiddenChoices,
      predictions: state.round.predictions,
    },
  });
}

function applyPrediction(state: GameState, action: PredictAction): TransitionResult {
  if (state.phase !== 'first-prediction' && state.phase !== 'second-prediction') {
    return failure('wrong-phase', 'Predictions are only accepted during prediction phases.');
  }
  if (!Number.isInteger(action.value) || action.value < 0 || action.value > 6) {
    return failure('invalid-prediction', 'A prediction must be an integer from zero to six.');
  }

  const expectedPlayer =
    state.phase === 'first-prediction' ? state.initiative : opposite(state.initiative);
  if (action.playerId !== expectedPlayer) {
    return failure('not-your-turn', 'Only the expected player may announce a prediction.');
  }

  const firstPrediction = state.round.predictions[state.initiative];
  if (firstPrediction === action.value) {
    return failure('duplicate-prediction', 'The second prediction must differ from the first.');
  }

  const predictions = {
    ...state.round.predictions,
    [action.playerId]: action.value,
  };
  const predictionEvent: DomainEvent = {
    type: 'prediction-announced',
    playerId: action.playerId,
    roundNumber: state.roundNumber,
    value: action.value,
  };

  if (state.phase === 'first-prediction') {
    return success(state, action, [predictionEvent], {
      phase: 'second-prediction',
      round: { hiddenChoices: state.round.hiddenChoices, predictions },
    });
  }

  if (!hasBothPlayers(state.round.hiddenChoices) || !hasBothPlayers(predictions)) {
    return failure('invalid-state', 'Resolution requires two choices and two predictions.');
  }
  return resolveRound(state, action, state.round.hiddenChoices, predictions, predictionEvent);
}

function resolveRound(
  state: GameState,
  action: PredictAction,
  choices: Readonly<Record<PlayerId, number>>,
  predictions: Readonly<Record<PlayerId, number>>,
  predictionEvent: DomainEvent,
): TransitionResult {
  const total = choices['player-one'] + choices['player-two'];
  const roundWinner = PLAYER_IDS.find((playerId) => predictions[playerId] === total) ?? null;
  const revealEvent: DomainEvent = {
    type: 'hands-revealed',
    roundNumber: state.roundNumber,
    choices: { ...choices },
    total,
  };
  const resolutionEvent: DomainEvent =
    roundWinner === null
      ? { type: 'round-without-winner', roundNumber: state.roundNumber, total }
      : {
          type: 'round-won',
          roundNumber: state.roundNumber,
          playerId: roundWinner,
          prediction: predictions[roundWinner],
        };
  const events: DomainEvent[] = [predictionEvent, revealEvent, resolutionEvent];
  const reserves = { ...state.reserves };

  if (roundWinner !== null) {
    const previousReserve = reserves[roundWinner];
    reserves[roundWinner] = previousReserve - 1;
    events.push({
      type: 'reserve-decreased',
      playerId: roundWinner,
      previousReserve,
      reserve: reserves[roundWinner],
    });
  }

  const roundResult: PublicRoundResult = {
    roundNumber: state.roundNumber,
    choices: { ...choices },
    predictions: { ...predictions },
    total,
    winner: roundWinner,
  };
  const winner = roundWinner !== null && reserves[roundWinner] === 0 ? roundWinner : null;

  if (winner !== null) {
    events.push({
      type: 'game-won',
      gameId: state.gameId,
      playerId: winner,
      roundNumber: state.roundNumber,
    });
    return success(state, action, events, {
      phase: 'finished',
      reserves,
      round: { hiddenChoices: choices, predictions },
      revealedRounds: [...state.revealedRounds, roundResult],
      winner,
    });
  }

  const nextInitiative = opposite(state.initiative);
  events.push({
    type: 'initiative-transferred',
    from: state.initiative,
    to: nextInitiative,
    nextRoundNumber: state.roundNumber + 1,
  });
  return success(state, action, events, {
    phase: 'hidden-choices',
    roundNumber: state.roundNumber + 1,
    initiative: nextInitiative,
    reserves,
    round: EMPTY_ROUND,
    revealedRounds: [...state.revealedRounds, roundResult],
  });
}

type StateChanges = Partial<
  Pick<
    GameState,
    'phase' | 'roundNumber' | 'initiative' | 'reserves' | 'round' | 'revealedRounds' | 'winner'
  >
>;

function success(
  state: GameState,
  action: GameAction,
  events: readonly DomainEvent[],
  changes: StateChanges,
): TransitionResult {
  const next = freezeState({
    ...state,
    ...changes,
    actionHistory: [...state.actionHistory, copyAction(action)],
    eventHistory: [...state.eventHistory, ...events],
    version: state.version + 1,
  });
  return { ok: true, state: next, events };
}

function failure(code: DomainError['code'], message: string): TransitionResult {
  return { ok: false, error: { code, message } };
}

function opposite(playerId: PlayerId): PlayerId {
  return playerId === 'player-one' ? 'player-two' : 'player-one';
}

function copyAction(action: GameAction): GameAction {
  return action.type === 'choose-hidden' ? { ...action } : { ...action };
}

export function replayGame(
  options: CreateGameOptions,
  actions: readonly GameAction[],
): ReplayResult {
  let state = createGame(options).state;
  for (const [actionIndex, action] of actions.entries()) {
    const result = applyGameAction(state, action);
    if (!result.ok) {
      return {
        ok: false,
        error: { ...result.error, actionIndex },
      };
    }
    state = result.state;
  }
  return { ok: true, state };
}

export function validateGameState(input: unknown): ValidationResult {
  if (!isRecord(input)) {
    return invalidState('A game state must be an object.');
  }
  if (
    input.rulesVersion !== RULES_VERSION ||
    typeof input.gameId !== 'string' ||
    input.gameId.length === 0 ||
    !isSafeInteger(input.seed) ||
    !isPositiveInteger(input.sequenceNumber) ||
    !isPositiveInteger(input.roundNumber) ||
    !isSafeInteger(input.version) ||
    input.version < 0 ||
    !isPlayer(input.initiative) ||
    !isPhase(input.phase) ||
    !isRecord(input.reserves) ||
    !isReserve(input.reserves['player-one']) ||
    !isReserve(input.reserves['player-two']) ||
    !isRecord(input.round) ||
    !isRecord(input.round.hiddenChoices) ||
    !isRecord(input.round.predictions) ||
    !Array.isArray(input.revealedRounds) ||
    !Array.isArray(input.actionHistory) ||
    !Array.isArray(input.eventHistory) ||
    !(input.winner === null || isPlayer(input.winner))
  ) {
    return invalidState('The game state violates its structural invariants.');
  }

  const choiceCount = countPlayerValues(input.round.hiddenChoices);
  const predictionCount = countPlayerValues(input.round.predictions);
  for (const playerId of PLAYER_IDS) {
    const choice = input.round.hiddenChoices[playerId];
    const reserve = input.reserves[playerId];
    if (
      choice !== undefined &&
      (typeof choice !== 'number' ||
        !Number.isInteger(choice) ||
        choice < 0 ||
        !isReserve(reserve) ||
        (input.phase !== 'finished' && choice > reserve))
    ) {
      return invalidState('A current hidden choice is outside its legal reserve.');
    }
    const prediction = input.round.predictions[playerId];
    if (
      prediction !== undefined &&
      (typeof prediction !== 'number' ||
        !Number.isInteger(prediction) ||
        prediction < 0 ||
        prediction > 6)
    ) {
      return invalidState('A current prediction is outside zero to six.');
    }
  }
  const predictionOne = input.round.predictions['player-one'];
  const predictionTwo = input.round.predictions['player-two'];
  if (predictionOne !== undefined && predictionOne === predictionTwo) {
    return invalidState('Predictions in the same round must be distinct.');
  }

  const phaseIsConsistent =
    (input.phase === 'hidden-choices' && choiceCount < 2 && predictionCount === 0) ||
    (input.phase === 'first-prediction' && choiceCount === 2 && predictionCount === 0) ||
    (input.phase === 'second-prediction' &&
      choiceCount === 2 &&
      predictionCount === 1 &&
      input.round.predictions[input.initiative] !== undefined) ||
    (input.phase === 'finished' &&
      choiceCount === 2 &&
      predictionCount === 2 &&
      input.winner !== null &&
      input.reserves[input.winner] === 0);
  if (!phaseIsConsistent || (input.phase !== 'finished' && input.winner !== null)) {
    return invalidState('The phase does not match the current round data.');
  }

  return { valid: true };
}

function invalidState(message: string): ValidationResult {
  return { valid: false, error: { code: 'invalid-state', message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isPositiveInteger(value: unknown): value is number {
  return isSafeInteger(value) && value > 0;
}

function isReserve(value: unknown): value is number {
  return isSafeInteger(value) && value >= 0 && value <= 3;
}

function isPlayer(value: unknown): value is PlayerId {
  return value === 'player-one' || value === 'player-two';
}

function isPhase(value: unknown): value is GamePhase {
  return (
    value === 'hidden-choices' ||
    value === 'first-prediction' ||
    value === 'second-prediction' ||
    value === 'finished'
  );
}

function isGameAction(value: unknown): value is GameAction {
  if (!isRecord(value) || !isPlayer(value.playerId)) {
    return false;
  }
  return (
    (value.type === 'choose-hidden' && typeof value.count === 'number') ||
    (value.type === 'predict' && typeof value.value === 'number')
  );
}

function countPlayerValues(value: Record<string, unknown>): number {
  return PLAYER_IDS.filter((playerId) => value[playerId] !== undefined).length;
}

function freezeState(state: GameState): GameState {
  for (const event of state.eventHistory) {
    if (event.type === 'hands-revealed') {
      Object.freeze(event.choices);
    }
    Object.freeze(event);
  }
  for (const action of state.actionHistory) {
    Object.freeze(action);
  }
  for (const round of state.revealedRounds) {
    Object.freeze(round.choices);
    Object.freeze(round.predictions);
    Object.freeze(round);
  }
  Object.freeze(state.reserves);
  Object.freeze(state.round.hiddenChoices);
  Object.freeze(state.round.predictions);
  Object.freeze(state.round);
  Object.freeze(state.revealedRounds);
  Object.freeze(state.actionHistory);
  Object.freeze(state.eventHistory);
  return Object.freeze(state);
}
