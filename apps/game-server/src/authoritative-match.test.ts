import { describe, expect, it } from 'vitest';

import type {
  CommandAccepted,
  RoomReaction,
  RoomSnapshot,
  SeatObservation,
} from '@three-stone/protocol';

import {
  AuthoritativeMatch,
  type AdmissionIdentity,
  type MatchConnection,
  type MatchDependencies,
} from './authoritative-match.js';
import { GameServerMetrics } from './game-server-metrics.js';

const ROOM_ID = '7d34b06c-02a8-40e3-86ca-24e81cd0ff19';
const GAME_ID = 'b8f16c4b-ed5c-43de-a679-ce0b4724a83c';

interface SentMessage {
  readonly type: string;
  readonly payload: unknown;
}

class FakeClock {
  nowMs = 1_775_000_000_000;

  now(): number {
    return this.nowMs;
  }
}

class FakeConnection implements MatchConnection {
  closed = false;
  readonly messages: SentMessage[] = [];

  constructor(readonly connectionId: string) {}

  send(type: string, payload: unknown): void {
    this.messages.push({ type, payload });
  }

  close(): void {
    this.closed = true;
  }

  last<T>(type: string): T {
    const found = this.messages.findLast((message) => message.type === type);
    if (found === undefined) {
      throw new Error(`No ${type} message was sent.`);
    }
    return found.payload as T;
  }
}

function identity(
  userId: string,
  playerId: 'player-one' | 'player-two',
  generation = 1,
): AdmissionIdentity {
  return {
    avatarUrl: playerId === 'player-one' ? '/api/profile/avatar' : null,
    connectionGeneration: generation,
    playerId,
    roomId: ROOM_ID,
    userId,
    username: playerId === 'player-one' ? 'Astrid' : 'Bjorn',
  };
}

function setup(overrides: Partial<MatchDependencies> = {}) {
  const clock = new FakeClock();
  const tickets = new Map<string, AdmissionIdentity>([
    ['ticket-one', identity('user-one', 'player-one')],
    ['ticket-two', identity('user-two', 'player-two')],
    ['ticket-three', identity('user-three', 'player-two')],
    ['ticket-one-generation-two', identity('user-one', 'player-one', 2)],
  ]);
  const saved: unknown[] = [];
  let resumeTokenNumber = 0;
  const dependencies: MatchDependencies = {
    clock,
    createResumeToken() {
      resumeTokenNumber += 1;
      return `resume-token-${resumeTokenNumber}`.padEnd(43, '0');
    },
    deadlines: {
      disconnectBudgetMs: 120_000,
      disconnectGraceMs: 60_000,
      hiddenChoiceMs: 30_000,
      predictionMs: 20_000,
      rematchMs: 60_000,
      resumeTokenLifetimeMs: 6 * 60 * 60 * 1_000,
    },
    resultRepository: {
      async save(input) {
        saved.push(input);
        return { kind: 'created' as const, gameId: input.gameId };
      },
    },
    async verifyAdmissionTicket(ticket, expectedRoomId) {
      const value = tickets.get(ticket);
      if (value === undefined || value.roomId !== expectedRoomId) {
        return null;
      }
      return value;
    },
    schedule() {
      return () => undefined;
    },
    ...overrides,
  };
  const match = new AuthoritativeMatch(
    {
      gameId: GAME_ID,
      roomId: ROOM_ID,
      seed: 47,
    },
    dependencies,
  );
  const one = new FakeConnection('connection-one');
  const two = new FakeConnection('connection-two');
  return { clock, match, one, saved, two };
}

async function joinAndReady(
  match: AuthoritativeMatch,
  one: FakeConnection,
  two: FakeConnection,
): Promise<void> {
  await expect(match.join(one, 'ticket-one')).resolves.toMatchObject({ ok: true });
  await expect(match.join(two, 'ticket-two')).resolves.toMatchObject({ ok: true });
  expect(match.syncConnection(one.connectionId)).toBe(true);
  expect(match.syncConnection(two.connectionId)).toBe(true);
}

