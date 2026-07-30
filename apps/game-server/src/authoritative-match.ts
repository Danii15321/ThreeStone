import { randomBytes, randomUUID } from 'node:crypto';

import {
  RULES_VERSION,
  abandonGame,
  applyGameAction,
  buildGameTranscript,
  cancelGame,
  createGame,
  createNextGame,
  expireHiddenChoiceDeadline,
  expirePredictionDeadline,
  forfeitGame,
  type GameState,
  type PlayerId,
} from '@three-stone/game-core';
import {
  PROTOCOL_VERSION,
  createCommandAccepted,
  createCommandRejected,
  createPublicSnapshot,
  roomResumeTokenSchema,
  roomReactionSchema,
  createSeatObservation,
  parseClientCommand,
  type ClientCommand,
  type CommandAccepted,
  type CommandErrorCode,
  type CommandRejected,
  type PublicPlayer,
  type Reaction,
} from '@three-stone/protocol';

import {
  activePredictionPlayer,
  commandFingerprint,
  commandIdFrom,
  domainErrorToProtocol,
  hashResumeToken,
  minimum,
  normalizedCommandId,
  participant,
  protocolVersionFrom,
  publicPlayer,
  sameHash,
} from './authoritative-match-support.js';
import type {
  AdmissionIdentity,
  MatchConnection,
  MatchDeadlines,
  MatchDependencies,
  MatchJoinResult,
  MatchOptions,
} from './authoritative-match-types.js';
import { MultiplayerRoomSession } from './multiplayer-room-session.js';

export type {
  AdmissionIdentity,
  MatchConnection,
  MatchDeadlines,
  MatchDependencies,
  MatchJoinResult,
  MatchClock,
  MatchOptions,
} from './authoritative-match-types.js';

interface SeatState {
  connection: MatchConnection | null;
  readonly identity: AdmissionIdentity;
  resumeToken: ResumeTokenRecord | null;
}

interface ResumeTokenRecord {
  readonly expiresAt: number;
  readonly hash: Buffer;
}

interface DisconnectState {
  readonly deadline: number;
  readonly startedAt: number;
}

interface ProcessedCommand {
  readonly fingerprint: string;
  readonly response: CommandAccepted;
}

export class AuthoritativeMatch {
  private readonly actionDeadlines = new Map<PlayerId, number>();
  private actionDeadlineIdentity: string | null = null;
  private cancelDeadlineTimer: (() => void) | null = null;
  private cancelLeaseTimer: (() => void) | null = null;
  private currentState: GameState;
  private currentSequence = 0;
  private readonly deadlines: MatchDeadlines;
  private readonly disconnected = new Map<PlayerId, DisconnectState>();
  private readonly disconnectUsedMs = new Map<PlayerId, number>();
  private readonly seats = new Map<PlayerId, SeatState>();
  private readonly connectionSeats = new Map<string, PlayerId>();
  private readonly ready = new Map<PlayerId, boolean>();
  private gameplayStarted = false;
  private readonly processed = new Map<string, Map<string, ProcessedCommand>>();
  private readonly roomSession: MultiplayerRoomSession;
  private roomClosed = false;
  private terminalPersistence: Promise<void> | null = null;

  constructor(
    private readonly options: MatchOptions,
    private readonly dependencies: MatchDependencies,
  ) {
    this.deadlines = {
      disconnectBudgetMs: 120_000,
      disconnectGraceMs: 60_000,
      hiddenChoiceMs: 30_000,
      predictionMs: 20_000,
      rematchMs: 60_000,
      resumeTokenLifetimeMs: 6 * 60 * 60 * 1_000,
      ...dependencies.deadlines,
    };
    this.roomSession = new MultiplayerRoomSession(options.roomId, this.deadlines.rematchMs);
    this.currentState = createGame({
      gameId: options.gameId,
      seed: options.seed,
      sequenceNumber: 1,
    }).state;
    this.scheduleLeaseHeartbeat();
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
    if (occupied?.connection !== null && occupied?.connection !== undefined) {
      this.connectionSeats.delete(occupied.connection.connectionId);
      occupied.connection.close?.();
    }
    this.finishDisconnection(identity.playerId);
    this.seats.set(identity.playerId, { connection, identity, resumeToken: null });
    this.connectionSeats.set(connection.connectionId, identity.playerId);
    this.ready.set(identity.playerId, this.ready.get(identity.playerId) ?? false);
    this.currentSequence += 1;
    this.syncActionDeadlines();
    this.broadcastState();
    return { ok: true, identity };
  }

