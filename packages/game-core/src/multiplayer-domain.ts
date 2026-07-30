import {
  PLAYER_IDS,
  type GameState,
  type GameTranscript,
  type MultiplayerSessionState,
  type PublicRoundResult,
  type SessionTransitionResult,
} from './types.js';

export function buildGameTranscript(state: GameState): GameTranscript | null {
  if (
    (state.phase !== 'finished' && state.phase !== 'cancelled') ||
    state.terminalReason === null
  ) {
    return null;
  }

  return freezeTranscript({
    gameId: state.gameId,
    rulesVersion: state.rulesVersion,
    seed: state.seed,
    initialInitiative: state.initialInitiative,
    winner: state.winner,
    terminalReason: state.terminalReason,
    rounds: state.revealedRounds.map(copyRound),
  });
}

export function createMultiplayerSession(sessionId: string): MultiplayerSessionState {
  if (sessionId.length === 0) {
    throw new TypeError('A multiplayer session requires a non-empty id.');
  }
  return freezeSession({
    sessionId,
    score: { 'player-one': 0, 'player-two': 0 },
    recordedGameIds: [],
  });
}

export function recordSessionGame(
  session: MultiplayerSessionState,
  game: GameState,
): SessionTransitionResult {
  if (game.phase !== 'finished' && game.phase !== 'cancelled') {
    return {
      ok: false,
      error: {
        code: 'game-not-terminal',
        message: 'Only a terminal game can update a multiplayer session.',
      },
    };
  }
  if (session.recordedGameIds.includes(game.gameId)) {
    return { ok: true, session };
  }

  const score = { ...session.score };
  if (game.winner !== null) {
    score[game.winner] += 1;
  }
  return {
    ok: true,
    session: freezeSession({
      ...session,
      score,
      recordedGameIds: [...session.recordedGameIds, game.gameId],
    }),
  };
}

function copyRound(round: PublicRoundResult): PublicRoundResult {
  return {
    ...round,
    choices: { ...round.choices },
    predictions: { ...round.predictions },
    reservesAfter: { ...round.reservesAfter },
  };
}

function freezeTranscript(transcript: GameTranscript): GameTranscript {
  for (const round of transcript.rounds) {
    Object.freeze(round.choices);
    Object.freeze(round.predictions);
    Object.freeze(round.reservesAfter);
    Object.freeze(round);
  }
  Object.freeze(transcript.rounds);
  return Object.freeze(transcript);
}

function freezeSession(session: MultiplayerSessionState): MultiplayerSessionState {
  for (const playerId of PLAYER_IDS) {
    if (!Number.isSafeInteger(session.score[playerId]) || session.score[playerId] < 0) {
      throw new TypeError('A multiplayer score must contain non-negative integers.');
    }
  }
  Object.freeze(session.score);
  Object.freeze(session.recordedGameIds);
  return Object.freeze(session);
}
