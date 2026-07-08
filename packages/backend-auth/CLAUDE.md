# CLAUDE.md — packages/backend-auth

BFF（Backend-For-Frontend）認証パッケージ（`@icasu/backend-auth`）で作業する際のルール。
OIDC 認可コード + PKCE フローを実装し、**設定を注入で受け取る**（`process.env` を直接読まない）。
ホスト（`apps/backend`）が `createAuth(config)` で組み立て、返ってきた Hono app を
`app.route('/auth', auth.route)` にマウントし、保護ルートで `auth.requireSession` を再利用する。

## 構成

`index.ts` と、その直接の依存（`route.ts` / `middleware.ts`）だけを `src/` 直下に置き、
それらが使う部品は `src/libs/` にまとめる。

```
src/
  index.ts        # 公開 API（createAuth / loadAuthConfigFromEnv / 型）
  route.ts        # createAuthRoute → /login /callback /logout /me
  route.test.ts   # BFF フロー全体の仕様（後述）
  middleware.ts   # createRequireSession（セッション検証 + アクセストークンの自動リフレッシュ）
  libs/
    config.ts     # AuthConfig 型 + loadAuthConfigFromEnv（env→config、起動時に一括検証）
    cookie.ts     # createCookies: 署名付きセッション Cookie（HttpOnly / SameSite=Strict / __Host-）
    oidc.ts       # createOidcClient: authorize URL / トークンエンドポイント / logout URL、TokenError
    jwks.ts       # createIdTokenVerifier: id_token の JWKS 検証（jose）
    pkce.ts       # PKCE verifier/challenge・state・nonce・sessionId 生成（状態なし）
    session.ts    # createSessionStore: DynamoDB 上のセッション & 一時 state ストア
    auth.test.ts  # libs 単体の仕様（後述）
```

## 公開 API（index.ts）

- **エントリは `index.ts` の1つだけ**（`exports` は `"."` のみ）。利用側は必ず
  `@icasu/backend-auth` から import し、`./route.ts` などの内部モジュールへ直接依存しない。
- 公開するのは `createAuth`・`loadAuthConfigFromEnv` と、型
  `AuthConfig` / `AuthEnv` / `RequireSession` / `SessionContext` のみ。個々の `create*`
  ファクトリ（cookie・oidc・session など）はパッケージ内部の実装詳細。

## 設計方針

- **設定は注入（DI）。`process.env` を直接読まない。** パッケージは `AuthConfig` を受け取る
  だけで、env の読み取り・検証はホストの責務。これにより「ホストが env を用意し忘れる」バグを
  次の2層で防ぐ:
  1. **型による強制** — `createAuth(config)` が `AuthConfig` を要求するので、配線忘れは
     コンパイルエラー。
  2. **起動時の一括検証** — ホストは `loadAuthConfigFromEnv()` を**起動時**（`apps/backend`
     の `index.ts` / `lambda.ts`）に呼ぶ。不足 env は**全件まとめて**報告し、初回リクエストでは
     なくブート時に落とす。同じコードが本番（実 Cognito）とローカル（oidc-server-mock +
     DynamoDB Local）で動くのは、差分をすべて `AuthConfig` に寄せているため。必要な変数は
     `apps/backend/.env.example` を参照。
- **ルート定義はメソッドチェーンで書く**。`createAuthRoute` の戻り値型が `AppType` 経由で
  フロントの Hono RPC クライアントに流れるため、途中変数に分解しない（`tasks` ルートと同じ規約）。
- **ステートフルな部品は `createAuth` で1度だけ構築する**。DynamoDB クライアント（`session.ts`）
  とリモート JWKS（`jwks.ts`）は各ファクトリのクロージャに閉じ込め、リクエストごとに作らない。
- **BFF セキュリティプロファイル**。ブラウザが持つのは不透明・署名付きの session id を載せた
  Cookie のみ（HttpOnly / SameSite=Strict / 本番は `__Host-` プレフィックス）。アクセス／
  リフレッシュ／id トークンはサーバ側（`session.ts` の DynamoDB）だけに保持する。
- **トークンのリフレッシュ**。`requireSession` は失効間近のアクセストークンを透過的に更新し、
  プロバイダがリフレッシュトークンをローテーションすれば新しい値を保存する。`invalid_grant`
  ならセッションを破棄して 401、その他の一過性エラーは rethrow（セッションは温存）。
- `session.ts` は単一テーブルを `pk` で名前空間分け（`sess#<id>` / `state#<state>`）し、
  DynamoDB TTL と読み取り時の明示チェックを併用する。

## テスト方針

**このパッケージのテストが認証機能の仕様**。DI を活かして依存にフェイクを注入し、外部境界以外は
実物を動かす（`process.env` を書き換えない）。

- `route.test.ts` — `createAuthRoute` の Hono app を実 Cookie で駆動し、login → callback →
  me → logout の BFF フロー全体（PKCE・state・Cookie 署名・自動リフレッシュ・オープン
  リダイレクト防止）を記述する。注入するフェイクは2つの境界のみ: セッションストア（in-memory
  Map）と、トークンエンドポイント / id_token 検証（`exchangeCode`/`refreshTokens`/`verifyIdToken`
  の `vi.fn()`）。
- `middleware.test.ts` — `createRequireSession` に cookie / store / oidc のフェイクを注入し、
  各分岐（Cookie 無し / セッション無し / 有効 / リフレッシュ＋ローテーション / 無効化）を
  副作用まで直接検証する。
- `libs/auth.test.ts` — PKCE 生成・authorize/logout URL 組み立て・`loadAuthConfigFromEnv`
  （完全な env の parse と、不足時の全件報告）の単体テスト。
