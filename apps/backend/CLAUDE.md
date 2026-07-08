# CLAUDE.md — apps/backend

BFF（Hono on Node.js / Lambda）で作業する際のルール。全体の構成・共通コマンドは
ルート [`CLAUDE.md`](../../CLAUDE.md) を参照。

## 合成点

`createApp(config)`（`src/app.ts`）が唯一の合成点。`@icasu/backend-auth` を `/auth` /
`/me` にマウントし、機能ルートを保護グループに束ねてルート直下に合成する。保護グループは
境界で `auth.requireSession` を 1 回適用し、配下のルートを認証で保護する。

- `src/index.ts` … Node 起動（`loadAuthConfigFromEnv()` を注入）。env 検証は起動時に一括。
- `src/lambda.ts` … Lambda ハンドラ。
- 設定は `AppConfig` として注入する（env 直読みをアプリ内でしない）。

## ルートの分割とパス

機能ルートは 1 エンドポイント 1 ファイルで `src/routes/` 直下に**フラットに**置き、各ファイルは
`export default new Hono().<method>('/path', …)` を返す。ディレクトリでネストせず、ファイル名に
パス構造とメソッドをエンコードする（`.` = パス区切り、`$xxx` = 動的セグメント、末尾 = 操作。
TanStack Router / Remix のフラットルート規約に相当）:

| ファイル                         | エンドポイント           |
| -------------------------------- | ------------------------ |
| `routes/tasks.list.ts`           | `GET /tasks`（一覧取得） |
| `routes/tasks.post.ts`           | `POST /tasks`（作成）    |
| `routes/tasks.$taskId.get.ts`    | `GET /tasks/:id`         |
| `routes/tasks.$taskId.put.ts`    | `PUT /tasks/:id`         |
| `routes/tasks.$taskId.delete.ts` | `DELETE /tasks/:id`      |

フラットにするのは、1 ファイルで 1 エンドポイントが完結し、ファイル名を見ればパスとメソッドが一意に
分かるようにするため。`$taskId` はファイル名上の動的セグメント表記で、**実際のパスパラメータ名は各
ファイル内の `'/tasks/:id'` が真実の源**（ファイル名側は可読性のための記述名）。`createApp` は各
default export を `.route('/', taskList)` のように**ルート直下（`/`）へマウント**し、パスの完全形は
各ファイル側で持つ（`'/tasks'` / `'/tasks/:id'`）。

- **パスは各ファイルでフルパスを書く**（`'/tasks'`）。`'/'` にマウントするため、ここで
  `'tasks/'` のように末尾スラッシュを付けると実パスが `/tasks/` になり、Hono は既定で
  strict（末尾スラッシュを区別）なので、RPC クライアントが叩く `/tasks` と食い違って 404 になる。
- **各ルートビルダはメソッドチェーンで書き切る**。`.route()` でのマウント合成は推論型を保つので、
  合成点で `const applicationRoutes = new Hono().use(…).route('/', …)…` のように中間変数へ
  束ねてよい（その変数に型注釈で widening を掛けない限り `AppType` は維持される）。壊してよいのは
  「1 本のビルダチェーンを途中で切って弱い型の変数に入れる」ことだけ。それはフロントの
  Hono RPC 型連携を壊す。
- ルート横断で使う zod スキーマは `src/response-models/<feature>.ts`（例: `response-models/task.ts`）に
  集約し、各ファイルから相対 import する。
- **テストもルート単位で分割する**（`tasks.list.test.ts` など、1 ルート 1 テストファイルで実装と同じ
  フラット命名にそろえる）。各テストは対象モジュールの default export を直接 `.request()` で叩く
  （フルパスを持つのでラッパ不要）。全ルートを 1 ファイルに集約したテストにはしない（肥大化するため）。
- **テスト専用ヘルパは実行時コードのディレクトリ（`response-models/` 等）に混ぜない**。使用スコープで
  置き場所を分ける: feature 非依存の汎用インフラ（DB 差し替え・マイグレーション等）は `src/__tests__/`、
  routes が使う feature 固有のヘルパ（seed 等）は `src/routes/__tests__/` に置く。

## フロントへの公開面（exports）は `AppType` 一本

`package.json` の `exports` は `.`（`src/index.ts` が `AppType` を re-export）**だけ**。
フロントとの契約面はこの RPC 型に集約する。`./app` や `./lambda` は export しない
（`app.ts` はテスト等が相対 import で使い、`lambda.ts` は iac が `NodejsFunction` の
`entry` にファイルパス直指定で参照するため、package export は不要）。

