import { describe, expect, it } from 'vitest';

import type { RoomSnapshot } from '@three-stone/protocol';

import {
  pregameWaitingMessage,
  reactionLabel,
  rematchPresentation,
  remainingSeconds,
  statusMessage,
  waitingConnectionMessage,
} from './multiplayer-presentation.js';

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
  rematch: {
    accepted: { 'player-one': false, 'player-two': false },
    deadline: null,
    declinedBy: null,
  },
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

  it('does not present a disconnected creator as normally waiting', () => {
    expect(waitingConnectionMessage('connected')).toBe(
      'Salon connecté. En attente de l’adversaire.',
    );
    expect(waitingConnectionMessage('disconnected')).toBe(
      'Connexion interrompue. Tentative de reconnexion…',
    );
  });

  it('keeps both players in the salon while the creator reconnects', () => {
    const waitingForCreator: RoomSnapshot = {
      ...snapshot,
      players: {
        'player-one': { ...snapshot.players['player-one'], connected: false },
        'player-two': { ...snapshot.players['player-two'], connected: true },
      },
      ready: { 'player-one': false, 'player-two': true },
    };
    expect(pregameWaitingMessage(waitingForCreator, 'player-two')).toBe(
      'Astrid se reconnecte… Le duel commencera à son retour.',
    );
    expect(
      pregameWaitingMessage(
        {
          ...waitingForCreator,
          players: {
            ...waitingForCreator.players,
            'player-one': { ...waitingForCreator.players['player-one'], connected: true },
          },
        },
        'player-two',
      ),
    ).toBe('Les deux joueurs prennent place autour de la table…');
  });

  it('gives every controlled reaction a French text equivalent', () => {
    expect((['well-played', 'nice-bluff', 'oops', 'rematch'] as const).map(reactionLabel)).toEqual([
      'Bien joué !',
      'Joli bluff !',
      'Oups !',
      'Revanche ?',
    ]);
  });

  it('rounds a server deadline up without displaying a negative countdown', () => {
    expect(remainingSeconds(20_001, 10_000)).toBe(11);
    expect(remainingSeconds(9_999, 10_000)).toBe(0);
    expect(remainingSeconds(null, 10_000)).toBeNull();
  });

  it('makes an incoming replay request explicit for the second player', () => {
    expect(
      rematchPresentation(
        {
          ...snapshot,
          phase: 'finished',
          rematch: {
            accepted: { 'player-one': true, 'player-two': false },
            deadline: snapshot.serverNow + 60_000,
            declinedBy: null,
          },
        },
        'player-two',
      ),
    ).toEqual({
      kind: 'incoming',
      requesterName: 'Astrid',
    });
  });
});
