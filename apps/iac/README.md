# @icasu/iac

このアプリの AWS CDK（TypeScript）インフラ。スタックは2つ:

| スタック            | リソース                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `Icasu-<Stage>-Db`  | Aurora **DSQL** クラスタ（サーバーレスな分散 Postgres）+ マイグレーション **Trigger**                     |
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

## スキーマのマイグレーション

`Icasu-<Stage>-Db` にはマイグレーション用の Lambda + CDK `Trigger`
（[`src/stacks/db/migration.ts`](src/stacks/db/migration.ts)）が含まれ、`cdk deploy` の中で
`packages/db` の drizzle マイグレーションを DSQL へ自動適用する。手動適用は不要。

- マイグレーション SQL は Lambda バンドルに同梱される。SQL に変更がなければ Trigger は
  再実行されず、デプロイに影響しない。
- マイグレーションが失敗するとデプロイ自体が失敗する。適用済みの DDL はロールバック
  されない（forward-only 運用）。
- `WebStack` は `DbStack` に依存するため、新しいアプリコードが公開される前にスキーマ適用が
  完了する。

スキーマを DSQL 互換に保つルール（`pgEnum` 不可・FK 不可・1 トランザクション 1 DDL など）と
ランナーの設計は [`packages/db/CLAUDE.md`](../../packages/db/CLAUDE.md) を参照。
ランタイムの接続自体（IAM トークン認証、SSL）は `DSQL_ENDPOINT` が設定されていれば
`packages/db/src/client.ts` が処理する。
