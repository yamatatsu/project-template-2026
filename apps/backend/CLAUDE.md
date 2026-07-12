# CLAUDE.md — apps/backend

BFF（Hono on Node.js / Lambda）の作業ルール。全体構成・共通コマンドはルート
[`CLAUDE.md`](../../CLAUDE.md)。

**この文書が backend の設計判断（レイヤ分割・値の所有・認可など）の根拠の集約先**。コードコメントは
ここへ参照させ、同じ根拠をコードに再説しない（コメント方針はルート [`CLAUDE.md`](../../CLAUDE.md)
「コードコメントの方針」）。長い仕様は `docs/specs/` に切り出してリンクする:
[楽観ロック](../../docs/specs/optimistic-lock.md)・[認証](../../docs/specs/authentication.md)・
[ログ](../../docs/specs/logs.md)。

## 合成点

`createApp(config)`（`src/app.ts`）が唯一の合成点。`@icasu/backend-auth` を `/auth` にマウントし、
機能ルート（`/me`・`/tasks`）を保護グループに束ねてルート直下に合成する。保護グループは境界で
`auth.requireSession` を 1 回適用して配下を認証保護する。**設定は `AppConfig` として注入し、env の
直読みはアプリ内でしない**（検証は起動時に一括）。

- `src/index.ts` … Node 起動（`loadAuthConfigFromEnv()` を注入）。
- `src/lambda.ts` … Lambda ハンドラ。

## ルートの分割とパス

機能ルートは **1 エンドポイント 1 ファイル**で `src/routes/` 直下に**フラットに**置き、各ファイルは
`export default new Hono().<method>('/path', …)` を返す。ファイル名にパスとメソッドをエンコードする
（`.`＝パス区切り、`$xxx`＝動的セグメント、末尾＝操作。TanStack Router / Remix のフラットルート規約
相当）。ファイル名を見ればパスとメソッドが一意に分かるのが狙い。

| ファイル                         | エンドポイント              |
| -------------------------------- | --------------------------- |
| `routes/me.get.ts`               | `GET /me`（現在のユーザー） |
| `routes/tasks.list.ts`           | `GET /tasks`（一覧取得）    |
| `routes/tasks.post.ts`           | `POST /tasks`（作成）       |
| `routes/tasks.$taskId.get.ts`    | `GET /tasks/:id`            |
| `routes/tasks.$taskId.put.ts`    | `PUT /tasks/:id`            |
| `routes/tasks.$taskId.delete.ts` | `DELETE /tasks/:id`         |

- **パスは各ファイルにフルパスで書く**（`'/tasks'`・`'/tasks/:id'`）。`createApp` は各 default export
  を `.route('/', …)` でルート直下にマウントするため。`$taskId` はファイル名上の可読名で、**真実の
  源は各ファイル内の `'/tasks/:id'`**。
- **末尾スラッシュを付けない**（`'tasks/'` は実パスが `/tasks/` になり、Hono 既定の strict 判定で
  RPC クライアントの `/tasks` と食い違い 404）。
- **各ルートビルダはメソッドチェーンで書き切る**。ビルダチェーンを途中で切って弱い型の変数に
  入れると `AppType`（フロント RPC 連携）が壊れる（「フロントへの公開面」）。
- **テストの書き方は backend-testing skill を使う**。

## 入力検証と値の所有

各ルートは `zValidator('json' | 'param' | 'header', schema)` で検証する。検証スキーマは feature 単位で
`src/wire/<feature>.ts`（request セクション）に置き、ルートから相対 import する（package export は
しない。「フロントへの公開面」）。

- **リクエストボディは全フィールド必須**（optional を作らない）。「無いなら null」を明示させ
  フロントを甘やかさない（`description`/`dueDate` は「キー必須・値は null 可」）。これで POST/PUT が
  同じ `taskInputSchema` を共有できる（版は body でなく `If-Match` で受けるため）。
