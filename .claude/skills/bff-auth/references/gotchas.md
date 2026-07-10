# 落とし穴・注意点

認証を触るときに踏みやすい罠と、その背後の非自明な理由。多くは**実際に踏んで直した**もの
（git 履歴・doc コメントに痕跡がある）。「一見不要／不自然に見えるコード」を消す前に必ず読む。

## 1. `__Host-` Cookie の削除にも Secure が必須（過去に本番 500）

`clearSessionCookie` は `deleteCookie(c, name, { path: '/', secure: cfg.secure })` と
**secure を渡している**。削除は maxAge:0 の Set-Cookie にすぎないが、hono は Cookie 名が
`__Host-` プレフィックスを持つ場合に属性を検証し、**Secure を渡さないと throw する**。
これを渡し忘れると本番の `__Host-sid` でログアウトが 500 になる（実際に起きて修正済み。
コミット `67ad667`）。set 側と削除側で同じ `cfg.secure` を使うこと。`libs/cookie.ts` 参照。

## 2. SameSite=Strict でもログインが壊れない理由（消さないこと）

session Cookie は `SameSite=Strict`。一見「IdP からの `/auth/callback` リダイレクトで Cookie が
送られず壊れる」と思えるが壊れない。理由: **この Cookie が発行されるのは callback の中**で、
クロスサイトの IdP→callback リダイレクト時点ではまだ存在しない。以後 Cookie が送られるのは
同一オリジンの SPA→BFF（API 呼び出し・ログアウト遷移）だけ。だから Strict がログインフローを
妨げない。「Lax に緩めないと動かない」という誤解で緩めないこと。`libs/cookie.ts` の doc コメント参照。

## 3. DynamoDB Local は TTL で失効させない → 読み取り時にも ttl チェック

`getSession`/`consumeState` は `ttl` を DynamoDB TTL 任せにせず**読み取り時に明示チェック**する
（`res.Item.ttl < now` なら `undefined`）。DynamoDB Local は TTL 掃除を実際には行わないため、
このチェックが無いとローカルで失効済みセッションが有効に見える。本番でも TTL 削除には遅延が
あるので、この明示チェックは本番でも正しさに効く。`libs/session.ts` 参照。

## 4. `/auth/*` はプレフィックスを strip しない（`/api/*` とは非対称）

配信層（CloudFront Function / Vite proxy）で `/api` は先頭を除去するが、**`/auth` は除去しない**。
理由は IdP 登録の redirect_uri を素直な `/auth/callback` に保つため。`cdn.ts` や `vite.config.ts` を
「対称にしよう」と `/auth` も strip すると、Hono のマウント位置（`/auth`）とズレて callback が
404 になる。詳細は [architecture.md](architecture.md) §2。

## 5. `/me` を `/auth` 側に置かない（JSON API と遷移を混ぜない）

`createMeRoute` は `createAuthRoute` と**別関数**で、`/api/me` として配信する。`/me` を `/auth`
配下に移すと、(1) RPC 型連携（`AppType`）から外れフロントの型が壊れる、(2) strip 規則が変わり
パスがズレる。「まとめて `/auth` に置けば楽」に見えても分離を保つ。`route.ts` の doc コメント参照。

## 6. リフレッシュ失敗の分岐: invalid_grant だけ invalidate、他は rethrow

`middleware.ts` の `tryRefresh` は `TokenError.isInvalidGrant`（refresh token 失効/失格）の
ときだけセッションを破棄して 401 にする。**それ以外の一過性エラー（ネットワーク・5xx）は
rethrow してセッションを温存**する。ここを「失敗したら一律ログアウト」にすると、瞬断で
全ユーザーが吹き飛ぶ。`isInvalidGrant` は token endpoint の body に `invalid_grant` が含まれるかで
判定している（`libs/oidc.ts`）。

## 7. リフレッシュトークンのローテーション対応

