import { timingSafeEqual } from 'node:crypto';

import { matchMaker } from '@colyseus/core';
import express from 'express';
import type { Application, Response } from 'express';
import { z } from 'zod';

import type { AdmissionRegistry, AdmissionReservation } from './admission-registry.js';
import type { GameServerDrainController } from './game-server-drain-controller.js';
import type { GameServerMetrics } from './game-server-metrics.js';
const GAME_ROOM_TYPE = 'three_stone';

const createRoomRequestSchema = z.strictObject({
  creatorUserId: z.string().min(1).max(128),
  gameId: z.uuid(),
  inviteCodeHash: z.string().regex(/^[a-f0-9]{64}$/),
  leaseExpiresAt: z.number().int().positive(),
  leaseToken: z.string().min(16).max(256),
  roomId: z.uuid(),
  seed: z.number().int().safe(),
});

const reserveSeatRequestSchema = z.strictObject({
  inviteCodeHash: z.string().regex(/^[a-f0-9]{64}$/),
  leaseExpiresAt: z.number().int().positive(),
  leaseToken: z.string().min(16).max(256),
  userId: z.string().min(1).max(128),
});

const refreshSeatRequestSchema = z.strictObject({
  roomId: z.uuid(),
  userId: z.string().min(1).max(128),
});

const releaseSeatRequestSchema = refreshSeatRequestSchema.extend({
  reservationId: z.string().min(8).max(128),
});

export interface InternalAdmissionHttpOptions {
  readonly drainController?: GameServerDrainController;
  readonly metrics?: GameServerMetrics;
  readonly registry: AdmissionRegistry;
  readonly secret: string;
  readonly createRoom?: (
    roomType: string,
    options: Record<string, unknown>,
  ) => Promise<{ readonly roomId: string }>;
  readonly disposeRoom?: (roomId: string) => Promise<void>;
}

export function configureInternalAdmissionHttp(
  app: Application,
  options: InternalAdmissionHttpOptions,
): void {
  const createRoom = options.createRoom ?? matchMaker.createRoom;
  app.use('/internal/v1', express.json({ limit: '8kb', strict: true }));
  app.use('/internal/v1', (request, response, next) => {
    const supplied = request.header('x-game-server-secret');
    if (supplied === undefined || !secretMatches(supplied, options.secret)) {
      response.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }
    next();
  });

  app.get('/internal/v1/metrics', (_request, response) => {
    response.status(200).json(options.metrics?.snapshot() ?? {});
  });
  app.get('/internal/v1/drain', (_request, response) => {
    response.status(200).json(
      options.drainController?.status() ?? {
        acceptingAdmissions: true,
        activeRooms: 0,
        deadline: null,
        state: 'accepting',
      },
    );
  });
  app.post('/internal/v1/drain', (_request, response) => {
    response.status(202).json(
      options.drainController?.start() ?? {
        acceptingAdmissions: true,
        activeRooms: 0,
        deadline: null,
        state: 'accepting',
      },
    );
  });

  app.post('/internal/v1/rooms', async (request, response) => {
    if (isDraining(options)) {
      draining(response);
      return;
    }
    const parsed = createRoomRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(422).json({ error: 'INVALID_REQUEST' });
      return;
    }
    const reservation = options.registry.create(parsed.data);
    if (reservation === null) {
      roomUnavailable(response);
      return;
    }
    try {
      const created = await createRoom(GAME_ROOM_TYPE, {
        gameId: parsed.data.gameId,
        roomId: parsed.data.roomId,
        seed: parsed.data.seed,
      });
      if (created.roomId !== parsed.data.roomId) {
        throw new Error('The created room id differs from its reservation.');
      }
      options.metrics?.roomCreated();
      response.status(201).json(reservation);
    } catch {
      options.registry.releaseSeat({
        reservationId: reservation.reservationId,
        roomId: reservation.roomId,
        userId: parsed.data.creatorUserId,
      });
      response.status(503).json({ error: 'ROOM_UNAVAILABLE' });
    }
  });

  app.post('/internal/v1/rooms/reserve', (request, response) => {
    if (isDraining(options)) {
      draining(response);
      return;
    }
    const parsed = reserveSeatRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(422).json({ error: 'INVALID_REQUEST' });
      return;
    }
    const reservation = options.registry.reserveByCode(parsed.data);
    if (reservation !== null) {
      options.metrics?.roomJoined();
    }
    sendReservation(response, reservation);
  });

  app.post('/internal/v1/rooms/refresh', (request, response) => {
    const parsed = refreshSeatRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(422).json({ error: 'INVALID_REQUEST' });
      return;
    }
    sendReservation(response, options.registry.refreshSeat(parsed.data.roomId, parsed.data.userId));
  });

  app.post('/internal/v1/rooms/release', async (request, response) => {
    const parsed = releaseSeatRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(422).json({ error: 'INVALID_REQUEST' });
      return;
    }
    const released = options.registry.releaseSeat(parsed.data);
    if (released.roomRemoved && options.disposeRoom !== undefined) {
      await options.disposeRoom(parsed.data.roomId);
    }
    response.status(204).end();
  });
}

function sendReservation(response: Response, reservation: AdmissionReservation | null): void {
  if (reservation === null) {
    roomUnavailable(response);
    return;
  }
  response.status(200).json(reservation);
}

function roomUnavailable(response: Response): void {
  response.status(409).json({ error: 'ROOM_UNAVAILABLE' });
}

function isDraining(options: InternalAdmissionHttpOptions): boolean {
  return options.drainController?.acceptingAdmissions === false;
}

function draining(response: Response): void {
  response.status(503).json({ error: 'DRAINING' });
}

function secretMatches(supplied: string, expected: string): boolean {
  const suppliedBytes = Buffer.from(supplied, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return (
    suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes)
  );
}