- **列の値は DB のデフォルトではなくアプリ（ドメイン）が決める**（[`packages/db/CLAUDE.md`](../../packages/db/CLAUDE.md)）。
  作成時の初期版・`createdAt`/`updatedAt` は `createTask`、更新時の `version`(+1)・`updatedAt` は
  `applyUpdate`、`users` の JIT は `createUser` が決める。**`$onUpdate` は使わず、ハンドラでもセットしない**。
- **スキーマ名は境界の語彙で名詞始まり**にする（例: `taskInputSchema`）。`create`/`update` はアプリ／
  コマンド層の語彙なので wire に持ち込まない。
- **enum の値集合の単一定義源は `entities/<feature>.ts`**（`taskStatusValues` 等）。wire の zod は
  `z.enum(taskStatusValues)` でここから派生させる（infra→domain の依存方向のため）。
- **境界でパースまで済ませる（parse, don't validate）**。ワイヤ→ドメインの変換はスキーマの `.transform`
  で行い、下流は変換済みの値だけ扱う（`dueDate` は ISO 文字列 → `Date | null`）。RPC のリクエスト型は
  transform **前**の入力型を見るので、クライアント契約（ISO 文字列送信）は変わらない。

> `packages/db` は package なので app 内の `entities` を import できず、`@icasu/db/schema` が enum の
> コピーを持つ（二重管理。値を足すときは両方を揃える）。解消には entity を `packages/domains` へ
> 切り出す必要があり別途。

## ドメイン層の構成（関数型 DDD）

更新系は **load → apply → save**、作成系は **create → add** に分け、レイヤごとにファイルを分ける。
状態遷移・生成の判断（業務ルール）を副作用のない純粋関数に閉じ込めテスト可能にするのが狙い。
**`PUT /tasks/:id` と `POST /tasks` が実装リファレンス**。`users` の JIT も同形（`createUser` ＋
`findUserBySub`/`addUser`、合成は `middleware/auth.ts`。「認証・認可」）。削除（DELETE）は状態遷移も
楽観ロックも持たないのでドメイン関数を挟まず repo の `removeTask` を直接呼ぶ。**読み取り系はドメイン
層を経由しない**（「読み取り系の方針」）。

- **`src/entities/<feature>.ts`（純粋）**: エンティティ型・factory（`createTask`。版の起点を固定）・
  状態遷移（`applyUpdate`）。DB もフレームワークも触らない。版競合の判断は意図を表す純粋関数
  （`ensureExpectedVersion`）に切り出し、状態遷移が内部で使う。
  - 失敗は throw せず `@icasu/simple-result` の `Result` で返す（[`.claude/rules/result-type.md`](../../.claude/rules/result-type.md)）。
    `E` はタグ付き union（`{ type: 'version-conflict', … }`）。
  - **時計 `now` はドメイン内で `new Date()` せず引数で注入**（純粋性・テスト容易性）。「クライアントの
    意図」（`updates`/`expectedVersion`）は Command に載せ、ambient な `now` は別引数で渡す。
  - **版のフィールド名は意図で選ぶ**。クライアントが編集の土台にした版は `expectedVersion`
    （`currentVersion` は「今 DB にある版」と読み違えるので使わない）。
- **`src/repositories/<feature>-db-repo.ts`（永続化）**: DB の読み書きだけを担い業務判断を持たない。
  API は **`find`/`add`/`save`/`remove` のコレクション語彙**でそろえ、SQL/CRUD 動詞は避ける
  （DB 実装の語彙をドメイン側に漏らさないため）:
  - `find*` —— 無いかもしれないので nullable（`get*` にしない）。
  - `add*` —— factory が組んだ新規状態を追加。CAS 不要。
  - `save*` —— 次状態を基底版条件の CAS で書き戻す（競合で書けなければ「保存できず」を返す）。
  - `remove*` —— 1 件削除し成否だけ返す（無ければルートが 404）。楽観ロックは掛けない。

  DB 行（フラット）⇄ドメイン型の変換は repo 内のヘルパ 1 か所に集約し、監査系の列は `meta`
  （version / 監査タイムスタンプ）にまとめて業務フィールドと分離する。

