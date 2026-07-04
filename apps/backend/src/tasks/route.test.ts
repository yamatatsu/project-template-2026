import { Hono } from 'hono';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * 実 Postgres バックエンドの `db` クライアントをインメモリの PGlite インスタンスに
 * 置き換え、ルートハンドラを生きた DB 無しで動かせるようにする。
 *
 * ファクトリは async でシングルトンを生成する。`route.ts` もこのテストも `@icasu/db/client`
 * から `db` を import するため、両者は*同一の*モックインスタンスに解決される。
 */
vi.mock('@icasu/db/client', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('@icasu/db/schema');
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  return { db };
});

const { createTasksRoute } = await import('./route.ts');
const { db } = await import('@icasu/db/client');
const { tasks } = await import('@icasu/db/schema');

// セッションミドルウェアは直交する関心事（認証のテストは @icasu/backend-auth 側にある）。
// パススルーの `requireSession` でルーターをマウントし、このテストは tasks の DB ロジックに
// 集中させる。
const app = new Hono().route(
  '/tasks',
  createTasksRoute((_c, next) => next()),
);

const JSON_HEADERS = { 'content-type': 'application/json' };

/** ヘルパー: task を POST し、パース済みの JSON ボディを返す。 */
async function createTask(body: Record<string, unknown>) {
  const res = await app.request('/tasks', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  return { res, json: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const { migrationsFolder } = await import('@icasu/db/migrations');
  await migrate(db as never, { migrationsFolder });
});

afterEach(async () => {
  await db.delete(tasks);
});

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

describe('GET /tasks', () => {
  it('returns all tasks ordered by createdAt descending', async () => {
    const { json: first } = await createTask({ title: 'first' });
    // createdAt のタイムスタンプが確実に異なる値になるよう、わずかに待つ。
    await new Promise((resolve) => setTimeout(resolve, 5));
    const { json: second } = await createTask({ title: 'second' });

    const res = await app.request('/tasks');
    expect(res.status).toBe(200);

    const rows = (await res.json()) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    // 新しいものが先頭。
    expect(rows.map((row) => row.id)).toEqual([second.id, first.id]);
  });

  it('returns an empty array when there are no tasks', async () => {
    const res = await app.request('/tasks');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

describe('GET /tasks/:id', () => {
  it('returns the matching task for an existing id', async () => {
    const { json: created } = await createTask({ title: 'find me' });

    const res = await app.request(`/tasks/${created.id}`);
    expect(res.status).toBe(200);

    const task = (await res.json()) as Record<string, unknown>;
    expect(task.id).toBe(created.id);
    expect(task.title).toBe('find me');
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

describe('PUT /tasks/:id', () => {
  it('updates a subset of fields and returns the updated task', async () => {
    const { json: created } = await createTask({ title: 'todo task' });

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

describe('DELETE /tasks/:id', () => {
  it('deletes an existing task and makes it no longer retrievable', async () => {
    const { json: created } = await createTask({ title: 'delete me' });

    const res = await app.request(`/tasks/${created.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    const getRes = await app.request(`/tasks/${created.id}`);
    expect(getRes.status).toBe(404);
  });

  it('returns 404 when deleting a non-existent uuid', async () => {
    const res = await app.request('/tasks/00000000-0000-0000-0000-000000000000', {
      method: 'DELETE',
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Task not found' });
  });
});
