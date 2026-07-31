import { describe, expect, it, vi } from 'vitest';

import type { CreateMultiplayerRoomResponse } from '@three-stone/api-contracts';

import {
  MultiplayerClient,
  projectBoardSeats,
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

const PLAYER_ONE_ADMISSION: CreateMultiplayerRoomResponse = {
  ...ADMISSION,
  playerId: 'player-one',
};

class FakeRoom implements MultiplayerRoomConnection {
  readonly handlers = new Map<string, (payload: unknown) => void>();
  readonly leaveHandlers = new Set<() => void>();
  readonly sent: { readonly type: string; readonly payload: unknown }[] = [];
  readonly leave = vi.fn(async () => undefined);

  onLeave(callback: () => void): () => void {
    this.leaveHandlers.add(callback);
    return () => this.leaveHandlers.delete(callback);
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

  disconnect(): void {
    for (const handler of this.leaveHandlers) {
      handler();
    }
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
    rematch: {
      accepted: { 'player-one': false, 'player-two': false },
      deadline: null,
      declinedBy: null,
    },
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

function setup(admission = ADMISSION) {
  const room = new FakeRoom();
  const connector: MultiplayerRoomConnector = {
    connect: vi.fn(async () => room),
  };
  const client = new MultiplayerClient(admission, connector, () => 'command-id-0001');
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

  it('keeps canonical board seats from both players viewpoints', async () => {
    for (const admission of [PLAYER_ONE_ADMISSION, ADMISSION]) {
      const { client, room } = setup(admission);
      await client.connect();

      room.emit('room.snapshot', snapshot(4));
      room.emit('room.snapshot', snapshot(3));

      expect(client.getState().snapshot?.sequence).toBe(4);
      expect(projectBoardSeats(client.getState())).toMatchObject({
        left: { playerId: 'player-one', username: 'Astrid' },
        right: { playerId: 'player-two', username: 'Bjorn' },
      });
    }
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

    const commands = room.sent.filter((message) => message.type === 'command');
    expect(commands).toHaveLength(2);
    expect(commands[0]?.payload).toMatchObject({
      commandId: 'command-id-0001',
      knownSequence: 5,
    });
    expect(commands[1]?.payload).toMatchObject({
      commandId: 'command-id-0001',
      knownSequence: 6,
    });
  });

  it('resumes directly with the in-memory token and keeps the latest snapshot', async () => {
    const initialRoom = new FakeRoom();
    const resumedRoom = new FakeRoom();
    const scheduled: (() => void)[] = [];
    const connector: MultiplayerRoomConnector = {
      connect: vi.fn().mockResolvedValueOnce(initialRoom).mockResolvedValueOnce(resumedRoom),
    };
    const client = new MultiplayerClient(ADMISSION, connector, () => 'command-id-0001', {
      now: () => 1_775_000_000_000,
      schedule(_delayMs, task) {
        scheduled.push(task);
        return () => undefined;
      },
    });
    await client.connect();
    initialRoom.emit('room.snapshot', snapshot(7));
    initialRoom.emit('room.resume-token', {
      connectionGeneration: 1,
      expiresAt: 1_775_000_060_000,
      protocolVersion: 2,
      token: 'resume-token'.padEnd(43, '0'),
      type: 'room.resume-token',
    });

    initialRoom.disconnect();
    expect(client.getState().connection).toBe('disconnected');
    await scheduled.shift()?.();

    expect(connector.connect).toHaveBeenLastCalledWith(ADMISSION.gameServerUrl, ADMISSION.roomId, {
      resumeToken: 'resume-token'.padEnd(43, '0'),
    });
    expect(client.getState()).toMatchObject({
      connection: 'connected',
      snapshot: { sequence: 7 },
    });
    expect(client.getState()).not.toHaveProperty('resumeToken');
    expect(resumedRoom.sent).toContainEqual({
      type: 'sync',
      payload: { protocolVersion: 2 },
    });
  });

  it('requests a fresh admission ticket when the initial socket cannot stay connected', async () => {
    const recoveredRoom = new FakeRoom();
    const scheduled: (() => void)[] = [];
    const refreshedAdmission = {
      ...ADMISSION,
      ticket: 'fresh-admission-ticket-that-is-long-enough-for-the-contract',
    };
    const connector: MultiplayerRoomConnector = {
      connect: vi
        .fn()
        .mockRejectedValueOnce(new Error('socket interrupted'))
        .mockResolvedValueOnce(recoveredRoom),
    };
    const refreshAdmission = vi.fn(async () => refreshedAdmission);
    const client = new MultiplayerClient(
      ADMISSION,
      connector,
      () => 'command-id-0001',
      {
        now: () => 1_775_000_000_000,
        schedule(_delayMs, task) {
          scheduled.push(task);
          return () => undefined;
        },
      },
      refreshAdmission,
    );

    await expect(client.connect()).rejects.toThrow('ROOM_UNAVAILABLE');
    expect(client.getState().connection).toBe('disconnected');
    scheduled.shift()?.();

    await vi.waitFor(() => expect(client.getState().connection).toBe('connected'));
    expect(refreshAdmission).toHaveBeenCalledOnce();
    expect(connector.connect).toHaveBeenLastCalledWith(
      refreshedAdmission.gameServerUrl,
      refreshedAdmission.roomId,
      { ticket: refreshedAdmission.ticket },
    );
  });

  it('exposes a validated reaction for three seconds without playing audio', async () => {
    const room = new FakeRoom();
    const scheduled: (() => void)[] = [];
    const client = new MultiplayerClient(
      ADMISSION,
      { connect: vi.fn(async () => room) },
      () => 'command-id-0001',
      {
        now: () => 1_775_000_000_000,
        schedule(_delayMs, task) {
          scheduled.push(task);
          return () => undefined;
        },
      },
    );
    await client.connect();
    room.emit('room.snapshot', snapshot(8));
    room.emit('session.reaction', {
      expiresAt: 1_775_000_003_000,
      playerId: 'player-one',
      protocolVersion: 2,
      reaction: 'well-played',
      sequence: 8,
      type: 'session.reaction',
    });

    expect(client.getState().reaction).toMatchObject({
      playerId: 'player-one',
      reaction: 'well-played',
    });
    expect(client.getState()).not.toHaveProperty('audio');

    scheduled.shift()?.();
    expect(client.getState().reaction).toBeNull();
  });
});
