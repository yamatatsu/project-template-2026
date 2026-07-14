import { sql } from 'drizzle-orm';
import { check, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Aurora DSQL は `CREATE TYPE ... AS ENUM` をサポートしないため pgEnum は使わず、
// text + CHECK 制約で表現する。値のリストはここを単一の定義源とし、backend の
// zod スキーマ等からも再利用する。
export const taskStatusValues = ['todo', 'in_progress', 'done'] as const;
export const taskPriorityValues = ['low', 'medium', 'high'] as const;
export const userRoleValues = ['member', 'admin'] as const;

/** CHECK 制約用の `'a', 'b', 'c'` リテラル列を組み立てる（内部定数のみを渡すこと）。 */
const literalList = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(', '));

/**
 * 楽観ロック用のバージョン列。**このリポの全テーブルに必須**（新しいテーブルにも必ず入れる）。
 * 更新時に `version = version + 1` で進め、WHERE version = <読み取り時の値> と一致した行だけを
 * 更新することで、間に別の更新が挟まった競合（lost update）を検出する。
 *
 * DB のデフォルトは付けず `notNull()` だけにする。初期値（1）や増分はアプリが決める
 * （値の決定を DB に散らさず、ゆくゆくのドメイン層へ素直に寄せるため）。
 * テーブル作成時に必ず入れるのは、Aurora DSQL が NOT NULL 列の後付けをできない
 * （ALTER TABLE ADD COLUMN に NOT NULL 不可・ALTER COLUMN ... SET NOT NULL も不可）ため。
 * 後から足すとテーブル再作成が要る（0002 / 0003 参照）ので、最初から入れておく。
 */
const versionColumn = () => integer('version').notNull();

// このリポの方針: **列の値が何であるべきかは DB のデフォルトではなくアプリが決める**。
// そのため業務的な既定値（status='todo' 等）や version/監査タイムスタンプに `.default()` を付けず、
// 制約（nullability・CHECK・unique）だけを DB に持たせる。id だけは surrogate key 生成の保険として
// defaultRandom を残すが、insert 時はアプリも uuid を明示する（ゆくゆくのドメイン層へ寄せやすくする）。
export const tasksTable = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status', { enum: taskStatusValues }).notNull(),
    priority: text('priority', { enum: taskPriorityValues }).notNull(),
    dueDate: timestamp('due_date'),
    // 作成者。users.id を指すアプリ層の参照（DSQL のため FK は張らず整合性はアプリで担保）。
    // 全 task は作成者を必ず持つため notNull。ただし DSQL は ALTER TABLE ADD COLUMN に NOT NULL を
    // 付けられず SET NOT NULL も不可のため、この列の追加マイグレーション（0002）はテーブル再作成で
    // 行っている（導入時点でローカル・クラウドとも tasks は空のため損失なし）。
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
    version: versionColumn(),
  },
  (table) => [
    check('tasks_status_check', sql`${table.status} in (${literalList(taskStatusValues)})`),
    check('tasks_priority_check', sql`${table.priority} in (${literalList(taskPriorityValues)})`),
  ],
);

export type Task = typeof tasksTable.$inferSelect;
export type NewTask = typeof tasksTable.$inferInsert;

export const usersTable = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // OIDC の sub。session.userSub と突き合わせるドメイン User の結合キー。1 ユーザー 1 行に
    // するため unique。email は IdP（Cognito / session）を単一の真実の源とし、DB には持たない。
    userSub: text('user_sub').notNull().unique(),
    role: text('role', { enum: userRoleValues }).notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
    version: versionColumn(),
  },
  (table) => [check('users_role_check', sql`${table.role} in (${literalList(userRoleValues)})`)],
);

export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
