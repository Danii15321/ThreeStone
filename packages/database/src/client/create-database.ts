import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schema/index.js';

export interface DatabaseClientOptions {
  readonly maxConnections?: number;
}

export function createDatabase(databaseUrl: string, options: DatabaseClientOptions = {}) {
  const queryClient = postgres(databaseUrl, {
    max: options.maxConnections ?? 10,
  });

  return {
    close: () => queryClient.end(),
    db: drizzle(queryClient, { schema }),
    queryClient,
  };
}

export type Database = ReturnType<typeof createDatabase>['db'];
