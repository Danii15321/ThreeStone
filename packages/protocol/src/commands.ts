import { z } from 'zod';

export const PROTOCOL_VERSION = 2 as const;
export const MAX_CLIENT_MESSAGE_BYTES = 1_024;

const commandIdSchema = z.string().min(8).max(128);
const roomIdSchema = z.string().min(8).max(128);
const sequenceSchema = z.number().int().nonnegative();

const envelope = {
  protocolVersion: z.literal(PROTOCOL_VERSION),
  commandId: commandIdSchema,
  roomId: roomIdSchema,
  knownSequence: sequenceSchema,
};

export const reactionSchema = z.enum(['well-played', 'nice-bluff', 'oops', 'rematch']);

export const clientCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...envelope,
    type: z.literal('room.ready'),
    payload: z.strictObject({ ready: z.boolean() }),
  }),
  z.strictObject({
    ...envelope,
    type: z.literal('round.choose'),
    payload: z.strictObject({ count: z.number().int().min(0).max(3) }),
  }),
  z.strictObject({
    ...envelope,
    type: z.literal('round.predict'),
    payload: z.strictObject({ value: z.number().int().min(0).max(6) }),
  }),
  z.strictObject({
    ...envelope,
    type: z.literal('match.abandon'),
    payload: z.strictObject({}),
  }),
  z.strictObject({
    ...envelope,
    type: z.literal('session.rematch'),
    payload: z.strictObject({ accept: z.boolean() }),
  }),
  z.strictObject({
    ...envelope,
    type: z.literal('session.react'),
    payload: z.strictObject({ reaction: reactionSchema }),
  }),
]);

export type ClientCommand = z.infer<typeof clientCommandSchema>;
export type Reaction = z.infer<typeof reactionSchema>;

export const commandErrorCodeSchema = z.enum([
  'COMMAND_INVALID',
  'COMMAND_TOO_LARGE',
  'COMMAND_ID_REUSED',
  'SEQUENCE_STALE',
  'WRONG_PHASE',
  'NOT_YOUR_TURN',
  'VALUE_INVALID',
  'RATE_LIMITED',
  'PROTOCOL_INCOMPATIBLE',
  'ROOM_UNAVAILABLE',
]);

export const commandAcceptedSchema = z.strictObject({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  type: z.literal('command.accepted'),
  commandId: commandIdSchema,
  sequence: sequenceSchema,
});

export const commandRejectedSchema = z.strictObject({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  type: z.literal('command.rejected'),
  commandId: commandIdSchema,
  sequence: sequenceSchema,
  error: z.strictObject({
    code: commandErrorCodeSchema,
    recoverable: z.boolean(),
  }),
});

export type CommandAccepted = z.infer<typeof commandAcceptedSchema>;
export type CommandRejected = z.infer<typeof commandRejectedSchema>;
export type CommandErrorCode = z.infer<typeof commandErrorCodeSchema>;

export function createCommandAccepted(commandId: string, sequence: number): CommandAccepted {
  return commandAcceptedSchema.parse({
    protocolVersion: PROTOCOL_VERSION,
    type: 'command.accepted',
    commandId,
    sequence,
  });
}

export function createCommandRejected(
  commandId: string,
  sequence: number,
  code: CommandErrorCode,
  recoverable: boolean,
): CommandRejected {
  return commandRejectedSchema.parse({
    protocolVersion: PROTOCOL_VERSION,
    type: 'command.rejected',
    commandId,
    sequence,
    error: { code, recoverable },
  });
}

export function parseClientCommand(input: unknown): ClientCommand {
  const serialized = typeof input === 'string' ? input : JSON.stringify(input);
  if (new TextEncoder().encode(serialized).byteLength > MAX_CLIENT_MESSAGE_BYTES) {
    throw new RangeError('Client command exceeds the protocol size budget.');
  }
  return clientCommandSchema.parse(typeof input === 'string' ? JSON.parse(input) : input);
}
