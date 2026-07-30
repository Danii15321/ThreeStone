import { describe, expect, it, vi } from 'vitest';

import { GameServerDrainController } from './game-server-drain-controller.js';
import { GameServerMetrics } from './game-server-metrics.js';
import { MAX_WEBSOCKET_PAYLOAD_BYTES, isWebSocketOriginAllowed } from './websocket-security.js';

describe('WebSocket security', () => {
  it('accepts only the configured browser origin and publishes a bounded frame size', () => {
    expect(
      isWebSocketOriginAllowed('https://three-stone.example', 'https://three-stone.example'),
    ).toBe(true);
    expect(
      isWebSocketOriginAllowed('https://attacker.example', 'https://three-stone.example'),
    ).toBe(false);
    expect(isWebSocketOriginAllowed(undefined, 'https://three-stone.example')).toBe(false);
    expect(MAX_WEBSOCKET_PAYLOAD_BYTES).toBe(2_048);
  });
});

describe('game-server drainage', () => {
  it('refuses new admissions then cancels active rooms after ten minutes', async () => {
    const scheduled: { delayMs: number; task: () => void }[] = [];
    const cancelOne = vi.fn(async () => undefined);
    const cancelTwo = vi.fn(async () => undefined);
    const controller = new GameServerDrainController({
      clock: () => 1_000,
      schedule(delayMs, task) {
        scheduled.push({ delayMs, task });
        return () => undefined;
      },
    });
    controller.registerRoom('room-one', cancelOne);
    controller.registerRoom('room-two', cancelTwo);

    expect(controller.start()).toEqual({
      acceptingAdmissions: false,
      activeRooms: 2,
      deadline: 601_000,
      state: 'draining',
    });
    expect(controller.acceptingAdmissions).toBe(false);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.delayMs).toBe(600_000);
    expect(cancelOne).not.toHaveBeenCalled();

    scheduled[0]?.task();
    await vi.waitFor(() => {
      expect(cancelOne).toHaveBeenCalledWith('server-draining');
      expect(cancelTwo).toHaveBeenCalledWith('server-draining');
      expect(controller.status()).toMatchObject({
        acceptingAdmissions: false,
        activeRooms: 0,
        state: 'drained',
      });
    });
  });

  it('immediately cancels a room registered after drainage started', async () => {
    const cancel = vi.fn(async () => undefined);
    const controller = new GameServerDrainController({
      clock: () => 1_000,
      schedule: () => () => undefined,
    });
    controller.start();

    controller.registerRoom('late-room', cancel);

    await vi.waitFor(() => expect(cancel).toHaveBeenCalledWith('server-draining'));
    expect(controller.status().activeRooms).toBe(0);
  });
});

describe('privacy-safe multiplayer metrics', () => {
  it('keeps only bounded counters and command latency aggregates', () => {
    const metrics = new GameServerMetrics();
    metrics.roomCreated();
    metrics.roomJoined();
    metrics.connectionOpened();
    metrics.resumeSucceeded();
    metrics.commandAccepted(25);
    metrics.commandAccepted(75);
    metrics.matchFinished('abandon');
    metrics.connectionClosed();

    const snapshot = metrics.snapshot();

    expect(snapshot).toMatchObject({
      activeConnections: 0,
      commandAcceptance: { count: 2, p95Ms: 75 },
      matchesAbandoned: 1,
      roomsCreated: 1,
      roomsFinished: 1,
      roomsJoined: 1,
      resumesSucceeded: 1,
    });
    expect(JSON.stringify(snapshot)).not.toMatch(
      /roomId|userId|ticket|token|invite|hidden|choice|username|bio/i,
    );
  });
});
