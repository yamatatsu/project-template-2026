# CLAUDE.md — packages/backend-auth

BFF（Backend-For-Frontend）認証パッケージ（`@icasu/backend-auth`）で作業する際のルール。
OIDC 認可コード + PKCE フローを実装した**純粋な Hono app** で、設定は環境変数からのみ読む。
ホスト（`apps/backend`）が `app.route('/auth', authRoute)` でマウントし、保護ルートで
`requireSession` を再利用する。

## 構成

`index.ts` と、その直接の依存（`route.ts` / `middleware.ts`）だけを `src/` 直下に置き、
それらが使う部品は `src/libs/` にまとめる。

```
src/
  index.ts        # 公開 API（authRoute / requireSession / AuthEnv / SessionContext）
  route.ts        # authRoute: /login /callback /logout /me
  route.test.ts   # BFF フロー全体の仕様（後述）
  middleware.ts   # requireSession（セッション検証 + アクセストークンの自動リフレッシュ）
  libs/
    config.ts     # 環境変数からの設定読み込み（遅延 + キャッシュ、resetAuthConfig でクリア）
    cookie.ts     # 署名付きセッション Cookie（HttpOnly / SameSite=Strict / __Host-）
    oidc.ts       # authorize URL 生成 / トークンエンドポイント / logout URL
    jwks.ts       # id_token の JWKS 検証（jose）
    pkce.ts       # PKCE verifier/challenge・state・nonce・sessionId 生成
    session.ts    # DynamoDB 上のセッション & 一時 state ストア
    auth.test.ts  # libs 単体の仕様（後述）
```

## 公開 API（index.ts）

- **エントリは `index.ts` の1つだけ**（`exports` は `"."` のみ）。利用側は必ず
  `@icasu/backend-auth` から import し、`./route.ts` などの内部モジュールへ直接依存しない。
- 公開するのは `authRoute`（Hono app）、`requireSession`、型 `AuthEnv` / `SessionContext` のみ。
  それ以外（config・oidc・session など）はパッケージ内部の実装詳細。

## 設計方針

- **ルート定義はメソッドチェーンで書く**。`authRoute` の推論型が `AppType` 経由で
  フロントの Hono RPC クライアントに流れるため、途中変数に分解しない（`tasks` ルートと同じ規約）。
- **設定は環境変数のみ**（`config.ts`）。このパッケージは `.env` を持たず、ホストプロセスの
  env を共有する。同じコードが本番（実 Cognito Hosted UI）とローカル（mock-oauth2-server +
  DynamoDB Local）で動くのは、差分をすべて env に寄せているため。必要な変数は
  `apps/backend/.env.example` を参照。
- **BFF セキュリティプロファイル**。ブラウザが持つのは不透明・署名付きの session id を載せた
  Cookie のみ（HttpOnly / SameSite=Strict / 本番は `__Host-` プレフィックス）。アクセス／
  リフレッシュ／id トークンはサーバ側（`session.ts` の DynamoDB）だけに保持する。
- **トークンのリフレッシュ**。`requireSession` は失効間近のアクセストークンを透過的に更新し、
  プロバイダがリフレッシュトークンをローテーションすれば新しい値を保存する。`invalid_grant`
  ならセッションを破棄して 401 を返す。
- `session.ts` は単一テーブルを `pk` で名前空間分け（`sess#<id>` / `state#<state>`）し、
  DynamoDB TTL と読み取り時の明示チェックを併用する。

## テスト方針

**このパッケージのテストが認証機能の仕様**。外部境界だけをモックし、それ以外は実物を動かす。

- `route.test.ts` — `authRoute` を実 Cookie で駆動し、login → callback → me → logout の
  BFF フロー全体（PKCE・state・Cookie 署名・自動リフレッシュ・オープンリダイレクト防止）を
  記述する。モックするのは2つの境界のみ: セッションストア（`libs/session.ts` → in-memory Map）と、
  トークンエンドポイント / id_token 検証（`libs/oidc.ts` の `exchangeCode`/`refreshTokens`、`libs/jwks.ts`）。
- `libs/auth.test.ts` — PKCE 生成・authorize/logout URL 組み立て・`config.ts` の単体テスト。
- 各テストは `beforeEach` で env を設定し `resetAuthConfig()` でキャッシュを捨てて再読込する。
