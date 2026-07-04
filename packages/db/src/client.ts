import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';

import * as schema from './schema.ts';

/**
 * pg のプール設定を組み立てる。
 *
 * - ローカル / コンテナの Postgres: `DATABASE_URL` を設定する（デフォルト）。
 * - Aurora DSQL: `DSQL_ENDPOINT` を設定する。DSQL には固定パスワードが無いため、
 *   新規接続のたびに署名し直した短命の IAM トークンで認証する。
 *   `@aws-sdk/dsql-signer` の import を遅延させているのは、ローカル開発で一切ロード
 *   させないため。
 */
function buildPoolConfig(): PoolConfig {
  const dsqlEndpoint = process.env.DSQL_ENDPOINT;
  const databaseUrl = process.env.DATABASE_URL;
  const dsqlRegion = process.env.DSQL_REGION;
  const awsRegion = process.env.AWS_REGION;
  const dsqlUser = process.env.DSQL_USER;
  const dsqlDatabase = process.env.DSQL_DATABASE;

  if (!dsqlEndpoint) {
    return { connectionString: databaseUrl };
  }

  const region = dsqlRegion ?? awsRegion;
  const user = dsqlUser ?? 'admin';

  return {
    host: dsqlEndpoint,
    port: 5432,
    user,
    database: dsqlDatabase ?? 'postgres',
    ssl: { rejectUnauthorized: true },
    // pg は async なプロバイダを受け付ける。新規接続のたびに呼ばれるため、IAM 認証
    // トークンは期限切れ前に透過的に更新される。
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
