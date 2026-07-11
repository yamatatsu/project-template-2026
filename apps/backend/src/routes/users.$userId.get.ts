import { zValidator } from '@hono/zod-validator';
import { db } from '@icasu/db/client';
import { users } from '@icasu/db/schema';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { auth } from '../middleware/auth.ts';
import { rowToUserResponse, userIdParamSchema } from '../wire/user.ts';

// 読み取り系はドメイン層（entities/repo）を経由せず drizzle を直書きする（mini-CQRS。詳細は CLAUDE.md）。
// ワイヤ形だけは write と揃えるため rowToUserResponse で meta ネストに整形する。ユーザー管理は admin 限定。
export default new Hono().get(
  '/users/:id',
  auth({ action: 'user:read' }),
  zValidator('param', userIdParamSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }
    return c.json(rowToUserResponse(user));
  },
);
