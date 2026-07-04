import { fileURLToPath } from 'node:url';

/** SQL マイグレーションフォルダの絶対パス。プロセスの cwd に依存しない。 */
export const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));
