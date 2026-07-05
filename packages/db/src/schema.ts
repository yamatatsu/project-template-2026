import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Aurora DSQL は `CREATE TYPE ... AS ENUM` をサポートしないため pgEnum は使わず、
// text + CHECK 制約で表現する。値のリストはここを単一の定義源とし、backend の
// zod スキーマ等からも再利用する。
export const taskStatusValues = ['todo', 'in_progress', 'done'] as const;
export const taskPriorityValues = ['low', 'medium', 'high'] as const;

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
