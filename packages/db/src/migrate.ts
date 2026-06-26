import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { db } from './client.ts';
import { migrationsFolder } from './migrations.ts';

await migrate(db, { migrationsFolder });

console.log('Migrations applied');

process.exit(0);
