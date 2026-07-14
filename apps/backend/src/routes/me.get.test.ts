import { testClient } from 'hono/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, seedSessionUser, testSession, withSession } from '../__tests__/support.ts';

vi.mock('@icasu/db/client', () =>
  import('../__tests__/support.ts').then((m) => m.createTestDbModule()),
);

const meRoute = (await import('./me.get.ts')).default;
const { db } = await import('@icasu/db/client');
const { usersTable } = await import('@icasu/db/schema');

beforeAll(() => migrateTestDb(db));
afterEach(() => db.delete(usersTable));

describe('GET /me', () => {
  it('returns the identity and member permissions for a JIT-provisioned user', async () => {
    const session = testSession({ userSub: 'member-sub', email: 'member@example.com' });
    const client = testClient(withSession(meRoute, session));

    const res = await client.me.$get();

    expect(res.status).toBe(200);
    // 初回アクセスは JIT で role=member → task:read のみ。
    expect(await res.json()).toEqual({
      userSub: 'member-sub',
      email: 'member@example.com',
      permissions: ['task:read'],
    });
  });

  it('returns task:write in permissions for an admin', async () => {
    const session = testSession({ userSub: 'admin-sub', email: undefined });
    await seedSessionUser(db, 'admin', session);
    const client = testClient(withSession(meRoute, session));

    const res = await client.me.$get();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      userSub: 'admin-sub',
      email: undefined,
      permissions: ['task:read', 'task:write'],
    });
  });
});