- **ルート（アプリケーション層）**: `findTask` →（`applyUpdate`・`Result` を narrowing）→ `saveTask` を
  繋ぎ、HTTP と結果コードの対応づけだけ持つ。**ワイヤ⇄ドメインのフィールド読み替え**
  （`version` → `expectedVersion` 等）はここに置き、ドメインにワイヤの語彙を持ち込まない。
- **`src/wire/<feature>.ts`（ワイヤ境界）**: request の zod スキーマ（入力の門番）と response serializer
  ＋ `TaskResponse` 型（出力）を、**方向でなくリソースで割って** 1 feature 1 ファイルに同居させる。
  feature を足す人が「送る形・返る形」を一度に触れ、共有フィールドの drift を隣り合わせでレビュー
  できるため。整合の強制は近接ではなく上流ソース（`entities` の値配列/型）が担うので、**enum をここで
  二重宣言しない**。package export もしない（「フロントへの公開面」）。

## 読み取り系の方針 — mini-CQRS

読み取り系（`GET /tasks/:id`・`GET /tasks`）は **ドメイン層を経由しない**。write の層分けを正当化するのは
楽観ロック・状態遷移という守るべき不変条件で、read にはそれが無く `findTask`/`Task` を通しても間接層が
増えるだけ。command と query は変更の圧力（整合性 vs 表示形・性能）が違うので分ける。

- read ハンドラは **drizzle 直書き**でよく、リファクタは**ハンドラ内の関数抽出に留める**（read 専用の
  repo/query 抽象を先に作らない＝YAGNI）。
- 次が**顕在化したら** read 専用の query 関数／read-model に昇格する: N+1・複数クエリを跨ぐ集約 ／
  行そのまま以上の projection・集計・整形 ／ ページング・フィルタ・ソートの組み合わせ爆発 ／
  read model がテーブル形から乖離。

### レスポンス形は全 endpoint で一貫（`TaskResponse`）

同じリソースが endpoint 次第で別の形にならないよう、**POST/PUT/GET/list は同一のワイヤ形**（`meta`
ネスト）を返す。整形は `src/wire/<feature>.ts` の serializer を単一の定義源にする:

- write（POST/PUT）の `toTaskResponse` —— ドメイン型 → ワイヤ。
- read（GET/list）の `rowToTaskResponse` —— drizzle 行 → ワイヤ。行から直接組むが、**返り値型を
  `TaskResponse` に固定**して write と形が割れないことを型で保証する。
- **`TaskResponse` はドメイン `Task` の再 export にしない**。`c.json` が `Date` を ISO 文字列に
  エンコードするので、date 系 leaf の型が `Task`（`Date`）と一致せず再 export は嘘になる。境界の
  独立した契約として宣言する（境界の語彙 ≠ ドメインの語彙）。
- **`Date → ISO 文字列` の encode を serializer 内で明示する**（入力境界の `.transform` による
  ISO→Date decode と対称）。Hono 任せにせず、`TaskResponse` を実ワイヤ形と一致させて型を正直に保つため。

## ミューテーションの意味論（楽観ロック）

設計の根拠（なぜ body でなく `If-Match` か・なぜ DELETE には掛けないか・412 からの回復手順）は
[`docs/specs/optimistic-lock.md`](../../docs/specs/optimistic-lock.md)。ここには作業ルールだけを書く。

- **更新（PUT）は楽観ロック必須**。`src/middleware/optimistic-lock.ts` の `requireOptimisticLock()` を
  `auth` と同様ルート定義に差す。版は body でなく **`If-Match` ヘッダ**で受け、ハンドラは
  `c.req.valid('header')['if-match']`（number）で読む。**削除（DELETE）には掛けない**。
