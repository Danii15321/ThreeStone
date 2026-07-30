import { z } from 'zod';

import type {
  GameServerAdmissionGateway,
  SeatReservation,
} from '../application/multiplayer-admission-service.js';

const seatReservationSchema = z.strictObject({
  connectionGeneration: z.number().int().positive(),
  playerId: z.enum(['player-one', 'player-two']),
  reservationId: z.string().min(8).max(128),
  roomId: z.uuid(),
  serverInstanceId: z.string().min(1).max(128),
});

interface HttpGameServerAdmissionGatewayOptions {
  readonly baseUrl: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly secret: string;
}

export class HttpGameServerAdmissionGateway implements GameServerAdmissionGateway {
  private readonly baseUrl: string;
  private readonly fetch: typeof globalThis.fetch;

  constructor(private readonly options: HttpGameServerAdmissionGatewayOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  createRoom(
    input: Parameters<GameServerAdmissionGateway['createRoom']>[0],
  ): Promise<SeatReservation | null> {
    return this.requestReservation('/internal/v1/rooms', input);
  }

  reserveSeat(
    input: Parameters<GameServerAdmissionGateway['reserveSeat']>[0],
  ): Promise<SeatReservation | null> {
    return this.requestReservation('/internal/v1/rooms/reserve', input);
  }

  refreshSeat(
    input: Parameters<GameServerAdmissionGateway['refreshSeat']>[0],
  ): Promise<SeatReservation | null> {
    return this.requestReservation('/internal/v1/rooms/refresh', input);
  }

  async releaseSeat(
    input: Parameters<GameServerAdmissionGateway['releaseSeat']>[0],
  ): Promise<void> {
    const response = await this.post('/internal/v1/rooms/release', input);
    if (!response.ok) {
      throw new Error('Game-server admission request failed');
    }
  }

  private async requestReservation(path: string, body: object): Promise<SeatReservation | null> {
    const response = await this.post(path, body);
    if (response.status === 409) {
      return null;
    }
    if (!response.ok) {
      throw new Error('Game-server admission request failed');
    }
    const parsed = seatReservationSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new Error('Invalid game-server admission response');
    }
    return parsed.data;
  }

  private post(path: string, body: object): Promise<Response> {
    return this.fetch(`${this.baseUrl}${path}`, {
      body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
        'x-game-server-secret': this.options.secret,
      },
      method: 'POST',
      signal: AbortSignal.timeout(5_000),
    });
  }
}
