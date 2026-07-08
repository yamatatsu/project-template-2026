# 実装計画 0000 — users テーブルと role による単純な RBAC

- ステータス: **未着手（別セッションが実装する）**
- 対象: `packages/db` / `apps/backend`
- 設計判断（Design 2）: 本ドキュメント §4 が唯一の記述。実装完了時に `apps/backend/CLAUDE.md`
  へ転記する（§5 Phase 6）。
- 関連仕様: [`docs/specs/authentication.md`](../specs/authentication.md)（BFF 認証の全体像）

このドキュメントは実装者がこのリポジトリの他の文脈を知らなくても着手できるよう、**現状・設計判断・
手順・受け入れ条件**を自己完結で書いてある。着手前にこの計画と上記 2 リンクに目を通すこと。

---

## 1. 目的

現在バックエンドは「有効なセッションがあるか（authN）」しか見ておらず、**誰であるか（ドメインの
User）** も **何を許すか（authZ）** も持っていない。ここに以下を入れる。

1. `users` テーブル（`role` を持つ）。
2. セッションからドメイン User を解決し、role で認可する Hono ミドルウェア。
3. 各保護ルートにアクセスレベル（`auth({ for: 'user' | 'admin' })`）を宣言する運用。

いわゆる **単純な RBAC**（role による粗粒度の認可）まで。行レベル認可（「この User が“この”
リソースを触れるか」）は最小限に留め、後続フェーズ（§7）として切り出す。

## 2. スコープ

**やる**

- `users` テーブル + マイグレーション（`packages/db`）。
- `apps/backend` に `AppEnv` 型と `auth({ for })` ミドルウェア（session→users 解決 + role ゲート）。
- 既存の保護ルート（`routes/tasks/*`）へアクセスレベル宣言を付与。
- 各ルートのハンドラテストを、Context に User を差し込んで認可込みで検証する形に更新。

**やらない（この計画では）**

- 管理画面や role 付与 UI。role 変更は当面シード / 手動運用（§6 で最小手段だけ示す）。
- tasks の owner スコープ化（行レベル認可）。→ §7 に将来フェーズとして記載。
- 認証（authN）そのものの変更。BFF パターン・セッション実装（`@icasu/backend-auth`）は触らない。

## 3. 現状（実装者向けの最小コンテキスト）

### 3.1 セッションが Context に載せているもの

`@icasu/backend-auth` の `requireSession` ミドルウェアが、検証済みセッションを
`c.set('session', …)` で載せる。中身（`SessionContext`）は:

```ts
{
  sessionId: string;
  userSub: string;
  email: string;
}
```

`userSub` は OIDC の `sub`（IdP 上のユーザー識別子）。**backend-auth はアプリの `users` テーブルや
role を知らないし、知らせない**（再利用可能な認証パッケージを app 固有モデルに依存させないため）。
`session.userSub` を `users` 行へ写すのはアプリ（`apps/backend`）側の責務。

### 3.2 現在の保護のかかり方（`apps/backend/src/app.ts`）

機能ルートは保護グループにまとめ、その境界で `requireSession` を 1 回だけ適用している:

```ts
const applicationRoutes = new Hono()
  .use('*', auth.requireSession) // ← authN のみ。現状ここまで。
  .route('/', taskList)
  .route('/', taskGet)
  .route('/', taskPost)
  .route('/', taskPut)
  .route('/', taskDelete);

return new Hono()
  .use('*', cors())
  .get('/hello-world', (c) => c.json({ message: 'hello world' }))
  .route('/auth', auth.navRoute)
  .route('/me', auth.meRoute)
  .route('/', applicationRoutes);
```

### 3.3 ルートの構成（`apps/backend/src/routes/tasks/`）

