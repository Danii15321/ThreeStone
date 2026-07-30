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
    initialInitiative: initiative,
    initiative,
    reserves: { 'player-one': 3, 'player-two': 3 },
    round: EMPTY_ROUND,
    revealedRounds: [],
    winner: null,
    terminalReason: null,
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
  if (state.phase === 'finished' || state.phase === 'cancelled') {
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
    initiative: state.initiative,
    choices: { ...choices },
    predictions: { ...predictions },
    total,
    winner: roundWinner,
    reservesAfter: { ...reserves },
  };
  const winner = roundWinner !== null && reserves[roundWinner] === 0 ? roundWinner : null;

  if (winner !== null) {
    events.push({
      type: 'game-won',
      gameId: state.gameId,
      playerId: winner,
      reason: 'reserve-empty',
      roundNumber: state.roundNumber,
    });
    return success(state, action, events, {
      phase: 'finished',
      reserves,
      round: { hiddenChoices: choices, predictions },
      revealedRounds: [...state.revealedRounds, roundResult],
      winner,
      terminalReason: 'reserve-empty',
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
    | 'phase'
    | 'roundNumber'
    | 'initiative'
    | 'reserves'
    | 'round'
    | 'revealedRounds'
    | 'winner'
    | 'terminalReason'
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

export function expireHiddenChoiceDeadline(
  state: GameState,
  expectedRoundNumber = state.roundNumber,
): TransitionResult {
  const validation = validateGameState(state);
  if (!validation.valid) {
    return { ok: false, error: validation.error };
  }
  if (state.phase === 'finished' || state.phase === 'cancelled') {
    return failure('game-finished', 'A terminal game cannot expire another deadline.');
  }
  if (state.roundNumber !== expectedRoundNumber) {
    return { ok: true, state, events: [] };
  }

  const submitted = PLAYER_IDS.filter(
    (playerId) => state.round.hiddenChoices[playerId] !== undefined,
  );
  if (submitted.length === 2) {
    return { ok: true, state, events: [] };
  }
  if (state.phase !== 'hidden-choices') {
    return failure('wrong-phase', 'The hidden choice deadline is not active.');
  }
  if (submitted.length === 0) {
    return cancelWithReason(state, 'both-hidden-choice-timeout');
  }
  return winByForfeit(state, submitted[0]!, 'hidden-choice-timeout');
}

export interface PredictionDeadlineIdentity {
  readonly roundNumber: number;
  readonly playerId: PlayerId;
}

export function expirePredictionDeadline(
  state: GameState,
  expected?: PredictionDeadlineIdentity,
): TransitionResult {
  const validation = validateGameState(state);
  if (!validation.valid) {
    return { ok: false, error: validation.error };
  }
  if (state.phase === 'finished' || state.phase === 'cancelled') {
    return failure('game-finished', 'A terminal game cannot expire another deadline.');
  }
  if (state.phase !== 'first-prediction' && state.phase !== 'second-prediction') {
    return failure('wrong-phase', 'No prediction deadline is active.');
  }

  const activePlayer =
    state.phase === 'first-prediction' ? state.initiative : opposite(state.initiative);
  if (
    expected !== undefined &&
    (expected.roundNumber !== state.roundNumber || expected.playerId !== activePlayer)
  ) {
    return { ok: true, state, events: [] };
  }
  return winByForfeit(state, opposite(activePlayer), 'prediction-timeout');
}

export function abandonGame(state: GameState, playerId: PlayerId): TransitionResult {
  return forfeitGame(state, playerId, 'abandon');
}

export function forfeitGame(
  state: GameState,
  losingPlayerId: PlayerId,
  reason: 'abandon' | 'disconnect',
): TransitionResult {
  const validation = validateGameState(state);
  if (!validation.valid) {
    return { ok: false, error: validation.error };
  }
  if (state.phase === 'finished' || state.phase === 'cancelled') {
    return failure('game-finished', 'A terminal game cannot be forfeited.');
  }
  return winByForfeit(state, opposite(losingPlayerId), reason);
}

export function cancelGame(state: GameState, operationalReason: string): TransitionResult {
  const validation = validateGameState(state);
  if (!validation.valid) {
    return { ok: false, error: validation.error };
  }
  if (operationalReason.trim().length === 0) {
    return failure('invalid-action', 'A technical cancellation requires an operational reason.');
  }
  if (state.phase === 'finished' || state.phase === 'cancelled') {
    return failure('game-finished', 'A terminal game cannot be cancelled again.');
  }
  return cancelWithReason(state, 'technical-cancellation');
}

function winByForfeit(
  state: GameState,
  winner: PlayerId,
  reason: 'hidden-choice-timeout' | 'prediction-timeout' | 'abandon' | 'disconnect',
): TransitionResult {
  const event: DomainEvent = {
    type: 'game-won',
    gameId: state.gameId,
    playerId: winner,
    reason,
    roundNumber: state.roundNumber,
  };
  return systemSuccess(state, [event], {
    phase: 'finished',
    winner,
    terminalReason: reason,
  });
}

function cancelWithReason(
  state: GameState,
  reason: 'both-hidden-choice-timeout' | 'technical-cancellation',
): TransitionResult {
  const event: DomainEvent = {
    type: 'game-cancelled',
    gameId: state.gameId,
    reason,
  };
  return systemSuccess(state, [event], {
    phase: 'cancelled',
    winner: null,
    terminalReason: reason,
  });
}

function systemSuccess(
  state: GameState,
  events: readonly DomainEvent[],
  changes: StateChanges,
): TransitionResult {
  const next = freezeState({
    ...state,
    ...changes,
    eventHistory: [...state.eventHistory, ...events],
    version: state.version + 1,
  });
  return { ok: true, state: next, events };
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
    !isPlayer(input.initialInitiative) ||
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
    !(input.winner === null || isPlayer(input.winner)) ||
    !(input.terminalReason === null || isTerminalReason(input.terminalReason))
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

  const activePhaseIsConsistent =
    (input.phase === 'hidden-choices' && choiceCount < 2 && predictionCount === 0) ||
    (input.phase === 'first-prediction' && choiceCount === 2 && predictionCount === 0) ||
    (input.phase === 'second-prediction' &&
      choiceCount === 2 &&
      predictionCount === 1 &&
      input.round.predictions[input.initiative] !== undefined);
  const roundProgressIsPossible =
    (choiceCount < 2 && predictionCount === 0) ||
    (choiceCount === 2 &&
      (predictionCount === 0 ||
        (predictionCount === 1 && input.round.predictions[input.initiative] !== undefined) ||
        predictionCount === 2));
  const finishedIsConsistent =
    input.phase === 'finished' &&
    input.winner !== null &&
    input.terminalReason !== null &&
    input.terminalReason !== 'both-hidden-choice-timeout' &&
    input.terminalReason !== 'technical-cancellation' &&
    roundProgressIsPossible &&
    (input.terminalReason !== 'reserve-empty' ||
      (choiceCount === 2 && predictionCount === 2 && input.reserves[input.winner] === 0)) &&
    (input.terminalReason !== 'hidden-choice-timeout' || choiceCount === 1) &&
    (input.terminalReason !== 'prediction-timeout' || (choiceCount === 2 && predictionCount < 2));
  const cancelledIsConsistent =
    input.phase === 'cancelled' &&
    input.winner === null &&
    (input.terminalReason === 'both-hidden-choice-timeout' ||
      input.terminalReason === 'technical-cancellation') &&
    roundProgressIsPossible &&
    (input.terminalReason !== 'both-hidden-choice-timeout' || choiceCount === 0);
  const activeIsConsistent =
    activePhaseIsConsistent && input.winner === null && input.terminalReason === null;
  if (!activeIsConsistent && !finishedIsConsistent && !cancelledIsConsistent) {
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
    value === 'finished' ||
    value === 'cancelled'
  );
}

function isTerminalReason(value: unknown): value is GameState['terminalReason'] {
  return (
    value === 'reserve-empty' ||
    value === 'hidden-choice-timeout' ||
    value === 'both-hidden-choice-timeout' ||
    value === 'prediction-timeout' ||
    value === 'abandon' ||
    value === 'disconnect' ||
    value === 'technical-cancellation'
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
    Object.freeze(round.reservesAfter);
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
