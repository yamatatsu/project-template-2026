import { randomUUID } from 'node:crypto';

import { db } from './client.ts';
import {
  type NewTask,
  type NewUser,
  taskPriorityValues,
  taskStatusValues,
  tasksTable,
  usersTable,
} from './schema.ts';

// ローカル動作確認用のシード。`pnpm db:seed`（ルート）/ `pnpm --filter @icasu/db db:seed` で流す。
// - member / admin の 2 ユーザーと、確認に十分な件数（101 件）のタスクを投入する。
// - user_sub は oidc-server-mock の事前定義ユーザー（docker/oidc-server-mock/users.json）に合わせる。
//   これにより、ローカルで `member` / `admin` でログインしたときに JIT ではなくこの行に解決される。
// - 何度流しても同じ状態に収束させる（tasks は全削除して入れ直し、users は user_sub の unique で吸収）。
//   本番 DB を汚さないための保険として、DSQL 接続時は実行を拒否する（下の guard）。

const TASK_COUNT = 101;

// oidc-server-mock の user_sub（docker/oidc-server-mock/users.json）。ログイン時の突き合わせキー。
const MEMBER_SUB = 'member-user';
const ADMIN_SUB = 'admin-user';

async function seed(): Promise<void> {
  // DSQL_ENDPOINT が設定されているとクラウドの DB に接続してしまう。シードはローカル専用なので明示的に弾く。
  if (process.env.DSQL_ENDPOINT) {
    throw new Error(
      'db:seed はローカル（DATABASE_URL）専用です。DSQL_ENDPOINT が設定されています。',
    );
  }

  const [member, admin] = await upsertUsers();
  await replaceTasks([member.id, admin.id]);

  console.log(
    `シード完了: users=2（member=${member.id} / admin=${admin.id}）, tasks=${TASK_COUNT}`,
  );
}

/**
 * member / admin の 2 ユーザーを確保して正準な行（id 付き）を返す。再実行に備え unique(user_sub) +
 * onConflictDoNothing で吸収し、勝った行を読み直して収束させる（addUser と同じ考え方）。
 */
async function upsertUsers(): Promise<[{ id: string }, { id: string }]> {
  const now = new Date();
  const rows: NewUser[] = [
    {
      id: randomUUID(),
      userSub: MEMBER_SUB,
      role: 'member',
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      userSub: ADMIN_SUB,
      role: 'admin',
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
  ];
  await db.insert(usersTable).values(rows).onConflictDoNothing();

  const found = await db
    .select({ id: usersTable.id, userSub: usersTable.userSub })
    .from(usersTable);
  const bySub = new Map(found.map((row) => [row.userSub, row]));
  const member = bySub.get(MEMBER_SUB);
  const admin = bySub.get(ADMIN_SUB);
  if (!member || !admin) {
    throw new Error('シード対象の user 行を確保できませんでした');
  }
  return [member, admin];
}

/** tasks を全削除して 101 件入れ直す（再実行で件数が増えないよう、まず空にする）。 */
async function replaceTasks(creatorIds: string[]): Promise<void> {
  await db.delete(tasksTable);
  await db.insert(tasksTable).values(buildTasks(creatorIds));
}

// index からの循環選択。modulo で常に範囲内だが noUncheckedIndexedAccess 下では undefined 型が
// 残るため、空配列だけを弾いて要素型に絞る。
function cycle<T>(values: readonly T[], index: number): T {
  const value = values[index % values.length];
  if (value === undefined) throw new Error('cycle: values must not be empty');
  return value;
}

/**
 * 確認用に status / priority / dueDate / description をばらけさせた 101 件を組み立てる。
 * 乱数は使わず index から決定的に作る（再実行で内容が変わらないようにするため）。
 */
function buildTasks(creatorIds: string[]): NewTask[] {
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;

  return Array.from({ length: TASK_COUNT }, (_unused, index): NewTask => {
    const number = index + 1;
    return {
      id: randomUUID(),
      title: `サンプルタスク #${number}`,
      // 3 件に 1 件は description なし（null 可の列を両方の状態で確認できるように）。
      description:
        index % 3 === 0 ? null : `動作確認用のサンプルタスク（${number} 件目）の説明文。`,
      status: cycle(taskStatusValues, index),
      // priority は status と位相をずらして組み合わせを散らす。
      priority: cycle(taskPriorityValues, index + 1),
      // 4 件に 1 件は期限なし。残りは今日を起点に前後へばらけさせる。
      dueDate: index % 4 === 0 ? null : new Date(now.getTime() + (index - 20) * dayMs),
      createdBy: cycle(creatorIds, index),
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
  });
}

await seed();

// pg の Pool が接続を保持しプロセスが終了しないため、明示的に終了する（cli.ts と同じ）。
process.exit(0);
