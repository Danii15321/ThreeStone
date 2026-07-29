import { serve } from '@hono/node-server';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

import { createApiRuntime } from './runtime.js';

try {
  loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch (error: unknown) {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    (error as { readonly code?: unknown }).code !== 'ENOENT'
  ) {
    throw error;
  }
}

const runtime = createApiRuntime();

const server = serve({
  fetch: runtime.app.fetch,
  hostname: runtime.environment.API_HOST,
  port: runtime.environment.API_PORT,
});

async function shutdown(signal: string) {
  console.info(`${signal} received; closing the API server.`);
  server.close((error) => {
    if (error) {
      console.error('API shutdown failed.', error);
      process.exitCode = 1;
    }
  });
  await runtime.close();
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});
