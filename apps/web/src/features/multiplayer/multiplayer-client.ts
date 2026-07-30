import { Client, type Room } from '@colyseus/sdk';
import type {
  CreateMultiplayerRoomResponse,
  JoinMultiplayerRoomResponse,
} from '@three-stone/api-contracts';
import {
  PROTOCOL_VERSION,
  commandAcceptedSchema,
  commandRejectedSchema,
  roomReactionSchema,
  roomResumeTokenSchema,
  roomSnapshotSchema,
  seatObservationSchema,
  type ClientCommand,
  type RoomSnapshot,
  type RoomReaction,
  type RoomResumeToken,
  type SeatObservation,
} from '@three-stone/protocol';

type Admission = CreateMultiplayerRoomResponse | JoinMultiplayerRoomResponse;
type CommandType = Extract<
  ClientCommand['type'],
  | 'match.abandon'
  | 'room.ready'
  | 'round.choose'
  | 'round.predict'
  | 'session.react'
  | 'session.rematch'
>;
type CommandPayload = Extract<ClientCommand, { type: CommandType }>['payload'];

export interface MultiplayerRoomConnection {
  leave(): Promise<unknown>;
  onLeave(callback: () => void): () => void;
  onMessage(type: string, callback: (payload: unknown) => void): () => void;
  send(type: string, payload: unknown): void;
}

export interface MultiplayerRoomConnector {
  connect(
    gameServerUrl: string,
    roomId: string,
    options: { readonly resumeToken: string } | { readonly ticket: string },
  ): Promise<MultiplayerRoomConnection>;
}

export interface MultiplayerReconnectRuntime {
  now(): number;
  schedule(delayMs: number, task: () => void): () => void;
}

export interface MultiplayerClientState {
  readonly connection: 'closed' | 'connected' | 'connecting' | 'disconnected';
  readonly error: string | null;
  readonly localPlayerId: Admission['playerId'];
  readonly observation: SeatObservation | null;
  readonly reaction: RoomReaction | null;
  readonly snapshot: RoomSnapshot | null;
}

interface PendingCommand {
  readonly commandId: string;
  readonly payload: CommandPayload;
  readonly type: CommandType;
}

export class MultiplayerClient {
  private readonly listeners = new Set<() => void>();
  private readonly pendingCommands = new Map<string, PendingCommand>();
  private readonly unsubscribers: (() => void)[] = [];
  private cancelReconnect: (() => void) | null = null;
  private cancelReaction: (() => void) | null = null;
  private closed = false;
  private reconnectAttempt = 0;
  private resumeToken: RoomResumeToken | null = null;
  private room: MultiplayerRoomConnection | null = null;
  private state: MultiplayerClientState;

  constructor(
    private readonly admission: Admission,
    private readonly connector: MultiplayerRoomConnector = new ColyseusRoomConnector(),
    private readonly createCommandId: () => string = () => crypto.randomUUID(),
    private readonly reconnectRuntime: MultiplayerReconnectRuntime = browserReconnectRuntime,
  ) {
    this.state = {
      connection: 'disconnected',
      error: null,
      localPlayerId: admission.playerId,
      observation: null,
      reaction: null,
      snapshot: null,
    };
  }

  getState = (): MultiplayerClientState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async connect(): Promise<void> {
    if (this.room !== null || this.state.connection === 'connecting') {
      return;
    }
    this.closed = false;
    this.update({ ...this.state, connection: 'connecting', error: null });
    try {
      const room = await this.connector.connect(
        this.admission.gameServerUrl,
        this.admission.roomId,
        { ticket: this.admission.ticket },
      );
      this.attach(room);
    } catch {
      this.update({ ...this.state, connection: 'disconnected', error: 'ROOM_UNAVAILABLE' });
      throw new Error('ROOM_UNAVAILABLE');
    }
  }