  canAdmit(identity: AdmissionIdentity): boolean {
    if (this.roomClosed || identity.roomId !== this.options.roomId) {
      return false;
    }
    const occupied = this.seats.get(identity.playerId);
    return (
      occupied === undefined ||
      (occupied.identity.userId === identity.userId &&
        occupied.identity.connectionGeneration < identity.connectionGeneration)
    );
  }

  consumeResumeToken(token: string): AdmissionIdentity | null {
    const suppliedHash = hashResumeToken(token);
    const now = this.dependencies.clock.now();
    for (const seat of this.seats.values()) {
      const record = seat.resumeToken;
      if (
        record === null ||
        record.expiresAt <= now ||
        !sameHash(record.hash, suppliedHash) ||
        !this.resumeWindowIsOpen(seat.identity.playerId, now)
      ) {
        continue;
      }
      seat.resumeToken = null;
      return {
        ...seat.identity,
        connectionGeneration: seat.identity.connectionGeneration + 1,
      };
    }
    return null;
  }

  leave(connectionId: string): void {
    const playerId = this.connectionSeats.get(connectionId);
    if (playerId === undefined) {
      return;
    }
    const current = this.seats.get(playerId);
    if (current?.connection?.connectionId !== connectionId) {
      return;
    }
    this.connectionSeats.delete(connectionId);
    current.connection = null;
    this.startDisconnection(playerId);
    this.currentSequence += 1;
    this.broadcastState();
    this.rescheduleDeadlineTimer();
  }

