import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';

import * as schema from './schema.ts';

/**
 * Builds the pg pool configuration.
 *
 * - Local / container Postgres: set `DATABASE_URL` (default).
 * - Aurora DSQL: set `DSQL_ENDPOINT`. DSQL has no static password, so every
 *   new connection authenticates with a freshly-signed, short-lived IAM token.
 *   The `@aws-sdk/dsql-signer` import is lazy so local dev never loads it.
 */
function buildPoolConfig(): PoolConfig {
  const dsqlEndpoint = process.env.DSQL_ENDPOINT;
  if (!dsqlEndpoint) {
    return { connectionString: process.env.DATABASE_URL };
  }

  const region = process.env.DSQL_REGION ?? process.env.AWS_REGION;
  const user = process.env.DSQL_USER ?? 'admin';

  return {
    host: dsqlEndpoint,
    port: 5432,
    user,
    database: process.env.DSQL_DATABASE ?? 'postgres',
    ssl: { rejectUnauthorized: true },
    // pg accepts an async provider; it is invoked for each new connection,
    // transparently refreshing the IAM auth token before it expires.
    password: async () => {
      const { DsqlSigner } = await import('@aws-sdk/dsql-signer');
      const signer = new DsqlSigner({ hostname: dsqlEndpoint, region });
      return user === 'admin'
        ? signer.getDbConnectAdminAuthToken()
        : signer.getDbConnectAuthToken();
    },
    max: 1,
  };
}

const pool = new Pool(buildPoolConfig());

export const db = drizzle(pool, { schema });
