import { z } from 'zod';

export const multiplayerInviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);

export const joinMultiplayerRoomRequestSchema = z.strictObject({
  code: multiplayerInviteCodeSchema,
});

const multiplayerAdmissionSchema = z.strictObject({
  gameServerUrl: z.url(),
  playerId: z.enum(['player-one', 'player-two']),
  roomId: z.uuid(),
  ticket: z.string().min(32).max(4_096),
  ticketExpiresAt: z.iso.datetime(),
});

export const createMultiplayerRoomResponseSchema = multiplayerAdmissionSchema.extend({
  inviteCode: multiplayerInviteCodeSchema,
});

export const joinMultiplayerRoomResponseSchema = multiplayerAdmissionSchema;

export type CreateMultiplayerRoomResponse = z.infer<typeof createMultiplayerRoomResponseSchema>;
export type JoinMultiplayerRoomRequest = z.infer<typeof joinMultiplayerRoomRequestSchema>;
export type JoinMultiplayerRoomResponse = z.infer<typeof joinMultiplayerRoomResponseSchema>;
