export interface RateLimiter {
  consume(key: string): boolean;
}

export class FixedWindowRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, { count: number; startedAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly clock: () => number = Date.now,
    private readonly maxBuckets: number = 10_000,
  ) {}

  consume(key: string): boolean {
    const now = this.clock();
    const bucket = this.buckets.get(key);

    if (bucket === undefined || now - bucket.startedAt >= this.windowMs) {
      if (bucket === undefined && this.buckets.size >= this.maxBuckets) {
        for (const [candidateKey, candidate] of this.buckets) {
          if (now - candidate.startedAt >= this.windowMs) {
            this.buckets.delete(candidateKey);
          }
        }
        if (this.buckets.size >= this.maxBuckets) {
          const oldestKey = this.buckets.keys().next().value as string | undefined;
          if (oldestKey !== undefined) this.buckets.delete(oldestKey);
        }
      }
      this.buckets.set(key, { count: 1, startedAt: now });
      return true;
    }

    if (bucket.count >= this.max) {
      return false;
    }

    bucket.count += 1;
    return true;
  }
}
