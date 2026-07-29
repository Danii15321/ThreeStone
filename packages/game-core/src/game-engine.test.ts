import { describe, expect, it } from 'vitest';

import {
  applyGameAction,
  createGame,
  createNextGame,
  getLegalActions,
  getPrivateObservation,
  getPublicView,
  replayGame,
  validateGameState,
  type GameAction,
  type GameState,
  type PlayerId,
} from './index.js';

function expectAccepted(state: GameState, action: GameAction): GameState {
  const result = applyGameAction(state, action);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.code);
  }
  return result.state;
}

function submitChoices(state: GameState, one: number, two: number): GameState {
  let next = expectAccepted(state, {
    type: 'choose-hidden',
    playerId: 'player-one',
    count: one,
  });
  next = expectAccepted(next, {
    type: 'choose-hidden',
    playerId: 'player-two',
    count: two,
  });
  return next;
}

function finishRound(
  state: GameState,
  choices: readonly [number, number],
  predictions: Readonly<Record<PlayerId, number>>,
): GameState {
  let next = submitChoices(state, choices[0], choices[1]);
  const first = next.initiative;
  const second: PlayerId = first === 'player-one' ? 'player-two' : 'player-one';
  next = expectAccepted(next, {
    type: 'predict',
    playerId: first,
    value: predictions[first],
  });
  return expectAccepted(next, {
    type: 'predict',
    playerId: second,
    value: predictions[second],
  });
}

describe('game creation and initiative', () => {
  it('creates a deterministic first game with two reserves of three', () => {
    const first = createGame({
      gameId: 'game-001',
      seed: 42,
      sequenceNumber: 1,
    });
    const repeated = createGame({
      gameId: 'game-001',
      seed: 42,
      sequenceNumber: 1,
    });

    expect(first).toEqual(repeated);
    expect(first.events).toEqual([
      {
        type: 'game-created',
        gameId: 'game-001',
        initiative: 'player-one',
        rulesVersion: '1.0.0',
        seed: 42,
      },
    ]);
    expect(first.state).toMatchObject({
      gameId: 'game-001',
      phase: 'hidden-choices',
      roundNumber: 1,
      initiative: 'player-one',
      reserves: { 'player-one': 3, 'player-two': 3 },
      winner: null,
      sequenceNumber: 1,
    });
    expect(validateGameState(first.state)).toEqual({ valid: true });
  });

  it('alternates the first-round initiative between successive games', () => {
    const first = createGame({
      gameId: 'game-001',
      seed: 1,
      sequenceNumber: 1,
    }).state;
    const second = createNextGame(first, { gameId: 'game-002', seed: 2 });
    const third = createNextGame(second.state, { gameId: 'game-003', seed: 3 });

    expect(first.initiative).toBe('player-one');
    expect(second.state.initiative).toBe('player-two');
    expect(third.state.initiative).toBe('player-one');
  });

  it('rejects structurally impossible states at the validation boundary', () => {
    const state = createGame({
      gameId: 'game-001',
      seed: 1,
      sequenceNumber: 1,
    }).state;

    expect(
      validateGameState({
        ...state,
        reserves: { ...state.reserves, 'player-one': 4 },
      }),
    ).toEqual({
      valid: false,
      error: expect.objectContaining({ code: 'invalid-state' }),
    });
  });
});

describe('hidden choices and confidentiality', () => {
  it.each([-1, 4, 1.5, Number.NaN])(
    'rejects an invalid hidden choice %s without mutating the state',
    (count) => {
      const state = createGame({
        gameId: 'game-001',
        seed: 1,
        sequenceNumber: 1,
      }).state;
      const result = applyGameAction(state, {
        type: 'choose-hidden',
        playerId: 'player-one',
        count,
      });

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'invalid-hidden-choice' },
      });
      expect(state.round.hiddenChoices).toEqual({});
    },
  );

  it('keeps a choice out of public and opposing private views', () => {
    const initial = createGame({
      gameId: 'game-001',
      seed: 1,
      sequenceNumber: 1,
    }).state;
    const result = applyGameAction(initial, {
      type: 'choose-hidden',
      playerId: 'player-one',
      count: 2,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.code);
    }

    expect(result.events).toEqual([
      { type: 'hidden-choice-received', playerId: 'player-one', roundNumber: 1 },
    ]);
    expect(getPublicView(result.state)).toMatchObject({
      choicesReceived: { 'player-one': true, 'player-two': false },
    });
    expect(getPublicView(result.state)).not.toHaveProperty('round.hiddenChoices');
    expect(getPrivateObservation(result.state, 'player-one').ownHiddenChoice).toBe(2);
    expect(getPrivateObservation(result.state, 'player-two').ownHiddenChoice).toBeNull();
  });

  it('refuses a duplicate choice and enters prediction only after both choices', () => {
    const initial = createGame({
      gameId: 'game-001',
      seed: 1,
      sequenceNumber: 1,
    }).state;
    const oneSubmitted = expectAccepted(initial, {
      type: 'choose-hidden',
      playerId: 'player-one',
      count: 1,
    });
    const duplicate = applyGameAction(oneSubmitted, {
      type: 'choose-hidden',
      playerId: 'player-one',
      count: 0,
    });
    const bothSubmitted = expectAccepted(oneSubmitted, {
      type: 'choose-hidden',
      playerId: 'player-two',
      count: 3,
    });

    expect(duplicate).toMatchObject({
      ok: false,
      error: { code: 'hidden-choice-already-submitted' },
    });
    expect(oneSubmitted.phase).toBe('hidden-choices');
    expect(bothSubmitted.phase).toBe('first-prediction');
  });
});

