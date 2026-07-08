import { db } from '@icasu/db/client';
import { tasks } from '@icasu/db/schema';
import { desc } from 'drizzle-orm';
import { Hono } from 'hono';

export default new Hono().get('/tasks', async (c) => {
  const rows = await db.select().from(tasks).orderBy(desc(tasks.createdAt));
  return c.json(rows);
});
