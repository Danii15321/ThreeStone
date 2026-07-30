import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { PROTOCOL_VERSION } from '../commands.js';

const MAX_TICKET_LIFETIME_MS = 45_000;
const MAX_CLOCK_SKEW_MS = 5_000;
const MIN_SECRET_BYTES = 32;

const admissionTicketPayloadSchema = z.strictObject({
  avatarUrl: z.string().max(2_048).nullable(),
  connectionGeneration: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  issuedAt: z.number().int().positive(),
  jti: z.string().min(8).max(128),
  playerId: z.enum(['player-one', 'player-two']),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  purpose: z.literal('multiplayer-admission'),
  roomId: z.string().min(8).max(128),
  userId: z.string().min(1).max(128),
  username: z.string().min(1).max(32),
});

export interface AdmissionTicketClaims {
  readonly avatarUrl: string | null;
  readonly connectionGeneration: number;
  readonly expiresAt: number;
  readonly issuedAt: number;
  readonly jti: string;
  readonly playerId: 'player-one' | 'player-two';
  readonly roomId: string;
  readonly userId: string;
  readonly username: string;
}

export interface AdmissionTicketVerifier {
  verify(ticket: string, expectedRoomId: string): Promise<AdmissionTicketClaims | null>;
}

export function issueAdmissionTicket(claims: AdmissionTicketClaims, secret: string): string {
  assertSecret(secret);
  const payload = admissionTicketPayloadSchema.parse({
    ...claims,
    protocolVersion: PROTOCOL_VERSION,
    purpose: 'multiplayer-admission',
  });
  if (
    payload.expiresAt <= payload.issuedAt ||
    payload.expiresAt - payload.issuedAt > MAX_TICKET_LIFETIME_MS
  ) {
    throw new RangeError('An admission ticket lifetime must be between 1 ms and 45 seconds.');
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export class HmacAdmissionTicketVerifier implements AdmissionTicketVerifier {
  private readonly consumed = new Map<string, number>();

  constructor(
    private readonly secret: string,
    private readonly now: () => number = Date.now,
  ) {
    assertSecret(secret);
  }

  async verify(ticket: string, expectedRoomId: string): Promise<AdmissionTicketClaims | null> {
    const now = this.now();
    this.deleteExpiredConsumedIds(now);
    const [encodedPayload, signature, extra] = ticket.split('.');
    if (
      encodedPayload === undefined ||
      signature === undefined ||
      extra !== undefined ||
      !signatureMatches(encodedPayload, signature, this.secret)
    ) {
      return null;
    }

    try {
      const parsed = admissionTicketPayloadSchema.safeParse(
        JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')),
      );
      if (!parsed.success) {
        return null;
      }
      const payload = parsed.data;
      if (
        payload.roomId !== expectedRoomId ||
        payload.expiresAt <= now ||
        payload.issuedAt > now + MAX_CLOCK_SKEW_MS ||
        payload.expiresAt - payload.issuedAt > MAX_TICKET_LIFETIME_MS ||
        this.consumed.has(payload.jti)
      ) {
        return null;
      }
      this.consumed.set(payload.jti, payload.expiresAt);
      return {
        avatarUrl: payload.avatarUrl,
        connectionGeneration: payload.connectionGeneration,
        expiresAt: payload.expiresAt,
        issuedAt: payload.issuedAt,
        jti: payload.jti,
        playerId: payload.playerId,
        roomId: payload.roomId,
        userId: payload.userId,
        username: payload.username,
      };
    } catch {
      return null;
    }
  }

  private deleteExpiredConsumedIds(now: number): void {
    for (const [jti, expiresAt] of this.consumed) {
      if (expiresAt <= now) {
        this.consumed.delete(jti);
      }
    }
  }
}

function assertSecret(secret: string): void {
  if (Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES) {
    throw new RangeError('The multiplayer ticket secret must contain at least 32 bytes.');
  }
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function signatureMatches(encodedPayload: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(sign(encodedPayload, secret), 'utf8');
  const received = Buffer.from(signature, 'utf8');
  return expected.length === received.length && timingSafeEqual(expected, received);
}
