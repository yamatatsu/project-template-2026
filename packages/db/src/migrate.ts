import { formatMigrateError, runMigrations } from './migrate-runner.ts';

const res = await runMigrations();

if (!res.ok) {
  console.error(formatMigrateError(res.error));
  if ('cause' in res.error && res.error.cause !== undefined) console.error(res.error.cause);
  process.exit(1);
}

console.log(
  res.value.applied.length === 0
    ? '適用対象のマイグレーションはありません'
    : `適用しました: ${res.value.applied.join(', ')}`,
);

// pg の Pool が接続を保持しプロセスが終了しないため、明示的に終了する。
process.exit(0);
