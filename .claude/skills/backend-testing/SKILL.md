---
name: backend-testing
description: このモノレポ（project-template-2026）の `apps/backend`（Hono BFF）でテストを書く／直す／レビューするときの唯一の実装ガイド。ルート単体テストを PGlite（インメモリ Postgres）上で request→db→response で回し、`hono/testing` の `testClient` で型付き RPC として叩く方式・共通ヘルパ（`support.ts` / `seed.ts`）・session/認可の seed・並列性・落とし穴を集約する。以下のいずれかのとき必ず読むこと —— (1) `apps/backend` に新しいルートのテストを追加する／既存テストを直す・レビューする、(2) PGlite・`vi.mock('@icasu/db/client')`・`migrateTestDb`・`withSession`・`testSession`・`seedTask`・`seedSessionUser`・`testClient`・`InferRequestType` の使い方を知りたい、(3) テストで DB を差し替える／マイグレーションを当てる／session や role を用意する／楽観ロック（body の `expectedVersion`）や zValidator の 400/404/409 を検証する、(4) 「テストが並列で衝突しないのはなぜか」「negative test で型が通らない」等のテスト特有の疑問がある。バックエンドのテストに関わるならまずこのスキルを読む。
---

# apps/backend のテストの書き方

`apps/backend` のテストは **ルート単体テスト**が基本。対象ルートの default export を **本物の DB スタック
（drizzle + マイグレーション）を PGlite（インメモリ Postgres）に差し替えた状態**で、`testClient` の
型付き RPC として叩き、**request → db → response** を通しで検証する。モック用の口は接続先を PGlite に
すり替えるだけで、SQL・楽観ロックの CAS・zValidator も本物が走る。

設計の *why*（層分割・値の所有・楽観ロック・認可の分担など）は
[`apps/backend/CLAUDE.md`](../../../apps/backend/CLAUDE.md) が正典。ここは **テストの書き方**に絞る。

## 鉄則

- **1 ルート 1 テストファイル**。ルート実装と同じフラット命名にする（`routes/tasks.$taskId.put.ts` →
  `routes/tasks.$taskId.put.test.ts`）。1 ファイルに集約しない（肥大化する）。
- **リクエストは必ず `testClient` の型付き RPC で送る**（`app.request(url, …)` の手書きはしない）。
  param/json/query が RPC の型で検証され、テストのボディがサーバ契約とずれれば**型で落ちる**。
- **契約違反を意図的に送る negative test だけ `as never` で型を外す**（下記）。それ以外で型を緩めない。

## 共通ヘルパ（どこに何があるか）

テスト専用ヘルパは実行時コードに混ぜない。feature 非依存の汎用インフラは `src/__tests__/support.ts`、
routes が使う feature 固有ヘルパ（seed 等）は `src/routes/__tests__/`。

| ヘルパ | 置き場所 | 用途 |
| --- | --- | --- |
| `createTestDbModule()` | `__tests__/support.ts` | `@icasu/db/client` の差し替え本体。**`vi.mock` のファクトリからのみ**呼ぶ。 |
| `migrateTestDb(db)` | `__tests__/support.ts` | drizzle マイグレーションを PGlite に適用。`beforeAll` で呼ぶ。 |
| `withSession(route, session)` | `__tests__/support.ts` | 対象ルートを session 注入する薄い親 app で包む（`testClient` に渡す）。 |
| `testSession(overrides?)` | `__tests__/support.ts` | 既定 session。`userSub`/`email` を上書きして role 別ケースを作る。 |
| `seedSessionUser(db, role, session?)` | `__tests__/support.ts` | session の `userSub` に対応する `users` 行を指定 role で seed（write 系で admin を用意）。 |
| `newRowColumns()` | `__tests__/support.ts` | 新規行の監査系カラム（id/version/timestamps）を一括生成。主に seed ヘルパが使う。 |
| `seedTask(db, values)` | `routes/__tests__/seed.ts` | task を 1 行 seed して返す（存在を保証した `Task`）。 |

## セットアップ定型（ファイル冒頭）

```ts
import { testClient } from 'hono/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { migrateTestDb, testSession, withSession } from '../__tests__/support.ts';
import { seedTask } from './__tests__/seed.ts';

// @icasu/db/client を PGlite 上の drizzle クライアントに差し替える。
vi.mock('@icasu/db/client', () =>
  import('../__tests__/support.ts').then((m) => m.createTestDbModule()),
);

const client = testClient(withSession((await import('./tasks.list.ts')).default, testSession()));
const { db } = await import('@icasu/db/client');
const { tasks } = await import('@icasu/db/schema');

beforeAll(() => migrateTestDb(db)); // 実マイグレーションを適用
afterEach(() => db.delete(tasks)); // テスト間で行をクリア
```

- **`vi.mock` のファクトリは動的 import で呼ぶ**。ファクトリはファイル先頭へ巻き上げられるため、
  トップレベル import した関数を直接参照すると初期化前アクセスになる。`import(...).then(...)` で回避する。
- **`db` / スキーマは `vi.mock` 後に `await import` で取り出す**（差し替え済みのインスタンスを掴むため）。
- **後片付けは `afterEach(() => db.delete(<table>))`**。`users` も seed したら一緒に消す（複数テーブルは
  `afterEach(async () => { await db.delete(tasks); await db.delete(users); })`）。

## リクエスト（testClient の型付き RPC）

ルートのフルパスがそのまま RPC のキーになる（`/tasks/:id` → `client.tasks[':id']`）。

