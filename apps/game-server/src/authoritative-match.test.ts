import { describe, expect, it } from 'vitest';

import type { CommandAccepted, RoomSnapshot, SeatObservation } from '@three-stone/protocol';

import {
  AuthoritativeMatch,
  type AdmissionIdentity,
  type MatchConnection,
  type MatchDependencies,
} from './authoritative-match.js';

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
  readonly messages: SentMessage[] = [];

  constructor(readonly connectionId: string) {}

  send(type: string, payload: unknown): void {
    this.messages.push({ type, payload });
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

function setup() {
  const clock = new FakeClock();
  const tickets = new Map<string, AdmissionIdentity>([
    ['ticket-one', identity('user-one', 'player-one')],
    ['ticket-two', identity('user-two', 'player-two')],
    ['ticket-three', identity('user-three', 'player-two')],
    ['ticket-one-generation-two', identity('user-one', 'player-one', 2)],
  ]);
  const saved: unknown[] = [];
  const dependencies: MatchDependencies = {
    clock,
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
  await accepted(match, one, {
    type: 'room.ready',
    payload: { ready: true },
  });
  await accepted(match, two, {
    type: 'room.ready',
    payload: { ready: true },
  });
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

describe('AuthoritativeMatch', () => {
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

    for (let round = 1; round <= 3; round += 1) {
      await accepted(match, one, { type: 'round.choose', payload: { count: 1 } });
      await accepted(match, two, { type: 'round.choose', payload: { count: 1 } });
      const initiative = match.state.initiative;
      const first = initiative === 'player-one' ? one : two;
      const second = initiative === 'player-one' ? two : one;
      await accepted(match, first, {
        type: 'round.predict',
        payload: { value: initiative === 'player-one' ? 2 : 0 },
      });
      await accepted(
        match,
        second,
        {
          type: 'round.predict',
          payload: { value: initiative === 'player-one' ? 0 : 2 },
        },
        `round-${round}-last-prediction`,
      );
    }

    expect(match.state).toMatchObject({
      phase: 'finished',
      winner: 'player-one',
      terminalReason: 'reserve-empty',
    });
    expect(saved).toHaveLength(1);

    const duplicate = await match.receive(two.connectionId, {
      protocolVersion: 2,
      commandId: 'round-3-last-prediction',
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
