import { zValidator } from '@hono/zod-validator';
import { db } from '@icasu/db/client';
import { users } from '@icasu/db/schema';
import { count, desc } from 'drizzle-orm';
import { Hono } from 'hono';

import { auth } from '../middleware/auth.ts';
import { rowToUserResponse, userListQuerySchema } from '../wire/user.ts';
import type { UserListResponse } from '../wire/user.ts';

// 読み取り系はドメイン層を経由せず drizzle を直書きする（mini-CQRS。詳細は CLAUDE.md）。ワイヤ形だけは
// write と揃えるため rowToUserResponse で meta ネストに整形する。ユーザー管理は admin 限定。
export default new Hono().get(
  '/users',
  auth({ action: 'user:read' }),
  zValidator('query', userListQuerySchema),
  async (c) => {
    const { page, pageSize } = c.req.valid('query');
    const { rows, total } = await findManyUsers(page, pageSize);
    const body: UserListResponse = {
      items: rows.map(rowToUserResponse),
      total,
    };
    return c.json(body);
  },
);

async function findManyUsers(
  page: number,
  pageSize: number,
): Promise<{ rows: (typeof users.$inferSelect)[]; total: number }> {
  const [rows, [totalRow]] = await Promise.all([
    db
      .select()
      .from(users)
      // createdAt は同値になり得る（一括投入など）ので id で全順序にし、ページ間の重複・欠落を防ぐ。
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(users),
  ]);
  return {
    rows,
    total: totalRow?.total ?? 0,
  };
}
