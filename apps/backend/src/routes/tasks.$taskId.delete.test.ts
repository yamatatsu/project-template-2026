import { eq } from 'drizzle-orm';
import { testClient } from 'hono/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, seedSessionUser, testSession, withSession } from '../__tests__/support.ts';
import { seedTask } from './__tests__/seed.ts';

vi.mock('@icasu/db/client', () =>
  import('../__tests__/support.ts').then((m) => m.createTestDbModule()),
);

// 監査ログは出力そのものではなく「何を記録したか」を検証する（実出力の検証は packages/logger 側）。
vi.mock('@icasu/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@icasu/logger')>()),
  auditLog: vi.fn(),
}));

const client = testClient(
  withSession((await import('./tasks.$taskId.delete.ts')).default, testSession()),
);
const { db } = await import('@icasu/db/client');
const { tasks, users } = await import('@icasu/db/schema');
const { auditLog } = await import('@icasu/logger');

beforeAll(() => migrateTestDb(db));
// DELETE は task:write（admin 限定）なので、session ユーザーを admin として用意する。
beforeEach(async () => {
  vi.mocked(auditLog).mockClear();
  await seedSessionUser(db, 'admin');
});
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

  it('records a task.deleted audit event with the acting user', async () => {
    const created = await seedTask(db, { title: 'delete me' });

    await client.tasks[':id'].$delete({ param: { id: created.id } });

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'task.deleted',
        outcome: 'success',
        actor: expect.objectContaining({ userSub: testSession().userSub, role: 'admin' }),
        target: { type: 'task', id: created.id },
      }),
    );
  });

  // 存在しない id への試行は不正の兆候ではないので証跡に残さない（404 はアクセスログで追える）。
  it('does not record an audit event when the task does not exist', async () => {
    await client.tasks[':id'].$delete({
      param: { id: '00000000-0000-0000-0000-000000000000' },
    });

    expect(auditLog).not.toHaveBeenCalled();
  });
});
