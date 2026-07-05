# @icasu/iac

このアプリの AWS CDK（TypeScript）インフラ。スタックは2つ:

| スタック            | リソース                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `Icasu-<Stage>-Db`  | Aurora **DSQL** クラスタ（サーバーレスな分散 Postgres）                                                   |
| `Icasu-<Stage>-Web` | **Cognito**、**S3 + CloudFront**（静的 SPA）、**API Gateway + Lambda**（BFF）、**DynamoDB**（セッション） |

## アーキテクチャ

```
                         ┌──────────────────────── CloudFront ───────────────────────┐
   Browser ── HTTPS ──▶  │  default behavior  ─────────────────▶  S3 (private, OAC)   │
                         │    └─ CF Function: SPA fallback → index.html               │
                         │  /api/*            ─────────────────▶  API Gateway (HTTP)  │
                         │    └─ CF Function: strip /api prefix      └─ Lambda (Hono)  │
                         └────────────────────────────────────────────────┬──────────┘
                                                                           │ IAM token
                                                                           ▼
                                                                    Aurora DSQL
```

API と静的コンテンツは**単一オリジン**を共有する: CloudFront は `/api/*` を API Gateway へ
転送し（`/api` プレフィックスは CloudFront Function で除去）、それ以外はすべて S3 へ向ける。
これはフロントエンドの構成と一致しており、RPC クライアントは本番で既に `/api` を向いている
（`apps/frontend/src/shared/api/index.ts`）。Lambda はローカル開発（`apps/backend`）と
_同じ_ Hono `app` を実行するため、バックエンドのコードは無変更で済む。

## 前提条件

- CDK 用に bootstrap 済みの AWS アカウント: `pnpm --filter @icasu/iac exec cdk bootstrap`
- 環境に認証情報があること（`AWS_PROFILE` / `AWS_REGION` または SSO）。
- CDK は Node のネイティブ TS サポートでアプリを実行する（`node src/app.ts`、`cdk.json` 参照）。
  バックエンドが `.ts` を直接実行するのと同じ方式で、ts-node は不要。

## デプロイ

```sh
# from the repo root
pnpm cdk:diff                       # preview
pnpm cdk:deploy                     # deploy both stacks (dev)

# build + upload the SPA in one go: the Web stack auto-uploads
# apps/frontend/dist if it exists, and invalidates CloudFront.
pnpm --filter @icasu/frontend build && pnpm cdk:deploy
```

## 設定

ランタイム入力は環境変数 `STAGE` のみ（`dev`・`prod`・未設定 → `dev`）。それ以外の値
（`region`・`account`・`stackPrefix`）は [`src/config.ts`](src/config.ts) に stage ごとの
定数（`devConfig` / `prodConfig`）として定義してある — 変更はそこで行う。

認証は **BFF パターン**を採用する: Lambda（Hono）が confidential な OAuth クライアントとして
Cognito の認可コード + PKCE フローを実行し、トークンは DynamoDB に保存、ブラウザには HttpOnly
なセッション Cookie だけを渡す。API Gateway の JWT authorizer は使わない — 認証は Hono の
セッションミドルウェアが担う。

```sh
STAGE=prod cdk deploy --all
```

## 採用した前提（必要なら変更する）

構築依頼を対話的に確認できなかったため、妥当なデフォルトとして以下を選択した:

1. **リージョンは `ap-northeast-1`（東京）、単一環境。** マルチリージョン DSQL は
   構成していない。基本的な環境分割は `src/config.ts` の stage ごとの定数でカバーする。
2. REST API ではなく **HTTP API（API Gateway v2）** — 安価で低レイテンシ。
3. **`/api` プレフィックスは CloudFront で除去**（CloudFront Function）。これにより
   バックエンドはルートパス（`/tasks`）のまま提供でき、Hono に `basePath` は不要。
4. **認証は BFF パターン（API Gateway の authorizer なし）。** Lambda（Hono）は
   confidential な OAuth クライアントで、Cognito の認可コード + PKCE フローを実行し、
   トークンは DynamoDB に保持、ブラウザには HttpOnly なセッション Cookie のみを渡す —
   ブラウザは JWT を一切持たない。
5. **カスタムドメイン / ACM 証明書なし** — CloudFront のデフォルトドメインを使う。

## ⚠️ DSQL のアプリ側 follow-up

ここにある**インフラ**はそのままデプロイ可能だが、既存のアプリスキーマとマイグレーション
フローには DSQL 固有の調整が必要で、それまで API は DSQL に対して動作しない
（DSQL は Postgres 互換だがドロップイン置き換えではない）:

- **`CREATE TYPE ... ENUM` は不可。** `packages/db/src/schema.ts` は `pgEnum`
  （`task_status`、`task_priority`）を使っているため、`text` + `CHECK` に変換する。
- **シーケンス / `SERIAL` は不可。** `uuid().defaultRandom()` の PK は問題ない。
- **外部キーは不可。**
- **1 トランザクションにつき DDL は 1 文まで。** Drizzle の node-postgres migrator は
  マイグレーションファイルを単一トランザクションで包むため、ファイルに複数の DDL 文が
  あると DSQL に拒否される。`drizzle-orm/.../migrator` ではなく、DSQL を考慮したランナー
  （1 文ずつ別トランザクション）でマイグレーションを実行すること。

ランタイムの接続自体（IAM トークン認証、SSL）は `DSQL_ENDPOINT` が設定されていれば
`packages/db/src/client.ts` が処理する。
