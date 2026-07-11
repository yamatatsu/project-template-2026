import { eq } from 'drizzle-orm';
import type { InferRequestType } from 'hono/client';
import { testClient } from 'hono/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, testSession, withSession } from '../__tests__/support.ts';
import { seedUser } from './__tests__/seed.ts';

vi.mock('@icasu/db/client', () =>
  import('../__tests__/support.ts').then((m) => m.createTestDbModule()),
);

const client = testClient(
  withSession((await import('./users.$userId.put.ts')).default, testSession()),
);
const { db } = await import('@icasu/db/client');
const { users } = await import('@icasu/db/schema');

beforeAll(() => migrateTestDb(db));
// role による認可・自己降格ガードを検証するため、viewer の role は各テストで明示的に seed する。
afterEach(() => db.delete(users));

type UserInput = InferRequestType<(typeof client.users)[':id']['$put']>['json'];

// If-Match の entity-tag（"<version>"）に版を載せる（Hono がヘッダ名を小文字化するのでキーは if-match）。
const ifMatch = (version: number) => ({ 'if-match': `"${version}"` });

// session ユーザー（userSub は testSession の既定 'test-user'）を admin として用意し、その行を返す。
const seedAdminViewer = () => seedUser(db, { userSub: 'test-user', role: 'admin' });

describe('PUT /users/:id', () => {
  it('promotes a member to admin and bumps the version', async () => {
    await seedAdminViewer();
    const target = await seedUser(db, { userSub: 'target-user', role: 'member' });

    const res = await client.users[':id'].$put({
      param: { id: target.id },
      json: { role: 'admin' },
      header: ifMatch(target.version),
    });

    expect(res.status).toBe(200);
    const updated = (await res.json()) as Record<string, unknown>;
    expect(updated.id).toBe(target.id);
    expect(updated.role).toBe('admin');
    const meta = updated.meta as Record<string, unknown>;
    expect(meta.version).toBe(target.version + 1);
  });

  it('returns 412 on a stale If-Match version and leaves the row untouched', async () => {
    await seedAdminViewer();
    const target = await seedUser(db, { userSub: 'target-user', role: 'member' });

    const res = await client.users[':id'].$put({
      param: { id: target.id },
      json: { role: 'admin' },
      header: ifMatch(target.version - 1),
    });

    expect(res.status).toBe(412);
    expect(await res.json()).toEqual({
      error: 'Version conflict',
      entity: 'user',
      id: target.id,
    });

    const [row] = await db.select().from(users).where(eq(users.id, target.id));
    expect(row?.role).toBe('member');
    expect(row?.version).toBe(target.version);
  });

  it('returns 428 when If-Match is absent (optimistic lock required)', async () => {
    await seedAdminViewer();
    const target = await seedUser(db, { userSub: 'target-user', role: 'member' });

    // If-Match を送らない検証。header は RPC 型で必須なので、欠如を再現するため型を外して送る。
    const res = await client.users[':id'].$put({
      param: { id: target.id },
      json: { role: 'admin' },
    } as never);

    expect(res.status).toBe(428);
    const [row] = await db.select().from(users).where(eq(users.id, target.id));
    expect(row?.role).toBe('member');
    expect(row?.version).toBe(target.version);
  });

  it('rejects an invalid role with 400', async () => {
    await seedAdminViewer();
    const target = await seedUser(db, { userSub: 'target-user', role: 'member' });

    const res = await client.users[':id'].$put({
      param: { id: target.id },
      // 未知の role は enum 検証で 400（If-Match は有効なので 428/412 ではない）。
      json: { role: 'superadmin' } as never,
      header: ifMatch(target.version),
    });

    expect(res.status).toBe(400);
  });

  it('returns 404 when updating a non-existent uuid', async () => {
    await seedAdminViewer();

    const res = await client.users[':id'].$put({
      param: { id: '00000000-0000-0000-0000-000000000000' },
      json: { role: 'admin' },
      header: ifMatch(1),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'User not found' });
  });

  it('returns 403 when an admin tries to demote themselves', async () => {
    const viewer = await seedAdminViewer();

    const res = await client.users[':id'].$put({
      param: { id: viewer.id },
      json: { role: 'member' },
      header: ifMatch(viewer.version),
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden', reason: 'self-demotion' });

    // 自己降格は拒否され、行は admin のまま。
    const [row] = await db.select().from(users).where(eq(users.id, viewer.id));
    expect(row?.role).toBe('admin');
    expect(row?.version).toBe(viewer.version);
  });

  it('returns 403 when a member tries to change a role (user:write is admin-only)', async () => {
    await seedUser(db, { userSub: 'test-user', role: 'member' });
    const target = await seedUser(db, { userSub: 'target-user', role: 'member' });

    const res = await client.users[':id'].$put({
      param: { id: target.id },
      json: { role: 'admin' },
      header: ifMatch(target.version),
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
  });
});
