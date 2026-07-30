import { z } from 'zod';

import {
  PLAYER_IDS,
  type GameState,
  type PlayerId,
  type PublicRoundResult,
} from '@three-stone/game-core';

import { PROTOCOL_VERSION } from './commands.js';

const playerIdSchema = z.enum(PLAYER_IDS);
const reserveSchema = z.number().int().min(0).max(3);
const predictionSchema = z.number().int().min(0).max(6);
const scoreSchema = z.number().int().nonnegative();

const playerMap = <T extends z.ZodType>(value: T) =>
  z.strictObject({
    'player-one': value,
    'player-two': value,
  });

const publicPlayerSchema = z.strictObject({
  username: z.string().min(1).max(32),
  avatarUrl: z.string().max(2_048).nullable(),
  connected: z.boolean(),
});

const revealedRoundSchema = z.strictObject({
  roundNumber: z.number().int().positive(),
  initiative: playerIdSchema,
  choices: playerMap(z.number().int().min(0).max(3)),
  predictions: playerMap(predictionSchema),
  total: z.number().int().min(0).max(6),
  winner: playerIdSchema.nullable(),
  reservesAfter: playerMap(reserveSchema),
});

export const roomSnapshotSchema = z.strictObject({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  type: z.literal('room.snapshot'),
  roomId: z.string().min(8).max(128),
  sequence: z.number().int().nonnegative(),
  serverNow: z.number().int().nonnegative(),
  actionDeadline: z.number().int().nonnegative().nullable(),
  phase: z.enum([
    'hidden-choices',
    'first-prediction',
    'second-prediction',
    'finished',
    'cancelled',
  ]),
  roundNumber: z.number().int().positive(),
  initiative: playerIdSchema,
  players: playerMap(publicPlayerSchema),
  ready: playerMap(z.boolean()),
  reserves: playerMap(reserveSchema),
  predictions: z.strictObject({
    'player-one': predictionSchema.optional(),
    'player-two': predictionSchema.optional(),
  }),
  revealedRounds: z.array(revealedRoundSchema),
  winner: playerIdSchema.nullable(),
  terminalReason: z
    .enum([
      'reserve-empty',
      'hidden-choice-timeout',
      'both-hidden-choice-timeout',
      'prediction-timeout',
      'abandon',
      'disconnect',
      'technical-cancellation',
    ])
    .nullable(),
  sessionScore: playerMap(scoreSchema),
});

export const seatObservationSchema = z.strictObject({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  type: z.literal('seat.observation'),
  sequence: z.number().int().nonnegative(),
  playerId: playerIdSchema,
  ownHiddenChoice: z.number().int().min(0).max(3).optional(),
});

export type RoomSnapshot = z.infer<typeof roomSnapshotSchema>;
export type SeatObservation = z.infer<typeof seatObservationSchema>;

export interface PublicPlayer {
  readonly username: string;
  readonly avatarUrl: string | null;
  readonly connected: boolean;
}

export interface SnapshotContext {
  readonly roomId: string;
  readonly sequence: number;
  readonly serverNow: number;
  readonly actionDeadline: number | null;
  readonly sessionScore: Readonly<Record<PlayerId, number>>;
  readonly players: Readonly<Record<PlayerId, PublicPlayer>>;
  readonly ready: Readonly<Record<PlayerId, boolean>>;
}

export function createPublicSnapshot(state: GameState, context: SnapshotContext): RoomSnapshot {
  return roomSnapshotSchema.parse({
    protocolVersion: PROTOCOL_VERSION,
    type: 'room.snapshot',
    roomId: context.roomId,
    sequence: context.sequence,
    serverNow: context.serverNow,
    actionDeadline: context.actionDeadline,
    phase: state.phase,
    roundNumber: state.roundNumber,
    initiative: state.initiative,
    players: copyPlayerMap(context.players),
    ready: { ...context.ready },
    reserves: { ...state.reserves },
    predictions: { ...state.round.predictions },
    revealedRounds: state.revealedRounds.map(copyRound),
    winner: state.winner,
    terminalReason: state.terminalReason,
    sessionScore: { ...context.sessionScore },
  });
}

export function createSeatObservation(
  state: GameState,
  playerId: PlayerId,
  sequence: number,
): SeatObservation {
  const ownHiddenChoice = state.round.hiddenChoices[playerId];
  return seatObservationSchema.parse({
    protocolVersion: PROTOCOL_VERSION,
    type: 'seat.observation',
    sequence,
    playerId,
    ...(ownHiddenChoice === undefined ? {} : { ownHiddenChoice }),
  });
}

function copyPlayerMap(
  players: Readonly<Record<PlayerId, PublicPlayer>>,
): Record<PlayerId, PublicPlayer> {
  return {
    'player-one': { ...players['player-one'] },
    'player-two': { ...players['player-two'] },
  };
}

function copyRound(round: PublicRoundResult): PublicRoundResult {
  return {
    ...round,
    choices: { ...round.choices },
    predictions: { ...round.predictions },
    reservesAfter: { ...round.reservesAfter },
  };
}
