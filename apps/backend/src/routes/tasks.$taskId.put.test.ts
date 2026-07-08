import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { JSON_HEADERS, migrateTestDb, testSession, withSession } from '../__tests__/support.ts';
import { seedTask } from './__tests__/seed.ts';

vi.mock('@icasu/db/client', () =>
  import('../__tests__/support.ts').then((m) => m.createTestDbModule()),
);

const app = withSession((await import('./tasks.$taskId.put.ts')).default, testSession());
const { db } = await import('@icasu/db/client');
const { tasks } = await import('@icasu/db/schema');

beforeAll(() => migrateTestDb(db));
afterEach(() => db.delete(tasks));

describe('PUT /tasks/:id', () => {
  it('updates a subset of fields and returns the updated task', async () => {
    const created = await seedTask(db, { title: 'todo task' });

    const res = await app.request(`/tasks/${created.id}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ status: 'done' }),
    });

    expect(res.status).toBe(200);
    const updated = (await res.json()) as Record<string, unknown>;
    expect(updated.id).toBe(created.id);
    expect(updated.status).toBe('done');
    // 触れていないフィールドは保持される。
    expect(updated.title).toBe('todo task');
  });

  it('returns 404 when updating a non-existent uuid', async () => {
    const res = await app.request('/tasks/00000000-0000-0000-0000-000000000000', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ status: 'done' }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Task not found' });
  });
});
