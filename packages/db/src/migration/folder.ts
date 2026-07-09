import { fileURLToPath } from 'node:url';

/**
 * SQL マイグレーションフォルダの絶対パス。プロセスの cwd に依存しない。
 *
 * esbuild は `import.meta.url` をそのまま残すため、これはバンドル出力ファイルの位置を基準に
 * 解決される。Lambda バンドル（`apps/iac` の Migration construct）は出力の隣に `ddl/` をコピーする
 * ので、このファイルと `ddl/` は必ず同階層に置くこと（`../ddl` にするとバンドル出力の外を指す）。
 */
export const migrationsFolder = fileURLToPath(new URL('./ddl', import.meta.url));