  syncConnection(connectionId: string): boolean {
    const playerId = this.connectionSeats.get(connectionId);
    const seat = playerId === undefined ? undefined : this.seats.get(playerId);
    if (playerId === undefined || seat?.connection?.connectionId !== connectionId) {
      return false;
    }
    this.issueResumeToken(playerId);
    if (this.seats.size === 2) {
      this.sendStateTo(playerId, seat);
    }
    return true;
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
    if (seat === undefined || seat.connection?.connectionId !== connectionId) {
      return this.sendRejection(seat?.connection, commandId, 'ROOM_UNAVAILABLE', false);
    }
    await this.tick();
    if (this.roomClosed) {
      return this.sendRejection(seat.connection, commandId, 'ROOM_UNAVAILABLE', false);
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
    if (command.type === 'session.react') {
      this.broadcastReaction(playerId, command.payload.reaction);
    }
    this.syncActionDeadlines();
    this.broadcastState();
    return response;
  }

  async tick(): Promise<void> {
    if (this.roomClosed || this.currentState.phase === 'cancelled') {
      this.clearDeadlineTimer();
      return;
    }
    const now = this.dependencies.clock.now();
    if (this.currentState.phase === 'finished') {
      if (
        this.roomSession.rematchExpired(now) ||
        [...this.disconnected.values()].some((state) => state.deadline <= now)
      ) {
        this.closeSession();
        return;
      }
      this.rescheduleDeadlineTimer();
      return;
    }
    const dueActionDeadline = minimum(this.actionDeadlines.values());
    if (dueActionDeadline !== null && dueActionDeadline <= now) {
      const transition =
        this.currentState.phase === 'hidden-choices'
          ? expireHiddenChoiceDeadline(this.currentState, this.currentState.roundNumber)
          : expirePredictionDeadline(this.currentState, {
              playerId: activePredictionPlayer(this.currentState),
              roundNumber: this.currentState.roundNumber,
            });
      if (transition.ok && transition.state !== this.currentState) {
        await this.acceptSystemTransition(transition.state);
        return;
      }
    }

    const dueDisconnected = [...this.disconnected.entries()]
      .filter(([, state]) => state.deadline <= now)
      .map(([playerId]) => playerId);
    if (dueDisconnected.length > 0) {
      const transition =
        dueDisconnected.length === 2
          ? cancelGame(this.currentState, 'all-players-disconnected')
          : forfeitGame(this.currentState, dueDisconnected[0]!, 'disconnect');
      if (transition.ok) {
        await this.acceptSystemTransition(transition.state);
        return;
      }
    }
    this.rescheduleDeadlineTimer();
  }

  async checkLease(): Promise<void> {
    const heartbeat = this.dependencies.leaseHeartbeat;
    if (heartbeat === undefined || this.currentState.phase === 'cancelled' || this.roomClosed) {
      this.clearLeaseTimer();
      return;
    }
    const health = await heartbeat.check(this.options.roomId);
    if (health === 'lost') {
      await this.shutdown('lease-lost');
      return;
    }
    this.scheduleLeaseHeartbeat();
  }

  async shutdown(operationalReason: string): Promise<void> {
    if (this.currentState.phase === 'finished' || this.currentState.phase === 'cancelled') {
      this.closeSession();
      this.clearLeaseTimer();
      await this.terminalPersistence;
      return;
    }
    const cancelled = cancelGame(this.currentState, operationalReason);
    if (cancelled.ok) {
      this.currentState = cancelled.state;
      this.currentSequence += 1;
      this.actionDeadlines.clear();
      this.clearDeadlineTimer();
      this.clearLeaseTimer();
      this.roomSession.recordTerminalGame(this.currentState, this.dependencies.clock.now());
      this.broadcastState();
      this.closeSession();
    }
  }

  private async applyCommand(
    playerId: PlayerId,
    command: ClientCommand,
  ): Promise<CommandErrorCode | null> {
    if (command.type === 'session.react') {
      if (
        this.roomClosed ||
        this.currentState.phase === 'cancelled' ||
        !this.roomSession.acceptReaction(playerId, this.dependencies.clock.now())
      ) {
        return this.roomClosed || this.currentState.phase === 'cancelled'
          ? 'ROOM_UNAVAILABLE'
          : 'RATE_LIMITED';
      }
      return null;
    }
    if (command.type === 'session.rematch') {
      if (this.currentState.phase !== 'finished') {
        return 'WRONG_PHASE';
      }
      const decision = this.roomSession.decideRematch(
        playerId,
        command.payload.accept,
        this.dependencies.clock.now(),
      );
      if (decision === 'unavailable') {
        return 'WRONG_PHASE';
      }
      if (decision === 'ready') {
        this.startRematch();
      }
      return null;
    }
    if (command.type === 'room.ready') {
      if (this.gameplayStarted) {
        return 'WRONG_PHASE';
      }
      this.ready.set(playerId, command.payload.ready);
      this.gameplayStarted = this.bothPlayersReady();
      return null;
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
    if (this.currentState.phase === 'finished' || this.currentState.phase === 'cancelled') {
      await this.recordTerminalState();
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
    const snapshot = this.createSnapshot();
    for (const [playerId, seat] of this.seats) {
      this.sendStateTo(playerId, seat, snapshot);
    }
  }

  private createSnapshot() {
    const playerOne = this.seats.get('player-one');
    const playerTwo = this.seats.get('player-two');
    if (playerOne === undefined || playerTwo === undefined) {
      throw new Error('A public snapshot requires both reserved seats.');
    }
    const players: Record<PlayerId, PublicPlayer> = {
      'player-one': publicPlayer(playerOne),
      'player-two': publicPlayer(playerTwo),
    };
    return createPublicSnapshot(this.currentState, {
      actionDeadline: minimum(this.actionDeadlines.values()),
      players,
      rematch: this.roomSession.rematch,
      ready: {
        'player-one': this.ready.get('player-one') === true,
        'player-two': this.ready.get('player-two') === true,
      },
      roomId: this.options.roomId,
      sequence: this.currentSequence,
      serverNow: this.dependencies.clock.now(),
      sessionScore: this.roomSession.score,
    });
  }

  private sendStateTo(playerId: PlayerId, seat: SeatState, snapshot = this.createSnapshot()): void {
    if (seat.connection === null) {
      return;
    }
    seat.connection.send(snapshot.type, snapshot);
    const observation = createSeatObservation(this.currentState, playerId, this.currentSequence);
    seat.connection.send(observation.type, observation);
  }

  private async acceptSystemTransition(state: GameState): Promise<void> {
    this.currentState = state;
    this.currentSequence += 1;
    this.syncActionDeadlines();
    if (state.phase === 'cancelled') {
      this.clearLeaseTimer();
    }
    if (state.phase === 'finished' || state.phase === 'cancelled') {
      await this.recordTerminalState();
    }
    this.broadcastState();
  }

  private syncActionDeadlines(): void {
    if (
      !this.bothPlayersReady() ||
      this.currentState.phase === 'finished' ||
      this.currentState.phase === 'cancelled'
    ) {
      this.actionDeadlines.clear();
      this.actionDeadlineIdentity = null;
      this.rescheduleDeadlineTimer();
      return;
    }

    const identity = `${this.currentState.roundNumber}:${this.currentState.phase}`;
    if (identity !== this.actionDeadlineIdentity) {
      this.actionDeadlineIdentity = identity;
      this.actionDeadlines.clear();
      const now = this.dependencies.clock.now();
      if (this.currentState.phase === 'hidden-choices') {
        const commonDeadline = now + this.deadlines.hiddenChoiceMs;
        for (const playerId of ['player-one', 'player-two'] as const) {
          if (this.currentState.round.hiddenChoices[playerId] === undefined) {
            this.actionDeadlines.set(playerId, commonDeadline);
          }
        }
      } else {
        this.actionDeadlines.set(
          activePredictionPlayer(this.currentState),
          now + this.deadlines.predictionMs,
        );
      }
    } else if (this.currentState.phase === 'hidden-choices') {
      for (const playerId of ['player-one', 'player-two'] as const) {
        if (this.currentState.round.hiddenChoices[playerId] !== undefined) {
          this.actionDeadlines.delete(playerId);
        }
      }
    }
    this.rescheduleDeadlineTimer();
  }

  private startDisconnection(playerId: PlayerId): void {
    if (this.roomClosed || this.currentState.phase === 'cancelled') {
      return;
    }
    const used = this.disconnectUsedMs.get(playerId) ?? 0;
    const remainingBudget = Math.max(0, this.deadlines.disconnectBudgetMs - used);
    const startedAt = this.dependencies.clock.now();
    this.disconnected.set(playerId, {
      deadline: startedAt + Math.min(this.deadlines.disconnectGraceMs, remainingBudget),
      startedAt,
    });
  }

  private finishDisconnection(playerId: PlayerId): void {
    const state = this.disconnected.get(playerId);
    if (state === undefined) {
      return;
    }
    const duration = Math.max(0, this.dependencies.clock.now() - state.startedAt);
    const previous = this.disconnectUsedMs.get(playerId) ?? 0;
    this.disconnectUsedMs.set(
      playerId,
      Math.min(this.deadlines.disconnectBudgetMs, previous + duration),
    );
    this.disconnected.delete(playerId);
  }

  private issueResumeToken(playerId: PlayerId): void {
    const seat = this.seats.get(playerId);
    if (seat === undefined || seat.connection === null) {
      return;
    }
    const token = this.dependencies.createResumeToken?.() ?? randomBytes(32).toString('base64url');
    const message = roomResumeTokenSchema.parse({
      connectionGeneration: seat.identity.connectionGeneration,
      expiresAt: this.dependencies.clock.now() + this.deadlines.resumeTokenLifetimeMs,
      protocolVersion: PROTOCOL_VERSION,
      token,
      type: 'room.resume-token',
    });
    seat.resumeToken = {
      expiresAt: message.expiresAt,
      hash: hashResumeToken(token),
    };
    seat.connection.send(message.type, message);
  }

  private resumeWindowIsOpen(playerId: PlayerId, now: number): boolean {
    if (this.roomClosed || this.currentState.phase === 'cancelled') {
      return false;
    }
    const seat = this.seats.get(playerId);
    if (seat?.connection !== null && seat?.connection !== undefined) {
      return true;
    }
    const disconnect = this.disconnected.get(playerId);
    return disconnect !== undefined && disconnect.deadline > now;
  }

  private rescheduleDeadlineTimer(): void {
    this.clearDeadlineTimer();
    const nextDeadline = minimum([
      ...this.actionDeadlines.values(),
      ...[...this.disconnected.values()].map((state) => state.deadline),
      ...(this.roomSession.rematch.deadline === null ? [] : [this.roomSession.rematch.deadline]),
    ]);
    if (nextDeadline === null) {
      return;
    }
    const delayMs = Math.max(0, nextDeadline - this.dependencies.clock.now());
    const schedule =
      this.dependencies.schedule ??
      ((delay: number, task: () => void) => {
        const timer = setTimeout(task, delay);
        return () => clearTimeout(timer);
      });
    this.cancelDeadlineTimer = schedule(delayMs, () => {
      this.cancelDeadlineTimer = null;
      void this.tick();
    });
  }

  private clearDeadlineTimer(): void {
    this.cancelDeadlineTimer?.();
    this.cancelDeadlineTimer = null;
  }

  private scheduleLeaseHeartbeat(): void {
    const heartbeat = this.dependencies.leaseHeartbeat;
    if (heartbeat === undefined || this.cancelLeaseTimer !== null) {
      return;
    }
    const schedule =
      this.dependencies.schedule ??
      ((delay: number, task: () => void) => {
        const timer = setTimeout(task, delay);
        return () => clearTimeout(timer);
      });
    this.cancelLeaseTimer = schedule(heartbeat.intervalMs, () => {
      this.cancelLeaseTimer = null;
      void this.checkLease();
    });
  }

  private clearLeaseTimer(): void {
    this.cancelLeaseTimer?.();
    this.cancelLeaseTimer = null;
  }

  private sendRejection(
    connection: MatchConnection | null | undefined,
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

  private startRematch(): void {
    this.currentState = createNextGame(this.currentState, {
      gameId: this.dependencies.createGameId?.() ?? randomUUID(),
      seed:
        this.dependencies.createGameSeed?.() ??
        (this.currentState.seed + this.currentState.sequenceNumber) % Number.MAX_SAFE_INTEGER,
    }).state;
    this.roomSession.beginRematch();
    this.terminalPersistence = null;
    this.actionDeadlineIdentity = null;
    this.actionDeadlines.clear();
    this.disconnectUsedMs.clear();
    this.disconnected.clear();
  }

  private async recordTerminalState(): Promise<void> {
    this.roomSession.recordTerminalGame(this.currentState, this.dependencies.clock.now());
    this.rescheduleDeadlineTimer();
    if (this.currentState.phase === 'finished') {
      this.terminalPersistence ??= this.persistTerminalResult();
      await this.terminalPersistence;
    }
  }

  private broadcastReaction(playerId: PlayerId, reaction: Reaction): void {
    const message = roomReactionSchema.parse({
      expiresAt: this.dependencies.clock.now() + 3_000,
      playerId,
      protocolVersion: PROTOCOL_VERSION,
      reaction,
      sequence: this.currentSequence,
      type: 'session.reaction',
    });
    for (const seat of this.seats.values()) {
      seat.connection?.send(message.type, message);
    }
  }

  private closeSession(): void {
    if (this.roomClosed) {
      return;
    }
    this.roomClosed = true;
    this.roomSession.close();
    this.actionDeadlines.clear();
    this.disconnected.clear();
    for (const seat of this.seats.values()) {
      seat.resumeToken = null;
      const connection = seat.connection;
      seat.connection = null;
      connection?.close?.();
    }
    this.connectionSeats.clear();
    this.clearDeadlineTimer();
    this.clearLeaseTimer();
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
