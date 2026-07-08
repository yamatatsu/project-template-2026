---
name: bff-auth
description: このモノレポ（project-template-2026）の認証の唯一の実装ガイド。OAuth 2.0 authorization code + PKCE を confidential client として実装した BFF（Backend-For-Frontend）パターン（draft-ietf-oauth-browser-based-apps §6 準拠）。ブラウザには不透明・署名付きの HttpOnly セッション Cookie だけを渡し、アクセス／リフレッシュ／id トークンはサーバ側（DynamoDB）にのみ保持する。以下のいずれかのとき必ず読むこと —— (1) 認証・ログイン・ログアウト・セッション・Cookie・OIDC/OAuth/PKCE・トークンリフレッシュ・`@icasu/backend-auth`・Cognito・oidc-server-mock について質問された、(2) ログイン/ログアウト/セッション/保護ルート/認可などの認証関連機能を実装・変更・レビューする、(3) `packages/backend-auth`・`apps/frontend` の `features/auth`・`entities/session`・`apps/iac` の Cognito/CloudFront/DynamoDB セッション周りを触る、(4) 認証の設計判断（なぜ Cookie にトークンを載せないか、なぜ /auth と /api を分けるか等）や落とし穴を知りたい。
---

# BFF 認証（project-template-2026）

このモノレポの認証は **BFF（Backend-For-Frontend）パターン**で実装されている。
出典は [OAuth 2.0 for Browser-Based Applications](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps)（IETF draft）の
**§6 "Backend For Frontend (BFF)"**、Cookie 属性は **§6.1.3.2**。

作業を始める前にまずこの SKILL.md 全体を読み、深掘りが必要になったら下記の reference を開く。
**このスキルと各ソースの doc コメント／各 `CLAUDE.md` が認証の正典**で、記憶や一般論で
認証コードを書かない。

## 破ってはいけない中心不変条件

> **ブラウザが手にするトークンはゼロ。** ブラウザが持つのは不透明・署名付きの session id を
> 載せた HttpOnly Cookie 1つだけ。access / refresh / id トークンはすべてサーバ側
> （DynamoDB のセッション行）にだけ存在する。

この一線を崩す提案（トークンを JSON で返す、`localStorage` に入れる、API Gateway に JWT
authorizer を付ける、Cookie にアクセストークンを載せる等）は **BFF パターンの否定**であり、
XSS によるトークン窃取への構造的防御を失う。実装・レビューではこれを最優先で守る。

## 全体像（1 段落）

Cognito（本番）/ oidc-server-mock（ローカル）を **OIDC プロバイダ**、Hono BFF を
**confidential client**（client secret 保持）とする authorization code + PKCE フロー。
ログインは BFF の `/auth/login` → プロバイダ hosted UI → `/auth/callback` へフルページ遷移し、
BFF が code をトークンに交換して DynamoDB にセッション行を作り、署名付き session Cookie を
発行する。以後 SPA は `credentials: 'include'` で `/api/*`（JSON API）を叩き、BFF の
`requireSession` ミドルウェアが Cookie → セッション検証（＋失効間近なら透過リフレッシュ）を行う。

## パッケージと責務（どこを触るか）

