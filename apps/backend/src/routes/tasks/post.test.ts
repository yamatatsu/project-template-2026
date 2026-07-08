import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { JSON_HEADERS, migrateTestDb, testSession, withSession } from '../../__tests__/support.ts';

vi.mock('@icasu/db/client', () =>
  import('../../__tests__/support.ts').then((m) => m.createTestDbModule()),
);

const app = withSession((await import('./post.ts')).default, testSession());
const { db } = await import('@icasu/db/client');
const { tasks, users } = await import('@icasu/db/schema');

beforeAll(() => migrateTestDb(db));
afterEach(() => db.delete(tasks));

/** ヘルパー: task を POST し、パース済みの JSON ボディを返す。 */
async function createTask(body: Record<string, unknown>) {
  const res = await app.request('/tasks', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  return { res, json: (await res.json()) as Record<string, unknown> };
}

describe('POST /tasks', () => {
  it('creates a task and applies default status/priority', async () => {
    const { res, json } = await createTask({ title: 'Write tests' });

    expect(res.status).toBe(201);
    expect(json).toMatchObject({
      title: 'Write tests',
      status: 'todo',
      priority: 'medium',
    });
    expect(typeof json.id).toBe('string');
    expect(typeof json.createdAt).toBe('string');
  });

  it('records the authenticated user as createdBy', async () => {
    const { json } = await createTask({ title: 'Owned task' });

    // authZ が JIT プロビジョニングした users 行の id（session の userSub ではなく）。
    const [user] = await db.select().from(users).where(eq(users.userSub, testSession().userSub));
    expect(json.createdBy).toBe(user?.id);
  });

  it('honours explicitly provided status and priority', async () => {
    const { res, json } = await createTask({
      title: 'Important',
      status: 'in_progress',
      priority: 'high',
    });

    expect(res.status).toBe(201);
    expect(json).toMatchObject({ status: 'in_progress', priority: 'high' });
  });

  it('rejects a missing title with 400', async () => {
    const res = await app.request('/tasks', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ description: 'no title' }),
    });

    expect(res.status).toBe(400);
  });

  it('rejects an empty title with 400', async () => {
    const res = await app.request('/tasks', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ title: '   ' }),
    });

    expect(res.status).toBe(400);
  });

  it('accepts an offset ISO dueDate and returns it as a string', async () => {
    const { res, json } = await createTask({
      title: 'With due date',
      dueDate: '2026-07-01T09:30:00+09:00',
    });

    expect(res.status).toBe(201);
    expect(typeof json.dueDate).toBe('string');
    expect(new Date(json.dueDate as string).toISOString()).toBe('2026-07-01T00:30:00.000Z');
  });
});
