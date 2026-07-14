import type { SessionContext } from '@icasu/backend-auth';
import { Hono } from 'hono';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, newRowColumns, withSession } from '../__tests__/support.ts';
import { auth } from './auth.ts';

vi.mock('@icasu/db/client', () =>
  import('../__tests__/support.ts').then((m) => m.createTestDbModule()),
);

// 監査ログは出力そのものではなく「何を記録したか」を検証したいので、emit 口だけ差し替える
// （実出力の検証は packages/logger 側にある）。
vi.mock('@icasu/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@icasu/logger')>()),
  auditLog: vi.fn(),
}));

const { db } = await import('@icasu/db/client');
const { usersTable } = await import('@icasu/db/schema');
const { auditLog } = await import('@icasu/logger');

beforeAll(() => migrateTestDb(db));
beforeEach(() => vi.mocked(auditLog).mockClear());
afterEach(() => db.delete(usersTable));

const session = (userSub: string): SessionContext => ({
  sessionId: 's',
  userSub,
  email: undefined,
});

/** action を要求する保護ルート（解決した user を返す）を session 注入込みで組む。 */
function probeApp(action: 'task:read' | 'task:write', userSub: string) {
  const route = new Hono().get('/probe', auth({ action }), (c) =>
    c.json({ id: c.get('user').id, role: c.get('user').role }),
  );
  return withSession(route, session(userSub));
}

describe('auth middleware', () => {
  it('provisions a user JIT on first access and defaults role to member', async () => {
    const res = await probeApp('task:read', 'sub-new').request('/probe');

    expect(res.status).toBe(200);
    expect(((await res.json()) as { role: string }).role).toBe('member');

    const rows = await db.select().from(usersTable);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userSub).toBe('sub-new');
  });

  it('resolves an existing user without creating a duplicate', async () => {
    await db
      .insert(usersTable)
      .values({ ...newRowColumns(), userSub: 'sub-existing', role: 'admin' });

    const res = await probeApp('task:read', 'sub-existing').request('/probe');

    expect(res.status).toBe(200);
    expect(await db.select().from(usersTable)).toHaveLength(1);
  });

  it('allows a member (JIT default) through a task:read route', async () => {
    const res = await probeApp('task:read', 'sub-member').request('/probe');

    expect(res.status).toBe(200);
    expect(((await res.json()) as { role: string }).role).toBe('member');
  });

  it('returns 403 when a member hits a task:write route', async () => {
    const res = await probeApp('task:write', 'sub-member').request('/probe');

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
  });

  // 権限の無い操作の試行は不正アクセスの兆候なので、403 を返すだけでなく証跡に残す。
  it('records an authz.denied audit event on 403', async () => {
    await probeApp('task:write', 'sub-member').request('/probe');

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'authz.denied',
        outcome: 'failure',
        reason: 'missing-permission',
        actor: expect.objectContaining({ userSub: 'sub-member', role: 'member' }),
        detail: { requiredAction: 'task:write' },
      }),
    );
  });

  it('records a user.provisioned audit event when the JIT row is created', async () => {
    await probeApp('task:read', 'sub-new').request('/probe');

    const [user] = await db.select().from(usersTable);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.provisioned',
        outcome: 'success',
        actor: expect.objectContaining({ userSub: 'sub-new' }),
        target: { type: 'user', id: user?.id },
      }),
    );
  });

  it('does not record an audit event when an existing authorized user passes', async () => {
    await db.insert(usersTable).values({ ...newRowColumns(), userSub: 'sub-admin', role: 'admin' });

    await probeApp('task:write', 'sub-admin').request('/probe');

    expect(auditLog).not.toHaveBeenCalled();
  });

  it('allows an admin through a task:write route', async () => {
    await db.insert(usersTable).values({ ...newRowColumns(), userSub: 'sub-admin', role: 'admin' });

    const res = await probeApp('task:write', 'sub-admin').request('/probe');

    expect(res.status).toBe(200);
    expect(((await res.json()) as { role: string }).role).toBe('admin');
  });
});
