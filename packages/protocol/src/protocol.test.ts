import { describe, expect, it } from 'vitest';

import { applyGameAction, createGame, type GameState } from '@three-stone/game-core';

import {
  MAX_CLIENT_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  clientCommandSchema,
  createCommandAccepted,
  createPublicSnapshot,
  createSeatObservation,
  parseClientCommand,
  roomReactionSchema,
  roomResumeTokenSchema,
  roomSnapshotSchema,
  seatObservationSchema,
  type SnapshotContext,
} from './index.js';

const context: SnapshotContext = {
  roomId: 'room-0001',
  sequence: 4,
  serverNow: 1_000,
  actionDeadline: 31_000,
  rematch: {
    accepted: { 'player-one': false, 'player-two': false },
    deadline: null,
    declinedBy: null,
  },
  sessionScore: { 'player-one': 0, 'player-two': 0 },
  players: {
    'player-one': {
      avatarUrl: '/api/profile/avatar/player-one',
      connected: true,
      username: 'Astrid',
    },
    'player-two': {
      avatarUrl: null,
      connected: true,
      username: 'Bjorn',
    },
  },
  ready: { 'player-one': true, 'player-two': false },
};

function choose(state: GameState, playerId: 'player-one' | 'player-two', count: number): GameState {
  const result = applyGameAction(state, { type: 'choose-hidden', playerId, count });
  if (!result.ok) {
    throw new Error(result.error.code);
  }
  return result.state;
}

describe('client commands', () => {
  it('validates the versioned command union and strips no unknown fields', () => {
    const valid = {
      protocolVersion: PROTOCOL_VERSION,
      type: 'round.choose',
      commandId: '018f47f2-8ee2-7e00-8000-000000000001',
      roomId: 'room-0001',
      knownSequence: 3,
      payload: { count: 2 },
    };

    expect(clientCommandSchema.safeParse(valid).success).toBe(true);
    expect(
      clientCommandSchema.safeParse({
        ...valid,
        payload: { count: 2, leaked: true },
      }).success,
    ).toBe(false);
    expect(clientCommandSchema.safeParse({ ...valid, protocolVersion: 1 }).success).toBe(false);
    expect(clientCommandSchema.safeParse({ ...valid, payload: { count: 4 } }).success).toBe(false);
  });

  it('publishes a strict client message size budget', () => {
    expect(MAX_CLIENT_MESSAGE_BYTES).toBe(1_024);
    expect(() =>
      parseClientCommand({
        protocolVersion: PROTOCOL_VERSION,
        type: 'round.choose',
        commandId: 'oversized-command',
        roomId: 'room-0001',
        knownSequence: 3,
        payload: { count: 2, padding: 'x'.repeat(MAX_CLIENT_MESSAGE_BYTES) },
      }),
    ).toThrow(RangeError);
  });

  it('rejects a deterministic corpus of malformed and reordered commands', () => {
    const malformed: unknown[] = [
      null,
      [],
      '',
      '{',
      { protocolVersion: 2 },
      {
        protocolVersion: 2,
        type: 'round.choose',
        commandId: 'short',
        roomId: 'room-0001',
        knownSequence: -1,
        payload: { count: 1 },
      },
      {
        protocolVersion: 2,
        type: 'round.predict',
        commandId: 'malformed-command',
        roomId: 'room-0001',
        knownSequence: Number.MAX_SAFE_INTEGER + 1,
        payload: { value: 7 },
      },
    ];

    for (const input of malformed) {
      expect(() => parseClientCommand(input)).toThrow();
    }
  });

  it('validates a private one-use resume token message without accepting extra fields', () => {
    const message = {
      connectionGeneration: 2,
      expiresAt: 1_775_000_060_000,
      protocolVersion: 2,
      token: 'opaque-resume-token'.padEnd(43, '0'),
      type: 'room.resume-token',
    };

    expect(roomResumeTokenSchema.parse(message)).toEqual(message);
    expect(() => roomResumeTokenSchema.parse({ ...message, playerId: 'player-one' })).toThrow();
  });

  it('accepts only one of the four ephemeral server reactions', () => {
    const reaction = {
      expiresAt: 4_000,
      playerId: 'player-one',
      protocolVersion: 2,
      reaction: 'nice-bluff',
      sequence: 8,
      type: 'session.reaction',
    };

    expect(roomReactionSchema.parse(reaction)).toEqual(reaction);
    expect(() => roomReactionSchema.parse({ ...reaction, reaction: 'free text' })).toThrow();
    expect(() => roomReactionSchema.parse({ ...reaction, sound: true })).toThrow();
  });
});

describe('public and private projections', () => {
  it('omits every hidden choice and submission tell from the public snapshot', () => {
    const state = choose(
      createGame({ gameId: 'game-001', seed: 2, sequenceNumber: 1 }).state,
      'player-one',
      3,
    );
    const snapshot = createPublicSnapshot(state, context);
    const serialized = JSON.stringify(snapshot);

    expect(roomSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(Object.hasOwn(snapshot, 'choicesReceived')).toBe(false);
    expect(serialized).not.toContain('hiddenChoice');
    expect(serialized).not.toContain('choicesReceived');
    expect(serialized).not.toContain('"count":3');
  });

  it('publishes the session score and explicit rematch agreement without hidden data', () => {
    const state = createGame({ gameId: 'game-001', seed: 2, sequenceNumber: 1 }).state;
    const snapshot = createPublicSnapshot(state, {
      ...context,
      rematch: {
        accepted: { 'player-one': true, 'player-two': false },
        deadline: 61_000,
        declinedBy: null,
      },
      sessionScore: { 'player-one': 2, 'player-two': 1 },
    });

    expect(snapshot.sessionScore).toEqual({ 'player-one': 2, 'player-two': 1 });
    expect(snapshot.rematch).toEqual({
      accepted: { 'player-one': true, 'player-two': false },
      deadline: 61_000,
      declinedBy: null,
    });
  });

  it('gives only the receiving seat its own accepted choice', () => {
    const state = choose(
      createGame({ gameId: 'game-001', seed: 2, sequenceNumber: 1 }).state,
      'player-one',
      3,
    );
    const owner = createSeatObservation(state, 'player-one', context.sequence);
    const opponent = createSeatObservation(state, 'player-two', context.sequence);

    expect(seatObservationSchema.safeParse(owner).success).toBe(true);
    expect(owner).toHaveProperty('ownHiddenChoice', 3);
    expect(Object.hasOwn(opponent, 'ownHiddenChoice')).toBe(false);
    expect(JSON.stringify(opponent)).not.toContain('3');
  });

  it('keeps the accepted acknowledgement independent from the chosen value', () => {
    const zero = JSON.stringify(createCommandAccepted('cmd-00001', 5));
    const three = JSON.stringify(createCommandAccepted('cmd-00002', 5));

    expect(zero.length).toBe(three.length);
    expect(zero).not.toContain('choice');
    expect(three).not.toContain('choice');
  });
});
