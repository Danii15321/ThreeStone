import { defineConfig } from 'drizzle-kit';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://three_stone_game:local-development-only@localhost:5432/three_stone_game';

export default defineConfig({
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
  out: './migrations',
  schema: './src/schema/index.ts',
  strict: true,
  verbose: true,
});