- **版の一致判定はドメインの `ensureExpectedVersion`（純粋）に閉じる**。ミドルウェアが持つのは
  ヘッダのパースまで。
- **`saveTask` は基底版を条件に CAS する**。`version` は `applyUpdate` が決めた絶対値を書き戻し、DB 側で
  `+1` しない。基底版（`expectedVersion`）は「新版 - 1」と逆算せず呼び出し側から渡す。
- **ステータス**: `If-Match` 欠如 → **428** ／ 形式不正 → **400** ／ 対象なし → **404** ／
  版不一致・CAS 競合 → **412**。412 の body は `{ error: 'Version conflict', entity, id }` のみ。
- `PUT /tasks/:id` は **PATCH ではなく PUT（全体置換）**。全フィールド必須なので、送られたボディを
  そのまま反映する（旧値は保持しない）。

## フロントへの公開面（exports）は `AppType` 一本

`package.json` の `exports` は `.`（`src/index.ts` が `AppType` を re-export）**だけ**。フロントとの契約面は
この RPC 型に集約する。`./app`・`./lambda` は export しない（`app.ts` はテストが相対 import で使い、
`lambda.ts` は iac が `NodejsFunction` の `entry` にパス直指定で参照するため）。

- **`src/wire/task.ts` の zod スキーマ・serializer を package export しない**。これらは「信頼できない
  入力の門番」「出力整形」という**サーバ内部実装**で契約ではない。公開すると (1) 契約面が `AppType` と
  二重化し、(2) フロントが backend 内部モジュールへ _runtime_ 依存し、(3) `@icasu/db/schema`
  （drizzle/pg-core）まで越境して引き込まれる。`TaskResponse` も同様に export しない。
- **フロントが必要とする型は RPC から取り出す**（`InferRequestType`/`InferResponseType`）。型のために
  スキーマを export しない。クライアント側のフォーム検証はフロントが自前スキーマで行い
  （[`apps/frontend/CLAUDE.md`](../frontend/CLAUDE.md)）、サーバはそれに依存せず常に独立に再検証する。
- **中間変数への型注釈で widening を掛けない**。`.route()` のマウント合成は推論型を保つので、合成点で
  `const applicationRoutes = new Hono().use(…).route('/', …)…` と中間変数に束ねるのは可。壊れるのは
  「1 本のビルダチェーンを途中で切って弱い型の変数に入れる」ことだけ。

## 認証・認可

authN（有効なセッションか）と authZ（誰で何を許すか）を**別レイヤ**に置く（変化の仕方が違うため）。

### Permission-based RBAC（`src/authorization.ts`）

**Permission-based RBAC**（action を role に付与し、その集合を permissions と呼ぶ）。`src/authorization.ts`
が **action の値集合**（`actionValues`）と **role→permissions マップ**の単一定義源で、app 層のポリシー
（DB enum ではない。role の値だけは `entities/user.ts` の `UserRole` を使う）。ルートは `auth({ action })`
で必要 action を要求し、`/me` は `permissionsForRole` で user の permissions を返す。action 追加や role の
権限変更は `authorization.ts` の 2 定義だけを触る（ドメインに RBAC を持ち込まない方針は下記）。

### authN / authZ のレイヤ分離

- **authN は合成点の境界に 1 回**。`auth.requireSession`（`@icasu/backend-auth`）を保護グループ境界に
  適用する。session 検証は Cookie / セッションストア / OIDC の**設定注入**を要するため、注入点（合成点）に
  置く。
- **authZ は各ルートのハンドラ定義に同居**。`auth({ action })`（`src/middleware/auth.ts`）を**ハンドラの
  可変長 middleware 引数として渡す**（`new Hono().get('/tasks', auth({ action: 'task:read' }), handler)`）。
  要求 action が user の permissions に無ければ **403**（未認証 401 は境界の `requireSession` の担当）。
  action を省略した `auth()` は role を解決するだけで permission を要求しない（`/me` が使う）。要求 action を
  ルート側に置くことで、**ファイル単体テストが認可まで込みで完全性を保証**できる。
