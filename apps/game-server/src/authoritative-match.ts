import { createHash } from 'node:crypto';

import {
  RULES_VERSION,
  abandonGame,
  applyGameAction,
  buildGameTranscript,
  cancelGame,
  createGame,
  type GameState,
  type PlayerId,
} from '@three-stone/game-core';
import {
  PROTOCOL_VERSION,
  createCommandAccepted,
  createCommandRejected,
  createPublicSnapshot,
  createSeatObservation,
  parseClientCommand,
  type ClientCommand,
  type CommandAccepted,
  type CommandErrorCode,
  type CommandRejected,
  type PublicPlayer,
} from '@three-stone/protocol';

export interface MatchClock {
  now(): number;
}

export interface AdmissionIdentity {
  readonly avatarUrl: string | null;
  readonly connectionGeneration: number;
  readonly playerId: PlayerId;
  readonly roomId: string;
  readonly userId: string;
  readonly username: string;
}

export interface MatchConnection {
  readonly connectionId: string;
  send(type: string, payload: unknown): void;
}

interface TerminalResultRepository {
  save(
    input: {
      readonly completedAt: Date;
      readonly gameId: string;
      readonly initialInitiative: PlayerId;
      readonly participants: readonly [
        {
          readonly finalReserve: number;
          readonly outcome: 'win' | 'loss';
          readonly seat: PlayerId;
          readonly userId: string;
        },
        {
          readonly finalReserve: number;
          readonly outcome: 'win' | 'loss';
          readonly seat: PlayerId;
          readonly userId: string;
        },
      ];
      readonly protocolVersion: number;
      readonly rounds: readonly {
        readonly choices: Readonly<Record<PlayerId, number>>;
        readonly initiative: PlayerId;
        readonly predictions: Readonly<Record<PlayerId, number>>;
        readonly reservesAfter: Readonly<Record<PlayerId, number>>;
        readonly roundNumber: number;
        readonly total: number;
        readonly winner: PlayerId | null;
      }[];
      readonly rulesVersion: string;
      readonly seed: number;
      readonly terminalReason:
        'reserve-empty' | 'hidden-choice-timeout' | 'prediction-timeout' | 'abandon' | 'disconnect';
      readonly winner: PlayerId;
    },
    recordedAt: Date,
  ): Promise<{ readonly kind: 'contradiction' } | { readonly kind: 'created' | 'existing' }>;
}

export interface MatchDependencies {
  readonly clock: MatchClock;
  readonly resultRepository: TerminalResultRepository;
  readonly verifyAdmissionTicket: (
    ticket: string,
    expectedRoomId: string,
  ) => Promise<AdmissionIdentity | null>;
}

export interface MatchOptions {
  readonly gameId: string;
  readonly roomId: string;
  readonly seed: number;
}

export type MatchJoinResult =
  | { readonly ok: true; readonly identity: AdmissionIdentity }
  | { readonly ok: false; readonly code: 'ROOM_UNAVAILABLE' };

interface ConnectedSeat {
  readonly connection: MatchConnection;
  readonly identity: AdmissionIdentity;
}

interface ProcessedCommand {
  readonly fingerprint: string;
  readonly response: CommandAccepted;
}

export class AuthoritativeMatch {
  private currentState: GameState;
  private currentSequence = 0;
  private readonly seats = new Map<PlayerId, ConnectedSeat>();
  private readonly connectionSeats = new Map<string, PlayerId>();
  private readonly ready = new Map<PlayerId, boolean>();
  private readonly processed = new Map<string, Map<string, ProcessedCommand>>();
  private terminalPersistence: Promise<void> | null = null;

  constructor(
    private readonly options: MatchOptions,
    private readonly dependencies: MatchDependencies,
  ) {
    this.currentState = createGame({
      gameId: options.gameId,
      seed: options.seed,
      sequenceNumber: 1,
    }).state;
  }

  get sequence(): number {
    return this.currentSequence;
  }

  get state(): GameState {
    return this.currentState;
  }

  async join(connection: MatchConnection, ticket: string): Promise<MatchJoinResult> {
    const identity = await this.dependencies.verifyAdmissionTicket(ticket, this.options.roomId);
    if (identity === null || identity.roomId !== this.options.roomId) {
      return { ok: false, code: 'ROOM_UNAVAILABLE' };
    }
    return this.joinIdentity(connection, identity);
  }

  joinIdentity(connection: MatchConnection, identity: AdmissionIdentity): MatchJoinResult {
    if (!this.canAdmit(identity)) {
      return { ok: false, code: 'ROOM_UNAVAILABLE' };
    }
    const occupied = this.seats.get(identity.playerId);
    if (occupied !== undefined) {
      this.connectionSeats.delete(occupied.connection.connectionId);
    }
    this.seats.set(identity.playerId, { connection, identity });
    this.connectionSeats.set(connection.connectionId, identity.playerId);
    this.ready.set(identity.playerId, this.ready.get(identity.playerId) ?? false);
    this.currentSequence += 1;
    this.broadcastState();
    return { ok: true, identity };
  }

