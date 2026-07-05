# CLAUDE.md — apps/backend

BFF（Hono on Node.js / Lambda）で作業する際のルール。全体の構成・共通コマンドは
ルート [`CLAUDE.md`](../../CLAUDE.md) を参照。

## 合成点

`createApp(config)`（`src/app.ts`）が唯一の合成点。`@icasu/backend-auth` を `/auth` に
マウントし、`createTasksRoute(requireSession)` を `/tasks` に束ねる。ルートは**メソッド
チェーンで定義する**（途中で変数に分けない）。チェーンを崩すと推論型 `AppType` が失われ、
フロントの Hono RPC 型連携が壊れる。

- `src/index.ts` … Node 起動（`loadAuthConfigFromEnv()` を注入）。env 検証は起動時に一括。
- `src/lambda.ts` … Lambda ハンドラ。
- 設定は `AppConfig` として注入する（env 直読みをアプリ内でしない）。

## フロントへの公開面（exports）は `AppType` 一本

`package.json` の `exports` は `.`（`src/index.ts` が `AppType` を re-export）**だけ**。
フロントとの契約面はこの RPC 型に集約する。`./app` や `./lambda` は export しない
（`app.ts` はテスト等が相対 import で使い、`lambda.ts` は iac が `NodejsFunction` の
`entry` にファイルパス直指定で参照するため、package export は不要）。

- **zod の検証スキーマ（`src/tasks/schema.ts` 等）を package export で公開しない。**
  これらは「信頼できない入力の門番」としての**サーバ内部実装**であり、契約ではない。
  公開すると (1) 契約面が `AppType` と二重化し、(2) フロントが backend 内部モジュールへ
  _runtime_ 依存し、(3) `@icasu/db/schema`（drizzle/pg-core）まで越境して引き込まれる。
- フロントが必要とするペイロード/レスポンスの**型**は、フロント側で RPC から取り出す
  （`InferRequestType` / `InferResponseType`）。型のためにスキーマを export しない。
- クライアント側のフォーム検証はフロントが自前スキーマで行う方針（案B）。詳細は
  [`apps/frontend/CLAUDE.md`](../frontend/CLAUDE.md)。サーバはそれに依存せず、
  `zValidator` で**常に独立に再検証する**。

## 入力検証

各ルートは `zValidator('json' | 'param', schema)` で検証する。検証スキーマは `tasks/*` 配下に
機能単位で置き、ルートからは相対 import で使う（package export はしない）。enum の値は
`@icasu/db/schema` の値配列（`taskStatusValues` 等）を単一の定義源として再利用する
（DSQL が `CREATE TYPE ... AS ENUM` 非対応のため `pgEnum` は使っていない。
[`packages/db/CLAUDE.md`](../../packages/db/CLAUDE.md) 参照）。

## コマンド（このパッケージ内から）

| 目的       | コマンド                        |
| ---------- | ------------------------------- |
| 開発サーバ | `pnpm dev`                      |
| 型チェック | `pnpm typecheck`                |
| テスト     | `pnpm test` / `pnpm test:watch` |
