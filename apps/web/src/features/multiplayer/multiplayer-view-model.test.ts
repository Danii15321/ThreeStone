import { describe, expect, it } from 'vitest';

import type { RoomSnapshot, SeatObservation } from '@three-stone/protocol';

import {
  deriveMultiplayerControls,
  mapRoundToLocalBoard,
  stoneReserveLabel,
} from './multiplayer-view-model.js';

const BASE_SNAPSHOT: RoomSnapshot = {
  actionDeadline: null,
  initiative: 'player-one',
  phase: 'hidden-choices',
  players: {
    'player-one': { avatarUrl: null, connected: true, username: 'Astrid' },
    'player-two': { avatarUrl: null, connected: true, username: 'Bjorn' },
  },
  predictions: {},
  protocolVersion: 2,
  ready: { 'player-one': true, 'player-two': true },
  rematch: {
    accepted: { 'player-one': false, 'player-two': false },
    deadline: null,
  },
  reserves: { 'player-one': 2, 'player-two': 3 },
  revealedRounds: [],
  roomId: '019b15db-9829-7b46-a6a5-6cfcb1ca84c5',
  roundNumber: 1,
  sequence: 4,
  serverNow: 1_775_000_000_000,
  sessionScore: { 'player-one': 0, 'player-two': 0 },
  terminalReason: null,
  type: 'room.snapshot',
  winner: null,
};

const OBSERVATION: SeatObservation = {
  playerId: 'player-two',
  protocolVersion: 2,
  sequence: 4,
  type: 'seat.observation',
};

describe('multiplayer view model', () => {
  it('offers zero through the local reserve without exposing opponent progress', () => {
    const controls = deriveMultiplayerControls(BASE_SNAPSHOT, OBSERVATION, 'player-two');

    expect(controls.hiddenChoices).toEqual([0, 1, 2, 3]);
    expect(controls).not.toHaveProperty('opponentSubmitted');
  });

  it('only lets the initiative predict first', () => {
    const firstPrediction: RoomSnapshot = {
      ...BASE_SNAPSHOT,
      phase: 'first-prediction',
    };

    expect(
      deriveMultiplayerControls(firstPrediction, OBSERVATION, 'player-one').predictions,
    ).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(
      deriveMultiplayerControls(firstPrediction, OBSERVATION, 'player-two').predictions,
    ).toEqual([]);
  });

  it('excludes the first prediction when the second player answers', () => {
    const secondPrediction: RoomSnapshot = {
      ...BASE_SNAPSHOT,
      phase: 'second-prediction',
      predictions: { 'player-one': 4 },
    };

    expect(
      deriveMultiplayerControls(secondPrediction, OBSERVATION, 'player-two').predictions,
    ).toEqual([0, 1, 2, 3, 5, 6]);
  });

  it('maps a revealed round relative to the local right-hand seat', () => {
    expect(
      mapRoundToLocalBoard(
        {
          choices: { 'player-one': 1, 'player-two': 2 },
          initiative: 'player-one',
          predictions: { 'player-one': 3, 'player-two': 4 },
          reservesAfter: { 'player-one': 1, 'player-two': 3 },
          roundNumber: 1,
          total: 3,
          winner: 'player-one',
        },
        'player-two',
      ),
    ).toEqual({
      choices: { human: 2, opponent: 1 },
      dropStone: 'opponent',
      total: 3,
    });
  });

  it.each([
    [0, '0 caillou restant'],
    [1, '1 caillou restant'],
    [2, '2 cailloux restants'],
  ])('formats the reserve label for %s stone(s)', (reserve, expected) => {
    expect(stoneReserveLabel(reserve)).toBe(expected);
  });
});
