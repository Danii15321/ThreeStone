import { describe, expect, it } from 'vitest';

import { HmacAdmissionTicketVerifier, issueAdmissionTicket } from '@three-stone/protocol/node';

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
