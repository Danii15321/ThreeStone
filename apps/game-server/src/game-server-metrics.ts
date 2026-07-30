const MAX_RECORDED_LATENCIES = 2_048;

export interface GameServerMetricsSnapshot {
  readonly activeConnections: number;
  readonly commandAcceptance: {
    readonly count: number;
    readonly p95Ms: number;
  };
  readonly leaseRenewalFailures: number;
  readonly matchesAbandoned: number;
  readonly roomsCancelled: number;
  readonly roomsFinished: number;
  readonly matchesTimedOut: number;
  readonly persistenceErrors: number;
  readonly resumesFailed: number;
  readonly resumesSucceeded: number;
  readonly roomsCreated: number;
  readonly roomsJoined: number;
}

export class GameServerMetrics {
  private connections = 0;
  private readonly commandLatencies: number[] = [];
  private leaseFailures = 0;
  private abandoned = 0;
  private cancelled = 0;
  private finished = 0;
  private timedOut = 0;
  private persistenceFailures = 0;
  private failedResumes = 0;
  private successfulResumes = 0;
  private createdRooms = 0;
  private joinedRooms = 0;

  roomCreated(): void {
    this.createdRooms += 1;
  }

  roomJoined(): void {
    this.joinedRooms += 1;
  }

  connectionOpened(): void {
    this.connections += 1;
  }

  connectionClosed(): void {
    this.connections = Math.max(0, this.connections - 1);
  }

  resumeSucceeded(): void {
    this.successfulResumes += 1;
  }

  resumeFailed(): void {
    this.failedResumes += 1;
  }

  commandAccepted(latencyMs: number): void {
    this.commandLatencies.push(Math.max(0, latencyMs));
    if (this.commandLatencies.length > MAX_RECORDED_LATENCIES) {
      this.commandLatencies.shift();
    }
  }

  matchFinished(reason: string): void {
    this.finished += 1;
    if (reason === 'abandon') {
      this.abandoned += 1;
    }
    if (reason.includes('timeout')) {
      this.timedOut += 1;
    }
  }

  matchCancelled(): void {
    this.cancelled += 1;
  }

  persistenceFailed(): void {
    this.persistenceFailures += 1;
  }

  leaseRenewalFailed(): void {
    this.leaseFailures += 1;
  }

  snapshot(): GameServerMetricsSnapshot {
    return {
      activeConnections: this.connections,
      commandAcceptance: {
        count: this.commandLatencies.length,
        p95Ms: percentile95(this.commandLatencies),
      },
      leaseRenewalFailures: this.leaseFailures,
      matchesAbandoned: this.abandoned,
      matchesTimedOut: this.timedOut,
      persistenceErrors: this.persistenceFailures,
      resumesFailed: this.failedResumes,
      resumesSucceeded: this.successfulResumes,
      roomsCreated: this.createdRooms,
      roomsCancelled: this.cancelled,
      roomsFinished: this.finished,
      roomsJoined: this.joinedRooms,
    };
  }
}

function percentile95(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0;
}
