import { z } from 'zod';

import {
  PLAYER_IDS,
  getStonesClass,
  type GameState,
  type PlayerId,
  type PublicRoundResult,
} from '@three-stone/game-core';

import { LEGACY_PROTOCOL_VERSION, PROTOCOL_VERSION, reactionSchema } from './commands.js';

const playerIdSchema = z.enum(PLAYER_IDS);
const reserveSchema = z.number().int().min(0).max(3);
const predictionSchema = z.number().int().min(0).max(6);
const scoreSchema = z.number().int().nonnegative();
export const stoneClassSchema = z.enum(['B', 'A', 'S']);
const stonesSchema = z.number().int().safe();

const playerMap = <T extends z.ZodType>(value: T) =>
  z.strictObject({
    'player-one': value,
    'player-two': value,
  });

const publicPlayerSchema = z.strictObject({
  username: z.string().min(1).max(32),
  avatarUrl: z.string().max(2_048).nullable(),
  connected: z.boolean(),
  stoneClass: stoneClassSchema,
  stones: stonesSchema,
});

export const stonesSettlementRewardSchema = z.strictObject({
  kind: z.enum(['stone-hand', 'stone-eye', 'stone-heart']),
  occurrences: z.number().int().positive().max(4),
  stones: z.number().int().nonnegative(),
});

export const playerStonesSettlementSchema = z
  .strictObject({
    baseDelta: z.number().int().safe(),
    classAfter: stoneClassSchema,
    classBefore: stoneClassSchema,
    netDelta: z.number().int().safe(),
    rewards: z.array(stonesSettlementRewardSchema).max(3),
    stonesAfter: stonesSchema,
    stonesBefore: stonesSchema,
  })
  .superRefine((settlement, context) => {
    const bonus = settlement.rewards.reduce((total, reward) => total + reward.stones, 0);
    const rewardKinds = new Set(settlement.rewards.map((reward) => reward.kind));
    if (rewardKinds.size !== settlement.rewards.length) {
      context.addIssue({
        code: 'custom',
        message: 'A Stones reward kind can appear only once per player.',
        path: ['rewards'],
      });
    }
    for (const [index, reward] of settlement.rewards.entries()) {
      const isValid =
        reward.kind === 'stone-hand'
          ? reward.stones === reward.occurrences * 3
          : reward.occurrences === 1 && reward.stones === (reward.kind === 'stone-eye' ? 9 : 6);
      if (!isValid) {
        context.addIssue({
          code: 'custom',
          message: 'The Stones reward does not match its authoritative rules.',
          path: ['rewards', index],
        });
      }
    }
    if (settlement.netDelta !== settlement.baseDelta + bonus) {
      context.addIssue({
        code: 'custom',
        message: 'The net Stones delta must equal the base and reward deltas.',
        path: ['netDelta'],
      });
    }
    if (settlement.stonesAfter !== settlement.stonesBefore + settlement.netDelta) {
      context.addIssue({
        code: 'custom',
        message: 'The final Stones total must equal the initial total and net delta.',
        path: ['stonesAfter'],
      });
    }
    if (settlement.classBefore !== getStonesClass(settlement.stonesBefore)) {
      context.addIssue({
        code: 'custom',
        message: 'The initial class does not match the initial Stones total.',
        path: ['classBefore'],
      });
    }
    if (settlement.classAfter !== getStonesClass(settlement.stonesAfter)) {
      context.addIssue({
        code: 'custom',
        message: 'The final class does not match the final Stones total.',
        path: ['classAfter'],
      });
    }
  });

export const stonesSettlementSchema = z.strictObject({
  players: playerMap(playerStonesSettlementSchema),
  rated: z.boolean(),
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
  rematch: z.strictObject({
    accepted: playerMap(z.boolean()),
    deadline: z.number().int().nonnegative().nullable(),
    declinedBy: playerIdSchema.nullable(),
  }),
  stonesSettlement: stonesSettlementSchema.nullable(),
});

export const seatObservationSchema = z.strictObject({
  // Private observations keep their v2 envelope during the compatibility
  // window; their payload is unchanged by the public Stones contract.
  protocolVersion: z.literal(LEGACY_PROTOCOL_VERSION),
  type: z.literal('seat.observation'),
  sequence: z.number().int().nonnegative(),
  playerId: playerIdSchema,
  ownHiddenChoice: z.number().int().min(0).max(3).optional(),
});

