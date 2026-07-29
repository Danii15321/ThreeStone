import {
  PLAYER_IDS,
  type GameAction,
  type GameState,
  type PlayerId,
  type PrivateObservation,
  type PublicGameView,
} from './types.js';

const otherPlayer = (playerId: PlayerId): PlayerId =>
  playerId === 'player-one' ? 'player-two' : 'player-one';

export function getLegalActions(state: GameState, playerId: PlayerId): readonly GameAction[] {
  if (state.phase === 'finished') {
    return [];
  }

  if (state.phase === 'hidden-choices') {
    if (state.round.hiddenChoices[playerId] !== undefined) {
      return [];
    }
    return Array.from({ length: state.reserves[playerId] + 1 }, (_, count) => ({
      type: 'choose-hidden' as const,
      playerId,
      count,
    }));
  }

  const expectedPlayer =
    state.phase === 'first-prediction' ? state.initiative : otherPlayer(state.initiative);
  if (playerId !== expectedPlayer) {
    return [];
  }

  const firstPrediction = state.round.predictions[state.initiative];
  return Array.from({ length: 7 }, (_, value) => value)
    .filter((value) => value !== firstPrediction)
    .map((value) => ({
      type: 'predict' as const,
      playerId,
      value,
    }));
}

export function getPublicView(state: GameState): PublicGameView {
  return {
    gameId: state.gameId,
    rulesVersion: state.rulesVersion,
    phase: state.phase,
    roundNumber: state.roundNumber,
    initiative: state.initiative,
    reserves: { ...state.reserves },
    choicesReceived: {
      'player-one': state.round.hiddenChoices['player-one'] !== undefined,
      'player-two': state.round.hiddenChoices['player-two'] !== undefined,
    },
    predictions: { ...state.round.predictions },
    revealedRounds: state.revealedRounds.map(copyRevealedRound),
    winner: state.winner,
    version: state.version,
  };
}

export function getPrivateObservation(state: GameState, playerId: PlayerId): PrivateObservation {
  const view = getPublicView(state);
  return {
    playerId,
    rulesVersion: view.rulesVersion,
    phase: view.phase,
    roundNumber: view.roundNumber,
    initiative: view.initiative,
    reserves: view.reserves,
    choicesReceived: view.choicesReceived,
    predictions: view.predictions,
    revealedRounds: view.revealedRounds,
    winner: view.winner,
    ownHiddenChoice: state.round.hiddenChoices[playerId] ?? null,
    legalActions: getLegalActions(state, playerId),
  };
}

function copyRevealedRound(
  round: GameState['revealedRounds'][number],
): GameState['revealedRounds'][number] {
  return {
    ...round,
    choices: { ...round.choices },
    predictions: { ...round.predictions },
  };
}

export function hasBothPlayers<T>(
  values: Readonly<Partial<Record<PlayerId, T>>>,
): values is Readonly<Record<PlayerId, T>> {
  return PLAYER_IDS.every((playerId) => values[playerId] !== undefined);
}
