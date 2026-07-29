import { describe, expect, it } from 'vitest';

import {
  getSoloSnapshot,
  listHumanActions,
  playHumanAction,
  startSoloGame,
} from './solo-game-controller.js';

function expectAccepted<T extends { ok: boolean }>(
  transition: T,
): asserts transition is T & { ok: true } {
  expect(transition.ok).toBe(true);
}

describe('solo game controller', () => {
  it('starts a deterministic game with the human as player one', () => {
    const options = {
      difficulty: 'normal' as const,
      gameId: 'solo-001',
      seed: 42,
      sequenceNumber: 1,
    };

    const first = startSoloGame(options);
    const repeated = startSoloGame(options);

    expect(getSoloSnapshot(first)).toEqual(getSoloSnapshot(repeated));
    expect(getSoloSnapshot(first)).toMatchObject({
      gameId: 'solo-001',
      phase: 'hidden-choices',
      reserves: { ai: 3, human: 3 },
      roundNumber: 1,
      winner: null,
    });
  });

  it('lets the AI choose without exposing its hidden choice', () => {
    const session = startSoloGame({
      difficulty: 'hard',
      gameId: 'solo-secret',
      seed: 71,
      sequenceNumber: 1,
    });
    const transition = playHumanAction(session, {
      type: 'choose-hidden',
      count: 2,
    });
    expectAccepted(transition);

    const snapshot = getSoloSnapshot(transition.session);
    expect(snapshot.humanHiddenChoice).toBe(2);
    expect(snapshot.choicesReceived).toEqual({ ai: true, human: true });
    expect(snapshot).not.toHaveProperty('aiHiddenChoice');
    expect(JSON.stringify(snapshot)).not.toContain('"player-two":2');
  });

  it('automatically plays the AI when it has the first prediction', () => {
    const session = startSoloGame({
      difficulty: 'normal',
      gameId: 'solo-ai-first',
      seed: 18,
      sequenceNumber: 2,
    });
    const transition = playHumanAction(session, {
      type: 'choose-hidden',
      count: 1,
    });
    expectAccepted(transition);

    const snapshot = getSoloSnapshot(transition.session);
    expect(snapshot.phase).toBe('second-prediction');
    expect(snapshot.predictions.ai).toEqual(expect.any(Number));
    expect(snapshot.predictions.human).toBeNull();
    expect(listHumanActions(transition.session)).not.toContainEqual({
      type: 'predict',
      value: snapshot.predictions.ai,
    });
  });

  it('rejects a command that is not one of the current human actions', () => {
    const session = startSoloGame({
      difficulty: 'easy',
      gameId: 'solo-invalid',
      seed: 2,
      sequenceNumber: 1,
    });

    expect(
      playHumanAction(session, {
        type: 'predict',
        value: 3,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'illegal-human-action' },
    });
  });

  it('can complete a seeded game without an illegal AI action', () => {
    let session = startSoloGame({
      difficulty: 'normal',
      gameId: 'solo-complete',
      seed: 982_451,
      sequenceNumber: 1,
    });
    let actions = 0;

    while (getSoloSnapshot(session).phase !== 'finished' && actions < 500) {
      const action = listHumanActions(session)[0];
      expect(action).toBeDefined();
      if (!action) {
        break;
      }
      const transition = playHumanAction(session, action);
      expectAccepted(transition);
      session = transition.session;
      actions += 1;
    }

    expect(getSoloSnapshot(session).phase).toBe('finished');
    expect(getSoloSnapshot(session).winner).toMatch(/^(human|ai)$/);
    expect(actions).toBeLessThan(500);
  });
});