- **レイヤリング**: `@icasu/backend-auth` は session / identity（`userSub`・`email`）まで。再利用パッケージを
  app 固有モデルに依存させないため、`session.userSub → users` 行の解決と action/role による RBAC は
  `apps/backend`（`auth` + `authorization.ts`）の責務。解決した `User` は `c.set('user')` で注入し、ハンドラは
  `c.get('user')` だけを見る。**`/me` も同じ理由で apps/backend が所有**する（permissions は role 由来の
  app 固有情報なので backend-auth には置けない）。
- **Env は推論に任せ、`new Hono<AppEnv>()` の型引数は書かない**。型引数で `AppEnv` を明示すると「app に
  `user` がある」と宣言してしまい、auth 付け忘れでも `c.get('user')` が型を通って undefined を掴む。
  middleware 引数で渡せば **auth を外すと `c.get('user')` が即コンパイルエラー**になり、認可漏れを型で
  防げる（`AppEnv` は `auth` 内部の型定義としてのみ使う）。
- **`users` に `email` は持たせない**。email は IdP（Cognito → session）が単一の真実源で、DB に置くと
  二重管理になる。`users` は identity の結合キー（`user_sub` unique）と app 所有の `role` だけ持つ。JIT は
  `findUserBySub` →（無ければ）`addUser` → 読み直しで初回アクセス時に 1 行確保する（追加は競合を無視する
  upsert とし、並行初回は `unique(user_sub)` で「勝った行」に収束）。role 付与（admin 昇格）は当面
  シード／手動運用。**RBAC の 403 判断はアプリ層に置き、ドメインに持ち込まない**。

認証の全体像（BFF パターン・OIDC フロー）は [`docs/specs/authentication.md`](../../docs/specs/authentication.md)。

## 監査ログ

設計の根拠（なぜミドルウェアで自動生成しないか・何を残さないか・Powertools の癖）は
[`docs/specs/logs.md`](../../docs/specs/logs.md)。ここには作業ルールだけを書く。

- **アクセスログは `middleware/request-logger.ts` が全リクエストに自動で 1 行出す**。合成点の最外周に
  差してあり、ルートで触る必要はない。
- **監査ログはハンドラ／ミドルウェアから明示的に emit する**。emit 口は `src/audit.ts` の 2 つだけ:
  - `audit(c, action, params?)` —— ハンドラから。actor は `c.get('user')` から自動で採る。
  - `auditWithActor(action, actor, params?)` —— `c.set('user')` 前の authZ ミドルウェア自身が使う。
- **action 名は `auditActionValues`（`src/audit.ts`）に足す**。ここが単一定義源。RBAC の `actionValues`
  （`authorization.ts`）とは別物なので混ぜない。認証イベント（`auth.*`）は `@icasu/backend-auth` が所有する。

| 仕掛け所                                | イベント                                         |
| --------------------------------------- | ------------------------------------------------ |
| `src/middleware/auth.ts`                | `authz.denied`（403）/ `user.provisioned`（JIT） |
| `src/routes/tasks.{post,put,delete}.ts` | `task.created` / `task.updated` / `task.deleted` |

**記録しないもの**（要求が変わるまで増やさない）: 読み取り（`GET`）・404 / 412・Cookie が無い 401・
リクエスト本文・email。`task.updated` の `detail` に載せるのは版と status の遷移だけ。

## コマンド（このパッケージ内から）

| 目的       | コマンド                        |
| ---------- | ------------------------------- |
| 開発サーバ | `pnpm dev`                      |
| 型チェック | `pnpm typecheck`                |
| テスト     | `pnpm test` / `pnpm test:watch` |
