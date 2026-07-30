import { describe, expect, it } from 'vitest';

import {
  abandonGame,
  applyGameAction,
  buildGameTranscript,
  cancelGame,
  createGame,
  createMultiplayerSession,
  expireHiddenChoiceDeadline,
  expirePredictionDeadline,
  recordSessionGame,
  type GameAction,
  type GameState,
} from './index.js';

function accept(state: GameState, action: GameAction): GameState {
  const result = applyGameAction(state, action);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.code);
  }
  return result.state;
}

function initialGame(gameId = 'multiplayer-001'): GameState {
  return createGame({ gameId, seed: 17, sequenceNumber: 1 }).state;
}

describe('multiplayer terminal transitions', () => {
  it('cancels without a winner when neither hidden choice arrived', () => {
    const result = expireHiddenChoiceDeadline(initialGame());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.code);
    }
    expect(result.state).toMatchObject({
      phase: 'cancelled',
      winner: null,
      terminalReason: 'both-hidden-choice-timeout',
    });
    expect(result.events).toEqual([
      {
        type: 'game-cancelled',
        gameId: 'multiplayer-001',
        reason: 'both-hidden-choice-timeout',
      },
    ]);
  });

  it('awards the game to the only player who submitted before the common deadline', () => {
    const waiting = accept(initialGame(), {
      type: 'choose-hidden',
      playerId: 'player-two',
      count: 2,
    });
    const result = expireHiddenChoiceDeadline(waiting);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.code);
    }
    expect(result.state).toMatchObject({
      phase: 'finished',
      winner: 'player-two',
      terminalReason: 'hidden-choice-timeout',
    });
  });

  it('treats an obsolete common deadline as a no-op once both choices are accepted', () => {
    let state = initialGame();
    state = accept(state, { type: 'choose-hidden', playerId: 'player-one', count: 1 });
    state = accept(state, { type: 'choose-hidden', playerId: 'player-two', count: 2 });

    const result = expireHiddenChoiceDeadline(state);

    expect(result).toEqual({ ok: true, state, events: [] });
  });

  it('makes the active predictor lose when their deadline expires', () => {
    let state = initialGame();
    state = accept(state, { type: 'choose-hidden', playerId: 'player-one', count: 0 });
    state = accept(state, { type: 'choose-hidden', playerId: 'player-two', count: 0 });

    const result = expirePredictionDeadline(state);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.code);
    }
    expect(result.state).toMatchObject({
      winner: 'player-two',
      terminalReason: 'prediction-timeout',
    });
  });

  it('distinguishes explicit abandonment from technical cancellation', () => {
    const abandoned = abandonGame(initialGame('abandoned'), 'player-one');
    const cancelled = cancelGame(initialGame('cancelled'), 'server-crash');

    expect(abandoned.ok).toBe(true);
    expect(cancelled.ok).toBe(true);
    if (!abandoned.ok || !cancelled.ok) {
      throw new Error('terminal transition refused');
    }
    expect(abandoned.state).toMatchObject({
      phase: 'finished',
      winner: 'player-two',
      terminalReason: 'abandon',
    });
    expect(cancelled.state).toMatchObject({
      phase: 'cancelled',
      winner: null,
      terminalReason: 'technical-cancellation',
    });
  });
});

describe('validated transcript and session score', () => {
  it('records initiative, revealed decisions and reserves after every round', () => {
    let state = initialGame('transcript');
    state = accept(state, { type: 'choose-hidden', playerId: 'player-one', count: 1 });
    state = accept(state, { type: 'choose-hidden', playerId: 'player-two', count: 2 });
    state = accept(state, { type: 'predict', playerId: 'player-one', value: 3 });
    state = accept(state, { type: 'predict', playerId: 'player-two', value: 4 });
    const terminal = abandonGame(state, 'player-one');
    expect(terminal.ok).toBe(true);
    if (!terminal.ok) {
      throw new Error(terminal.error.code);
    }

    expect(buildGameTranscript(terminal.state)).toEqual({
      gameId: 'transcript',
      rulesVersion: '1.0.0',
      seed: 17,
      initialInitiative: 'player-one',
      winner: 'player-two',
      terminalReason: 'abandon',
      rounds: [
        {
          roundNumber: 1,
          initiative: 'player-one',
          choices: { 'player-one': 1, 'player-two': 2 },
          predictions: { 'player-one': 3, 'player-two': 4 },
          total: 3,
          winner: 'player-one',
          reservesAfter: { 'player-one': 2, 'player-two': 3 },
        },
      ],
    });
  });

  it('increments a session once for a winner and never for a cancellation', () => {
    const session = createMultiplayerSession('session-001');
    const won = abandonGame(initialGame('won'), 'player-two');
    const cancelled = cancelGame(initialGame('cancelled'), 'server-crash');
    expect(won.ok && cancelled.ok).toBe(true);
    if (!won.ok || !cancelled.ok) {
      throw new Error('terminal transition refused');
    }

    const afterWin = recordSessionGame(session, won.state);
    expect(afterWin.ok).toBe(true);
    if (!afterWin.ok) {
      throw new Error(afterWin.error.code);
    }
    expect(afterWin.session.score).toEqual({ 'player-one': 1, 'player-two': 0 });

    const duplicate = recordSessionGame(afterWin.session, won.state);
    expect(duplicate).toEqual(afterWin);

    const afterCancellation = recordSessionGame(afterWin.session, cancelled.state);
    expect(afterCancellation.ok).toBe(true);
    if (!afterCancellation.ok) {
      throw new Error(afterCancellation.error.code);
    }
    expect(afterCancellation.session.score).toEqual({ 'player-one': 1, 'player-two': 0 });
  });
});