export const roomResumeTokenSchema = z.strictObject({
  protocolVersion: z.union([z.literal(LEGACY_PROTOCOL_VERSION), z.literal(PROTOCOL_VERSION)]),
  type: z.literal('room.resume-token'),
  connectionGeneration: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  token: z.string().regex(/^[A-Za-z0-9_-]{43,256}$/),
});

export const roomReactionSchema = z.strictObject({
  protocolVersion: z.union([z.literal(LEGACY_PROTOCOL_VERSION), z.literal(PROTOCOL_VERSION)]),
  type: z.literal('session.reaction'),
  expiresAt: z.number().int().nonnegative(),
  playerId: playerIdSchema,
  reaction: reactionSchema,
  sequence: z.number().int().nonnegative(),
});

export type RoomReaction = z.infer<typeof roomReactionSchema>;
export type RoomSnapshot = z.infer<typeof roomSnapshotSchema>;
export type RoomResumeToken = z.infer<typeof roomResumeTokenSchema>;
export type SeatObservation = z.infer<typeof seatObservationSchema>;
export type StonesClass = z.infer<typeof stoneClassSchema>;
export interface StonesSettlementReward {
  readonly kind: 'stone-hand' | 'stone-eye' | 'stone-heart';
  readonly occurrences: number;
  readonly stones: number;
}
export interface PlayerStonesSettlement {
  readonly baseDelta: number;
  readonly classAfter: StonesClass;
  readonly classBefore: StonesClass;
  readonly netDelta: number;
  readonly rewards: readonly StonesSettlementReward[];
  readonly stonesAfter: number;
  readonly stonesBefore: number;
}
export interface StonesSettlement {
  readonly players: Readonly<Record<PlayerId, PlayerStonesSettlement>>;
  readonly rated: boolean;
}

export interface PublicPlayer {
  readonly username: string;
  readonly avatarUrl: string | null;
  readonly connected: boolean;
  readonly stoneClass: StonesClass;
  readonly stones: number;
}

interface SnapshotPlayerContext {
  readonly username: string;
  readonly avatarUrl: string | null;
  readonly connected: boolean;
  readonly stoneClass?: StonesClass;
  readonly stones?: number;
}

export interface SnapshotContext {
  readonly roomId: string;
  readonly sequence: number;
  readonly serverNow: number;
  readonly actionDeadline: number | null;
  readonly rematch: {
    readonly accepted: Readonly<Record<PlayerId, boolean>>;
    readonly deadline: number | null;
    readonly declinedBy: PlayerId | null;
  };
  readonly sessionScore: Readonly<Record<PlayerId, number>>;
  readonly players: Readonly<Record<PlayerId, SnapshotPlayerContext>>;
  readonly ready: Readonly<Record<PlayerId, boolean>>;
  readonly stonesSettlement?: StonesSettlement | null;
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
    rematch: {
      accepted: { ...context.rematch.accepted },
      deadline: context.rematch.deadline,
      declinedBy: context.rematch.declinedBy,
    },
    stonesSettlement: context.stonesSettlement ?? null,
  });
}

export function createSeatObservation(
  state: GameState,
  playerId: PlayerId,
  sequence: number,
): SeatObservation {
  const ownHiddenChoice = state.round.hiddenChoices[playerId];
  return seatObservationSchema.parse({
    protocolVersion: LEGACY_PROTOCOL_VERSION,
    type: 'seat.observation',
    sequence,
    playerId,
    ...(ownHiddenChoice === undefined ? {} : { ownHiddenChoice }),
  });
}

function copyPlayerMap(
  players: Readonly<Record<PlayerId, SnapshotPlayerContext>>,
): Record<PlayerId, PublicPlayer> {
  const copyPlayer = (player: SnapshotPlayerContext): PublicPlayer => ({
    ...player,
    stoneClass: player.stoneClass ?? 'B',
    stones: player.stones ?? 0,
  });
  return {
    'player-one': copyPlayer(players['player-one']),
    'player-two': copyPlayer(players['player-two']),
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
