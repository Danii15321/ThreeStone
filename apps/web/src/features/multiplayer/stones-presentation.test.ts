import { describe, expect, it } from 'vitest';

import type { RoomSnapshot } from '@three-stone/protocol';

import * as presentation from './multiplayer-presentation.js';

type StonesPresentation = {
  playerStoneClassLabel(stones: number, stoneClass: 'A' | 'B' | 'S'): string;
  stonesSettlementPresentation(snapshot: RoomSnapshot): readonly unknown[];
};

const stonesPresentation = presentation as unknown as StonesPresentation;

const terminalSnapshot = {
  actionDeadline: null,
  initiative: 'player-one',
  phase: 'finished',
  players: {
    'player-one': {
      avatarUrl: null,
      connected: true,
      stoneClass: 'S',
      stones: 519,
      username: 'Astrid',
    },
    'player-two': {
      avatarUrl: null,
      connected: true,
      stoneClass: 'B',
      stones: 74,
      username: 'Bjorn',
    },
  },
  predictions: { 'player-one': 2, 'player-two': 0 },
  protocolVersion: 2,
  ready: { 'player-one': true, 'player-two': true },
  rematch: {
    accepted: { 'player-one': false, 'player-two': false },
    deadline: null,
    declinedBy: null,
  },
  reserves: { 'player-one': 0, 'player-two': 1 },
  revealedRounds: [],
  roomId: 'room-stones-0001',
  roundNumber: 4,
  sequence: 22,
  serverNow: 1_775_000_000_000,
  sessionScore: { 'player-one': 1, 'player-two': 0 },
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
  type: 'room.snapshot',
  winner: 'player-one',
} as unknown as RoomSnapshot;

describe('Stones multiplayer presentation', () => {
  it.each([
    [-40, 'B', 'Classe B · -40 Stones'],
    [100, 'A', 'Classe A · 100 Stones'],
    [500, 'S', 'Classe S · 500 Stones'],
  ] as const)(
    'makes %i Stones in class %s explicit on the profile',
    (stones, stoneClass, label) => {
      expect(stonesPresentation.playerStoneClassLabel(stones, stoneClass)).toBe(label);
    },
  );

  it('presents the authoritative evolution and named rewards for both players', () => {
    expect(stonesPresentation.stonesSettlementPresentation(terminalSnapshot)).toEqual([
      {
        baseDelta: 12,
        classChanged: true,
        netDelta: 39,
        playerId: 'player-one',
        rewards: [
          {
            kind: 'stone-hand',
            label: 'Main de pierre',
            occurrences: 4,
            stones: 12,
          },
          {
            kind: 'stone-eye',
            label: 'Œil en pierre',
            occurrences: 1,
            stones: 9,
          },
          {
            kind: 'stone-heart',
            label: 'Cœur de pierre',
            occurrences: 1,
            stones: 6,
          },
        ],
        stoneClass: 'S',
        stonesAfter: 519,
        stonesBefore: 480,
        username: 'Astrid',
      },
      {
        baseDelta: -12,
        classChanged: false,
        netDelta: -6,
        playerId: 'player-two',
        rewards: [
          {
            kind: 'stone-heart',
            label: 'Cœur de pierre',
            occurrences: 1,
            stones: 6,
          },
        ],
        stoneClass: 'B',
        stonesAfter: 74,
        stonesBefore: 80,
        username: 'Bjorn',
      },
    ]);
  });
});
