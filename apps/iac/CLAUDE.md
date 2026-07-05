# CLAUDE.md — apps/iac

AWS CDK (TypeScript) で作業する際のルール。アーキテクチャ・デプロイ手順・DSQL の
アプリ側 follow-up は [`README.md`](README.md) を参照。ここでは**コードを書くときの規約**に絞る。

## 構成

```
src/
  app.ts            # CDK エントリ（cdk.json の `app` が指す）。Stack を組み立てるだけの薄い層
  config.ts         # デプロイ設定（後述）
  stacks/
    db/index.ts     # DbStack（Aurora DSQL クラスタ）
    web/
      index.ts      # WebStack 本体。construct を組み合わせるだけ
      api.ts        # Api construct（API Gateway HTTP API + Lambda）
      cdn.ts        # Cdn construct（S3 + CloudFront、/api を API GW へ）
      cognito.ts    # Cognito construct（User Pool + hosted UI client）
cloudfront/         # CloudFront Functions（strip-api-prefix / spa-fallback）の JS
```

CDK はネイティブ TS 実行（`node src/app.ts`、`cdk.json` 参照）。ts-node 不要。

## 設定（config.ts）

- **ランタイム入力は環境変数 `STAGE` のみ**。値は `dev` / `prod` / 未設定のいずれか。
  未設定なら `dev` にフォールバックし、それ以外は例外を投げる（`resolveStage`）。
- **CDK context は使わない**。`app.node.tryGetContext(...)` や `cdk deploy -c key=value` で
  設定値を渡さないこと。`STAGE` 以外の値（`region` / `account` / `stackPrefix` など）は
  すべて `config.ts` 内に**定数**として定義する。
- stage ごとの差分は `devConfig` / `prodConfig` の2つの定数オブジェクトで表現し、
  `STAGE` で切り替える。設定値を増やすときは両方に追記する。
- デプロイは `STAGE=prod cdk deploy --all` のように環境変数で指定する。

## Stack / construct を書くときの規約

- **`CfnOutput` は使わない**。CI/CD ランタイムにスタックの内部情報（エンドポイント・
  バケット名・User Pool ID など）を余計なヒントとして晒さないため。値が必要なら
  construct のプロパティ経由でコード内で受け渡す。
- **不要な public 属性を作らない**。外部（他 construct / app.ts）から参照しない値は
  インスタンス属性にせずローカル変数に留める。別メソッドで使うが外部公開不要なものは
  `private` にする。属性を消すときは参照箇所を grep で確認してから。
- **CloudFront まわりなど凝集した一塊は construct に切り出す**（例: `Cdn`）。
  `WebStack` 本体は construct を組み立て依存を繋ぐだけの薄い層に保つ。
- **API 認証は BFF（Hono）で行う**。本構成は OAuth BFF パターンを採用する。ブラウザは
  セッション Cookie のみを持ちトークンを受け取らないため、API Gateway に JWT authorizer は
  付けない（ブラウザは JWT を持たない）。認証は Lambda 内の Hono セッション検証ミドルウェアが
  担う。Cognito はトークン発行（Hosted UI + authorization code grant + PKCE）に用い、Lambda は
  機密クライアントとして token endpoint と通信する。

## ドキュメントとの整合

コードを変更したら、`README.md` と各ファイルの doc コメントが実装と乖離していないか
必ず確認すること。特に設定の渡し方・スタック構成・デプロイ手順・公開属性を変えたときは
README / コメントも同時に更新する。

## 確認コマンド（リポジトリルートから）

| 目的           | コマンド                                   |
| -------------- | ------------------------------------------ |
| 型チェック     | `pnpm --filter @icasu/iac run typecheck`   |
| 差分プレビュー | `pnpm cdk:diff`                            |
| デプロイ       | `pnpm cdk:deploy`（`STAGE` で stage 指定） |
