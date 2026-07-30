export type MultiplayerSeat = 'player-one' | 'player-two';

export interface AdmissionReservation {
  readonly connectionGeneration: number;
  readonly playerId: MultiplayerSeat;
  readonly reservationId: string;
  readonly roomId: string;
  readonly serverInstanceId: string;
}

export interface AdmissionRegistryOptions {
  readonly clock: () => number;
  readonly createReservationId: () => string;
  readonly firstSeat: () => MultiplayerSeat;
  readonly serverInstanceId: string;
  readonly waitingRoomLifetimeMs: number;
}

interface SeatRecord {
  connectionGeneration: number;
  readonly leaseToken: string;
  readonly playerId: MultiplayerSeat;
  readonly reservationId: string;
  readonly userId: string;
}

interface RoomRecord {
  readonly creatorUserId: string;
  readonly gameId: string;
  readonly inviteCodeHash: string;
  waitingExpiresAt: number;
  readonly roomId: string;
  readonly seats: Map<MultiplayerSeat, SeatRecord>;
}

export class AdmissionRegistry {
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly roomIdByCodeHash = new Map<string, string>();

  constructor(private readonly options: AdmissionRegistryOptions) {
    if (options.waitingRoomLifetimeMs <= 0) {
      throw new RangeError('A waiting room lifetime must be positive.');
    }
  }

  create(input: {
    readonly creatorUserId: string;
    readonly gameId: string;
    readonly inviteCodeHash: string;
    readonly leaseToken: string;
    readonly roomId: string;
  }): AdmissionReservation | null {
    this.pruneExpiredWaitingRooms();
    if (this.rooms.has(input.roomId) || this.roomIdByCodeHash.has(input.inviteCodeHash)) {
      return null;
    }
    const playerId = this.options.firstSeat();
    const seat = this.createSeat(input.creatorUserId, playerId, input.leaseToken);
    const room: RoomRecord = {
      creatorUserId: input.creatorUserId,
      gameId: input.gameId,
      inviteCodeHash: input.inviteCodeHash,
      roomId: input.roomId,
      seats: new Map([[playerId, seat]]),
      waitingExpiresAt: this.options.clock() + this.options.waitingRoomLifetimeMs,
    };
    this.rooms.set(input.roomId, room);
    this.roomIdByCodeHash.set(input.inviteCodeHash, input.roomId);
    return this.publicReservation(input.roomId, seat);
  }

  reserveByCode(input: {
    readonly inviteCodeHash: string;
    readonly leaseToken: string;
    readonly userId: string;
  }): AdmissionReservation | null {
    this.pruneExpiredWaitingRooms();
    const roomId = this.roomIdByCodeHash.get(input.inviteCodeHash);
    const room = roomId === undefined ? undefined : this.rooms.get(roomId);
    if (room === undefined || room.waitingExpiresAt <= this.options.clock()) {
      return null;
    }
    const existing = findSeatByUserId(room, input.userId);
    if (existing !== null) {
      existing.connectionGeneration += 1;
      return this.publicReservation(room.roomId, existing);
    }
    if (room.seats.size >= 2) {
      return null;
    }
    const playerId: MultiplayerSeat = room.seats.has('player-one') ? 'player-two' : 'player-one';
    const seat = this.createSeat(input.userId, playerId, input.leaseToken);
    room.seats.set(playerId, seat);
    this.roomIdByCodeHash.delete(room.inviteCodeHash);
    return this.publicReservation(room.roomId, seat);
  }

  refreshSeat(roomId: string, userId: string): AdmissionReservation | null {
    this.pruneExpiredWaitingRooms();
    const room = this.rooms.get(roomId);
    const seat = room === undefined ? null : findSeatByUserId(room, userId);
    if (seat === null) {
      return null;
    }
    seat.connectionGeneration += 1;
    return this.publicReservation(roomId, seat);
  }

  releaseSeat(input: {
    readonly reservationId: string;
    readonly roomId: string;
    readonly userId: string;
  }): { readonly released: boolean; readonly roomRemoved: boolean } {
    const room = this.rooms.get(input.roomId);
    const seat = room === undefined ? null : findSeatByUserId(room, input.userId);
    if (room === undefined || seat === null || seat.reservationId !== input.reservationId) {
      return { released: false, roomRemoved: false };
    }
    if (room.creatorUserId === input.userId) {
      this.deleteRoom(room);
      return { released: true, roomRemoved: true };
    }
    room.seats.delete(seat.playerId);
    room.waitingExpiresAt = this.options.clock() + this.options.waitingRoomLifetimeMs;
    this.roomIdByCodeHash.set(room.inviteCodeHash, room.roomId);
    return { released: true, roomRemoved: false };
  }

  getLeaseCredentials(
    roomId: string,
  ): readonly { readonly leaseToken: string; readonly userId: string }[] {
    const room = this.rooms.get(roomId);
    return room === undefined
      ? []
      : [...room.seats.values()].map((seat) => ({
          leaseToken: seat.leaseToken,
          userId: seat.userId,
        }));
  }

  private createSeat(userId: string, playerId: MultiplayerSeat, leaseToken: string): SeatRecord {
    return {
      connectionGeneration: 1,
      leaseToken,
      playerId,
      reservationId: this.options.createReservationId(),
      userId,
    };
  }

  private publicReservation(roomId: string, seat: SeatRecord): AdmissionReservation {
    return {
      connectionGeneration: seat.connectionGeneration,
      playerId: seat.playerId,
      reservationId: seat.reservationId,
      roomId,
      serverInstanceId: this.options.serverInstanceId,
    };
  }

  private pruneExpiredWaitingRooms(): void {
    const now = this.options.clock();
    for (const room of this.rooms.values()) {
      if (room.seats.size < 2 && room.waitingExpiresAt <= now) {
        this.deleteRoom(room);
      }
    }
  }

  private deleteRoom(room: RoomRecord): void {
    this.rooms.delete(room.roomId);
    if (this.roomIdByCodeHash.get(room.inviteCodeHash) === room.roomId) {
      this.roomIdByCodeHash.delete(room.inviteCodeHash);
    }
  }
}

function findSeatByUserId(room: RoomRecord, userId: string): SeatRecord | null {
  for (const seat of room.seats.values()) {
    if (seat.userId === userId) {
      return seat;
    }
  }
  return null;
}