`refreshTokens` のレスポンスに新しい refresh token があれば差し替え、無ければ既存を維持
（`tokens.refreshToken ?? session.refreshToken`）。プロバイダがローテーションする構成で、
「新 refresh を保存し忘れて次回リフレッシュが invalid_grant」になるのを防ぐ。`middleware.ts` 参照。

## 8. constructor parameter properties を使わない（Node strip-only TS の制約）

`TokenError`（`libs/oidc.ts`）は `constructor(private status)` 形式ではなく**明示的なフィールド
代入**にしている。Node の strip-only な TypeScript 実行（型注釈を消すだけでコード生成しない）が
parameter properties を**サポートしないため**。このモノレポは同方式で TS を直接実行する
（`allowImportingTsExtensions` 前提、ビルド無し）ので、認証以外の新規クラスでも parameter
properties は避ける。

## 9. redirect（returnTo）は同一オリジンのパスのみ許可（open-redirect ガード）

callback は `safeReturnPath`（`route.ts`）を通ったパスへだけ遷移し、さもなくば `/` へ落とす。
**先頭が `/` かどうかだけでは守れない** —— `//evil.com` はスキーム相対の絶対 URL として、
`/\evil.com` はブラウザが `\` を `/` に正規化して、どちらも外部サイトへ出てしまう。
ガードは `/` 始まり **かつ** `//`・`/\` 始まりでないこと。`route.test.ts` の
"refuses to redirect to an off-site returnTo" が絶対 URL・`//`・`/\` の 3 形を固定している。
returnTo の扱いを変えるときはこのテストを壊さない。

## 10. state はワンタイム消費・nonce は id_token と突合

- `state`: `consumeState` が Delete（`ReturnValues: ALL_OLD`）1 コマンドで読み取りと削除を行い
  再利用不可（CSRF & リプレイ対策）。Get→Delete の 2 コマンドに分けると並行 callback が同じ
  state を両方通過できてしまう（削除できた側だけが中身を得る、でアトミックにする）。未知/消費済み
  state の callback は 400。
- `nonce`: `verifyIdToken(idToken, expectedNonce)` が JWKS/issuer/audience 検証に加え
  `payload.nonce !== expectedNonce` を弾く（id_token リプレイ対策）。`libs/jwks.ts`。

「動くから」とこれらの検証を省略しない。各々が別の攻撃（CSRF / code 横取り / id_token リプレイ）に
対応している（PKCE の S256 challenge と合わせて三重）。

## 11. ステートフル部品はリクエストごとに作らない

DynamoDB document client（`libs/session.ts`）とリモート JWKS（`libs/jwks.ts` の
`createRemoteJWKSet`）は `createAuth` のクロージャに閉じ込め、**起動時に1度だけ**構築する。
JWKS はキャッシュが効く。ハンドラ内で `new DynamoDBClient()` したり verifier を作り直したりしない。

## 12. 「認証の仕様＝テスト」。挙動を変えたらテストを更新

`packages/backend-auth/src/route.test.ts`・`middleware.test.ts`・`libs/auth.test.ts` が
BFF フロー全体（login→callback→me→logout、リフレッシュ、ローテーション、無効化、
open-redirect ガード、`__Host-` 削除）を**実 Cookie で駆動して**固定している。DI を活かして
フェイクを注入する境界は「セッションストア（in-memory Map）」と「token endpoint / id_token 検証
（`vi.fn()`）」の2つだけで、`process.env` は書き換えない。認証を変更したら必ずこれらを
更新・実行する（`pnpm --filter @icasu/backend-auth test`）。

## 13. 契約面は `AppType` 一本。backend 内部をフロントに import しない

フロントは backend の zod スキーマなど内部モジュールを **runtime import しない**
（`@icasu/backend/schema` 参照禁止）。すると契約が二重化し、`@icasu/db`（drizzle/pg-core）まで
bundle に漏れる。フロントが要る型は RPC から `InferRequestType`/`InferResponseType` で取り出す。
`apps/backend/CLAUDE.md`・`apps/frontend/CLAUDE.md` 参照。