1 エンドポイント 1 ファイル。各ファイルは `export default new Hono().<method>('/tasks'…, …)` を返し、
`app.ts` が `/` にマウントする。フルパスは各ファイルが持つ（`'/tasks'` / `'/tasks/:id'`）。
ルート横断の zod スキーマは `routes/tasks/shared/schema.ts`。詳細は
[`apps/backend/CLAUDE.md`](../../apps/backend/CLAUDE.md)「ルートの分割とパス」を参照。

### 3.4 DB の制約（Aurora DSQL 互換。`packages/db/CLAUDE.md` より抜粋）

新テーブルを足すとき**必ず守る**:

- **`pgEnum` は使わない**（`CREATE TYPE ... AS ENUM` 非対応）。`text` + `{ enum: [...] }` +
  `check()` で表現し、値配列を export して zod からも再利用する（既存の `taskStatusValues` と同型）。
- **FOREIGN KEY は張れない。** 参照整合性はアプリ層で担保する。
- **連番 PK 不可。** PK は `uuid().defaultRandom()`。
- マイグレーションは `pnpm db:generate` で生成 →（DSQL 互換か目視確認）→ `pnpm db:migrate` で適用。
  適用済みファイルは編集しない。

## 4. 設計判断（Design 2 ハイブリッド）

この計画が拠って立つ設計。**現時点で `apps/backend/CLAUDE.md` にはまだ書いていない**（実装完了時に
転記する。§5 Phase 6）。要点:

- **authN（session 検証）はルート横断で変わらない** → 合成点の保護グループに 1 回だけ付ける
  （現状のまま）。session 検証は Cookie/ストア/OIDC の**設定注入**を要するため、注入点の合成点に置く。
- **authZ（RBAC）はルートごとに変わる** → 各ルートファイルのハンドラ定義に
  `.use('*', auth({ for: '…' }))` として**同居**させる。ファイル単体テストが認可まで込みで
  完全性を保証できる。この認可ミドルウェアは **`db`（静的 import）と Context 参照だけ**で成立し、
  設定注入が不要 → 静的に import してハンドラ定義に直接書ける（ルートファイルを factory に戻さない）。
- **レイヤリング**: `backend-auth` は session / identity（`userSub`・`email`）まで。
  `session.userSub → users` の解決と RBAC は `apps/backend` 側のミドルウェアに置く。
- 解決した `User` は `c.set('user', …)` で Context に注入し、ハンドラは `c.get('user')` だけを見る
  （Cookie/OIDC/session の語彙をハンドラに持ち込まない）。

## 5. 実装ステップ

### Phase 1 — `users` テーブル（`packages/db`）

`packages/db/src/schema.ts` に追加（既存 `tasks` と同じ書式・DSQL 制約に従う）:

```ts
// role は DSQL 制約により pgEnum 不可。text + enum + check で表現し、値配列を export して
// backend からも単一定義源として再利用する（tasks の taskStatusValues と同じ方針）。
export const userRoleValues = ['member', 'admin'] as const;

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // OIDC の sub。session.userSub とこれで突き合わせる。1 ユーザー 1 行にするため unique。
    userSub: text('user_sub').notNull().unique(),
    email: text('email').notNull(),
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
```

- `literalList` は既存のファイル内ヘルパを再利用する。
- **FK は張らない**（`userSub` の unique までに留める）。
- マイグレーション: `pnpm db:generate` → 生成 SQL が DSQL 互換（`CREATE TYPE` を吐いていない・FK が
  無い等）か確認 → コミット → `pnpm db:migrate` でローカル適用。

### Phase 2 — `AppEnv` 型（`apps/backend`）

`c.get('user')` を型付きで受けるためのアプリ Env。置き場所は `apps/backend/src/middleware/env.ts` 等:

```ts
import type { User } from '@icasu/db/schema';

export interface AppEnv {
  Variables: { user: User };
}
```

- User を読むルートは `new Hono<AppEnv>()` で書く（Phase 4）。
- 注意: `backend-auth` の `AuthEnv.Variables.session` も同じ Context に載る。`auth` ミドルウェアは
  `session` を読み `user` を書くので、その内部型は両方を満たす必要がある（`AuthEnv & AppEnv` 相当を
  扱う）。ハンドラ側は `AppEnv`（`user`）だけ見えれば十分。

