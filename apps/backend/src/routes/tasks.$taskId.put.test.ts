import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  JSON_HEADERS,
  migrateTestDb,
  seedSessionUser,
  testSession,
  withSession,
} from '../__tests__/support.ts';
import { seedTask } from './__tests__/seed.ts';

vi.mock('@icasu/db/client', () =>
  import('../__tests__/support.ts').then((m) => m.createTestDbModule()),
);

const app = withSession((await import('./tasks.$taskId.put.ts')).default, testSession());
const { db } = await import('@icasu/db/client');
const { tasks, users } = await import('@icasu/db/schema');

beforeAll(() => migrateTestDb(db));
// PUT は task:write（admin 限定）なので、session ユーザーを admin として用意する。
beforeEach(() => seedSessionUser(db, 'admin'));
afterEach(async () => {
  await db.delete(tasks);
  await db.delete(users);
});

// PUT は全フィールド必須（リソース全体の置換）。テストは全フィールドを持つボディを基準に、
// 検証したい項目だけ上書きする。楽観ロックの版は body ではなく If-Match ヘッダで送る。
const validBody = (overrides: Record<string, unknown> = {}) => ({
  title: 'new title',
  description: null,
  status: 'todo',
  priority: 'medium',
  dueDate: null,
  ...overrides,
});

// If-Match の entity-tag（"<version>"）に版を載せる。JSON ボディ用ヘッダとまとめて渡す。
const headersFor = (version: number) => ({ ...JSON_HEADERS, 'If-Match': `"${version}"` });

describe('PUT /tasks/:id', () => {
  it('replaces the whole resource and bumps the version', async () => {
    const created = await seedTask(db, {
      title: 'old title',
      description: 'old description',
      status: 'todo',
      priority: 'low',
    });

    const res = await app.request(`/tasks/${created.id}`, {
      method: 'PUT',
      headers: headersFor(created.version),
      // 全体置換: description を送らない（null）ので既存値は消える。
      body: JSON.stringify(validBody({ status: 'done' })),
    });

    expect(res.status).toBe(200);
    const updated = (await res.json()) as Record<string, unknown>;
    expect(updated.id).toBe(created.id);
    expect(updated.title).toBe('new title');
    expect(updated.status).toBe('done');
    // 置換なので送った値どおり（旧 description は保持されない）。
    expect(updated.description).toBeNull();
    expect(updated.priority).toBe('medium');
    // 楽観ロック: version が 1 進む（監査系は meta にまとまる）。
    const meta = updated.meta as Record<string, unknown>;
    expect(meta.version).toBe(created.version + 1);
  });

  it('returns 412 on a stale If-Match version and leaves the row untouched', async () => {
    const created = await seedTask(db, { title: 'todo task' });

    const res = await app.request(`/tasks/${created.id}`, {
      method: 'PUT',
      headers: headersFor(created.version - 1),
      body: JSON.stringify(validBody({ title: 'clobber' })),
    });

    // If-Match 不一致は precondition 失敗（412）。通知は「競合したこと・対象 entity」のみ。
    expect(res.status).toBe(412);
    expect(await res.json()).toEqual({
      error: 'Version conflict',
      entity: 'task',
      id: created.id,
    });

    const [row] = await db.select().from(tasks);
    expect(row?.title).toBe('todo task');
    expect(row?.version).toBe(created.version);
  });

  it('returns 428 when If-Match is absent (optimistic lock required)', async () => {
    const created = await seedTask(db, { title: 'todo task' });

    const res = await app.request(`/tasks/${created.id}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify(validBody({ title: 'clobber' })),
    });

    expect(res.status).toBe(428);
    // precondition が無いので更新されていない。
    const [row] = await db.select().from(tasks);
    expect(row?.title).toBe('todo task');
    expect(row?.version).toBe(created.version);
  });

  it('rejects a body missing required fields with 400', async () => {
    const created = await seedTask(db, { title: 'todo task' });

    const res = await app.request(`/tasks/${created.id}`, {
      method: 'PUT',
      headers: headersFor(created.version),
      body: JSON.stringify({ title: 'only title' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 404 when updating a non-existent uuid', async () => {
    const res = await app.request('/tasks/00000000-0000-0000-0000-000000000000', {
      method: 'PUT',
      headers: headersFor(1),
      body: JSON.stringify(validBody()),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Task not found' });
  });
});
