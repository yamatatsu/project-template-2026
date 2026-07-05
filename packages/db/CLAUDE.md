# CLAUDE.md — packages/db

drizzle のスキーマ / DB クライアント / マイグレーション（`@icasu/db`）。本番 DB は
Aurora DSQL、ローカルは docker-compose の Postgres。**両方で同じスキーマ・同じ
マイグレーション経路を使う**（環境差を作らない）。

## 構成と exports

| export           | 実体                | 役割                                                          |
| ---------------- | ------------------- | ------------------------------------------------------------- |
| `.` / `./schema` | `src/schema.ts`     | drizzle スキーマ（enum 値配列・行型も含む）                   |
| `./client`       | `src/client.ts`     | drizzle クライアント（`DATABASE_URL` / `DSQL_ENDPOINT` 切替） |
| `./migrations`   | `src/migrations.ts` | マイグレーションフォルダの絶対パス                            |

`src/migrate-runner.ts`（自前ランナー）と `src/migrate-handler.ts`（CDK Trigger 用の
Lambda ハンドラ）は package export しない。ハンドラは `apps/iac` が `NodejsFunction` の
`entry` にファイルパス直指定で参照する（`apps/backend/src/lambda.ts` と同じ方式）。

## スキーマを書くときのルール（DSQL 互換）

Aurora DSQL は Postgres 互換だがドロップイン置き換えではない。ローカル Postgres では
より緩い書き方でも動いてしまうため、**常に DSQL で通る形で書く**:

- **`pgEnum` は使わない**（`CREATE TYPE ... AS ENUM` 非対応）。`text` + `{ enum: [...] }` +
  `check()` で表現する。値配列（`taskStatusValues` 等）を export し、backend の zod
  スキーマからも単一の定義源として再利用する。
- **FOREIGN KEY は張れない。** 参照整合性はアプリ層で担保する。
- **連番 PK（`serial` 等）は使わない。** PK は `uuid().defaultRandom()`。DSQL 自体は
  identity column をサポートするが、分散 DB では連番がホットスポットを生むため採用しない。
- **1 トランザクションに DDL は 1 文まで・DDL と DML の混在不可。** マイグレーションの
  実行方式はこの制約に合わせてある（後述）。

## マイグレーション

### フロー

1. `src/schema.ts` を編集する。
2. `pnpm db:generate` — SQL とスナップショットを `src/migrations/` に生成。
3. 生成された SQL が上記の DSQL 互換ルールに収まっているか確認してコミット。
4. 適用:
   - **ローカル**: `pnpm db:migrate`（`.env` の `DATABASE_URL` に対して実行）。
   - **AWS**: `cdk deploy` 中に DbStack の Trigger が自動適用する
     （`apps/iac/src/stacks/db/migration.ts`）。手動適用は不要。

**適用済みのマイグレーションファイルは編集しない。** ランナーが内容を SHA-256 で検証し、
変更を検出すると失敗する。直したいことがあれば新しいマイグレーションを追加する。

`db:push` はローカルの試行錯誤用（マイグレーションを生成せず直接反映）。適用履歴と
乖離するため、使ったらローカル DB を作り直す（`docker compose down -v`）。

### ランナー（`src/migrate-runner.ts`）が自前実装である理由

drizzle 標準の `drizzle-orm/node-postgres/migrator` は (1) ファイル全体を
1 トランザクションで実行し、(2) 管理テーブルに `SERIAL` を使うため、どちらも DSQL で
動かない。自前ランナーは `--> statement-breakpoint` で分割した文を 1 文ずつ独立した
トランザクションで実行し、適用済みタグを `__migrations` テーブル（`tag` text PK +
`hash` + `applied_at`）に記録する。ローカル Postgres でも同じ経路を使う。

### forward-only 運用と部分適用

文単位で実行するため、ファイル途中で失敗すると「一部適用・記録なし」になり得る
（DSQL は複数 DDL をまとめてロールバックできない）。再実行は同ファイルの先頭からに
なるので、失敗した文を修正するか、DB 側を手で前進させて解消する。ロールバック用の
逆マイグレーションは作らない。

## 接続（`src/client.ts`）

- ローカル / CI: `DATABASE_URL`。
- DSQL: `DSQL_ENDPOINT`（+ `DSQL_REGION`）。固定パスワードが無いため、新規接続のたびに
  `@aws-sdk/dsql-signer` で短命の IAM トークンを署名する。

## コマンド（このパッケージ内から）

| 目的                             | コマンド           |
| -------------------------------- | ------------------ |
| マイグレーション生成             | `pnpm db:generate` |
| マイグレーション適用（ローカル） | `pnpm db:migrate`  |
| 型チェック                       | `pnpm typecheck`   |
