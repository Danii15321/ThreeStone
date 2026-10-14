import { describe, expect, it } from 'vitest';

import { createGame } from '@three-stone/game-core';

import { createPublicSnapshot, roomSnapshotSchema, type SnapshotContext } from './index.js';

const context = {
  actionDeadline: 31_000,
  players: {
    'player-one': {
      avatarUrl: null,
      connected: true,
      stoneClass: 'A',
      stones: 480,
      username: 'Astrid',
    },
    'player-two': {
      avatarUrl: null,
      connected: true,
      stoneClass: 'B',
      stones: 80,
      username: 'Bjorn',
    },
  },
  ready: { 'player-one': true, 'player-two': true },
  rematch: {
    accepted: { 'player-one': false, 'player-two': false },
    deadline: null,
    declinedBy: null,
  },
  roomId: 'room-stones-0001',
  sequence: 4,
  serverNow: 1_000,
  sessionScore: { 'player-one': 0, 'player-two': 0 },
  stonesSettlement: null,
} as unknown as SnapshotContext;

describe('public Stones contract', () => {
  it('publishes each player Stones total and class from the first public snapshot', () => {
    const snapshot = createPublicSnapshot(
      createGame({ gameId: 'game-stones-001', seed: 2, sequenceNumber: 1 }).state,
      context,
    );

    expect(roomSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot.players).toMatchObject({
      'player-one': { stoneClass: 'A', stones: 480 },
      'player-two': { stoneClass: 'B', stones: 80 },
    });
    expect(snapshot).toHaveProperty('stonesSettlement', null);
  });

  it('accepts a terminal settlement detailed for both players', () => {
    const activeSnapshot = createPublicSnapshot(
      createGame({ gameId: 'game-stones-002', seed: 2, sequenceNumber: 1 }).state,
      context,
    );
    const terminalSnapshot = {
      ...activeSnapshot,
      actionDeadline: null,
      phase: 'finished',
      players: {
        'player-one': { ...activeSnapshot.players['player-one'], stoneClass: 'S', stones: 519 },
        'player-two': { ...activeSnapshot.players['player-two'], stoneClass: 'B', stones: 74 },
      },
      stonesSettlement: {
        players: {
          'player-one': {
            baseDelta: 12,
            classAfter: 'S',
            classBefore: 'A',
            netDelta: 39,
            rewards: [
              { kind: 'stone-hand', occurrences: 4, stones: 12 },
              { kind: 'stone-eye', occurrences: 1, stones: 9 },
              { kind: 'stone-heart', occurrences: 1, stones: 6 },
            ],
            stonesAfter: 519,
            stonesBefore: 480,
          },
          'player-two': {
            baseDelta: -12,
            classAfter: 'B',
            classBefore: 'B',
            netDelta: -6,
            rewards: [{ kind: 'stone-heart', occurrences: 1, stones: 6 }],
            stonesAfter: 74,
            stonesBefore: 80,
          },
        },
        rated: true,
      },
      terminalReason: 'reserve-empty',
      winner: 'player-one',
    };

    const result = roomSnapshotSchema.safeParse(terminalSnapshot);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({
        stonesSettlement: {
          players: {
            'player-one': {
              baseDelta: 12,
              classAfter: 'S',
              netDelta: 39,
              stonesAfter: 519,
              stonesBefore: 480,
            },
            'player-two': {
              baseDelta: -12,
              classAfter: 'B',
              netDelta: -6,
              stonesAfter: 74,
              stonesBefore: 80,
            },
          },
        },
      });
    }
  });

  it.each([
    [-250, 'B'],
    [99, 'B'],
    [100, 'A'],
    [499, 'A'],
    [500, 'S'],
    [12_000, 'S'],
  ] as const)('accepts %i Stones in class %s', (stones, stoneClass) => {
    const snapshot = createPublicSnapshot(
      createGame({ gameId: `game-class-${stones}`, seed: 2, sequenceNumber: 1 }).state,
      {
        ...context,
        players: {
          ...context.players,
          'player-one': { ...context.players['player-one'], stoneClass, stones },
        },
      } as unknown as SnapshotContext,
    );

    expect(snapshot.players['player-one']).toMatchObject({ stoneClass, stones });
    expect(roomSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });
});