  canAdmit(identity: AdmissionIdentity): boolean {
    if (identity.roomId !== this.options.roomId) {
      return false;
    }
    const occupied = this.seats.get(identity.playerId);
    return (
      occupied === undefined ||
      (occupied.identity.userId === identity.userId &&
        occupied.identity.connectionGeneration < identity.connectionGeneration)
    );
  }

  leave(connectionId: string): void {
    const playerId = this.connectionSeats.get(connectionId);
    if (playerId === undefined) {
      return;
    }
    const current = this.seats.get(playerId);
    if (current?.connection.connectionId !== connectionId) {
      return;
    }
    this.connectionSeats.delete(connectionId);
    this.seats.delete(playerId);
    this.currentSequence += 1;
    this.broadcastState();
  }

  async receive(
    connectionId: string,
    rawCommand: unknown,
  ): Promise<CommandAccepted | CommandRejected> {
    const playerId = this.connectionSeats.get(connectionId);
    const commandId = commandIdFrom(rawCommand);
    if (playerId === undefined) {
      return this.sendRejection(undefined, commandId, 'ROOM_UNAVAILABLE', false);
    }
    const seat = this.seats.get(playerId);
    if (seat === undefined || seat.connection.connectionId !== connectionId) {
      return this.sendRejection(seat?.connection, commandId, 'ROOM_UNAVAILABLE', false);
    }

    let command: ClientCommand;
    try {
      command = parseClientCommand(rawCommand);
    } catch (error) {
      const code: CommandErrorCode =
        error instanceof RangeError
          ? 'COMMAND_TOO_LARGE'
          : protocolVersionFrom(rawCommand) === PROTOCOL_VERSION
            ? 'COMMAND_INVALID'
            : 'PROTOCOL_INCOMPATIBLE';
      return this.sendRejection(seat.connection, commandId, code, true);
    }
    if (command.roomId !== this.options.roomId) {
      return this.sendRejection(seat.connection, command.commandId, 'ROOM_UNAVAILABLE', false);
    }

    const fingerprint = commandFingerprint(command);
    const previous = this.processed.get(seat.identity.userId)?.get(command.commandId);
    if (previous !== undefined) {
      if (previous.fingerprint !== fingerprint) {
        return this.sendRejection(seat.connection, command.commandId, 'COMMAND_ID_REUSED', false);
      }
      seat.connection.send(previous.response.type, previous.response);
      return previous.response;
    }
    if (command.knownSequence !== this.currentSequence) {
      return this.sendRejection(seat.connection, command.commandId, 'SEQUENCE_STALE', true);
    }

    const error = await this.applyCommand(playerId, command);
    if (error !== null) {
      return this.sendRejection(seat.connection, command.commandId, error, true);
    }

    this.currentSequence += 1;
    const response = createCommandAccepted(command.commandId, this.currentSequence);
    const byUser = this.processed.get(seat.identity.userId) ?? new Map();
    byUser.set(command.commandId, { fingerprint, response });
    this.processed.set(seat.identity.userId, byUser);
    seat.connection.send(response.type, response);
    this.broadcastState();
    return response;
  }

  async shutdown(operationalReason: string): Promise<void> {
    if (this.currentState.phase === 'finished' || this.currentState.phase === 'cancelled') {
      await this.terminalPersistence;
      return;
    }
    const cancelled = cancelGame(this.currentState, operationalReason);
    if (cancelled.ok) {
      this.currentState = cancelled.state;
      this.currentSequence += 1;
      this.broadcastState();
    }
  }

  private async applyCommand(
    playerId: PlayerId,
    command: ClientCommand,
  ): Promise<CommandErrorCode | null> {
    if (command.type === 'room.ready') {
      this.ready.set(playerId, command.payload.ready);
      return null;
    }
    if (command.type === 'session.rematch' || command.type === 'session.react') {
      return 'WRONG_PHASE';
    }
    if (!this.bothPlayersReady()) {
      return 'WRONG_PHASE';
    }

    const transition =
      command.type === 'round.choose'
        ? applyGameAction(this.currentState, {
            type: 'choose-hidden',
            playerId,
            count: command.payload.count,
          })
        : command.type === 'round.predict'
          ? applyGameAction(this.currentState, {
              type: 'predict',
              playerId,
              value: command.payload.value,
            })
          : abandonGame(this.currentState, playerId);
    if (!transition.ok) {
      return domainErrorToProtocol(transition.error.code);
    }

    this.currentState = transition.state;
    if (this.currentState.phase === 'finished') {
      this.terminalPersistence ??= this.persistTerminalResult();
      await this.terminalPersistence;
    }
    return null;
  }

