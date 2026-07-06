# アーキテクチャ詳細

目次

- [1. 登場人物とトラストモデル](#1-登場人物とトラストモデル)
- [2. ルーティングの2系統: `/auth` と `/api`](#2-ルーティングの2系統-auth-と-api)
- [3. 各フローのシーケンス図](#3-各フローのシーケンス図)
- [4. セッションストア（DynamoDB 単一テーブル）](#4-セッションストアdynamodb-単一テーブル)
- [5. Cookie の仕様](#5-cookie-の仕様)
- [6. 設定注入（DI）と env](#6-設定注入diと-env)
- [7. ローカル ↔ 本番の切り替え](#7-ローカル--本番の切り替え)
- [8. フロントエンド連携](#8-フロントエンド連携)
- [9. draft-ietf-oauth-browser-based-apps との対応](#9-draft-ietf-oauth-browser-based-apps-との対応)

## 1. 登場人物とトラストモデル

- **OIDC プロバイダ** = Cognito user pool + hosted UI（本番）/ mock-oauth2-server（ローカル）。
- **BFF** = Hono アプリ（`apps/backend`）。OAuth の **confidential client**。client secret を持ち、
  token endpoint に HTTP Basic（`client_id:client_secret`）で認証する（`libs/oidc.ts`）。
- **SPA** = React（`apps/frontend`）。**トークンを一切扱わない**。持つのは session Cookie だけ。
- **セッションストア** = DynamoDB（`libs/session.ts`）。トークンの実体はここにだけ置く。

信頼境界: ブラウザは信頼しない。トークンはサーバ側にしか存在しないため、XSS があっても
盗めるのは「Cookie 経由で BFF を叩ける」ことだけで、トークンそのものは奪えない
（HttpOnly なので JS からは Cookie 値すら読めない）。

## 2. ルーティングの2系統: `/auth` と `/api`

**この分離が最重要かつ最も間違えやすい。** BFF は用途の異なる2系統を持つ。

| 系統 | パス | 何 | 呼び出し方 | Hono マウント | CloudFront / Vite |
| --- | --- | --- | --- | --- | --- |
| **OAuth 遷移** | `/auth/login`・`/auth/callback`・`/auth/logout` | ブラウザのフルページ遷移。IdP との往復・redirect_uri | `window.location`（RPC ではない） | `app.route('/auth', navRoute)` | プレフィックスを **strip しない**（そのまま転送） |
| **JSON API** | `/api/me`・`/api/tasks` … | fetch/RPC で叩く JSON | Hono RPC クライアント（`credentials: 'include'`） | `app.route('/me', meRoute)`・`/tasks` | 先頭 `/api` を **strip** して Hono に `/me`・`/tasks` を見せる |

なぜ分けるか:

- **`/auth/*` を strip しない理由** = IdP に登録する redirect_uri を素直な `/auth/callback` に
  保つため。CloudFront（本番）も Vite proxy（ローカル）もそのまま転送し、Hono のマウント位置
  `/auth` と一致する。
- **`/api/*` を strip する理由** = RPC の型連携（`AppType`）に載るのは JSON API だけ。フロントは
  `client.me.$get()` のように叩き、`/api` プレフィックスは配信層（CloudFront Function / Vite
  rewrite）で除去されるので Hono 側は `/me`・`/tasks` として実装できる。
- `createMeRoute` が `createAuthRoute` と別関数なのはこのため。「現在のユーザー」を返す `/me` は
  リダイレクト系ではなく JSON API なので `/api` 配下に置き、`AppType` に載せる。

実装の対応:

- 本番: `apps/iac/src/stacks/web/cdn.ts` の `additionalBehaviors` — `/api/*` に strip 関数を付け、
  `/auth/*` は strip なしで同じ API Gateway origin へ。
- ローカル: `apps/frontend/vite.config.ts` の proxy — `/api` は `rewrite` で先頭を除去、`/auth` は
  そのまま転送。両者は同じ挙動になるよう意図的に揃えている。
- フロント: `features/auth/lib/urls.ts` の `authUrls` は `/auth/*` を**素の URL**として持ち、
  `shared/api` の RPC クライアントは `/api` ベース。

## 3. 各フローのシーケンス図

login / callback / me（API 保護）/ refresh / logout の**手順とシーケンス図は
[`docs/specs/authentication.md`](../../../../docs/specs/authentication.md) が単一の真実源**。
フロー（順序・分岐）を変えたらまずそちらを直す。ここでは図に載せていない実装上の要点だけ残す:

- **各エンドポイントと担当**: `/auth/login`・`/auth/callback`・`/auth/logout` は `route.ts`、
  `/api/me` の検証と透過リフレッシュは `middleware.ts` の `requireSession`、`/api/me` 本体は
  `route.ts` の `createMeRoute`（`c.get('session')` を JSON で返すだけ）。
- **失効マージン**は `REFRESH_MARGIN_SECONDS = 60`（`middleware.ts`）。`accessTokenExpiresAt - 60s
  <= now` で先回りリフレッシュ。
- **リフレッシュの失敗分岐**: `refreshToken` 無し／`TokenError.isInvalidGrant` は invalidate
  （セッション削除 + Cookie クリア）→ 401。**それ以外の一過性エラーは rethrow**（セッションは
  温存。ネットワーク瞬断で勝手にログアウトさせない）。
- **入力バリデーション**: `/auth/callback` は `code`・`state` 必須（無ければ 400 `invalid_request`）、
  `consumeState` 空は 400 `invalid_state`。`returnTo` は `/` 始まりの同一オリジンパスのみ許可
  （**open-redirect ガード**）。
- **各種検証の中身**は他節に集約: PKCE/state/nonce 生成（§9 と `pkce.ts`）、id_token の
  JWKS・issuer・audience・nonce 検証（`jwks.ts`）、セッションの TTL 明示チェック（§4）、
  Cookie 署名（§5）。

## 4. セッションストア（DynamoDB 単一テーブル）

`libs/session.ts` / IaC は `apps/iac/src/stacks/web/sessions.ts`。

- 単一テーブルをパーティションキー `pk` で名前空間分け:
  - `sess#<sessionId>` … トークン一式（**サーバ側のみ**）。TTL 30 日。
  - `state#<state>` … ログイン往復中だけ生きる PKCE/nonce/returnTo。TTL 10 分。
- `ttl`（epoch 秒）で DynamoDB TTL が自動掃除。ただし **DynamoDB Local は実際には失効させない**
  ため、`getSession`/`consumeState` は**読み取り時にも `ttl` を明示チェック**する。
- `consumeState` は Get→Delete のワンタイム（state 再利用を防ぐ）。
- IaC: `PAY_PER_REQUEST`、`timeToLiveAttribute: 'ttl'`、prod は `RETAIN`。

## 5. Cookie の仕様

`libs/cookie.ts`。`hono/cookie` の `setSignedCookie`/`getSignedCookie`/`deleteCookie` を使う。

- 中身は不透明な session id のみ（**トークンは絶対に載せない**）。
- 属性: `HttpOnly`・`Secure`（本番）・`SameSite=Strict`・`Path=/`・`Domain` 属性なし・maxAge 30 日。
- 本番は `__Host-` プレフィックス（`COOKIE_NAME`）。→ Domain 属性禁止・Path=/・Secure 必須という
  ブラウザ強制を満たす最も堅い Cookie。
- 署名は `COOKIE_SECRET`（本番は `openssl rand -hex 32`）。改竄/未署名は `readSessionCookie` が
  `undefined` を返す。
- SameSite=Strict でもログインが壊れない理由・`__Host-` 削除の Secure 必須は
  [gotchas.md](gotchas.md) 参照。

## 6. 設定注入（DI）と env

`libs/config.ts`。パッケージは `process.env` を読まず `AuthConfig` を受け取るだけ。

- ホスト（`apps/backend/src/index.ts` / `lambda.ts`）が `loadAuthConfigFromEnv()` を**起動時に**呼ぶ。
- 不足必須変数は**全件まとめて**エラーにする（初回リクエストで1つずつ落ちるのを防ぐ）。
- 2層で配線忘れを防ぐ: (1) `createAuth(config)` が `AuthConfig` を要求 → コンパイルエラー、
  (2) 起動時一括検証 → ブート時 fail fast。

env 一覧（必須/任意・既定値は `apps/backend/.env.example` が単一の情報源）:

| 変数 | 必須 | 用途 |
| --- | --- | --- |
| `OIDC_ISSUER`/`OIDC_AUTHORIZE_URL`/`OIDC_TOKEN_URL`/`OIDC_JWKS_URL` | ○ | プロバイダのエンドポイント |
| `OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET` | ○ | confidential client 認証 |
| `OIDC_SCOPES` | 任意（既定 `openid email profile`） | 要求スコープ |
| `AUTH_REDIRECT_URI` | ○ | `/auth/callback`。IdP 登録値と一致必須 |
| `AUTH_LOGOUT_URL` | ○ | `{redirect}` を含むログアウトテンプレート |
| `APP_BASE_URL` | ○ | SPA の場所。ログイン/ログアウト後の着地先 |
| `COOKIE_NAME` | 任意（既定 `sid`。本番 `__Host-`） | Cookie 名 |
| `COOKIE_SECURE` | 任意（既定 `true`。ローカル `false`） | Secure 属性 |
| `COOKIE_SECRET` | ○ | 署名鍵 |
| `SESSION_TABLE_NAME` | ○ | DynamoDB テーブル名 |
| `DYNAMODB_ENDPOINT` | 任意（Local のときだけ） | 本番は未設定 = AWS の DynamoDB |
| `AWS_REGION` | 任意（既定 `ap-northeast-1`） | リージョン |

## 7. ローカル ↔ 本番の切り替え

**コードは一切分岐しない。差分はすべて `AuthConfig`（= env）に寄せてある。**

| | ローカル | 本番 |
| --- | --- | --- |
| OIDC プロバイダ | mock-oauth2-server（`docker/mock-oauth2-server/config.json`、`:8080`） | Cognito hosted UI |
| セッション DB | DynamoDB Local（`:8000`、`DYNAMODB_ENDPOINT` 設定） | AWS DynamoDB（endpoint 未設定） |
| Cookie Secure | `false`（http） | `true` + `__Host-` |
| `/api`・`/auth` 振り分け | Vite proxy（`vite.config.ts`） | CloudFront Function（`cdn.ts`） |
| 起動 | `pnpm local:up` → `pnpm dev`（フロント :5001 / BFF :3001） | Lambda（`apps/iac`） |

- IaC の Cognito は **confidential client**（`generateSecret: true`）で、callback URL は SPA では
  なく **BFF の `/auth/callback`**。`callbackUrls` に本番 URL とローカル `http://localhost:5001/auth/callback`
  を両方登録している。
- Lambda（`api.ts`）に **JWT authorizer を付けない**。ブラウザは JWT を持たない（Cookie のみ）ため。
  認証は Lambda 内の Hono `requireSession` が行う。
- OIDC/Cognito の env は CDK が Lambda の環境変数として注入する（`api.ts` の `addEnvironment`）。

## 8. フロントエンド連携

FSD レイヤーに沿って配置（`apps/frontend/CLAUDE.md` 参照）。

- `shared/api`（`index.ts`）: `hc<AppType>(baseUrl, { init: { credentials: 'include' } })`。
  `credentials: 'include'` が **BFF セッション Cookie を全 API 呼び出しに同送**する鍵。
  `baseUrl` は `VITE_API_URL ?? '/api'`。
- `entities/session`: `sessionQuery()`（`client.me.$get()`、non-OK は `UnauthorizedError` を throw、
  `retry: false`、`staleTime: 5 分`）。`UnauthorizedError` は「未ログイン」を一時障害と区別する専用型。
- `features/auth`:
  - `AuthGuard`（`ui/auth-guard.tsx`）: `sessionQuery` を購読し、`UnauthorizedError` のときだけ
    `redirectToLogin()`。それ以外（loading/success/一時エラー）は children をそのまま描画
    —— API 自体がサーバ側で保護されているので、確認中に機微情報は漏れない。
  - `lib/urls.ts`: `authUrls.login(returnTo)` / `logout()`。`redirectToLogin()` は現在の
    `pathname + search` を `returnTo` に載せて全画面遷移。
  - `logout-button`: `/auth/logout` へ全画面遷移。
- **重要**: フロントは backend の内部モジュール（zod スキーマ等）を runtime import しない。
  契約面は `AppType`（Hono RPC 型）一本（`apps/frontend/CLAUDE.md` / `apps/backend/CLAUDE.md`）。

## 9. draft-ietf-oauth-browser-based-apps との対応

このアプリの設計は [OAuth 2.0 for Browser-Based Applications](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps)
の **§6 BFF パターン**に準拠する。

- SPA にトークンを渡さず BFF がトークンを保持（§6 の中心思想）。
- session Cookie の属性（HttpOnly / Secure / SameSite=Strict / `__Host-` / Domain なし / Path=/）は
  **§6.1.3.2** に対応（`libs/cookie.ts` の doc コメントに §6.1.3.2 が明記されている）。
- BFF は confidential client として authorization code + PKCE を実行（`libs/oidc.ts`・`pkce.ts`）。
- state（CSRF）・nonce（id_token リプレイ）・PKCE（code 横取り）を各フローで検証。