- **zod の検証スキーマ（`src/response-models/task.ts` 等）を package export で公開しない。**
  これらは「信頼できない入力の門番」としての**サーバ内部実装**であり、契約ではない。
  公開すると (1) 契約面が `AppType` と二重化し、(2) フロントが backend 内部モジュールへ
  _runtime_ 依存し、(3) `@icasu/db/schema`（drizzle/pg-core）まで越境して引き込まれる。
- フロントが必要とするペイロード/レスポンスの**型**は、フロント側で RPC から取り出す
  （`InferRequestType` / `InferResponseType`）。型のためにスキーマを export しない。
- クライアント側のフォーム検証はフロントが自前スキーマで行う方針（案B）。詳細は
  [`apps/frontend/CLAUDE.md`](../frontend/CLAUDE.md)。サーバはそれに依存せず、
  `zValidator` で**常に独立に再検証する**。

## 入力検証

各ルートは `zValidator('json' | 'param', schema)` で検証する。検証スキーマは
`src/response-models/<feature>.ts` に置き、ルートからは相対 import で使う（package export は
しない）。enum の値は
`@icasu/db/schema` の値配列（`taskStatusValues` 等）を単一の定義源として再利用する
（DSQL が `CREATE TYPE ... AS ENUM` 非対応のため `pgEnum` は使っていない。
[`packages/db/CLAUDE.md`](../../packages/db/CLAUDE.md) 参照）。

## 認証・認可

authN（認証＝有効なセッションか）と authZ（認可＝誰で何を許すか）を**別のレイヤ**に分けて置く
（ハイブリッド構成）。両者の変化の仕方が違うためで、置き場所もそれに合わせる。

- **authN は合成点の境界に 1 回**。`auth.requireSession`（`@icasu/backend-auth`）を保護グループの
  境界に適用する。session 検証は Cookie / セッションストア / OIDC の**設定注入**を要するため、
  注入点である合成点に置く（ルート横断で変わらない）。
- **authZ は各ルートのハンドラ定義に同居**。`auth({ for: 'user' | 'admin' })`（`src/middleware/auth.ts`）を
  **ハンドラの可変長 middleware 引数として渡す**（`new Hono().get('/tasks', auth({ for: 'user' }), handler)`）。
  この authZ ミドルウェアは **`db`（静的 import）と Context 参照だけ**で成立し設定注入が不要なので、
  ハンドラ定義に静的 import で直接書ける。アクセスレベルがルートごとに変わるものをルート側に置くことで、
  **ファイル単体テストが認可まで込みで完全性を保証**できる。
- **レイヤリング**: `@icasu/backend-auth` は session / identity（`userSub`・`email`）まで。
  再利用可能な認証パッケージを app 固有モデルに依存させないため、`session.userSub → users` 行の解決と
  role による RBAC は `apps/backend` 側（`auth({ for })`）の責務。解決した `User` は `c.set('user')` で
  Context に注入し、ハンドラは `c.get('user')` だけを見る（session / Cookie / OIDC の語彙を持ち込まない）。
- **Env は推論に任せ、`new Hono<AppEnv>()` の型引数は書かない**。`auth` を middleware 引数として渡すと
  Hono がそこから Env を推論し、後続ハンドラで `c.get('user')` が型安全に使える。型引数で `AppEnv` を
  明示すると「app に `user` がある」と**宣言**してしまい、auth を付け忘れても `c.get('user')` が型を
  通って undefined を掴む。middleware 引数として渡す形なら、**auth を外すと `c.get('user')` が即
  コンパイルエラー**になり、認可漏れを型で防げる（`AppEnv` は `auth` ミドルウェア内部の型定義としてのみ
  使う）。中間変数への型注釈で widening を掛けないことは従来どおり（`AppType` が壊れる）。
- **`users` に `email` は持たせない**。email は IdP（Cognito → session）が単一の真実の源で、DB に置くと
  二重管理になる（`session.email` は `string | undefined`）。`users` は identity の結合キー（`user_sub`
  unique）と app 所有の `role` だけを持つ。JIT プロビジョニングは初回アクセス時に `userSub` で 1 行
  確保する（並行初回は `unique` + `onConflictDoNothing` で吸収）。role 付与は当面シード / 手動運用。

認証の全体像（BFF パターン・OIDC フロー）は
[`docs/specs/authentication.md`](../../docs/specs/authentication.md) を参照。

## コマンド（このパッケージ内から）

| 目的       | コマンド                        |
| ---------- | ------------------------------- |
| 開発サーバ | `pnpm dev`                      |
| 型チェック | `pnpm typecheck`                |
| テスト     | `pnpm test` / `pnpm test:watch` |
