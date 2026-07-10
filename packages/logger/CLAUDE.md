# CLAUDE.md — packages/logger

構造化ログと監査ログの実体（`@icasu/logger`）。AWS Lambda Powertools Logger の薄いラッパで、
`apps/*` と `packages/*` が共有する。

**設計の根拠（なぜこの形か・Powertools の癖・pino を選ばなかった理由）は
[`docs/specs/logs.md`](../../docs/specs/logs.md)**。ここには作業ルール（何をすべきか）だけを書く。
**どこに監査ログを仕掛けるか**は [`apps/backend/CLAUDE.md`](../../apps/backend/CLAUDE.md)「監査ログ」。

## 公開 API（index.ts）

| API                           | 使う場面                                                              |
| ----------------------------- | --------------------------------------------------------------------- |
| `logger`                      | **リクエスト外**のログ（起動処理など）でだけ直接使う                  |
| `getLogger()`                 | リクエスト内のログはすべてこれを通す                                  |
| `runInRequestScope(keys, fn)` | リクエストスコープを確立する。合成点の最外周から 1 回だけ             |
| `appendRequestKeys(keys)`     | 以降このリクエストの全ログに載るキーを足す（認証後の `userSub` など） |
| `auditLog(event)`             | 監査レコードを 1 件出す。**各パッケージのラッパ経由で呼ぶ**           |

## ルール

- **リクエスト内で `logger` を直接使わない**。`getLogger()` を使う（`logger` に `appendKeys` すると
  以降の全リクエストにキーが残る）。`appendRequestKeys` はスコープ外の呼び出しを黙って捨てる。
- **`auditLog` を直接呼ばない**。action 名の値集合を持つラッパ（`apps/backend/src/audit.ts` の
  `audit` / `auditWithActor`、`packages/backend-auth/src/audit.ts` の `auditAuth`）を通す。
- **`detail` にはスカラーだけ載せる**。構造体を丸ごと渡さない。
- **email をログに載せない**。identity は `userSub` に統一する。
- **`addContext()` / `injectLambdaContext()` を使わない**。`createChild()` と組み合わせると
  `cold_start` が毎リクエスト `true` になる（[`docs/specs/logs.md`](../../docs/specs/logs.md)）。
- **`POWERTOOLS_LOGGER_LOG_EVENT` を有効にしない**。Cookie と認可コードが CloudWatch に落ちる。
- **`apps/iac` で `applicationLogLevelV2`（ALC）を設定しない**。監査ログが消える。

## 環境変数

Powertools が直接読む（このパッケージは `process.env` を読まない）。

| 変数                      | 用途                                                            |
| ------------------------- | --------------------------------------------------------------- |
| `POWERTOOLS_SERVICE_NAME` | 全ログに載るサービス名                                          |
| `POWERTOOLS_LOG_LEVEL`    | **アプリログ**のレベル。監査ログはこれでは黙らない              |
| `POWERTOOLS_DEV`          | グローバル console + indent 付き出力。ローカルとテストで使う    |
| `AWS_LAMBDA_LOG_LEVEL`    | ALC。全ロガーを短絡する。**テストで全ログを黙らせる唯一の手段** |

> `@icasu/backend-auth` は「パッケージ内で `process.env` を読まない」規約だが、このパッケージを import
> する以上 Powertools の env 規約には従う。設定注入の対象は認証設定（`AuthConfig`）であって、
> 横断的関心事であるログの出力先ではない。

## テスト

- **他パッケージ**は `vitest.config.ts` の `env` に `AWS_LAMBDA_LOG_LEVEL: 'SILENT'` を指定して黙らせる。
- **このパッケージ自身**は出力を検証するので黙らせず、`POWERTOOLS_DEV: 'true'` を指定する。

## コマンド（このパッケージ内から）

| 目的       | コマンド                        |
| ---------- | ------------------------------- |
| 型チェック | `pnpm typecheck`                |
| テスト     | `pnpm test` / `pnpm test:watch` |
