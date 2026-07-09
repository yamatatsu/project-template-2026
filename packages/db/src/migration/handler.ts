import { formatMigrateError, runMigrations } from './runner.ts';

/**
 * CDK の Trigger（apps/iac の `Migration` construct）がデプロイ中に呼ぶ Lambda ハンドラ。
 *
 * Lambda / CloudFormation は throw をデプロイ失敗として扱う I/F のため、この境界で
 * Result を例外に変換する（失敗を握りつぶすとスキーマ不整合のままアプリが公開される）。
 */
export const handler = async (): Promise<{ applied: string[] }> => {
  const res = await runMigrations();
  if (!res.ok) {
    const cause = 'cause' in res.error ? res.error.cause : undefined;
    throw new Error(formatMigrateError(res.error), cause !== undefined ? { cause } : undefined);
  }
  console.log(`applied migrations: ${JSON.stringify(res.value.applied)}`);
  return res.value;
};
