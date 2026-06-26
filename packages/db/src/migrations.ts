import { fileURLToPath } from 'node:url';

/** Absolute path to the SQL migrations folder, independent of process cwd. */
export const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));
