import { describe, expect, it, vi } from 'vitest';

import type { CreateMultiplayerRoomResponse } from '@three-stone/api-contracts';

import {
  MultiplayerClient,
  projectLocalSeats,
  type MultiplayerRoomConnection,
  type MultiplayerRoomConnector,
} from './multiplayer-client.js';

const ADMISSION: CreateMultiplayerRoomResponse = {
  gameServerUrl: 'ws://127.0.0.1:2567',
  inviteCode: 'ABCD23',
  playerId: 'player-two',
  roomId: '019b15db-9829-7b46-a6a5-6cfcb1ca84c5',
  ticket: 'signed-admission-ticket-that-is-long-enough-for-the-contract',
  ticketExpiresAt: '2026-07-30T18:00:45.000Z',
};

class FakeRoom implements MultiplayerRoomConnection {
  readonly handlers = new Map<string, (payload: unknown) => void>();
  readonly sent: { readonly type: string; readonly payload: unknown }[] = [];
  readonly leave = vi.fn(async () => undefined);

  onLeave(): () => void {
    return () => undefined;
  }

  onMessage(type: string, callback: (payload: unknown) => void): () => void {
    this.handlers.set(type, callback);
    return () => this.handlers.delete(type);
  }

  send(type: string, payload: unknown): void {
    this.sent.push({ payload, type });
  }

  emit(type: string, payload: unknown): void {
    this.handlers.get(type)?.(payload);
  }
}

function snapshot(sequence: number) {
  return {
    actionDeadline: null,
    initiative: 'player-one',
    phase: 'hidden-choices',
    players: {
      'player-one': {
        avatarUrl: null,
        connected: true,
        username: 'Astrid',
      },
      'player-two': {
        avatarUrl: '/api/profile/avatar?v=1',
        connected: true,
        username: 'Bjorn',
      },
    },
    predictions: {},
    protocolVersion: 2,
    ready: { 'player-one': true, 'player-two': true },
    reserves: { 'player-one': 3, 'player-two': 3 },
    revealedRounds: [],
    roomId: ADMISSION.roomId,
    roundNumber: 1,
    sequence,
    serverNow: 1_775_000_000_000,
    sessionScore: { 'player-one': 0, 'player-two': 0 },
    terminalReason: null,
    type: 'room.snapshot',
    winner: null,
  };
}

function setup() {
  const room = new FakeRoom();
  const connector: MultiplayerRoomConnector = {
    connect: vi.fn(async () => room),
  };
  const client = new MultiplayerClient(ADMISSION, connector, () => 'command-id-0001');
  return { client, connector, room };
}

describe('MultiplayerClient', () => {
  it('sends the short-lived ticket only in WebSocket join options', async () => {
    const { client, connector } = setup();

    await client.connect();

    expect(connector.connect).toHaveBeenCalledWith(ADMISSION.gameServerUrl, ADMISSION.roomId, {
      ticket: ADMISSION.ticket,
    });
    expect(client.getState()).not.toHaveProperty('ticket');
  });

  it('keeps the newest snapshot and always projects the local player on the right', async () => {
    const { client, room } = setup();
    await client.connect();

    room.emit('room.snapshot', snapshot(4));
    room.emit('room.snapshot', snapshot(3));

    expect(client.getState().snapshot?.sequence).toBe(4);
    expect(projectLocalSeats(client.getState())).toMatchObject({
      left: { playerId: 'player-one', username: 'Astrid' },
      right: { playerId: 'player-two', username: 'Bjorn' },
    });
  });

  it('stores only the local hidden choice and rejects extra private fields', async () => {
    const { client, room } = setup();
    await client.connect();
    room.emit('room.snapshot', snapshot(2));

    room.emit('seat.observation', {
      ownHiddenChoice: 2,
      playerId: 'player-two',
      protocolVersion: 2,
      sequence: 2,
      type: 'seat.observation',
    });
    expect(client.getState().observation?.ownHiddenChoice).toBe(2);

    room.emit('seat.observation', {
      opponentHiddenChoice: 1,
      ownHiddenChoice: 2,
      playerId: 'player-two',
      protocolVersion: 2,
      sequence: 2,
      type: 'seat.observation',
    });
    expect(client.getState().error).toBe('MESSAGE_INVALID');
    expect(client.getState()).not.toHaveProperty('opponentHiddenChoice');
  });

  it('retries a stale command with the same commandId and the server sequence', async () => {
    const { client, room } = setup();
    await client.connect();
    room.emit('room.snapshot', snapshot(5));

    client.send('room.ready', { ready: true });
    room.emit('command.rejected', {
      commandId: 'command-id-0001',
      error: { code: 'SEQUENCE_STALE', recoverable: true },
      protocolVersion: 2,
      sequence: 6,
      type: 'command.rejected',
    });

    expect(room.sent).toHaveLength(2);
    expect(room.sent[0]?.payload).toMatchObject({
      commandId: 'command-id-0001',
      knownSequence: 5,
    });
    expect(room.sent[1]?.payload).toMatchObject({
      commandId: 'command-id-0001',
      knownSequence: 6,
    });
  });
});
