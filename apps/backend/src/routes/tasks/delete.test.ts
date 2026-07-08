import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { migrateTestDb } from '../../__tests__/support.ts';
import { seedTask } from './__tests__/seed.ts';

vi.mock('@icasu/db/client', () =>
  import('../../__tests__/support.ts').then((m) => m.createTestDbModule()),
);

const app = (await import('./delete.ts')).default;
const { db } = await import('@icasu/db/client');
const { tasks } = await import('@icasu/db/schema');

beforeAll(() => migrateTestDb(db));
afterEach(() => db.delete(tasks));

describe('DELETE /tasks/:id', () => {
  it('deletes an existing task and removes it from the table', async () => {
    const created = await seedTask(db, { title: 'delete me' });

    const res = await app.request(`/tasks/${created.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    // 取得系ルートに依存せず、DB を直接見て消えていることを確認する。
    const remaining = await db.select().from(tasks).where(eq(tasks.id, created.id));
    expect(remaining).toHaveLength(0);
  });

  it('returns 404 when deleting a non-existent uuid', async () => {
    const res = await app.request('/tasks/00000000-0000-0000-0000-000000000000', {
      method: 'DELETE',
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Task not found' });
  });
});
