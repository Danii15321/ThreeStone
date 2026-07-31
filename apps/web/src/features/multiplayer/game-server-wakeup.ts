interface WakeGameServerOptions {
  readonly fetcher?: typeof fetch;
  readonly maxAttempts?: number;
  readonly retryDelayMs?: number;
  readonly wait?: (delayMs: number) => Promise<void>;
}

const DEFAULT_MAX_ATTEMPTS = 45;
const DEFAULT_RETRY_DELAY_MS = 2_000;

export async function wakeGameServer(
  publicWebSocketUrl: string,
  options: WakeGameServerOptions = {},
): Promise<void> {
  const readinessUrl = new URL('/health/ready', publicWebSocketUrl);
  readinessUrl.protocol = readinessUrl.protocol === 'wss:' ? 'https:' : 'http:';
  const fetcher = options.fetcher ?? fetch;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const wait = options.wait ?? sleep;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetcher(readinessUrl.toString(), {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      if (response.ok) return;
    } catch {
      // A sleeping Render instance can close early requests while it boots.
    }
    if (attempt < maxAttempts) await wait(retryDelayMs);
  }

  throw new Error('GAME_SERVER_WAKE_TIMEOUT');
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}
