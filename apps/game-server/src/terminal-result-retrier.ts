import type { TerminalResultRepository } from './terminal-result-repository.js';

type TerminalResult = Parameters<TerminalResultRepository['save']>[0];

interface PendingResult {
  attempts: number;
  cancelTimer: (() => void) | null;
  readonly input: TerminalResult;
  readonly recordedAt: Date;
}

interface RetrierOptions {
  readonly onFailure?: () => void;
  readonly schedule?: (delayMs: number, task: () => void) => () => void;
}

export class RetryingTerminalResultRepository implements TerminalResultRepository {
  private readonly entries = new Map<string, PendingResult>();
  private readonly onFailure: () => void;
  private readonly schedule: (delayMs: number, task: () => void) => () => void;
  private stopping = false;

  constructor(
    private readonly inner: TerminalResultRepository,
    options: RetrierOptions = {},
  ) {
    this.onFailure = options.onFailure ?? (() => undefined);
    this.schedule =
      options.schedule ??
      ((delayMs, task) => {
        const timer = setTimeout(task, delayMs);
        return () => clearTimeout(timer);
      });
  }

  get pendingCount(): number {
    return this.entries.size;
  }

  async save(
    input: TerminalResult,
    recordedAt: Date,
  ): ReturnType<TerminalResultRepository['save']> {
    if (this.entries.has(input.gameId)) {
      return { kind: 'created' };
    }
    try {
      return await this.inner.save(input, recordedAt);
    } catch {
      this.onFailure();
      if (!this.stopping) {
        const entry: PendingResult = {
          attempts: 1,
          cancelTimer: null,
          input,
          recordedAt,
        };
        this.entries.set(input.gameId, entry);
        this.scheduleRetry(entry);
        return { kind: 'created' };
      }
      throw new Error('Terminal result persistence is unavailable during shutdown.');
    }
  }

  async flush(): Promise<{ readonly pending: number }> {
    this.stopping = true;
    const entries = [...this.entries.values()];
    for (const entry of entries) {
      entry.cancelTimer?.();
      entry.cancelTimer = null;
    }
    await Promise.all(entries.map((entry) => this.flushEntry(entry)));
    return { pending: this.entries.size };
  }

  private scheduleRetry(entry: PendingResult): void {
    const delayMs = Math.min(30_000, 1_000 * 2 ** Math.min(entry.attempts - 1, 5));
    entry.cancelTimer = this.schedule(delayMs, () => {
      entry.cancelTimer = null;
      void this.retry(entry);
    });
  }

  private async retry(entry: PendingResult): Promise<void> {
    if (!this.entries.has(entry.input.gameId) || this.stopping) {
      return;
    }
    try {
      await this.inner.save(entry.input, entry.recordedAt);
      this.entries.delete(entry.input.gameId);
    } catch {
      this.onFailure();
      entry.attempts += 1;
      this.scheduleRetry(entry);
    }
  }

  private async flushEntry(entry: PendingResult): Promise<void> {
    try {
      await this.inner.save(entry.input, entry.recordedAt);
      this.entries.delete(entry.input.gameId);
    } catch {
      this.onFailure();
    }
  }
}
