import { createHash } from 'node:crypto';

import {
  createMultiplayerRoomResponseSchema,
  joinMultiplayerRoomResponseSchema,
  type AccountMetadata,
  type CreateMultiplayerRoomResponse,
  type JoinMultiplayerRoomResponse,
} from '@three-stone/api-contracts';
import { issueAdmissionTicket, type AdmissionTicketClaims } from '@three-stone/protocol/node';

const TICKET_LIFETIME_MS = 45_000;
const LEASE_LIFETIME_MS = 120_000;

export interface MultiplayerLeaseGateway {
  acquire(input: {
    readonly expiresAt: Date;
    readonly leaseTokenHash: string;
    readonly now: Date;
    readonly roomId: string;
    readonly serverInstanceId: string;
    readonly userId: string;
  }): Promise<'acquired' | 'existing' | 'conflict'>;
  findActive(userId: string, now: Date): Promise<{ readonly roomId: string } | null>;
  release(userId: string, roomId: string, leaseTokenHash: string): Promise<boolean>;
}

export interface SeatReservation {
  readonly connectionGeneration: number;
  readonly playerId: 'player-one' | 'player-two';
  readonly reservationId: string;
  readonly roomId: string;
  readonly serverInstanceId: string;
}

export interface GameServerAdmissionGateway {
  createRoom(input: {
    readonly creatorUserId: string;
    readonly gameId: string;
    readonly inviteCodeHash: string;
    readonly leaseExpiresAt: number;
    readonly leaseToken: string;
    readonly roomId: string;
    readonly seed: number;
  }): Promise<SeatReservation | null>;
  reserveSeat(input: {
    readonly inviteCodeHash: string;
    readonly leaseExpiresAt: number;
    readonly leaseToken: string;
    readonly userId: string;
  }): Promise<SeatReservation | null>;
  refreshSeat(input: {
    readonly roomId: string;
    readonly userId: string;
  }): Promise<SeatReservation | null>;
  releaseSeat(input: {
    readonly reservationId: string;
    readonly roomId: string;
    readonly userId: string;
  }): Promise<void>;
}

export interface MultiplayerAdmissionDependencies {
  readonly clock: () => Date;
  readonly createInviteCode: () => string;
  readonly createLeaseToken: () => string;
  readonly createUuid: () => string;
  readonly gameServer: GameServerAdmissionGateway;
  readonly gameServerUrl: string;
  readonly leases: MultiplayerLeaseGateway;
  readonly serverInstanceId: string;
  readonly ticketSecret: string;
}

export class RoomUnavailableError extends Error {
  constructor() {
    super('Impossible de rejoindre ce salon');
    this.name = 'RoomUnavailableError';
  }
}

export class MultiplayerAdmissionService {
  constructor(private readonly dependencies: MultiplayerAdmissionDependencies) {}

  async create(account: AccountMetadata): Promise<CreateMultiplayerRoomResponse> {
    const now = this.dependencies.clock();
    const roomId = this.dependencies.createUuid();
    const gameId = this.dependencies.createUuid();
    const inviteCode = this.dependencies.createInviteCode();
    const leaseToken = this.dependencies.createLeaseToken();
    const leaseTokenHash = hashSecret(leaseToken);
    const leaseExpiresAt = new Date(now.getTime() + LEASE_LIFETIME_MS);
    const lease = await this.dependencies.leases.acquire({
      expiresAt: leaseExpiresAt,
      leaseTokenHash,
      now,
      roomId,
      serverInstanceId: this.dependencies.serverInstanceId,
      userId: account.id,
    });
    if (lease !== 'acquired') {
      throw new RoomUnavailableError();
    }

    try {
      const reservation = await this.dependencies.gameServer.createRoom({
        creatorUserId: account.id,
        gameId,
        inviteCodeHash: hashInviteCode(inviteCode),
        leaseExpiresAt: leaseExpiresAt.getTime(),
        leaseToken,
        roomId,
        seed: seedFromUuid(gameId),
      });
      if (!this.isUsableReservation(reservation, roomId)) {
        throw new RoomUnavailableError();
      }
      return createMultiplayerRoomResponseSchema.parse({
        ...this.issueAdmission(account, reservation, now),
        inviteCode,
      });
    } catch {
      await this.dependencies.leases.release(account.id, roomId, leaseTokenHash);
      throw new RoomUnavailableError();
    }
  }

