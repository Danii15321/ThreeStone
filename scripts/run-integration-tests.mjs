import { spawnSync } from 'node:child_process';
import process, { loadEnvFile } from 'node:process';
import { URL, fileURLToPath } from 'node:url';

try {
  loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch (error) {
  if (error?.code !== 'ENOENT') {
    throw error;
  }
}

if (!process.env.TEST_DATABASE_URL) {
  fail('TEST_DATABASE_URL is required. Define it in the environment or in the local .env file.');
}

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) {
  fail('Unable to locate the pnpm executable.');
}

for (const workspace of ['@three-stone/api', '@three-stone/database']) {
  const result = spawnSync(process.execPath, [pnpmCli, '--filter', workspace, 'test'], {
    env: process.env,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