### Phase 3 — `auth({ for })` ミドルウェア（`apps/backend`）

`apps/backend/src/middleware/auth.ts`（新規）。**設定注入不要**（`db` は静的 import、role 判定は
Context 参照のみ）ゆえハンドラ定義に静的 import で書ける、が肝。

```ts
import { db } from '@icasu/db/client';
import { users, type User } from '@icasu/db/schema';
import { eq } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from './env.ts';
// session 型を読むため backend-auth の AuthEnv も必要（Env は AuthEnv & AppEnv 相当）。

type Access = 'user' | 'admin';

/**
 * session（authN 済み・境界で付与）からドメイン User を解決し Context に注入する。
 * for: 'admin' の場合は role も検証する。設定注入を要さないため各ルートに静的に書ける。
 */
export const auth = (opts: { for: Access }) =>
  createMiddleware<AppEnv /* & AuthEnv */>(async (c, next) => {
    const { userSub, email } = c.get('session');

    // JIT プロビジョニング: 初回アクセス時に users 行を作る（別サインアップ導線を持たない前提）。
    // → §8 の未決事項を確認。方針が変わるならここを差し替える。
    let [user] = await db.select().from(users).where(eq(users.userSub, userSub));
    if (!user) {
      [user] = await db.insert(users).values({ userSub, email }).returning();
    }

    if (opts.for === 'admin' && user.role !== 'admin') {
      return c.json({ error: 'forbidden' }, 403);
    }

    c.set('user', user);
    await next();
  });
```

- `session` は保護グループ境界の `requireSession` が既に載せている前提（authN はここでやり直さない）。
- 403 は「認証済みだが権限不足」。認証欠如（401）は境界の `requireSession` が既に弾いている。

### Phase 4 — 配線（各ルート + 合成点）

各保護ルートで **Env を `AppEnv` にし、アクセスレベルを宣言**する。例（`routes/tasks/list.ts`）:

```ts
import { auth } from '../../middleware/auth.ts';

export default new Hono<AppEnv>()
  .use('*', auth({ for: 'user' })) // ← アクセスレベルを明示（省略＝書き忘れ）
  .get('/tasks', async (c) => {
    const user = c.get('user'); // session/Cookie/OIDC は知らない
    // …（当面 user は未使用でもよい。owner スコープ化は §7）
  });
```

- **保護グループ配下の全ルートに `auth({ for })` を必ず 1 行付ける**（付いていない＝書き忘れが
  レビューで分かる運用）。tasks はまず全て `for: 'user'`。admin 限定ルートが出たら `for: 'admin'`。
- `app.ts` の境界 `requireSession` は**そのまま**（authN は境界に残す）。`applicationRoutes` の
  `new Hono()` は、マウントする各ルートが `AppEnv` を持つため型の整合を取る（必要なら
  `new Hono<AppEnv>()` にする。RPC 型 `AppType` を壊さないことを frontend の `pnpm typecheck` で確認）。

### Phase 5 — テスト

各ルートのハンドラテストは、`auth` を通すために **Context に前段で `session`（と必要なら `user`）を
差し込む**。認可がルートに同居しているので、これで**ファイル単体テストが認可まで検証**できる。

- 既存の `routes/tasks/route.test.ts` は `@icasu/db/client` を PGlite に差し替えている。ここに
  `users` 用の前提行（テスト前に insert）と、リクエスト前に `session` を載せる薄いミドルウェアを足す。
- 追加すべきケース: `for: 'user'` のルートに member でアクセス→200 / admin 限定ルートに member→403 /
  admin→200。`auth.middleware` 単体のテストも用意すると良い（解決・JIT 作成・403 の 3 系統）。

### Phase 6 — ドキュメント転記（`apps/backend/CLAUDE.md`）

