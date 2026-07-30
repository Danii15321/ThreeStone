import { Client, type Room } from '@colyseus/sdk';
import type {
  CreateMultiplayerRoomResponse,
  JoinMultiplayerRoomResponse,
} from '@three-stone/api-contracts';
import {
  PROTOCOL_VERSION,
  commandAcceptedSchema,
  commandRejectedSchema,
  roomSnapshotSchema,
  seatObservationSchema,
  type ClientCommand,
  type RoomSnapshot,
  type SeatObservation,
} from '@three-stone/protocol';

type Admission = CreateMultiplayerRoomResponse | JoinMultiplayerRoomResponse;
type CommandType = Extract<
  ClientCommand['type'],
  'match.abandon' | 'room.ready' | 'round.choose' | 'round.predict'
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
    options: { readonly ticket: string },
  ): Promise<MultiplayerRoomConnection>;
}

export interface MultiplayerClientState {
  readonly connection: 'closed' | 'connected' | 'connecting' | 'disconnected';
  readonly error: string | null;
  readonly localPlayerId: Admission['playerId'];
  readonly observation: SeatObservation | null;
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
  private room: MultiplayerRoomConnection | null = null;
  private state: MultiplayerClientState;

  constructor(
    private readonly admission: Admission,
    private readonly connector: MultiplayerRoomConnector = new ColyseusRoomConnector(),
    private readonly createCommandId: () => string = () => crypto.randomUUID(),
  ) {
    this.state = {
      connection: 'disconnected',
      error: null,
      localPlayerId: admission.playerId,
      observation: null,
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
    this.update({ ...this.state, connection: 'connecting', error: null });
    try {
      const room = await this.connector.connect(
        this.admission.gameServerUrl,
        this.admission.roomId,
        { ticket: this.admission.ticket },
      );
      this.room = room;
      this.unsubscribers.push(
        room.onMessage('room.snapshot', (payload) => this.receiveSnapshot(payload)),
        room.onMessage('seat.observation', (payload) => this.receiveObservation(payload)),
        room.onMessage('command.accepted', (payload) => this.receiveAccepted(payload)),
        room.onMessage('command.rejected', (payload) => this.receiveRejected(payload)),
        room.onLeave(() => {
          this.room = null;
          this.update({ ...this.state, connection: 'disconnected' });
        }),
      );
      this.update({ ...this.state, connection: 'connected' });
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
    const room = this.room;
    this.room = null;
    for (const unsubscribe of this.unsubscribers.splice(0)) {
      unsubscribe();
    }
    this.pendingCommands.clear();
    if (room !== null) {
      await room.leave();
    }
    this.update({ ...this.state, connection: 'closed' });
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
    options: { readonly ticket: string },
  ): Promise<MultiplayerRoomConnection> {
    const room = await new Client(gameServerUrl).joinById(roomId, options);
    return colyseusConnection(room);
  }
}

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