| 場所 | 役割 |
| --- | --- |
| `packages/backend-auth`（`@icasu/backend-auth`）| 認証の本体。`createAuth(config)` が合成点。**認証の仕様はここのテストが正典**。 |
| `packages/backend-auth/src/route.ts` | `createAuthRoute`（`/login`・`/callback`・`/logout` = ブラウザ遷移）と `createMeRoute`（`/me` = JSON API）。 |
| `packages/backend-auth/src/middleware.ts` | `createRequireSession`。保護ルート用。セッション検証＋アクセストークン自動リフレッシュ＋ローテーション。 |
| `packages/backend-auth/src/libs/` | `config`（DI 設定 + env ロード）/ `cookie`（署名付き Cookie）/ `oidc`（token endpoint・URL 組み立て）/ `jwks`（id_token 検証）/ `pkce`（乱数・PKCE）/ `session`（DynamoDB ストア）。 |
| `apps/backend/src/app.ts` | ホストの合成点。`createAuth` を呼び `/auth`・`/me`・`/tasks` をマウント。`AppType` を export。 |
| `apps/frontend/src/features/auth` | `AuthGuard`（`/api/me` が 401 のときログインへ全画面遷移）・`logout-button`・`authUrls`。 |
| `apps/frontend/src/entities/session` | `sessionQuery`（TanStack Query で `/api/me`）・`UnauthorizedError`。 |
| `apps/frontend/src/shared/api` | Hono RPC クライアント（`credentials: 'include'`）。 |
| `apps/iac/src/stacks/web` | `cognito`（confidential client + hosted UI）・`cdn`（CloudFront の `/api` と `/auth` 振り分け）・`sessions`（DynamoDB）・`api`（Lambda。authorizer なし）。 |

## 絶対に外せない設計ポイント

- **設定は注入（DI）。パッケージは `process.env` を読まない。** ホスト（`apps/backend`）が
  `loadAuthConfigFromEnv()` を**起動時に一度**呼び、不足 env を全件まとめて報告して fail fast する。
  同じコードが本番（Cognito）とローカル（mock）で動くのは差分をすべて `AuthConfig` に寄せているから。
- **ルート定義はメソッドチェーンで書く（変数に分解しない）。** チェーンを崩すと推論型 `AppType`
  が失われ、フロントの Hono RPC 型連携が壊れる。`route.ts` / `app.ts` / `tasks/route.ts` 共通の規約。
- **`/auth`（ブラウザ遷移）と `/api`（JSON）は別系統。** 混同禁止。理由と振り分けは
  [references/architecture.md](references/architecture.md)。
- **ステートフルな部品（DynamoDB クライアント・リモート JWKS）は `createAuth` で1度だけ構築**し、
  リクエストごとに作らない。

## 深掘りリファレンス

- **各フローのシーケンス図** —— login / logout / refresh / API 保護の手順・順序・分岐を mermaid で
  図解したリポジトリ内ドキュメント。**フロー（手順）はここが単一の真実源**（正典はコード＝テスト
  だが、フローの記述はこの1箇所に集約し、architecture.md には重複させない）。フローを変えたら
  まずここを直す。→ [`docs/specs/authentication.md`](../../../docs/specs/authentication.md)
- **アーキテクチャ全体** —— `/auth` vs `/api` の分離と CloudFront/Vite の振り分け、セッションストア／
  Cookie 仕様、ローカル↔本番の切り替え、DI 設計、フロント連携、draft との対応（＝**設計判断**が中心。
  各フローの手順は上のドキュメントを見る）。→ [references/architecture.md](references/architecture.md)
- **落とし穴・注意点** —— `__Host-` Cookie 削除時の Secure 必須、SameSite=Strict が成立する理由、
  DynamoDB Local の TTL、redirect_uri を strip しない理由、`invalid_grant` の扱い、Node strip-only
  TS の制約、open-redirect ガード 等（既に踏んで直したものを含む）。→
  [references/gotchas.md](references/gotchas.md)

## 変更するときの入口

- **保護 API を追加** → ルートに `auth.requireSession` を挟み `c.get('session')` で `userSub`/`email`
  を取る（`tasks/route.ts` と同型）。`app.ts` へメソッドチェーンでマウント。
- **セッションに項目を増やす** → `libs/session.ts` の `SessionData` と読み書き、`route.ts` の
  `saveSession`、必要なら `middleware.ts` の `SessionContext` を揃える。
- **プロバイダ／スコープ変更** → env（`OIDC_*` / `AUTH_*`）と `apps/iac` の Cognito、
  `apps/backend/.env.example` を一緒に更新。DI のためパッケージ側コードは基本不要。
- **認証を触ったら必ず** `pnpm --filter @icasu/backend-auth test`（＋ `apps/backend` のテスト）を
  実行し、テスト＝仕様を満たすことを確認する。
