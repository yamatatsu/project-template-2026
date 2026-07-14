import { testClient } from 'hono/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, testSession, withSession } from '../__tests__/support.ts';
import { seedTask } from './__tests__/seed.ts';

vi.mock('@icasu/db/client', () =>
  import('../__tests__/support.ts').then((m) => m.createTestDbModule()),
);

const client = testClient(withSession((await import('./tasks.list.ts')).default, testSession()));
const { db } = await import('@icasu/db/client');
const { tasksTable } = await import('@icasu/db/schema');

beforeAll(() => migrateTestDb(db));
afterEach(() => db.delete(tasksTable));

/** createdAt を 1 日ずつずらして count 件 seed する（順序とページ境界を決定的にする）。 */
function seedTasksByDay(count: number) {
  return Promise.all(
    Array.from({ length: count }, (_, i) =>
      seedTask(db, {
        title: `task-${i}`,
        createdAt: new Date(Date.UTC(2026, 0, i + 1)),
      }),
    ),
  );
}

describe('GET /tasks', () => {
  it('returns tasks ordered by createdAt descending with the total count', async () => {
    const [first, second] = await seedTasksByDay(2);

    const res = await client.tasks.$get({ query: {} });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { items: Array<Record<string, unknown>>; total: number };
    expect(body.total).toBe(2);
    expect(body.items).toHaveLength(2);
    // 新しいものが先頭。
    expect(body.items.map((row) => row.id)).toEqual([second?.id, first?.id]);
    // read も write と同一のワイヤ形（監査列は meta にまとめ、トップレベルには出さない）。
    const [newest] = body.items;
    const meta = newest?.meta as Record<string, unknown>;
    expect(meta.version).toBe(second?.version);
    expect(typeof meta.createdAt).toBe('string');
    expect(newest?.createdAt).toBeUndefined();
  });

  it('returns the requested page and keeps total at the full count', async () => {
    const seeded = await seedTasksByDay(3);

    const page1 = (await (
      await client.tasks.$get({ query: { page: '1', pageSize: '2' } })
    ).json()) as { items: Array<Record<string, unknown>>; total: number };
    expect(page1.total).toBe(3);
    expect(page1.items.map((row) => row.id)).toEqual([seeded[2]?.id, seeded[1]?.id]);

    const page2 = (await (
      await client.tasks.$get({ query: { page: '2', pageSize: '2' } })
    ).json()) as { items: Array<Record<string, unknown>>; total: number };
    expect(page2.total).toBe(3);
    expect(page2.items.map((row) => row.id)).toEqual([seeded[0]?.id]);
  });

  it('returns an empty page beyond the last one without failing', async () => {
    await seedTasksByDay(1);

    const res = await client.tasks.$get({ query: { page: '5', pageSize: '10' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expect.objectContaining({ items: [], total: 1 }));
  });

  it('rejects a pageSize above the cap with 400', async () => {
    const res = await client.tasks.$get({ query: { pageSize: '101' } });
    expect(res.status).toBe(400);
  });

  it.each([
    { name: 'zero page', query: { page: '0' } },
    { name: 'non-numeric page', query: { page: 'abc' } },
    { name: 'zero pageSize', query: { pageSize: '0' } },
    { name: 'negative pageSize', query: { pageSize: '-1' } },
  ])('rejects invalid query ($name) with 400', async ({ query }) => {
    const res = await client.tasks.$get({ query });
    expect(res.status).toBe(400);
  });

  it('returns an empty list when there are no tasks', async () => {
    const res = await client.tasks.$get({ query: {} });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], total: 0 });
  });
});
