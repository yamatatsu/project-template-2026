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

機能ルートは 1 エンドポイント 1 ファイルで `src/routes/<feature>/<method>.ts` に置き、各ファイルは
`export default new Hono().<method>('/path', …)` を返す（例: `routes/tasks/list.ts` が
`GET /tasks`、`routes/tasks/get.ts` が `GET /tasks/:id`）。`createApp` は各 default export を
`.route('/', taskList)` のように**ルート直下（`/`）へマウント**し、パスの完全形は各ファイル側で
持つ（`'/tasks'` / `'/tasks/:id'`）。

- **パスは各ファイルでフルパスを書く**（`'/tasks'`）。`'/'` にマウントするため、ここで
  `'tasks/'` のように末尾スラッシュを付けると実パスが `/tasks/` になり、Hono は既定で
  strict（末尾スラッシュを区別）なので、RPC クライアントが叩く `/tasks` と食い違って 404 になる。
- **各ルートビルダはメソッドチェーンで書き切る**。`.route()` でのマウント合成は推論型を保つので、
  合成点で `const applicationRoutes = new Hono().use(…).route('/', …)…` のように中間変数へ
  束ねてよい（その変数に型注釈で widening を掛けない限り `AppType` は維持される）。壊してよいのは
  「1 本のビルダチェーンを途中で切って弱い型の変数に入れる」ことだけ。それはフロントの
  Hono RPC 型連携を壊す。
- ルート横断で使う zod スキーマは `routes/<feature>/shared/schema.ts` に集約し、各ファイルから
  相対 import する。
- **テストもルート単位で分割する**（`list.test.ts` など、1 ルート 1 テストファイル）。各テストは
  対象モジュールの default export を直接 `.request()` で叩く（フルパスを持つのでラッパ不要）。全ルートを
  1 ファイルに集約したテストにはしない（肥大化するため）。
- **テスト専用ヘルパは `shared/` に置かない**（`shared/` は実行時コード専用）。使用スコープで置き場所を
  分ける: feature 非依存の汎用インフラ（DB 差し替え・マイグレーション等）は `src/__tests__/`、特定
  feature だけが使うヘルパ（seed 等）は `routes/<feature>/__tests__/` に置く。

## フロントへの公開面（exports）は `AppType` 一本

`package.json` の `exports` は `.`（`src/index.ts` が `AppType` を re-export）**だけ**。
フロントとの契約面はこの RPC 型に集約する。`./app` や `./lambda` は export しない
（`app.ts` はテスト等が相対 import で使い、`lambda.ts` は iac が `NodejsFunction` の
`entry` にファイルパス直指定で参照するため、package export は不要）。

- **zod の検証スキーマ（`src/routes/tasks/shared/schema.ts` 等）を package export で公開しない。**
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
`routes/<feature>/shared/schema.ts` に置き、ルートからは相対 import で使う（package export は
しない）。enum の値は
`@icasu/db/schema` の値配列（`taskStatusValues` 等）を単一の定義源として再利用する
（DSQL が `CREATE TYPE ... AS ENUM` 非対応のため `pgEnum` は使っていない。
[`packages/db/CLAUDE.md`](../../packages/db/CLAUDE.md) 参照）。

## 認証

保護グループの境界で `auth.requireSession`（`@icasu/backend-auth`）を適用し、配下のルートを
セッションで保護する。ハンドラは現状セッションを直接は参照しない。認証の全体像は
[`docs/specs/authentication.md`](../../docs/specs/authentication.md) を参照。

## コマンド（このパッケージ内から）

| 目的       | コマンド                        |
| ---------- | ------------------------------- |
| 開発サーバ | `pnpm dev`                      |
| 型チェック | `pnpm typecheck`                |
| テスト     | `pnpm test` / `pnpm test:watch` |