  private bothPlayersReady(): boolean {
    return (
      this.seats.size === 2 &&
      this.ready.get('player-one') === true &&
      this.ready.get('player-two') === true
    );
  }

  private broadcastState(): void {
    if (this.seats.size !== 2) {
      return;
    }
    const playerOne = this.seats.get('player-one');
    const playerTwo = this.seats.get('player-two');
    if (playerOne === undefined || playerTwo === undefined) {
      return;
    }
    const players: Record<PlayerId, PublicPlayer> = {
      'player-one': publicPlayer(playerOne),
      'player-two': publicPlayer(playerTwo),
    };
    const snapshot = createPublicSnapshot(this.currentState, {
      actionDeadline: null,
      players,
      ready: {
        'player-one': this.ready.get('player-one') === true,
        'player-two': this.ready.get('player-two') === true,
      },
      roomId: this.options.roomId,
      sequence: this.currentSequence,
      serverNow: this.dependencies.clock.now(),
      sessionScore: { 'player-one': 0, 'player-two': 0 },
    });
    for (const [playerId, seat] of this.seats) {
      seat.connection.send(snapshot.type, snapshot);
      const observation = createSeatObservation(this.currentState, playerId, this.currentSequence);
      seat.connection.send(observation.type, observation);
    }
  }

  private sendRejection(
    connection: MatchConnection | undefined,
    commandId: string,
    code: CommandErrorCode,
    recoverable: boolean,
  ): CommandRejected {
    const response = createCommandRejected(
      normalizedCommandId(commandId),
      this.currentSequence,
      code,
      recoverable,
    );
    connection?.send(response.type, response);
    return response;
  }

  private async persistTerminalResult(): Promise<void> {
    const transcript = buildGameTranscript(this.currentState);
    if (transcript === null) {
      throw new Error('A terminal persistence attempt requires a terminal game transcript.');
    }
    if (
      transcript.winner === null ||
      transcript.terminalReason === 'both-hidden-choice-timeout' ||
      transcript.terminalReason === 'technical-cancellation'
    ) {
      return;
    }
    const playerOne = this.seats.get('player-one');
    const playerTwo = this.seats.get('player-two');
    if (playerOne === undefined || playerTwo === undefined) {
      throw new Error('A terminal multiplayer result requires both authenticated participants.');
    }
    const completedAt = new Date(this.dependencies.clock.now());
    const result = await this.dependencies.resultRepository.save(
      {
        completedAt,
        gameId: transcript.gameId,
        initialInitiative: transcript.initialInitiative,
        participants: [
          participant(playerOne, transcript.winner, this.currentState),
          participant(playerTwo, transcript.winner, this.currentState),
        ],
        protocolVersion: PROTOCOL_VERSION,
        rounds: transcript.rounds,
        rulesVersion: RULES_VERSION,
        seed: transcript.seed,
        terminalReason: transcript.terminalReason,
        winner: transcript.winner,
      },
      completedAt,
    );
    if (result.kind === 'contradiction') {
      throw new Error('The terminal multiplayer result contradicts its persisted game id.');
    }
  }
}

function publicPlayer(seat: ConnectedSeat): PublicPlayer {
  return {
    avatarUrl: seat.identity.avatarUrl,
    connected: true,
    username: seat.identity.username,
  };
}

function participant(
  seat: ConnectedSeat,
  winner: PlayerId,
  state: GameState,
): {
  readonly finalReserve: number;
  readonly outcome: 'win' | 'loss';
  readonly seat: PlayerId;
  readonly userId: string;
} {
  return {
    finalReserve: state.reserves[seat.identity.playerId],
    outcome: seat.identity.playerId === winner ? 'win' : 'loss',
    seat: seat.identity.playerId,
    userId: seat.identity.userId,
  };
}

function commandFingerprint(command: ClientCommand): string {
  return createHash('sha256').update(JSON.stringify(command)).digest('hex');
}

function commandIdFrom(input: unknown): string {
  if (
    typeof input === 'object' &&
    input !== null &&
    'commandId' in input &&
    typeof input.commandId === 'string'
  ) {
    return input.commandId;
  }
  return 'invalid-command';
}

function normalizedCommandId(commandId: string): string {
  return commandId.length >= 8 && commandId.length <= 128 ? commandId : 'invalid-command';
}

function protocolVersionFrom(input: unknown): unknown {
  return typeof input === 'object' && input !== null && 'protocolVersion' in input
    ? input.protocolVersion
    : undefined;
}

function domainErrorToProtocol(code: string): CommandErrorCode {
  switch (code) {
    case 'wrong-phase':
    case 'game-finished':
      return 'WRONG_PHASE';
    case 'not-your-turn':
      return 'NOT_YOUR_TURN';
    case 'invalid-hidden-choice':
    case 'invalid-prediction':
    case 'duplicate-prediction':
      return 'VALUE_INVALID';
    default:
      return 'COMMAND_INVALID';
  }
}
