import type { InferRequestType } from 'hono/client';
import { testClient } from 'hono/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, seedSessionUser, testSession, withSession } from '../__tests__/support.ts';
import { seedTask } from './__tests__/seed.ts';

vi.mock('@icasu/db/client', () =>
  import('../__tests__/support.ts').then((m) => m.createTestDbModule()),
);

const client = testClient(
  withSession((await import('./tasks.$taskId.put.ts')).default, testSession()),
);
const { db } = await import('@icasu/db/client');
const { tasks, users } = await import('@icasu/db/schema');

beforeAll(() => migrateTestDb(db));
// PUT は task:write（admin 限定）なので、session ユーザーを admin として用意する。
beforeEach(() => seedSessionUser(db, 'admin'));
afterEach(async () => {
  await db.delete(tasks);
  await db.delete(users);
});

type TaskInput = InferRequestType<(typeof client.tasks)[':id']['$put']>['json'];
type TaskContent = Omit<TaskInput, 'expectedVersion'>;

// PUT は全フィールド必須（リソース全体の置換）。テストは全フィールドを持つボディを基準に、
// 検証したい項目だけ上書きする。
const validContent = (overrides: Partial<TaskContent> = {}): TaskContent => ({
  title: 'new title',
  description: null,
  status: 'todo',
  priority: 'medium',
  dueDate: null,
  ...overrides,
});

// 楽観ロックの版は body の expectedVersion で送る（content とは別の関心なので引数を分ける）。
const validBody = (expectedVersion: number, overrides: Partial<TaskContent> = {}): TaskInput => ({
  ...validContent(overrides),
  expectedVersion,
});

describe('PUT /tasks/:id', () => {
  it('replaces the whole resource and bumps the version', async () => {
    const created = await seedTask(db, {
      title: 'old title',
      description: 'old description',
      status: 'todo',
      priority: 'low',
    });

    const res = await client.tasks[':id'].$put({
      param: { id: created.id },
      // 全体置換: description を送らない（null）ので既存値は消える。
      json: validBody(created.version, { status: 'done' }),
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
    // 版は precondition ではなくリクエスト固有の前提なので、レスポンスには現れない。
    expect(updated.expectedVersion).toBeUndefined();
  });

  it('returns 409 on a stale expectedVersion and leaves the row untouched', async () => {
    // 既に一度更新された行（version 2）を再現する。クライアントが持っている版は 1 で stale。
    const created = await seedTask(db, { title: 'todo task', version: 2 });

    const res = await client.tasks[':id'].$put({
      param: { id: created.id },
      json: validBody(created.version - 1, { title: 'clobber' }),
    });

    // 版不一致はリソースの現在状態との衝突（409）。通知は「競合したこと・対象 entity」のみ。
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'Version conflict',
      entity: 'task',
      id: created.id,
    });

    const [row] = await db.select().from(tasks);
    expect(row?.title).toBe('todo task');
    expect(row?.version).toBe(created.version);
  });

  it('rejects a body without expectedVersion with 400 (optimistic lock required)', async () => {
    const created = await seedTask(db, { title: 'todo task' });

    const res = await client.tasks[':id'].$put({
      param: { id: created.id },
      // 版の欠如は型契約にも反する。zValidator の 400 を確かめるため json だけ型を外す。
      json: validContent({ title: 'clobber' }) as never,
    });

    expect(res.status).toBe(400);
    // 版が無いので更新されていない。
    const [row] = await db.select().from(tasks);
    expect(row?.title).toBe('todo task');
    expect(row?.version).toBe(created.version);
  });

  it('rejects a body missing required fields with 400', async () => {
    const created = await seedTask(db, { title: 'todo task' });

    const res = await client.tasks[':id'].$put({
      param: { id: created.id },
      // 必須フィールド欠落は型契約にも反する。zValidator の 400 を確かめるため json だけ型を外す。
      json: { title: 'only title', expectedVersion: created.version } as never,
    });

    expect(res.status).toBe(400);
  });

  it('returns 404 when updating a non-existent uuid', async () => {
    const res = await client.tasks[':id'].$put({
      param: { id: '00000000-0000-0000-0000-000000000000' },
      json: validBody(1),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Task not found' });
  });
});
