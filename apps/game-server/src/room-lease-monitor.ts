import { createHash } from 'node:crypto';

interface LeaseCredential {
  readonly expiresAt: number;
  readonly leaseToken: string;
  readonly userId: string;
}

interface LeaseRegistry {
  expireRoom(roomId: string): boolean;
  getLeaseCredentials(roomId: string): readonly LeaseCredential[];
  renewLease(roomId: string, userId: string, leaseToken: string, expiresAt: number): boolean;
}

interface LeaseRepository {
  renew(input: {
    readonly expiresAt: Date;
    readonly leaseTokenHash: string;
    readonly now: Date;
    readonly roomId: string;
    readonly userId: string;
  }): Promise<boolean>;
}

export type RoomLeaseHealth = 'healthy' | 'lost' | 'unavailable';

export class RoomLeaseMonitor {
  constructor(
    private readonly dependencies: {
      readonly clock: () => number;
      readonly leaseLifetimeMs: number;
      readonly registry: LeaseRegistry;
      readonly repository: LeaseRepository;
    },
  ) {
    if (dependencies.leaseLifetimeMs <= 0) {
      throw new RangeError('A room lease lifetime must be positive.');
    }
  }

  async check(roomId: string): Promise<RoomLeaseHealth> {
    const credentials = this.dependencies.registry.getLeaseCredentials(roomId);
    if (credentials.length === 0) {
      return this.markLost(roomId);
    }
    const nowMs = this.dependencies.clock();
    const now = new Date(nowMs);
    const expiresAtMs = nowMs + this.dependencies.leaseLifetimeMs;
    const expiresAt = new Date(expiresAtMs);

    try {
      for (const credential of credentials) {
        const renewed = await this.dependencies.repository.renew({
          expiresAt,
          leaseTokenHash: hashLeaseToken(credential.leaseToken),
          now,
          roomId,
          userId: credential.userId,
        });
        if (
          !renewed ||
          !this.dependencies.registry.renewLease(
            roomId,
            credential.userId,
            credential.leaseToken,
            expiresAtMs,
          )
        ) {
          return this.markLost(roomId);
        }
      }
      return 'healthy';
    } catch {
      const lastProvenExpiry = Math.min(
        ...this.dependencies.registry
          .getLeaseCredentials(roomId)
          .map((credential) => credential.expiresAt),
      );
      return lastProvenExpiry <= nowMs ? this.markLost(roomId) : 'unavailable';
    }
  }

  private markLost(roomId: string): 'lost' {
    this.dependencies.registry.expireRoom(roomId);
    return 'lost';
  }
}

function hashLeaseToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}
