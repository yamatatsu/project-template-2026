import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, testSession, withSession } from '../__tests__/support.ts';
import { seedTask } from './__tests__/seed.ts';

vi.mock('@icasu/db/client', () =>
  import('../__tests__/support.ts').then((m) => m.createTestDbModule()),
);

const app = withSession((await import('./tasks.list.ts')).default, testSession());
const { db } = await import('@icasu/db/client');
const { tasks } = await import('@icasu/db/schema');

beforeAll(() => migrateTestDb(db));
afterEach(() => db.delete(tasks));

describe('GET /tasks', () => {
  it('returns all tasks ordered by createdAt descending', async () => {
    // createdAt を明示して順序を決定的にする（defaultNow だと連続 insert で同値になり得る）。
    const first = await seedTask(db, {
      title: 'first',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    const second = await seedTask(db, {
      title: 'second',
      createdAt: new Date('2026-01-02T00:00:00Z'),
    });

    const res = await app.request('/tasks');
    expect(res.status).toBe(200);

    const rows = (await res.json()) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    // 新しいものが先頭。
    expect(rows.map((row) => row.id)).toEqual([second.id, first.id]);
    // read も write と同一のワイヤ形（監査列は meta にまとめ、トップレベルには出さない）。
    const [newest] = rows;
    const meta = newest?.meta as Record<string, unknown>;
    expect(meta.version).toBe(second.version);
    expect(typeof meta.createdAt).toBe('string');
    expect(newest?.createdAt).toBeUndefined();
  });

  it('returns an empty array when there are no tasks', async () => {
    const res = await app.request('/tasks');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