async function accepted(
  match: AuthoritativeMatch,
  connection: FakeConnection,
  command:
    | Readonly<{
        type: 'room.ready';
        payload: { ready: boolean };
      }>
    | Readonly<{
        type: 'round.choose';
        payload: { count: number };
      }>
    | Readonly<{
        type: 'round.predict';
        payload: { value: number };
      }>
    | Readonly<{
        type: 'match.abandon';
        payload: Record<string, never>;
      }>
    | Readonly<{
        type: 'session.rematch';
        payload: { accept: boolean };
      }>
    | Readonly<{
        type: 'session.react';
        payload: { reaction: 'well-played' | 'nice-bluff' | 'oops' | 'rematch' };
      }>,
  commandId = `command-${String(match.sequence + 1).padStart(4, '0')}`,
): Promise<CommandAccepted> {
  const response = await match.receive(connection.connectionId, {
    protocolVersion: 2,
    commandId,
    roomId: ROOM_ID,
    knownSequence: match.sequence,
    ...command,
  });
  expect(response.type).toBe('command.accepted');
  return response as CommandAccepted;
}

async function finishGame(
  match: AuthoritativeMatch,
  one: FakeConnection,
  two: FakeConnection,
  winner: 'player-one' | 'player-two' = 'player-one',
): Promise<void> {
  const gameNumber = match.state.sequenceNumber;
  for (let round = 1; round <= 3; round += 1) {
    await accepted(match, one, { type: 'round.choose', payload: { count: 1 } });
    await accepted(match, two, { type: 'round.choose', payload: { count: 1 } });
    const initiative = match.state.initiative;
    const first = initiative === 'player-one' ? one : two;
    const second = initiative === 'player-one' ? two : one;
    await accepted(match, first, {
      type: 'round.predict',
      payload: { value: initiative === winner ? 2 : 0 },
    });
    await accepted(
      match,
      second,
      {
        type: 'round.predict',
        payload: { value: initiative === winner ? 0 : 2 },
      },
      `game-${gameNumber}-round-${round}-last-prediction`,
    );
  }
}

