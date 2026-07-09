import { eq } from 'drizzle-orm';
import type { InferRequestType } from 'hono/client';
import { testClient } from 'hono/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, seedSessionUser, testSession, withSession } from '../__tests__/support.ts';

vi.mock('@icasu/db/client', () =>
  import('../__tests__/support.ts').then((m) => m.createTestDbModule()),
);

const client = testClient(withSession((await import('./tasks.post.ts')).default, testSession()));
const { db } = await import('@icasu/db/client');
const { tasks, users } = await import('@icasu/db/schema');

beforeAll(() => migrateTestDb(db));
// POST は task:write（admin 限定）なので、session ユーザーを admin として用意する。
beforeEach(() => seedSessionUser(db, 'admin'));
afterEach(async () => {
  await db.delete(tasks);
  await db.delete(users);
});

// リクエストボディの型は RPC の request 型から取り出す（transform 前の入力型）。テストのボディが
// サーバ契約とずれたら型で落ちる。
type TaskInput = InferRequestType<(typeof client.tasks)['$post']>['json'];

// リクエストは全フィールド必須（DB デフォルトに委ねない方針）。テストは全フィールドを持つ
// 有効ボディを基準に、検証したい項目だけ上書きする。
const validBody = (overrides: Partial<TaskInput> = {}): TaskInput => ({
  title: 'Write tests',
  description: null,
  status: 'todo',
  priority: 'medium',
  dueDate: null,
  ...overrides,
});

/** ヘルパー: task を POST し、パース済みの JSON ボディを返す。 */
async function createTask(body: TaskInput) {
  const res = await client.tasks.$post({ json: body });
  return { res, json: (await res.json()) as Record<string, unknown> };
}

describe('POST /tasks', () => {
  it('creates a task from the provided values and stamps app-owned columns', async () => {
    const { res, json } = await createTask(validBody({ status: 'in_progress', priority: 'high' }));

    expect(res.status).toBe(201);
    expect(json).toMatchObject({ title: 'Write tests', status: 'in_progress', priority: 'high' });
    // id / version / タイムスタンプはアプリが付与する（監査系は meta にまとめて返す）。
    expect(typeof json.id).toBe('string');
    const meta = json.meta as Record<string, unknown>;
    expect(meta.version).toBe(1);
    expect(typeof meta.createdAt).toBe('string');
  });

  it('records the authenticated user as createdBy', async () => {
    const { json } = await createTask(validBody({ title: 'Owned task' }));

    // authZ が JIT プロビジョニングした users 行の id（session の userSub ではなく）。
    const [user] = await db.select().from(users).where(eq(users.userSub, testSession().userSub));
    expect(json.createdBy).toBe(user?.id);
  });

  it('rejects a body missing required fields with 400', async () => {
    // status / priority を必須にしたので、title だけでは通らない（フロントに値を明示させる）。欠落は
    // 型契約にも反するので、zValidator の 400 を確かめるため型を外して送る。
    const res = await client.tasks.$post({ json: { title: 'no status/priority' } as never });

    expect(res.status).toBe(400);
  });

  it('rejects an empty title with 400', async () => {
    const res = await client.tasks.$post({ json: validBody({ title: '   ' }) });

    expect(res.status).toBe(400);
  });

  it('accepts an offset ISO dueDate and returns it as a string', async () => {
    const { res, json } = await createTask(validBody({ dueDate: '2026-07-01T09:30:00+09:00' }));

    expect(res.status).toBe(201);
    expect(typeof json.dueDate).toBe('string');
    expect(new Date(json.dueDate as string).toISOString()).toBe('2026-07-01T00:30:00.000Z');
  });
});