実装が固まったら、§4 の設計判断（Design 2・レイヤリング・`auth({ for })` の運用）を
`apps/backend/CLAUDE.md` に「認証・認可」節として追記する。現状 CLAUDE.md は認証（`requireSession`）
までしか書いていない（将来設計を先に書かない方針のため）。実装後の**現実に一致した記述**として足す。

## 6. role の付与（当面の運用）

管理 UI は作らない。admin を作る最小手段だけ用意する（どちらか）:

- シード SQL / スクリプトで対象 `user_sub` の行を `role='admin'` に更新。
- ローカルは `pnpm db:migrate` 後に手で `update users set role='admin' where …`。

将来 role 変更 API を足すなら、それ自体を `auth({ for: 'admin' })` で保護する。

## 7. 将来フェーズ — tasks の owner スコープ（行レベル認可）

RBAC（role の粗粒度）とは別物。「この User の tasks だけ見せる／触らせる」は**リソースを引く
クエリ／ハンドラ側**に残る（ミドルウェアに畳めない）。やるなら:

1. `tasks` に `ownerId uuid` 列を足す（**FK は張らない**＝DSQL 制約。整合はアプリ層）。マイグレーション。
2. `list`/`get`/`put`/`delete` のクエリに `where owner_id = c.get('user').id` を足す。
   `post` は `ownerId: user.id` を挿入。
3. 他人の task への get/put/delete は 404 相当に落とす（存在秘匿）。

この計画（0000）の受け入れには**含めない**。別計画として起こす。

## 8. 未決事項（実装前に判断が要る）

1. **User プロビジョニングの方式**: §5 Phase 3 は「初回アクセス時 JIT 作成（`users` に upsert）」を
   仮採用。代替は「明示的なサインアップ / `/me` 到達時に作成」等。JIT を採るなら、複数リクエスト同時
   到達時の重複を `userSub` unique（+ `onConflictDoNothing` して再 select）で吸収すること。
2. **`email` の更新**: IdP 側で email が変わったとき既存 `users` 行を追随させるか。当面は初回のみ記録で可。
3. **`for` の粒度**: 現状 `'user' | 'admin'` の 2 段で十分か。role を増やすなら `userRoleValues` と
   `Access` を合わせて拡張する。
4. **`applicationRoutes` の Env**: `new Hono<AppEnv>()` にするか、各ルート側の Env に委ねるか。
   frontend の `pnpm typecheck`（RPC 型連携）が通ることを最終確認に使う。

## 9. 受け入れ条件

- [ ] `users` テーブルのマイグレーションが生成・適用でき、DSQL 互換（`CREATE TYPE` / FK を含まない）。
- [ ] `auth({ for })` が session→users を解決し `c.set('user')`、`for:'admin'` で role を検証する。
- [ ] 保護グループ配下の全ルートに `auth({ for })` が付いている。
- [ ] ハンドラテストが認可込みで通り（member 200 / admin-only は member 403・admin 200）、
      `pnpm --filter @icasu/backend test` が緑。
- [ ] `pnpm --filter @icasu/backend typecheck` と `pnpm --filter @icasu/frontend typecheck`（RPC 型連携）
      が通る。
- [ ] §4 の設計を [`apps/backend/CLAUDE.md`](../../apps/backend/CLAUDE.md) に「認証・認可」節として
      追記した（Phase 6）。

## 10. 参照

- [`apps/backend/CLAUDE.md`](../../apps/backend/CLAUDE.md) — 合成点・保護境界（現状の認証）、
  ルートの分割とパス。認可の設計は本計画の Phase 6 でここへ追記する。
- [`packages/db/CLAUDE.md`](../../packages/db/CLAUDE.md) — DSQL 互換のスキーマ規約とマイグレーション。
- [`packages/backend-auth/CLAUDE.md`](../../packages/backend-auth/CLAUDE.md) — session / `requireSession`
  / `SessionContext` の実装。
- [`docs/specs/authentication.md`](../specs/authentication.md) — BFF 認証の全体像。