| エンドポイント | 呼び方 |
| --- | --- |
| `GET /tasks` | `client.tasks.$get()` |
| `GET /tasks/:id` | `client.tasks[':id'].$get({ param: { id } })` |
| `POST /tasks` | `client.tasks.$post({ json: body })` |
| `PUT /tasks/:id` | `client.tasks[':id'].$put({ param: { id }, json: { ...body, expectedVersion: 1 } })` |
| `DELETE /tasks/:id` | `client.tasks[':id'].$delete({ param: { id } })` |

- **`{ json }` を渡すと `content-type: application/json` が自動で付く**（手動ヘッダ不要）。
- **body 型は route から取り出して固定する**。テストのボディがサーバ契約とずれれば型で落ちる:

  ```ts
  import type { InferRequestType } from 'hono/client';

  type TaskInput = InferRequestType<(typeof client.tasks)['$post']>['json'];

  const validBody = (overrides: Partial<TaskInput> = {}): TaskInput => ({
    title: 'Write tests',
    description: null,
    status: 'todo',
    priority: 'medium',
    dueDate: null,
    ...overrides,
  });
  ```

  これは transform **前**の入力型なので `dueDate` は ISO 文字列を渡す（サーバが `Date` にパースする）。
- **楽観ロックの版は body の `expectedVersion`（number）で渡す**。PUT のスキーマ
  （`conditionalTaskInputSchema`）が RPC 型に載せているので **`json.expectedVersion` は型で必須**になる。
  **内容と版はヘルパを分ける**と、版を欠いたnegative test（400）がそのまま書ける:

  ```ts
  type TaskInput = InferRequestType<(typeof client.tasks)[':id']['$put']>['json'];
  type TaskContent = Omit<TaskInput, 'expectedVersion'>;

  const validContent = (overrides: Partial<TaskContent> = {}): TaskContent => ({ ...  });
  const validBody = (expectedVersion: number, overrides: Partial<TaskContent> = {}): TaskInput => ({
    ...validContent(overrides),
    expectedVersion,
  });
  ```

  版は 1 始まりの正の整数なので、**stale な版を試すときは `seedTask(db, { title, version: 2 })` のように
  seed 側の版を上げてから 1 を送る**（`version: 1` の行に `expectedVersion: 0` を送っても、競合ではなく
  スキーマ違反の 400 になる）。

## 認可（authZ）を通す

要求 action はルート側に書かれているので、**ファイル単体テストで認可まで込みで検証**できる。

- **read 系（`task:read`）**: 既定 session のままで通る。初回アクセスで JIT により `role='member'` の
  行が作られ、member は `task:read` を持つ。
- **write 系（`task:write` = admin 限定）**: `POST`/`PUT`/`DELETE` は admin が要る。`beforeEach(() =>
  seedSessionUser(db, 'admin'))` で session ユーザーを admin として先に用意する。忘れると **403**。

## negative test（意図的な契約違反）

型付き client は正しい形を要求するので、**わざと壊した入力**は型と衝突する。その 2 パターンだけ
`as never` で型を外し、コメントで理由を書く:

```ts
// 必須フィールド欠落 → zValidator の 400 を確かめる。
await client.tasks.$post({ json: { title: 'only title' } as never });

// expectedVersion 欠落 → zValidator の 400 を確かめる（楽観ロックが必須であることの検証）。
await client.tasks[':id'].$put({ param: { id }, json: validContent() as never });
```

`空 title`（`validBody({ title: '   ' })`）のように**型は正しいが値が不正**なケースは `as never` 不要
（そのまま渡して 400 を確認する）。

## レスポンスの検証

- **監査系カラムは `meta` にネストされ、トップレベルには出ない**（read/write 全 endpoint で同一ワイヤ形）。
  `json.meta.version` を見る。`json.version` / `json.createdAt` は `undefined` を期待してよい。
- **`Date` は ISO 文字列**で返る（`typeof meta.createdAt === 'string'`）。
- **本文は `(await res.json()) as Record<string, unknown>` で受けて**個別フィールドを assert する。DB を
  直接見て確かめたいとき（削除済み・未更新など）は `db.select().from(...)` を使い、取得系ルートに依存しない。
- 楽観ロック競合の 409 body は `{ error: 'Version conflict', entity: 'task', id }` のみ（現在版は返さない）。

## 並列性（安全に並列化される仕組み）

- **並列の単位はテストファイル**。vitest はファイルを別ワーカーで並列実行する。
- **各テストファイルが自分専用の PGlite を 1 つ持つ**。`vi.mock` はファイルごとに評価され、
  `createTestDbModule()` が呼ばれるたび `new PGlite()` でまっさらなインメモリ DB を作る。共有ポートも
  共有ファイルも無いので**ファイル間で状態が干渉しない**——だから並列で衝突しない。
- **同一ファイル内のテストは逐次**で 1 つの PGlite を共有するため、`afterEach` の行削除で独立性を保つ。

## 実行コマンド（`apps/backend` 内から）

| 目的 | コマンド |
| --- | --- |
| 全テスト | `pnpm test` |
| watch | `pnpm test:watch` |
| 1 ファイルだけ | `npx vitest run src/routes/tasks.list.test.ts` |

## リファレンス実装

迷ったら既存テストを写経の起点にする。**`routes/tasks.$taskId.put.test.ts` が最も網羅的**
（param + json、200/400/404/409、DB 直接検証、negative の `as never` を全部含む）。
read 系は `routes/tasks.list.test.ts` / `routes/tasks.$taskId.get.test.ts`、認可の seed は
`routes/tasks.post.test.ts`、合成点の smoke test（未認証 401）は `src/app.test.ts` が参考になる。
