import { createHash, timingSafeEqual } from 'node:crypto';

import type { GameState, PlayerId } from '@three-stone/game-core';
import type { ClientCommand, CommandErrorCode, PublicPlayer } from '@three-stone/protocol';

interface SeatProjection {
  readonly connection: unknown | null;
  readonly identity: {
    readonly avatarUrl: string | null;
    readonly playerId: PlayerId;
    readonly userId: string;
    readonly username: string;
  };
}

export function publicPlayer(seat: SeatProjection): PublicPlayer {
  return {
    avatarUrl: seat.identity.avatarUrl,
    connected: seat.connection !== null,
    username: seat.identity.username,
  };
}

export function participant(
  seat: SeatProjection,
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

export function commandFingerprint(command: ClientCommand): string {
  return createHash('sha256').update(JSON.stringify(command)).digest('hex');
}

export function activePredictionPlayer(state: GameState): PlayerId {
  return state.phase === 'first-prediction'
    ? state.initiative
    : state.initiative === 'player-one'
      ? 'player-two'
      : 'player-one';
}

export function hashResumeToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

export function sameHash(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

export function minimum(values: Iterable<number>): number | null {
  let result: number | null = null;
  for (const value of values) {
    if (result === null || value < result) {
      result = value;
    }
  }
  return result;
}

export function commandIdFrom(input: unknown): string {
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

export function normalizedCommandId(commandId: string): string {
  return commandId.length >= 8 && commandId.length <= 128 ? commandId : 'invalid-command';
}

export function protocolVersionFrom(input: unknown): unknown {
  return typeof input === 'object' && input !== null && 'protocolVersion' in input
    ? input.protocolVersion
    : undefined;
}

export function domainErrorToProtocol(code: string): CommandErrorCode {
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
