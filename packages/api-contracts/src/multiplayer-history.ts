import { z } from 'zod';

const seatSchema = z.enum(['player-one', 'player-two']);
const reserveSchema = z.number().int().min(0).max(3);
const valueSchema = z.number().int().min(0).max(6);
const seatMap = <T extends z.ZodType>(value: T) =>
  z.strictObject({
    'player-one': value,
    'player-two': value,
  });

const activeParticipantSchema = z.strictObject({
  deleted: z.literal(false),
  displayName: z.string().min(1).max(32),
  finalReserve: reserveSchema,
  outcome: z.enum(['win', 'loss']),
});

const deletedParticipantSchema = z.strictObject({
  deleted: z.literal(true),
  displayName: z.literal('Joueur supprimé'),
  finalReserve: reserveSchema,
  outcome: z.enum(['win', 'loss']),
});

export const multiplayerHistoryParticipantSchema = z.discriminatedUnion('deleted', [
  activeParticipantSchema,
  deletedParticipantSchema,
]);

export const multiplayerRoundSummarySchema = z
  .strictObject({
    choices: seatMap(reserveSchema),
    initiative: seatSchema,
    predictions: seatMap(valueSchema),
    reservesAfter: seatMap(reserveSchema),
    roundNumber: z.number().int().positive(),
    total: valueSchema,
    winner: seatSchema.nullable(),
  })
  .superRefine((round, context) => {
    if (round.total !== round.choices['player-one'] + round.choices['player-two']) {
      context.addIssue({
        code: 'custom',
        message: 'The round total must equal both revealed choices.',
        path: ['total'],
      });
    }
    if (round.predictions['player-one'] === round.predictions['player-two']) {
      context.addIssue({
        code: 'custom',
        message: 'Both predictions must be distinct.',
        path: ['predictions'],
      });
    }
  });

export const multiplayerGameSummarySchema = z.strictObject({
  completedAt: z.iso.datetime(),
  gameId: z.uuid(),
  initialInitiative: seatSchema,
  localSeat: seatSchema,
  participants: seatMap(multiplayerHistoryParticipantSchema),
  protocolVersion: z.number().int().positive(),
  rounds: z.array(multiplayerRoundSummarySchema).max(10_000),
  rulesVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  seed: z.number().int().safe(),
  terminalReason: z.enum([
    'reserve-empty',
    'hidden-choice-timeout',
    'prediction-timeout',
    'abandon',
    'disconnect',
  ]),
  winner: seatSchema,
});

export const multiplayerGameHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().min(0).default(0),
});

export const multiplayerGameHistorySchema = z.strictObject({
  items: z.array(multiplayerGameSummarySchema),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export type MultiplayerGameHistory = z.infer<typeof multiplayerGameHistorySchema>;
export type MultiplayerGameHistoryQuery = z.infer<typeof multiplayerGameHistoryQuerySchema>;
export type MultiplayerGameSummary = z.infer<typeof multiplayerGameSummarySchema>;
export type MultiplayerHistoryParticipant = z.infer<typeof multiplayerHistoryParticipantSchema>;
export type MultiplayerRoundSummary = z.infer<typeof multiplayerRoundSummarySchema>;
