import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, testSession, withSession } from '../__tests__/support.ts';
import { seedTask } from './__tests__/seed.ts';

vi.mock('@icasu/db/client', () =>
  import('../__tests__/support.ts').then((m) => m.createTestDbModule()),
);

const app = withSession((await import('./tasks.$taskId.get.ts')).default, testSession());
const { db } = await import('@icasu/db/client');
const { tasks } = await import('@icasu/db/schema');

beforeAll(() => migrateTestDb(db));
afterEach(() => db.delete(tasks));

describe('GET /tasks/:id', () => {
  it('returns the matching task for an existing id', async () => {
    const created = await seedTask(db, { title: 'find me' });

    const res = await app.request(`/tasks/${created.id}`);
    expect(res.status).toBe(200);

    const task = (await res.json()) as Record<string, unknown>;
    expect(task.id).toBe(created.id);
    expect(task.title).toBe('find me');
    // read も write と同一のワイヤ形（監査列は meta にまとめ、トップレベルには出さない）。
    const meta = task.meta as Record<string, unknown>;
    expect(meta.version).toBe(created.version);
    expect(typeof meta.createdAt).toBe('string');
    expect(task.version).toBeUndefined();
    expect(task.createdAt).toBeUndefined();
  });

  it('returns 404 for a non-existent uuid', async () => {
    const res = await app.request('/tasks/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Task not found' });
  });

  it('returns 400 for a param that is not a uuid', async () => {
    const res = await app.request('/tasks/not-a-uuid');
    expect(res.status).toBe(400);
  });
});