  async join(account: AccountMetadata, inviteCode: string): Promise<JoinMultiplayerRoomResponse> {
    const now = this.dependencies.clock();
    const leaseToken = this.dependencies.createLeaseToken();
    const leaseTokenHash = hashSecret(leaseToken);
    const leaseExpiresAt = new Date(now.getTime() + LEASE_LIFETIME_MS);
    const reservation = await this.dependencies.gameServer.reserveSeat({
      inviteCodeHash: hashInviteCode(inviteCode),
      leaseExpiresAt: leaseExpiresAt.getTime(),
      leaseToken,
      userId: account.id,
    });
    if (!this.isUsableReservation(reservation)) {
      throw new RoomUnavailableError();
    }

    try {
      const lease = await this.dependencies.leases.acquire({
        expiresAt: leaseExpiresAt,
        leaseTokenHash,
        now,
        roomId: reservation.roomId,
        serverInstanceId: this.dependencies.serverInstanceId,
        userId: account.id,
      });
      if (lease === 'conflict') {
        throw new RoomUnavailableError();
      }
    } catch {
      await this.dependencies.gameServer.releaseSeat({
        reservationId: reservation.reservationId,
        roomId: reservation.roomId,
        userId: account.id,
      });
      throw new RoomUnavailableError();
    }
    return joinMultiplayerRoomResponseSchema.parse(this.issueAdmission(account, reservation, now));
  }

  async refresh(account: AccountMetadata, roomId: string): Promise<JoinMultiplayerRoomResponse> {
    const now = this.dependencies.clock();
    const activeLease = await this.dependencies.leases.findActive(account.id, now);
    if (activeLease?.roomId !== roomId) {
      throw new RoomUnavailableError();
    }
    const reservation = await this.dependencies.gameServer.refreshSeat({
      roomId,
      userId: account.id,
    });
    if (!this.isUsableReservation(reservation, roomId)) {
      throw new RoomUnavailableError();
    }
    return joinMultiplayerRoomResponseSchema.parse(this.issueAdmission(account, reservation, now));
  }

  private issueAdmission(
    account: AccountMetadata,
    reservation: SeatReservation,
    now: Date,
  ): JoinMultiplayerRoomResponse {
    const expiresAt = now.getTime() + TICKET_LIFETIME_MS;
    const claims: AdmissionTicketClaims = {
      avatarUrl: account.image,
      connectionGeneration: reservation.connectionGeneration,
      expiresAt,
      issuedAt: now.getTime(),
      jti: this.dependencies.createUuid(),
      playerId: reservation.playerId,
      roomId: reservation.roomId,
      userId: account.id,
      username: account.displayUsername,
    };
    return {
      gameServerUrl: this.dependencies.gameServerUrl,
      playerId: reservation.playerId,
      roomId: reservation.roomId,
      ticket: issueAdmissionTicket(claims, this.dependencies.ticketSecret),
      ticketExpiresAt: new Date(expiresAt).toISOString(),
    };
  }

  private isUsableReservation(
    reservation: SeatReservation | null,
    expectedRoomId?: string,
  ): reservation is SeatReservation {
    return (
      reservation !== null &&
      reservation.serverInstanceId === this.dependencies.serverInstanceId &&
      (expectedRoomId === undefined || reservation.roomId === expectedRoomId)
    );
  }
}

function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

function hashInviteCode(value: string): string {
  return createHash('sha256').update(value.trim().toUpperCase()).digest('hex');
}

function seedFromUuid(uuid: string): number {
  return Number.parseInt(createHash('sha256').update(uuid).digest('hex').slice(0, 12), 16);
}