  send(type: CommandType, payload: CommandPayload): string {
    if (this.room === null || this.state.snapshot === null) {
      throw new Error('ROOM_NOT_READY');
    }
    const commandId = this.createCommandId();
    const pending = { commandId, payload, type };
    this.pendingCommands.set(commandId, pending);
    this.transmit(pending, this.state.snapshot.sequence);
    return commandId;
  }

  async close(): Promise<void> {
    this.closed = true;
    this.cancelReconnect?.();
    this.cancelReconnect = null;
    this.cancelReaction?.();
    this.cancelReaction = null;
    const room = this.room;
    this.room = null;
    for (const unsubscribe of this.unsubscribers.splice(0)) {
      unsubscribe();
    }
    this.pendingCommands.clear();
    this.resumeToken = null;
    if (room !== null) {
      await room.leave();
    }
    this.update({ ...this.state, connection: 'closed' });
  }

  private receiveReaction(payload: unknown): void {
    const parsed = roomReactionSchema.safeParse(payload);
    if (!parsed.success) {
      this.update({ ...this.state, error: 'MESSAGE_INVALID' });
      return;
    }
    this.cancelReaction?.();
    this.update({ ...this.state, error: null, reaction: parsed.data });
    this.cancelReaction = this.reconnectRuntime.schedule(
      Math.max(0, parsed.data.expiresAt - this.reconnectRuntime.now()),
      () => {
        this.cancelReaction = null;
        if (this.state.reaction?.sequence === parsed.data.sequence) {
          this.update({ ...this.state, reaction: null });
        }
      },
    );
  }

  private receiveSnapshot(payload: unknown): void {
    const parsed = roomSnapshotSchema.safeParse(payload);
    if (!parsed.success) {
      this.update({ ...this.state, error: 'MESSAGE_INVALID' });
      return;
    }
    if (this.state.snapshot !== null && parsed.data.sequence < this.state.snapshot.sequence) {
      return;
    }
    this.update({ ...this.state, error: null, snapshot: parsed.data });
    if (this.state.connection === 'connected') {
      for (const pending of this.pendingCommands.values()) {
        this.transmit(pending, parsed.data.sequence);
      }
    }
  }

  private receiveResumeToken(payload: unknown): void {
    const parsed = roomResumeTokenSchema.safeParse(payload);
    if (!parsed.success) {
      this.update({ ...this.state, error: 'MESSAGE_INVALID' });
      return;
    }
    this.resumeToken = parsed.data;
    this.reconnectAttempt = 0;
  }

  private receiveObservation(payload: unknown): void {
    const parsed = seatObservationSchema.safeParse(payload);
    if (!parsed.success || parsed.data.playerId !== this.state.localPlayerId) {
      this.update({ ...this.state, error: 'MESSAGE_INVALID' });
      return;
    }
    if (this.state.observation !== null && parsed.data.sequence < this.state.observation.sequence) {
      return;
    }
    this.update({ ...this.state, error: null, observation: parsed.data });
  }

  private receiveAccepted(payload: unknown): void {
    const parsed = commandAcceptedSchema.safeParse(payload);
    if (!parsed.success) {
      this.update({ ...this.state, error: 'MESSAGE_INVALID' });
      return;
    }
    this.pendingCommands.delete(parsed.data.commandId);
    this.update({ ...this.state, error: null });
  }

  private receiveRejected(payload: unknown): void {
    const parsed = commandRejectedSchema.safeParse(payload);
    if (!parsed.success) {
      this.update({ ...this.state, error: 'MESSAGE_INVALID' });
      return;
    }
    const pending = this.pendingCommands.get(parsed.data.commandId);
    if (
      pending !== undefined &&
      parsed.data.error.code === 'SEQUENCE_STALE' &&
      parsed.data.error.recoverable
    ) {
      this.transmit(pending, parsed.data.sequence);
      return;
    }
    this.pendingCommands.delete(parsed.data.commandId);
    this.update({ ...this.state, error: parsed.data.error.code });
  }

