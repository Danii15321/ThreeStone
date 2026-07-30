const DEFAULT_DRAIN_DURATION_MS = 10 * 60 * 1_000;

type CancelRoom = (reason: 'server-draining') => Promise<void> | void;

interface DrainControllerOptions {
  readonly clock?: () => number;
  readonly durationMs?: number;
  readonly schedule?: (delayMs: number, task: () => void) => () => void;
}

export interface DrainStatus {
  readonly acceptingAdmissions: boolean;
  readonly activeRooms: number;
  readonly deadline: number | null;
  readonly state: 'accepting' | 'draining' | 'drained';
}

export class GameServerDrainController {
  private readonly cancelRooms = new Map<string, CancelRoom>();
  private cancelTimer: (() => void) | null = null;
  private readonly clock: () => number;
  private readonly durationMs: number;
  private drainDeadline: number | null = null;
  private drainState: DrainStatus['state'] = 'accepting';
  private readonly schedule: (delayMs: number, task: () => void) => () => void;

  constructor(options: DrainControllerOptions = {}) {
    this.clock = options.clock ?? Date.now;
    this.durationMs = options.durationMs ?? DEFAULT_DRAIN_DURATION_MS;
    this.schedule =
      options.schedule ??
      ((delayMs, task) => {
        const timer = setTimeout(task, delayMs);
        return () => clearTimeout(timer);
      });
    if (this.durationMs <= 0) {
      throw new RangeError('The game-server drain duration must be positive.');
    }
  }

  get acceptingAdmissions(): boolean {
    return this.drainState === 'accepting';
  }

  registerRoom(roomId: string, cancel: CancelRoom): () => void {
    if (!this.acceptingAdmissions) {
      void this.cancelLateRoom(cancel);
      return () => undefined;
    }
    this.cancelRooms.set(roomId, cancel);
    return () => {
      this.cancelRooms.delete(roomId);
      this.completeWhenEmpty();
    };
  }

  start(): DrainStatus {
    if (!this.acceptingAdmissions) {
      return this.status();
    }
    this.drainState = this.cancelRooms.size === 0 ? 'drained' : 'draining';
    this.drainDeadline = this.clock() + this.durationMs;
    if (this.drainState === 'draining') {
      this.cancelTimer = this.schedule(this.durationMs, () => {
        this.cancelTimer = null;
        void this.cancelRemainingRooms();
      });
    }
    return this.status();
  }

  status(): DrainStatus {
    return {
      acceptingAdmissions: this.acceptingAdmissions,
      activeRooms: this.cancelRooms.size,
      deadline: this.drainDeadline,
      state: this.drainState,
    };
  }

  private async cancelLateRoom(cancel: CancelRoom): Promise<void> {
    await cancel('server-draining');
    this.completeWhenEmpty();
  }

  private async cancelRemainingRooms(): Promise<void> {
    const rooms = [...this.cancelRooms.values()];
    this.cancelRooms.clear();
    await Promise.allSettled(rooms.map((cancel) => cancel('server-draining')));
    this.drainState = 'drained';
  }

  private completeWhenEmpty(): void {
    if (this.drainState !== 'draining' || this.cancelRooms.size !== 0) {
      return;
    }
    this.cancelTimer?.();
    this.cancelTimer = null;
    this.drainState = 'drained';
  }
}
