import { testClient } from 'hono/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, seedSessionUser, testSession, withSession } from '../__tests__/support.ts';
import { seedUser } from './__tests__/seed.ts';

vi.mock('@icasu/db/client', () =>
  import('../__tests__/support.ts').then((m) => m.createTestDbModule()),
);

const client = testClient(
  withSession((await import('./users.$userId.get.ts')).default, testSession()),
);
const { db } = await import('@icasu/db/client');
const { users } = await import('@icasu/db/schema');

beforeAll(() => migrateTestDb(db));
// GET /users/:id は user:read（admin 限定）なので、session ユーザーを admin として用意する。
beforeEach(() => seedSessionUser(db, 'admin'));
afterEach(() => db.delete(users));

describe('GET /users/:id', () => {
  it('returns the user by id in the shared wire shape', async () => {
    const target = await seedUser(db, { userSub: 'target-user', role: 'member' });

    const res = await client.users[':id'].$get({ param: { id: target.id } });
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.id).toBe(target.id);
    expect(body.userSub).toBe('target-user');
    expect(body.role).toBe('member');
    // 監査列は meta にまとめ、トップレベルには出さない。
    const meta = body.meta as Record<string, unknown>;
    expect(meta.version).toBe(target.version);
    expect(typeof meta.createdAt).toBe('string');
    expect(body.createdAt).toBeUndefined();
  });

  it('returns 404 for a non-existent uuid', async () => {
    const res = await client.users[':id'].$get({
      param: { id: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'User not found' });
  });
});
