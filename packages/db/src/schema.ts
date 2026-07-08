import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Aurora DSQL は `CREATE TYPE ... AS ENUM` をサポートしないため pgEnum は使わず、
// text + CHECK 制約で表現する。値のリストはここを単一の定義源とし、backend の
// zod スキーマ等からも再利用する。
export const taskStatusValues = ['todo', 'in_progress', 'done'] as const;
export const taskPriorityValues = ['low', 'medium', 'high'] as const;
export const userRoleValues = ['member', 'admin'] as const;

/** CHECK 制約用の `'a', 'b', 'c'` リテラル列を組み立てる（内部定数のみを渡すこと）。 */
const literalList = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(', '));

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status', { enum: taskStatusValues }).notNull().default('todo'),
    priority: text('priority', { enum: taskPriorityValues }).notNull().default('medium'),
    dueDate: timestamp('due_date'),
    // 作成者。users.id を指すアプリ層の参照（DSQL のため FK は張らず整合性はアプリで担保）。
    // 全 task は作成者を必ず持つため notNull。ただし DSQL は ALTER TABLE ADD COLUMN に NOT NULL を
    // 付けられず SET NOT NULL も不可のため、この列の追加マイグレーション（0002）はテーブル再作成で
    // 行っている（導入時点でローカル・クラウドとも tasks は空のため損失なし）。
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check('tasks_status_check', sql`${table.status} in (${literalList(taskStatusValues)})`),
    check('tasks_priority_check', sql`${table.priority} in (${literalList(taskPriorityValues)})`),
  ],
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // OIDC の sub。session.userSub と突き合わせるドメイン User の結合キー。1 ユーザー 1 行に
    // するため unique。email は IdP（Cognito / session）を単一の真実の源とし、DB には持たない。
    userSub: text('user_sub').notNull().unique(),
    role: text('role', { enum: userRoleValues }).notNull().default('member'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [check('users_role_check', sql`${table.role} in (${literalList(userRoleValues)})`)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
