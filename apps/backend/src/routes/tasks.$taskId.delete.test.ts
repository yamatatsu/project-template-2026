import { eq } from 'drizzle-orm';
import { testClient } from 'hono/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, seedSessionUser, testSession, withSession } from '../__tests__/support.ts';
import { seedTask } from './__tests__/seed.ts';

vi.mock('@icasu/db/client', () =>
  import('../__tests__/support.ts').then((m) => m.createTestDbModule()),
);

const client = testClient(
  withSession((await import('./tasks.$taskId.delete.ts')).default, testSession()),
);
const { db } = await import('@icasu/db/client');
const { tasks, users } = await import('@icasu/db/schema');

beforeAll(() => migrateTestDb(db));
// DELETE は task:write（admin 限定）なので、session ユーザーを admin として用意する。
beforeEach(() => seedSessionUser(db, 'admin'));
afterEach(async () => {
  await db.delete(tasks);
  await db.delete(users);
});

describe('DELETE /tasks/:id', () => {
  it('deletes an existing task and removes it from the table', async () => {
    const created = await seedTask(db, { title: 'delete me' });

    const res = await client.tasks[':id'].$delete({ param: { id: created.id } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    // 取得系ルートに依存せず、DB を直接見て消えていることを確認する。
    const remaining = await db.select().from(tasks).where(eq(tasks.id, created.id));
    expect(remaining).toHaveLength(0);
  });

  it('returns 404 when deleting a non-existent uuid', async () => {
    const res = await client.tasks[':id'].$delete({
      param: { id: '00000000-0000-0000-0000-000000000000' },
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Task not found' });
  });
});
