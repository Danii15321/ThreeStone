import { describe, expect, it } from 'vitest';

import {
  HmacAdmissionTicketVerifier,
  MAX_ADMISSION_TICKET_BYTES,
  issueAdmissionTicket,
} from '@three-stone/protocol/node';

const SECRET = 'development-test-secret-with-at-least-thirty-two-bytes';
const ROOM_ID = '7d34b06c-02a8-40e3-86ca-24e81cd0ff19';
const NOW = 1_775_000_000_000;

function claims() {
  return {
    avatarUrl: null,
    connectionGeneration: 1,
    expiresAt: NOW + 45_000,
    issuedAt: NOW,
    jti: 'once-only-ticket-id',
    playerId: 'player-one' as const,
    roomId: ROOM_ID,
    userId: 'user-one',
    username: 'Astrid',
  };
}

describe('multiplayer admission ticket', () => {
  it('rejects oversized tickets before attempting to decode them', async () => {
    const verifier = new HmacAdmissionTicketVerifier(SECRET, () => NOW);

    expect(MAX_ADMISSION_TICKET_BYTES).toBe(2_048);
    await expect(
      verifier.verify('x'.repeat(MAX_ADMISSION_TICKET_BYTES + 1), ROOM_ID),
    ).resolves.toBe(null);
  });

  it('binds the signed payload to the room admission action', () => {
    const ticket = issueAdmissionTicket(claims(), SECRET);
    const encodedPayload = ticket.split('.')[0] ?? '';
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));

    expect(payload).toMatchObject({
      action: 'join-room',
      purpose: 'multiplayer-admission',
      roomId: ROOM_ID,
    });
  });

  it('is bound to one room, expires and is consumed exactly once', async () => {
    const verifier = new HmacAdmissionTicketVerifier(SECRET, () => NOW);
    const ticket = issueAdmissionTicket(claims(), SECRET);

    await expect(verifier.verify(ticket, ROOM_ID)).resolves.toMatchObject({
      userId: 'user-one',
      playerId: 'player-one',
    });
    await expect(verifier.verify(ticket, ROOM_ID)).resolves.toBeNull();

    const wrongRoomVerifier = new HmacAdmissionTicketVerifier(SECRET, () => NOW);
    await expect(wrongRoomVerifier.verify(ticket, 'another-room-id')).resolves.toBeNull();
    const expiredVerifier = new HmacAdmissionTicketVerifier(SECRET, () => NOW + 45_001);
    await expect(expiredVerifier.verify(ticket, ROOM_ID)).resolves.toBeNull();
  });

  it('rejects an altered signature without revealing ticket details', async () => {
    const verifier = new HmacAdmissionTicketVerifier(SECRET, () => NOW);
    const ticket = issueAdmissionTicket(claims(), SECRET);
    const altered = `${ticket.slice(0, -1)}${ticket.endsWith('a') ? 'b' : 'a'}`;

    await expect(verifier.verify(altered, ROOM_ID)).resolves.toBeNull();
  });
});
