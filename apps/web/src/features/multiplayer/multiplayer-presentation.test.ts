import { describe, expect, it } from 'vitest';

import type { RoomSnapshot } from '@three-stone/protocol';

import { statusMessage } from './multiplayer-presentation.js';

const snapshot: RoomSnapshot = {
  actionDeadline: 1_775_000_020_000,
  initiative: 'player-one',
  phase: 'first-prediction',
  players: {
    'player-one': { avatarUrl: null, connected: true, username: 'Astrid' },
    'player-two': { avatarUrl: null, connected: false, username: 'Bjorn' },
  },
  predictions: {},
  protocolVersion: 2,
  ready: { 'player-one': true, 'player-two': true },
  reserves: { 'player-one': 3, 'player-two': 3 },
  revealedRounds: [],
  roomId: '019b15db-9829-7b46-a6a5-6cfcb1ca84c5',
  roundNumber: 1,
  sequence: 8,
  serverNow: 1_775_000_000_000,
  sessionScore: { 'player-one': 0, 'player-two': 0 },
  terminalReason: null,
  type: 'room.snapshot',
  winner: null,
};

describe('multiplayer presentation', () => {
  it('announces an opponent reconnection without hiding the running phase deadline', () => {
    expect(statusMessage(snapshot, undefined, 'player-one')).toBe('Bjorn se reconnecte…');
    expect(snapshot.actionDeadline).toBe(1_775_000_020_000);
  });
});
