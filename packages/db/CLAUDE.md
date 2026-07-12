# CLAUDE.md — packages/db

drizzle のスキーマ / DB クライアント / マイグレーション（`@icasu/db`）。本番 DB は
Aurora DSQL、ローカルは docker-compose の Postgres。**両方で同じスキーマ・同じ
マイグレーション経路を使う**（環境差を作らない）。

## 構成と exports

```
src/
  schema.ts          # スキーマ変更で触る
  client.ts          # 接続（DSQL / ローカル）を変えるときに触る
  migration/         # マイグレーションの仕組みを変える・バグを直すときに触る
    runner.ts        # 自前ランナー（後述）
    cli.ts           # `pnpm db:migrate` のエントリ
    handler.ts       # CDK Trigger 用の Lambda ハンドラ
    folder.ts        # ddl/ の絶対パス
    ddl/             # drizzle-kit が生成する SQL とスナップショット
```

| export           | 実体                      | 役割                                                          |
| ---------------- | ------------------------- | ------------------------------------------------------------- |
| `.` / `./schema` | `src/schema.ts`           | drizzle スキーマ（enum 値配列・行型も含む）                   |
| `./client`       | `src/client.ts`           | drizzle クライアント（`DATABASE_URL` / `DSQL_ENDPOINT` 切替） |
| `./migrations`   | `src/migration/folder.ts` | マイグレーションフォルダの絶対パス                            |

`runner.ts` / `cli.ts` / `handler.ts` は package export しない。ハンドラは `apps/iac` が
`NodejsFunction` の `entry` にファイルパス直指定で参照する（`apps/backend/src/lambda.ts` と
同じ方式）。SQL フォルダを `migrations/` でなく `migration/ddl/` と呼ぶのは、仕組み側の
ファイル群と資産を兄弟に並べて紛らわしくしないため。

**`folder.ts` と `ddl/` は同階層に置く**。`folder.ts` は `import.meta.url` でパスを解決し、
esbuild はこれをバンドル出力の位置基準のまま残すため、Lambda バンドル（`apps/iac` の
`Migration` construct が出力の隣に `ddl/` をコピーする）とソースの両方で `./ddl` が成立する
必要がある。どちらかだけを移動すると本番のマイグレーションが実行時に SQL を見失う。

## スキーマを書くときのルール（DSQL 互換）

Aurora DSQL は Postgres 互換だがドロップイン置き換えではない。ローカル Postgres では
より緩い書き方でも動いてしまうため、**常に DSQL で通る形で書く**:

- **`pgEnum` は使わない**（`CREATE TYPE ... AS ENUM` 非対応）。`text` + `{ enum: [...] }` +
  `check()` で表現する。値配列（`taskStatusValues` 等）は列型と `check()` 制約を組むために
  `schema.ts` が持つ。**app 側の単一定義源は `apps/backend/src/entities/` で、こちらはその複製**
  （package は app を import できないため。値を足すときは両方を揃える）。
- **FOREIGN KEY は張れない。** 参照整合性はアプリ層で担保する。
- **連番 PK（`serial` 等）は使わない。** PK は `uuid().defaultRandom()`。DSQL 自体は
  identity column をサポートするが、分散 DB では連番がホットスポットを生むため採用しない。
- **列の値は DB のデフォルトではなくアプリが決める。** スキーマには `.default()` を付けず、制約
  （nullability・CHECK・unique）だけを持たせるのが基本。業務的な既定値（`status='todo'` 等）も
  監査タイムスタンプ（`createdAt`/`updatedAt`）も version の初期値も、値の決定はアプリ（ゆくゆくは
  ドメイン層）の責務にする（`apps/backend` の `newRowColumns()` 等）。例外は `id` の `defaultRandom()`
  だけ（surrogate key 生成の保険。ただし insert 時はアプリも uuid を明示する）。`$onUpdate` も使わない。
- **全テーブルに楽観ロック用の `version` 列を必ず持たせる**（`schema.ts` の `versionColumn()` を
  使う。`integer` NOT NULL、default は付けない）。初期値（1）や増分（`version + 1`）はアプリが与え、
  更新は `WHERE version = <読み取り値>` に一致した行だけ更新して lost update を検出する。**新規テーブルでも
  最初から入れる**こと。DSQL は後から NOT NULL 列を追加できず（ADD COLUMN に NOT NULL 不可・
  SET NOT NULL 不可）、後付けにはテーブル再作成が必要になるため。
- **1 トランザクションに DDL は 1 文まで・DDL と DML の混在不可。** マイグレーションの
  実行方式はこの制約に合わせてある（後述）。
- **NOT NULL 列を既存テーブルに追加するときはテーブル再作成**（`DROP TABLE` → `CREATE TABLE`）で
  行う。前述のとおり DSQL は NOT NULL 列を後付けできない。`db:generate` は `ALTER TABLE ADD COLUMN`
  を吐くので、生成 SQL を手で DROP+CREATE に書き換える（スナップショットは最終スキーマを表すため
  そのままでよい）。空テーブル前提の破壊的操作なので、データのある環境では使えない（0002 / 0003 が実例）。

## マイグレーション

### フロー

1. `src/schema.ts` を編集する。
2. `pnpm db:generate` — SQL とスナップショットを `src/migration/ddl/` に生成。
3. 生成された SQL が上記の DSQL 互換ルールに収まっているか確認してコミット。
4. 適用:
   - **ローカル**: `pnpm db:migrate`（`.env` の `DATABASE_URL` に対して実行）。
   - **AWS**: `cdk deploy` 中に DbStack の Trigger が自動適用する
     （`apps/iac/src/stacks/db/migration.ts`）。手動適用は不要。

**適用済みのマイグレーションファイルは編集しない。** ランナーが内容を SHA-256 で検証し、
変更を検出すると失敗する。直したいことがあれば新しいマイグレーションを追加する。

`db:push` はローカルの試行錯誤用（マイグレーションを生成せず直接反映）。適用履歴と
乖離するため、使ったらローカル DB を作り直す（`docker compose down -v`）。

### ランナー（`src/migration/runner.ts`）が自前実装である理由

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
| 動作確認用データ投入（ローカル） | `pnpm db:seed`     |
| 型チェック                       | `pnpm typecheck`   |

`db:seed`（`src/seed.ts`）はローカル動作確認用のデータ投入。member / admin の 2 ユーザー
（oidc-server-mock の `member-user` / `admin-user` に対応）とタスクを冪等に入れる。`DATABASE_URL`
に対してのみ実行し、`DSQL_ENDPOINT` が設定されていれば本番誤投入を避けるため拒否する。