  private transmit(pending: PendingCommand, knownSequence: number): void {
    this.room?.send('command', {
      commandId: pending.commandId,
      knownSequence,
      payload: pending.payload,
      protocolVersion: PROTOCOL_VERSION,
      roomId: this.admission.roomId,
      type: pending.type,
    });
  }

  private attach(room: MultiplayerRoomConnection): void {
    for (const unsubscribe of this.unsubscribers.splice(0)) {
      unsubscribe();
    }
    this.room = room;
    this.unsubscribers.push(
      room.onMessage('room.resume-token', (payload) => this.receiveResumeToken(payload)),
      room.onMessage('room.snapshot', (payload) => this.receiveSnapshot(payload)),
      room.onMessage('session.reaction', (payload) => this.receiveReaction(payload)),
      room.onMessage('seat.observation', (payload) => this.receiveObservation(payload)),
      room.onMessage('command.accepted', (payload) => this.receiveAccepted(payload)),
      room.onMessage('command.rejected', (payload) => this.receiveRejected(payload)),
      room.onLeave(() => this.handleUnexpectedLeave(room)),
    );
    this.update({ ...this.state, connection: 'connected', error: null });
    room.send('sync', { protocolVersion: PROTOCOL_VERSION });
  }

  private handleUnexpectedLeave(room: MultiplayerRoomConnection): void {
    if (this.closed || this.room !== room) {
      return;
    }
    this.room = null;
    for (const unsubscribe of this.unsubscribers.splice(0)) {
      unsubscribe();
    }
    this.update({ ...this.state, connection: 'disconnected' });
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    const token = this.resumeToken;
    if (this.closed || token === null || token.expiresAt <= this.reconnectRuntime.now()) {
      return;
    }
    const delayMs = Math.min(4_000, 250 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.cancelReconnect?.();
    this.cancelReconnect = this.reconnectRuntime.schedule(delayMs, () => {
      this.cancelReconnect = null;
      void this.reconnect();
    });
  }

  private async reconnect(): Promise<void> {
    const token = this.resumeToken;
    if (
      this.closed ||
      this.room !== null ||
      token === null ||
      token.expiresAt <= this.reconnectRuntime.now()
    ) {
      return;
    }
    this.update({ ...this.state, connection: 'connecting', error: null });
    try {
      const room = await this.connector.connect(
        this.admission.gameServerUrl,
        this.admission.roomId,
        {
          resumeToken: token.token,
        },
      );
      if (this.closed) {
        await room.leave();
        return;
      }
      this.attach(room);
    } catch {
      this.update({ ...this.state, connection: 'disconnected', error: 'ROOM_UNAVAILABLE' });
      this.scheduleReconnect();
    }
  }

  private update(state: MultiplayerClientState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export function projectLocalSeats(state: MultiplayerClientState) {
  if (state.snapshot === null) {
    return null;
  }
  const right = state.localPlayerId;
  const left = right === 'player-one' ? 'player-two' : 'player-one';
  return {
    left: { playerId: left, ...state.snapshot.players[left] },
    right: { playerId: right, ...state.snapshot.players[right] },
  };
}

class ColyseusRoomConnector implements MultiplayerRoomConnector {
  async connect(
    gameServerUrl: string,
    roomId: string,
    options: { readonly resumeToken: string } | { readonly ticket: string },
  ): Promise<MultiplayerRoomConnection> {
    const room = await new Client(gameServerUrl).joinById(roomId, options);
    return colyseusConnection(room);
  }
}

const browserReconnectRuntime: MultiplayerReconnectRuntime = {
  now: Date.now,
  schedule(delayMs, task) {
    const timer = window.setTimeout(task, delayMs);
    return () => window.clearTimeout(timer);
  },
};

function colyseusConnection(room: Room): MultiplayerRoomConnection {
  return {
    leave: () => room.leave(),
    onLeave(callback) {
      const event = room.onLeave(callback);
      return () => event.remove(callback);
    },
    onMessage: (type, callback) => room.onMessage(type, callback),
    send: (type, payload) => room.send(type, payload),
  };
}