describe('AuthoritativeMatch', () => {
  it('atomically cancels a hidden-choice deadline when neither player submitted', async () => {
    const { clock, match, one, saved, two } = setup();
    await joinAndReady(match, one, two);

    expect(one.last<RoomSnapshot>('room.snapshot').actionDeadline).toBe(clock.now() + 30_000);
    clock.nowMs += 30_000;
    await match.tick();

    expect(match.state).toMatchObject({
      phase: 'cancelled',
      terminalReason: 'both-hidden-choice-timeout',
      winner: null,
    });
    expect(saved).toHaveLength(0);
  });

  it('keeps an action deadline running through disconnection and awards the timeout', async () => {
    const { clock, match, one, saved, two } = setup();
    await joinAndReady(match, one, two);
    await accepted(match, one, { type: 'round.choose', payload: { count: 1 } });

    clock.nowMs += 27_000;
    match.leave(two.connectionId);
    clock.nowMs += 3_000;
    await match.tick();

    expect(match.state).toMatchObject({
      phase: 'finished',
      terminalReason: 'hidden-choice-timeout',
      winner: 'player-one',
    });
    expect(saved).toHaveLength(1);
  });

  it('keeps a disconnected creator resumable while the room is still waiting', async () => {
    const { clock, match, one, two } = setup();
    await expect(match.join(one, 'ticket-one')).resolves.toMatchObject({ ok: true });
    expect(match.syncConnection(one.connectionId)).toBe(true);
    const token = one.last<{ token: string }>('room.resume-token').token;

    match.leave(one.connectionId);
    clock.nowMs += 60_001;
    await match.tick();

    expect(match.state).toMatchObject({ phase: 'hidden-choices', winner: null });
    await expect(match.join(two, 'ticket-two')).resolves.toMatchObject({ ok: true });
    clock.nowMs += 59_000;
    await match.tick();
    expect(match.consumeResumeToken(token)).toMatchObject({
      connectionGeneration: 2,
      playerId: 'player-one',
      userId: 'user-one',
    });
  });

  it('starts only after both admitted connections have synchronized', async () => {
    const { match, one, two } = setup();
    await expect(match.join(one, 'ticket-one')).resolves.toMatchObject({ ok: true });
    await expect(match.join(two, 'ticket-two')).resolves.toMatchObject({ ok: true });

    expect(match.syncConnection(one.connectionId)).toBe(true);
    expect(one.last<RoomSnapshot>('room.snapshot')).toMatchObject({
      actionDeadline: null,
      ready: { 'player-one': true, 'player-two': false },
    });

    expect(match.syncConnection(two.connectionId)).toBe(true);
    expect(one.last<RoomSnapshot>('room.snapshot')).toMatchObject({
      ready: { 'player-one': true, 'player-two': true },
    });
    expect(one.last<RoomSnapshot>('room.snapshot').actionDeadline).not.toBeNull();
  });

  it('starts the normal reconnection grace only when an opponent joins the waiting creator', async () => {
    const { clock, match, one, two } = setup();
    await expect(match.join(one, 'ticket-one')).resolves.toMatchObject({ ok: true });
    expect(match.syncConnection(one.connectionId)).toBe(true);

    match.leave(one.connectionId);
    clock.nowMs += 5 * 60_000;
    await match.tick();
    await expect(match.join(two, 'ticket-two')).resolves.toMatchObject({ ok: true });

    clock.nowMs += 60_001;
    await match.tick();

    expect(match.state).toMatchObject({ phase: 'finished', winner: 'player-two' });
  });

  it('does not start gameplay while a ready creator is disconnected', async () => {
    const { match, one, two } = setup();
    await expect(match.join(one, 'ticket-one')).resolves.toMatchObject({ ok: true });
    expect(match.syncConnection(one.connectionId)).toBe(true);
    const token = one.last<{ token: string }>('room.resume-token').token;

    match.leave(one.connectionId);
    await expect(match.join(two, 'ticket-two')).resolves.toMatchObject({ ok: true });
    expect(match.syncConnection(two.connectionId)).toBe(true);

    expect(two.last<RoomSnapshot>('room.snapshot')).toMatchObject({
      actionDeadline: null,
      players: { 'player-one': { connected: false } },
      ready: { 'player-one': false, 'player-two': true },
    });

    const resumedIdentity = match.consumeResumeToken(token);
    const resumed = new FakeConnection('connection-one-resumed-before-start');
    expect(match.joinIdentity(resumed, resumedIdentity!)).toMatchObject({ ok: true });
    expect(match.syncConnection(resumed.connectionId)).toBe(true);

    expect(two.last<RoomSnapshot>('room.snapshot').actionDeadline).not.toBeNull();
  });

  it('rejects a command received after its deadline even before the timer callback runs', async () => {
    const { clock, match, one, two } = setup();
    await joinAndReady(match, one, two);
    await accepted(match, one, { type: 'round.choose', payload: { count: 1 } });
    const sequenceBeforeDeadline = match.sequence;
    clock.nowMs += 30_000;

    const late = await match.receive(two.connectionId, {
      commandId: 'late-hidden-choice',
      knownSequence: sequenceBeforeDeadline,
      payload: { count: 1 },
      protocolVersion: 2,
      roomId: ROOM_ID,
      type: 'round.choose',
    });

    expect(late).toMatchObject({
      type: 'command.rejected',
      error: { code: 'SEQUENCE_STALE' },
    });
    expect(match.state).toMatchObject({
      phase: 'finished',
      terminalReason: 'hidden-choice-timeout',
      winner: 'player-one',
    });
  });

  it('does not let a player pause a started game by withdrawing ready state', async () => {
    const { match, one, two } = setup();
    await joinAndReady(match, one, two);
    const sequence = match.sequence;

    const response = await match.receive(one.connectionId, {
      commandId: 'withdraw-ready-after-start',
      knownSequence: sequence,
      payload: { ready: false },
      protocolVersion: 2,
      roomId: ROOM_ID,
      type: 'room.ready',
    });

    expect(response).toMatchObject({
      type: 'command.rejected',
      error: { code: 'WRONG_PHASE' },
    });
    expect(match.sequence).toBe(sequence);
    expect(one.last<RoomSnapshot>('room.snapshot').actionDeadline).not.toBeNull();
  });

  it('uses disconnect grace only when the absent seat has no action due', async () => {
    const { clock, match, one, two } = setup();
    await joinAndReady(match, one, two);
    await accepted(match, one, { type: 'round.choose', payload: { count: 1 } });
    await accepted(match, two, { type: 'round.choose', payload: { count: 1 } });

    match.leave(two.connectionId);
    clock.nowMs += 19_999;
    await match.tick();
    expect(match.state.phase).toBe('first-prediction');

    clock.nowMs += 1;
    await match.tick();
    expect(match.state).toMatchObject({
      phase: 'finished',
      terminalReason: 'prediction-timeout',
      winner: 'player-two',
    });
  });

  it('resumes directly with a one-use rotating token and invalidates the old generation', async () => {
    const { match, one, two } = setup();
    await joinAndReady(match, one, two);
    const firstToken = one.last<{ token: string }>('room.resume-token').token;
    match.leave(one.connectionId);

    const resumedIdentity = match.consumeResumeToken(firstToken);
    expect(resumedIdentity).toMatchObject({
      connectionGeneration: 2,
      playerId: 'player-one',
      userId: 'user-one',
    });
    expect(match.consumeResumeToken(firstToken)).toBeNull();

    const replacement = new FakeConnection('connection-one-resumed');
    expect(match.joinIdentity(replacement, resumedIdentity!)).toMatchObject({ ok: true });
    expect(match.syncConnection(replacement.connectionId)).toBe(true);
    const rotatedToken = replacement.last<{ token: string }>('room.resume-token').token;
    expect(rotatedToken).not.toBe(firstToken);

    const newerIdentity = match.consumeResumeToken(rotatedToken);
    const newest = new FakeConnection('connection-one-newest');
    expect(match.joinIdentity(newest, newerIdentity!)).toMatchObject({ ok: true });
    expect(replacement.closed).toBe(true);
  });

  it('enforces the cumulative reconnect budget across rotated tokens', async () => {
    const { clock, match, one, two } = setup();
    await expect(match.join(one, 'ticket-one')).resolves.toMatchObject({ ok: true });
    await expect(match.join(two, 'ticket-two')).resolves.toMatchObject({ ok: true });
    match.syncConnection(one.connectionId);
    let token = one.last<{ token: string }>('room.resume-token').token;
    let current = one;

    for (const absence of [50_000, 59_000]) {
      match.leave(current.connectionId);
      clock.nowMs += absence;
      const resumed = match.consumeResumeToken(token);
      expect(resumed).not.toBeNull();
      current = new FakeConnection(`resumed-after-${absence}`);
      expect(match.joinIdentity(current, resumed!)).toMatchObject({ ok: true });
      match.syncConnection(current.connectionId);
      token = current.last<{ token: string }>('room.resume-token').token;
    }

    match.leave(current.connectionId);
    clock.nowMs += 10_999;
    await match.tick();
    expect(match.state.phase).toBe('hidden-choices');

    clock.nowMs += 1;
    await match.tick();
    expect(match.state).toMatchObject({
      phase: 'finished',
      terminalReason: 'disconnect',
      winner: 'player-two',
    });
  });

  it('cancels without a winner when the active room lease is definitively lost', async () => {
    const { match, one, saved, two } = setup({
      leaseHeartbeat: {
        check: async () => 'lost',
        intervalMs: 30_000,
      },
    });
    await joinAndReady(match, one, two);

    await match.checkLease();

    expect(match.state).toMatchObject({
      phase: 'cancelled',
      terminalReason: 'technical-cancellation',
      winner: null,
    });
    expect(saved).toHaveLength(0);
  });

  it('admits exactly two authenticated seats and rejects a third identity', async () => {
    const { match, one, two } = setup();
    const third = new FakeConnection('connection-three');

    await expect(match.join(one, 'ticket-one')).resolves.toMatchObject({ ok: true });
    await expect(match.join(two, 'ticket-two')).resolves.toMatchObject({ ok: true });
    await expect(match.join(third, 'ticket-three')).resolves.toEqual({
      ok: false,
      code: 'ROOM_UNAVAILABLE',
    });
  });

  it('rejects stale sequence, wrong phase and old connection generations without mutation', async () => {
    const { match, one, two } = setup();
    await joinAndReady(match, one, two);
    const initialSequence = match.sequence;

    const wrongPhase = await match.receive(one.connectionId, {
      protocolVersion: 2,
      commandId: 'wrong-phase-command',
      roomId: ROOM_ID,
      knownSequence: initialSequence,
      type: 'round.predict',
      payload: { value: 2 },
    });
    expect(wrongPhase).toMatchObject({
      type: 'command.rejected',
      error: { code: 'WRONG_PHASE' },
    });
    expect(match.sequence).toBe(initialSequence);

    const stale = await match.receive(one.connectionId, {
      protocolVersion: 2,
      commandId: 'stale-sequence-command',
      roomId: ROOM_ID,
      knownSequence: initialSequence - 1,
      type: 'round.choose',
      payload: { count: 1 },
    });
    expect(stale).toMatchObject({
      type: 'command.rejected',
      error: { code: 'SEQUENCE_STALE' },
    });
    expect(match.sequence).toBe(initialSequence);

    const replacement = new FakeConnection('connection-one-new');
    await expect(match.join(replacement, 'ticket-one-generation-two')).resolves.toMatchObject({
      ok: true,
    });
    const obsolete = await match.receive(one.connectionId, {
      protocolVersion: 2,
      commandId: 'obsolete-generation-command',
      roomId: ROOM_ID,
      knownSequence: match.sequence,
      type: 'round.choose',
      payload: { count: 1 },
    });
    expect(obsolete).toMatchObject({
      type: 'command.rejected',
      error: { code: 'ROOM_UNAVAILABLE' },
    });
  });

  it('deduplicates identical command ids and rejects contradictory reuse', async () => {
    const { match, one, two } = setup();
    await joinAndReady(match, one, two);
    const knownSequence = match.sequence;
    const command = {
      protocolVersion: 2 as const,
      commandId: 'same-command-id',
      roomId: ROOM_ID,
      knownSequence,
      type: 'round.choose' as const,
      payload: { count: 2 },
    };

    const first = await match.receive(one.connectionId, command);
    const sequenceAfterFirst = match.sequence;
    const repeated = await match.receive(one.connectionId, command);
    const contradictory = await match.receive(one.connectionId, {
      ...command,
      payload: { count: 1 },
    });

    expect(first).toEqual(repeated);
    expect(match.sequence).toBe(sequenceAfterFirst);
    expect(contradictory).toMatchObject({
      type: 'command.rejected',
      error: { code: 'COMMAND_ID_REUSED' },
    });
  });

  it('sends the owner choice only to its private observation and emits no opponent tell', async () => {
    const { match, one, two } = setup();
    await joinAndReady(match, one, two);
    const oneStart = one.messages.length;
    const twoStart = two.messages.length;

    await accepted(match, one, {
      type: 'round.choose',
      payload: { count: 2 },
    });

    const oneMessages = one.messages.slice(oneStart);
    const twoMessages = two.messages.slice(twoStart);
    const ownObservation = oneMessages.find((message) => message.type === 'seat.observation')
      ?.payload as SeatObservation;
    const opponentObservation = twoMessages.find((message) => message.type === 'seat.observation')
      ?.payload as SeatObservation;
    const opponentSnapshot = twoMessages.find((message) => message.type === 'room.snapshot')
      ?.payload as RoomSnapshot;

    expect(ownObservation).toHaveProperty('ownHiddenChoice', 2);
    expect(opponentObservation).not.toHaveProperty('ownHiddenChoice');
    expect(JSON.stringify(opponentSnapshot)).not.toContain('hiddenChoice');
    expect(JSON.stringify(opponentSnapshot)).not.toContain('choicesReceived');
  });

  it('lets two programmatic players finish and persists the terminal result once', async () => {
    const { match, one, saved, two } = setup();
    await joinAndReady(match, one, two);

    await finishGame(match, one, two);

    expect(match.state).toMatchObject({
      phase: 'finished',
      winner: 'player-one',
      terminalReason: 'reserve-empty',
    });
    expect(saved).toHaveLength(1);

    const duplicate = await match.receive(two.connectionId, {
      protocolVersion: 2,
      commandId: 'game-1-round-3-last-prediction',
      roomId: ROOM_ID,
      knownSequence: match.sequence - 1,
      type: 'round.predict',
      payload: { value: 0 },
    });
    expect(duplicate.type).toBe('command.accepted');
    expect(saved).toHaveLength(1);
    expect(two.last<RoomSnapshot>('room.snapshot')).toMatchObject({
      winner: 'player-one',
      phase: 'finished',
    });
  });

  it('acknowledges and broadcasts a terminal command even when persistence is unavailable', async () => {
    const metrics = new GameServerMetrics();
    const { match, one, two } = setup({
      metrics,
      resultRepository: {
        async save() {
          throw new Error('database unavailable');
        },
      },
    });
    await joinAndReady(match, one, two);

    await finishGame(match, one, two);

    expect(one.last<RoomSnapshot>('room.snapshot')).toMatchObject({
      phase: 'finished',
      winner: 'player-one',
    });
    expect(two.last<RoomSnapshot>('room.snapshot')).toMatchObject({
      phase: 'finished',
      winner: 'player-one',
    });
    expect(metrics.snapshot()).toMatchObject({
      commandAcceptance: { count: 12 },
      persistenceErrors: 1,
      roomsFinished: 1,
    });
  });

  it('keeps a session score and starts a rematch only after both players accept', async () => {
    const { match, one, two } = setup();
    await joinAndReady(match, one, two);
    const firstInitiative = match.state.initialInitiative;
    await finishGame(match, one, two);

    expect(one.last<RoomSnapshot>('room.snapshot')).toMatchObject({
      rematch: {
        accepted: { 'player-one': false, 'player-two': false },
        deadline: null,
        declinedBy: null,
      },
      sessionScore: { 'player-one': 1, 'player-two': 0 },
    });

    await accepted(match, one, {
      type: 'session.rematch',
      payload: { accept: true },
    });
    expect(match.state.phase).toBe('finished');

    await accepted(match, two, {
      type: 'session.rematch',
      payload: { accept: true },
    });
    expect(match.state).toMatchObject({
      phase: 'hidden-choices',
      initialInitiative: firstInitiative === 'player-one' ? 'player-two' : 'player-one',
    });
    expect(one.last<RoomSnapshot>('room.snapshot').sessionScore).toEqual({
      'player-one': 1,
      'player-two': 0,
    });
  });

  it('broadcasts only controlled reactions and enforces both rate limits', async () => {
    const { clock, match, one, two } = setup();
    await joinAndReady(match, one, two);

    await accepted(match, one, {
      type: 'session.react',
      payload: { reaction: 'nice-bluff' },
    });
    expect(two.last<RoomReaction>('session.reaction')).toMatchObject({
      expiresAt: clock.now() + 3_000,
      playerId: 'player-one',
      reaction: 'nice-bluff',
    });

    const tooFast = await match.receive(one.connectionId, {
      commandId: 'reaction-too-fast',
      knownSequence: match.sequence,
      payload: { reaction: 'oops' },
      protocolVersion: 2,
      roomId: ROOM_ID,
      type: 'session.react',
    });
    expect(tooFast).toMatchObject({
      type: 'command.rejected',
      error: { code: 'RATE_LIMITED' },
    });

    for (const [index, reaction] of (['oops', 'well-played'] as const).entries()) {
      clock.nowMs += 2_000;
      await accepted(
        match,
        one,
        { type: 'session.react', payload: { reaction } },
        `spaced-reaction-${index}`,
      );
    }
    clock.nowMs += 2_000;
    const fourthInWindow = await match.receive(one.connectionId, {
      commandId: 'reaction-four-in-ten-seconds',
      knownSequence: match.sequence,
      payload: { reaction: 'rematch' },
      protocolVersion: 2,
      roomId: ROOM_ID,
      type: 'session.react',
    });
    expect(fourthInWindow).toMatchObject({
      type: 'command.rejected',
      error: { code: 'RATE_LIMITED' },
    });
  });

  it('keeps a complete two-to-one series in the same room', async () => {
    const { match, one, two } = setup();
    await joinAndReady(match, one, two);

    for (const winner of ['player-one', 'player-two', 'player-one'] as const) {
      await finishGame(match, one, two, winner);
      if (match.state.sequenceNumber < 3) {
        await accepted(match, one, {
          type: 'session.rematch',
          payload: { accept: true },
        });
        await accepted(match, two, {
          type: 'session.rematch',
          payload: { accept: true },
        });
      }
    }

    expect(one.last<RoomSnapshot>('room.snapshot')).toMatchObject({
      phase: 'finished',
      sessionScore: { 'player-one': 2, 'player-two': 1 },
    });
  });

  it('closes the room and invalidates resume tokens when the rematch window expires', async () => {
    const { clock, match, one, two } = setup();
    await joinAndReady(match, one, two);
    const token = one.last<{ token: string }>('room.resume-token').token;
    await finishGame(match, one, two);

    clock.nowMs += 60_000;
    await match.tick();

    expect(one.closed).toBe(true);
    expect(two.closed).toBe(true);
    expect(match.consumeResumeToken(token)).toBeNull();
    await expect(
      match.receive(one.connectionId, {
        commandId: 'command-after-room-close',
        knownSequence: match.sequence,
        payload: { reaction: 'oops' },
        protocolVersion: 2,
        roomId: ROOM_ID,
        type: 'session.react',
      }),
    ).resolves.toMatchObject({
      type: 'command.rejected',
      error: { code: 'ROOM_UNAVAILABLE' },
    });
  });

  it('cancels an active match on technical shutdown without persisting a winner', async () => {
    const { match, one, saved, two } = setup();
    await joinAndReady(match, one, two);

    await match.shutdown('server-draining');

    expect(match.state).toMatchObject({
      phase: 'cancelled',
      winner: null,
      terminalReason: 'technical-cancellation',
    });
    expect(saved).toHaveLength(0);
  });
});
