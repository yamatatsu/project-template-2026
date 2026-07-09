import type { SessionContext } from '@icasu/backend-auth';
import { Hono } from 'hono';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, newRowColumns, withSession } from '../__tests__/support.ts';
import { auth } from './auth.ts';

vi.mock('@icasu/db/client', () =>
  import('../__tests__/support.ts').then((m) => m.createTestDbModule()),
);

const { db } = await import('@icasu/db/client');
const { users } = await import('@icasu/db/schema');

beforeAll(() => migrateTestDb(db));
afterEach(() => db.delete(users));

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

    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userSub).toBe('sub-new');
  });

  it('resolves an existing user without creating a duplicate', async () => {
    await db.insert(users).values({ ...newRowColumns(), userSub: 'sub-existing', role: 'admin' });

    const res = await probeApp('task:read', 'sub-existing').request('/probe');

    expect(res.status).toBe(200);
    expect(await db.select().from(users)).toHaveLength(1);
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

  it('allows an admin through a task:write route', async () => {
    await db.insert(users).values({ ...newRowColumns(), userSub: 'sub-admin', role: 'admin' });

    const res = await probeApp('task:write', 'sub-admin').request('/probe');

    expect(res.status).toBe(200);
    expect(((await res.json()) as { role: string }).role).toBe('admin');
  });
});
