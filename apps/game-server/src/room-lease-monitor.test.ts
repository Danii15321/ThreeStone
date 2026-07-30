import { describe, expect, it, vi } from 'vitest';

import { RoomLeaseMonitor } from './room-lease-monitor.js';

const NOW = 1_775_000_000_000;
const ROOM_ID = 'a4e97166-e9e0-49cf-8812-96be1f59687a';

function setup() {
  let now = NOW;
  const expireRoom = vi.fn(() => true);
  const renewLease = vi.fn(() => true);
  const registry = {
    expireRoom,
    getLeaseCredentials: () => [
      {
        expiresAt: NOW + 60_000,
        leaseToken: 'private-lease-token',
        userId: 'user-one',
      },
    ],
    renewLease,
  };
  const renew = vi.fn(
    async (input: {
      readonly expiresAt: Date;
      readonly leaseTokenHash: string;
      readonly now: Date;
      readonly roomId: string;
      readonly userId: string;
    }) => {
      void input;
      return true;
    },
  );
  const monitor = new RoomLeaseMonitor({
    clock: () => now,
    leaseLifetimeMs: 120_000,
    registry,
    repository: { renew },
  });
  return {
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
    expireRoom,
    monitor,
    renew,
    renewLease,
  };
}

describe('RoomLeaseMonitor', () => {
  it('renews every credential and advances the registry expiry', async () => {
    const { monitor, renew, renewLease } = setup();

    await expect(monitor.check(ROOM_ID)).resolves.toBe('healthy');

    expect(renew).toHaveBeenCalledWith(
      expect.objectContaining({
        expiresAt: new Date(NOW + 120_000),
        roomId: ROOM_ID,
        userId: 'user-one',
      }),
    );
    expect(renew.mock.calls[0]?.[0].leaseTokenHash).not.toContain('private-lease-token');
    expect(renewLease).toHaveBeenCalledWith(
      ROOM_ID,
      'user-one',
      'private-lease-token',
      NOW + 120_000,
    );
  });

  it('tolerates a database outage only until the last proven lease expiry', async () => {
    const { advance, expireRoom, monitor, renew } = setup();
    renew.mockRejectedValue(new Error('database unavailable'));

    await expect(monitor.check(ROOM_ID)).resolves.toBe('unavailable');
    expect(expireRoom).not.toHaveBeenCalled();

    advance(60_000);
    await expect(monitor.check(ROOM_ID)).resolves.toBe('lost');
    expect(expireRoom).toHaveBeenCalledWith(ROOM_ID);
  });

  it('marks a room lost immediately when PostgreSQL refuses one credential', async () => {
    const { expireRoom, monitor, renew } = setup();
    renew.mockResolvedValue(false);

    await expect(monitor.check(ROOM_ID)).resolves.toBe('lost');
    expect(expireRoom).toHaveBeenCalledWith(ROOM_ID);
  });
});
