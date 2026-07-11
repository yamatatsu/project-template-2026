import { testClient } from 'hono/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, testSession, withSession } from '../__tests__/support.ts';
import { seedUser } from './__tests__/seed.ts';

vi.mock('@icasu/db/client', () =>
  import('../__tests__/support.ts').then((m) => m.createTestDbModule()),
);

const client = testClient(withSession((await import('./users.list.ts')).default, testSession()));
const { db } = await import('@icasu/db/client');
const { users } = await import('@icasu/db/schema');

beforeAll(() => migrateTestDb(db));

// GET /users は user:read（admin 限定）。session ユーザー（viewer）自身も一覧に載るので、admin として
// 用意しつつ createdAt を最古にして末尾に固定し、seed した対象ユーザーの順序検証を邪魔しないようにする。
let viewerId: string;
beforeEach(async () => {
  const viewer = await seedUser(db, {
    userSub: 'test-user',
    role: 'admin',
    createdAt: new Date(Date.UTC(2025, 11, 31)),
  });
  viewerId = viewer.id;
});
afterEach(() => db.delete(users));

/** createdAt を 1 日ずつずらして count 件 seed する（順序とページ境界を決定的にする）。 */
function seedUsersByDay(count: number) {
  return Promise.all(
    Array.from({ length: count }, (_, i) =>
      seedUser(db, {
        userSub: `user-${i}`,
        role: 'member',
        createdAt: new Date(Date.UTC(2026, 0, i + 1)),
      }),
    ),
  );
}

describe('GET /users', () => {
  it('returns users ordered by createdAt descending with the total count', async () => {
    const [first, second] = await seedUsersByDay(2);

    const res = await client.users.$get({ query: {} });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { items: Array<Record<string, unknown>>; total: number };
    // viewer 自身も含まれる。
    expect(body.total).toBe(3);
    expect(body.items).toHaveLength(3);
    // 新しいものが先頭、viewer（最古）が末尾。
    expect(body.items.map((row) => row.id)).toEqual([second?.id, first?.id, viewerId]);
    // read も write と同一のワイヤ形（監査列は meta にまとめ、トップレベルには出さない。email は持たない）。
    const [newest] = body.items;
    expect(newest?.userSub).toBe('user-1');
    expect(newest?.role).toBe('member');
    const meta = newest?.meta as Record<string, unknown>;
    expect(meta.version).toBe(second?.version);
    expect(typeof meta.createdAt).toBe('string');
    expect(newest?.createdAt).toBeUndefined();
  });

  it('returns the requested page and keeps total at the full count', async () => {
    const seeded = await seedUsersByDay(3);

    const page1 = (await (
      await client.users.$get({ query: { page: '1', pageSize: '2' } })
    ).json()) as { items: Array<Record<string, unknown>>; total: number };
    expect(page1.total).toBe(4);
    expect(page1.items.map((row) => row.id)).toEqual([seeded[2]?.id, seeded[1]?.id]);

    const page2 = (await (
      await client.users.$get({ query: { page: '2', pageSize: '2' } })
    ).json()) as { items: Array<Record<string, unknown>>; total: number };
    expect(page2.total).toBe(4);
    // 3 対象ユーザーの最古 + viewer。
    expect(page2.items.map((row) => row.id)).toEqual([seeded[0]?.id, viewerId]);
  });

  it('rejects a pageSize above the cap with 400', async () => {
    const res = await client.users.$get({ query: { pageSize: '101' } });
    expect(res.status).toBe(400);
  });

  it('returns 403 when a member views the user list', async () => {
    // viewer を member に差し替える（user:read は admin 限定）。
    await db.delete(users);
    await seedUser(db, { userSub: 'test-user', role: 'member' });

    const res = await client.users.$get({ query: {} });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
  });
});