describe('predictions, reveal and resolution', () => {
  it('enforces turn order, integer bounds and distinct predictions', () => {
    const state = submitChoices(
      createGame({ gameId: 'game-001', seed: 1, sequenceNumber: 1 }).state,
      1,
      2,
    );

    expect(
      applyGameAction(state, {
        type: 'predict',
        playerId: 'player-two',
        value: 3,
      }),
    ).toMatchObject({ ok: false, error: { code: 'not-your-turn' } });
    expect(
      applyGameAction(state, {
        type: 'predict',
        playerId: 'player-one',
        value: 7,
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-prediction' } });

    const firstPrediction = expectAccepted(state, {
      type: 'predict',
      playerId: 'player-one',
      value: 6,
    });
    expect(firstPrediction.phase).toBe('second-prediction');
    expect(
      applyGameAction(firstPrediction, {
        type: 'predict',
        playerId: 'player-two',
        value: 6,
      }),
    ).toMatchObject({ ok: false, error: { code: 'duplicate-prediction' } });

    const impossibleButLegal = applyGameAction(firstPrediction, {
      type: 'predict',
      playerId: 'player-two',
      value: 5,
    });
    expect(impossibleButLegal.ok).toBe(true);
  });

  it('reveals, awards exactly one stone and emits ordered public events', () => {
    let state = submitChoices(
      createGame({ gameId: 'game-001', seed: 1, sequenceNumber: 1 }).state,
      2,
      1,
    );
    state = expectAccepted(state, {
      type: 'predict',
      playerId: 'player-one',
      value: 2,
    });
    const result = applyGameAction(state, {
      type: 'predict',
      playerId: 'player-two',
      value: 3,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.code);
    }

    expect(result.state.reserves).toEqual({
      'player-one': 3,
      'player-two': 2,
    });
    expect(result.state.phase).toBe('hidden-choices');
    expect(result.state.initiative).toBe('player-two');
    expect(result.events.map((event) => event.type)).toEqual([
      'prediction-announced',
      'hands-revealed',
      'round-won',
      'reserve-decreased',
      'initiative-transferred',
    ]);
    expect(result.events[1]).toEqual({
      type: 'hands-revealed',
      roundNumber: 1,
      choices: { 'player-one': 2, 'player-two': 1 },
      total: 3,
    });
  });

  it('starts a new round without changing reserves when nobody is correct', () => {
    const state = finishRound(
      createGame({ gameId: 'game-001', seed: 1, sequenceNumber: 1 }).state,
      [0, 0],
      { 'player-one': 1, 'player-two': 2 },
    );

    expect(state.reserves).toEqual({ 'player-one': 3, 'player-two': 3 });
    expect(state.roundNumber).toBe(2);
    expect(state.initiative).toBe('player-two');
    expect(state.round.hiddenChoices).toEqual({});
    expect(getPublicView(state).revealedRounds.at(-1)).toMatchObject({
      roundNumber: 1,
      total: 0,
      winner: null,
    });
  });

  it('finishes at reserve zero and rejects every later game action', () => {
    let state = createGame({
      gameId: 'game-001',
      seed: 1,
      sequenceNumber: 1,
    }).state;
    for (let round = 0; round < 3; round += 1) {
      state = finishRound(state, [0, 0], {
        'player-one': 0,
        'player-two': 1,
      });
    }

    expect(state.phase).toBe('finished');
    expect(state.winner).toBe('player-one');
    expect(state.reserves['player-one']).toBe(0);
    expect(getLegalActions(state, 'player-one')).toEqual([]);
    expect(
      applyGameAction(state, {
        type: 'choose-hidden',
        playerId: 'player-one',
        count: 0,
      }),
    ).toMatchObject({ ok: false, error: { code: 'game-finished' } });
  });
});

describe('replay and immutability', () => {
  it('replays an action history into the exact same state', () => {
    const options = { gameId: 'game-001', seed: 982_451, sequenceNumber: 1 };
    let state = createGame(options).state;
    state = finishRound(state, [1, 2], {
      'player-one': 3,
      'player-two': 4,
    });
    state = finishRound(state, [0, 0], {
      'player-one': 0,
      'player-two': 1,
    });

    const replay = replayGame(options, state.actionHistory);
    expect(replay.ok).toBe(true);
    if (!replay.ok) {
      throw new Error(replay.error.code);
    }
    expect(replay.state).toEqual(state);
  });
});
