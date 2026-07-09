# CLAUDE.md — apps/backend

BFF（Hono on Node.js / Lambda）の作業ルール。全体構成・共通コマンドはルート
[`CLAUDE.md`](../../CLAUDE.md)。

**この文書が backend の設計判断（レイヤ分割・値の所有・楽観ロック・認可など）の根拠の集約先**。
コードコメントはここへ参照させ、同じ根拠をコードに再説しない。コメントには局所の why だけ残す
（コメント方針はルート [`CLAUDE.md`](../../CLAUDE.md)「コードコメントの方針」）。

## 合成点

`createApp(config)`（`src/app.ts`）が唯一の合成点。`@icasu/backend-auth` を `/auth`・`/me` に
マウントし、機能ルートを保護グループに束ねてルート直下に合成する。保護グループは境界で
`auth.requireSession` を 1 回適用して配下を認証保護する。設定は `AppConfig` として注入し、env
直読みはアプリ内でしない（検証は起動時に一括）。

- `src/index.ts` … Node 起動（`loadAuthConfigFromEnv()` を注入）。
- `src/lambda.ts` … Lambda ハンドラ。

## ルートの分割とパス

機能ルートは **1 エンドポイント 1 ファイル**で `src/routes/` 直下に**フラットに**置き、各ファイルは
`export default new Hono().<method>('/path', …)` を返す。ファイル名にパスとメソッドをエンコード
する（`.`＝パス区切り、`$xxx`＝動的セグメント、末尾＝操作。TanStack Router / Remix のフラット
ルート規約相当）。ファイル名を見ればパスとメソッドが一意に分かるのが狙い。

| ファイル                         | エンドポイント           |
| -------------------------------- | ------------------------ |
| `routes/tasks.list.ts`           | `GET /tasks`（一覧取得） |
| `routes/tasks.post.ts`           | `POST /tasks`（作成）    |
| `routes/tasks.$taskId.get.ts`    | `GET /tasks/:id`         |
| `routes/tasks.$taskId.put.ts`    | `PUT /tasks/:id`         |
| `routes/tasks.$taskId.delete.ts` | `DELETE /tasks/:id`      |

- **パスは各ファイルにフルパスで書く**（`'/tasks'`・`'/tasks/:id'`）。`createApp` は各 default export
  を `.route('/', …)` でルート直下にマウントするため。`$taskId` はファイル名上の可読名で、**真実の
  源は各ファイル内の `'/tasks/:id'`**。
- **末尾スラッシュを付けない**（`'tasks/'` は実パスが `/tasks/` になり、Hono 既定の strict 判定で
  RPC クライアントの `/tasks` と食い違い 404）。
- **各ルートビルダはメソッドチェーンで書き切る**。ビルダチェーンを途中で切って弱い型の変数に
  入れると `AppType`（フロント RPC 連携）が壊れる（「フロントへの公開面」）。
- **テストもルート単位で分割**（`tasks.list.test.ts` 等、1 ルート 1 ファイル・同じフラット命名）。各
  テストは対象の default export を直接 `.request()` で叩く（フルパスを持つのでラッパ不要）。1 ファイル
  に集約しない（肥大化する）。
- **テスト専用ヘルパは実行時コードのディレクトリに混ぜない**。feature 非依存の汎用インフラ（DB
  差し替え・マイグレーション等）は `src/__tests__/`、routes が使う feature 固有ヘルパ（seed 等）は
  `src/routes/__tests__/`。

## 入力検証と値の所有

各ルートは `zValidator('json' | 'param' | 'header', schema)` で検証する。検証スキーマは feature 単位で
`src/wire/<feature>.ts`（request セクション）に置き、ルートから相対 import する（package export は
しない。「フロントへの公開面」）。

- **リクエストボディは全フィールド必須**（optional を作らない）。「無いなら null」を明示させフロント
  を甘やかさない（`description`/`dueDate` は「キー必須・値は null 可」）。これで POST/PUT は同じ
  `taskInputSchema` を共有できる（版は body でなく If-Match ヘッダで受けるため。「ミューテーションの
  意味論」）。
- **列の値は DB のデフォルトではなくアプリ（ドメイン）が決める**（[`packages/db/CLAUDE.md`](../../packages/db/CLAUDE.md)）。
  作成時は初期版・`createdAt`/`updatedAt` を `createTask` が、更新時は `version`(+1)・`updatedAt` を
  `applyUpdate` が決める（`$onUpdate` は使わない。ハンドラもセットしない）。`users` の JIT も
  `createUser` が版・監査列・初期 role を決める（「認証・認可」）。値の決定を DB に散らさずドメインへ
  集める方針。
- **スキーマ名は境界の語彙で名詞始まり**にする（`create`/`update` はアプリ/コマンド層の語彙なので
  wire に持ち込まない。例: `taskInputSchema`）。
- **enum の値集合の単一定義源は `entities/<feature>.ts`**（`taskStatusValues` 等）。wire の zod はここから
  `z.enum(taskStatusValues)` で派生させる（infra→domain の依存方向のため。DSQL が
  `CREATE TYPE ... AS ENUM` 非対応で `pgEnum` を使わない事情は [`packages/db/CLAUDE.md`](../../packages/db/CLAUDE.md)）。
- **境界でパースまで済ませる（parse, don't validate）**。ワイヤ→ドメインの変換はスキーマの
  `.transform` で行い、下流は変換済みの値だけ扱う。例: `dueDate` は ISO 文字列を `.transform` で
  `Date | null` にパースし、ハンドラは `Date` を直接使う。RPC のリクエスト型は transform **前**の入力型
  を見るのでクライアント契約（ISO 文字列送信）は不変。

> `packages/db` は package なので app 内の `entities` を import できず、当面 `@icasu/db/schema` が enum の
> コピーを持つ（entities と二重管理）。解消には entity を `packages/domains` へ切り出す必要があり別途。

## ドメイン層の構成（関数型 DDD）

更新系は **load → apply → save**、作成系は **create → add** に分け、レイヤごとにファイルを分ける。
状態遷移・生成の判断（業務ルール）を副作用のない純粋関数に閉じ込めテスト可能にするのが狙い。
**`PUT /tasks/:id` と `POST /tasks` が実装リファレンス**。`users` の JIT も同形（`createUser` ＋
`findUserBySub`/`addUser`、合成は `middleware/auth.ts`。「認証・認可」）。削除（DELETE）は状態遷移も
楽観ロックも持たないのでドメイン関数を挟まず repo の `removeTask` を直接呼ぶ。**読み取り系はドメイン
層を経由しない**（「読み取り系の方針」）。

- **`src/entities/<feature>.ts`（純粋）**: エンティティ型と状態遷移の純粋関数。DB もフレームワークも
  触らない。例（`task`）: エンティティ型・factory（`createTask`。版の起点を固定）・状態遷移
  （`applyUpdate`）。版競合の判断は意図を表す純粋関数（`ensureExpectedVersion`）に切り出し、状態遷移が
  内部で使う（テスト可能な単位に閉じる）。
  - 失敗は throw せず `@icasu/simple-result` の `Result` で返す（[`.claude/rules/result-type.md`](../../.claude/rules/result-type.md)）。
    `E` はタグ付き union（`{ type: 'version-conflict', … }`）。
  - **時計 `now` はドメイン内で `new Date()` せず実行時コンテキストとして注入**（純粋性・テスト容易性）。
    「クライアントの意図」（`updates`/`expectedVersion`）は Command に載せ、ambient な `now` は別引数で渡す。
  - **版のフィールド名は意図で選ぶ**。クライアントが編集の土台にした版は `expectedVersion`
    （`currentVersion` は「今 DB にある版」と読み違えるので使わない）。
- **`src/repositories/<feature>-db-repo.ts`（永続化）**: DB の読み書きだけを担い業務判断を持たない。
  API は **`find`/`add`/`save`/`remove` のコレクション語彙**でそろえ SQL/CRUD 動詞は避ける（DB 実装の
  語彙をドメイン側に漏らさない）:
  - `find*` —— 無いかもしれないので nullable（`get*` にしない）。
  - `add*` —— factory が組んだ新規状態を追加。CAS 不要。
  - `save*` —— 状態遷移が組んだ次状態を、基底版を条件に CAS で書き戻す（競合で書けなければ「保存できず」を返す）。
  - `remove*` —— 1 件削除し成否だけ返す（無ければルートが 404）。楽観ロックは掛けない。

  DB 行（フラット）⇄ドメイン型の変換は repo 内の変換ヘルパ 1 か所に集約し、監査系の列は `meta`
  （version / 監査タイムスタンプ）にまとめて業務フィールドと分離する。

- **ルート（アプリケーション層）**: 合成点として `findTask` →（`applyUpdate`・`Result` を narrowing）→
  `saveTask` を繋ぎ、HTTP と結果コードの対応づけだけ持つ。**ワイヤ⇄ドメインのフィールド読み替え**
  （`version` → `expectedVersion` 等）はここに置き、ドメインにワイヤの語彙を持ち込まない。
- **`src/wire/<feature>.ts`（ワイヤ境界＝入出力を 1 feature 1 ファイル）**: request の zod スキーマ（入力の
  門番）と response serializer ＋ `TaskResponse` 型（出力）を、**方向でなくリソースで割って**同居させる。
  feature を足す人が「送る形・返る形」を一度に触れ、共有フィールドの drift を隣り合わせでレビュー
  できるため。整合の強制は近接でなく上流ソース（`entities` の値配列/型）が担う（enum をここで二重宣言
  しない）。フロントへの契約は `AppType` が担うので package export はしない（「フロントへの公開面」）。

## 読み取り系の方針 — mini-CQRS

読み取り系（`GET /tasks/:id`・`GET /tasks`）は **ドメイン層を経由しない**。write（POST/PUT）が層分けを
正当化できるのは楽観ロック・状態遷移という守るべき不変条件があるからで、read は射影で守る不変条件が
なく、`findTask`/`Task` を通しても間接層が増えるだけ。command と query は変更の圧力（整合性 vs 表示形・
性能）が違うので分ける。

- read ハンドラは **drizzle 直書き**でよく、リファクタは**ハンドラ内の関数抽出に留める**（read 専用の
  repo/query 抽象を先に作らない＝YAGNI）。
- 次が**顕在化したら** read 専用の query 関数／read-model に昇格する: N+1・複数クエリを跨ぐ集約 / 行その
  まま以上の projection・集計・整形 / ページング・フィルタ・ソートの組み合わせ爆発 / read model が
  テーブル形から乖離。

### レスポンス形は全 endpoint で一貫（`TaskResponse`）

同じリソースが endpoint 次第で別の形にならないよう、**POST/PUT/GET/list は同一のワイヤ形**（`meta`
ネスト）を返す。整形は `src/wire/<feature>.ts` の serializer を単一の定義源にする:

- write（POST/PUT）の `toTaskResponse` —— ドメイン型 → ワイヤ。
- read（GET/list）の `rowToTaskResponse` —— drizzle 行 → ワイヤ。read はドメインを経由しないので行から
  直接組むが、**返り値型を `TaskResponse` に固定**して write と形が割れないことを型で保証する。
- **`TaskResponse` はドメイン `Task` の再export にしない**。`c.json` が `Date` を ISO 文字列にエンコード
  するので date 系 leaf の型が `Task`（`Date`）と一致せず再export は嘘になる。境界の独立した契約として
  宣言する（入力側で `taskInputSchema` を `TaskUpdateCommand` と別に持つのと同じ。境界の語彙 ≠ ドメイン
  の語彙）。
- **`Date → ISO 文字列` の encode を serializer 内で明示**（入力境界の `.transform` による ISO→Date decode
  と対称）。Hono 任せにせず `TaskResponse` を実ワイヤ形と一致させ型を正直に保つため。

## ミューテーションの意味論（楽観ロック）

**更新（PUT）は `version` 列による楽観ロックを必須**とする（全テーブルが `version` を持つ。lost update
防止）。版は HTTP の precondition なので **`If-Match` ヘッダ**で受ける。**削除（DELETE）には現状かけない**
（テンプレ時点で削除の要求が定かでなく複雑度・テスト量に見合わない。要求が固まれば PUT と同じ
If-Match 方式で足せる）。版チェックはドメインの `ensureExpectedVersion`（純粋）に閉じる。

`PUT /tasks/:id` は **PATCH ではなく PUT（全体置換）**。全フィールド必須なので送られたボディがリソースの
全体像そのものになり、送値どおりに反映する（旧値は保持しない）。

楽観ロックの版は body に混ぜず **`If-Match` ヘッダの entity-tag（`"<version>"`）** で送る（版は「土台に
した版」という precondition でリソース内容ではないため）。検証は **`src/middleware/optimistic-lock.ts` の
`requireOptimisticLock()`** を `auth` と同様ルート定義に差して行う（ミューテーションのたびに使う
cross-cutting な関心なので middleware に集約）。**名前は仕様（楽観ロックを要求する意図）で付け、実装
メカニズム（`If-Match`）はミドルウェア内に閉じる**——middleware 列を読めばエンドポイントの仕様が分かる
ように。内部は `zValidator('header', …)` で版を RPC の型（`InferRequestType`）に載せ送信を型で強制する
（手読みだと送り忘れを検出できない。ヘッダ名は Hono が小文字化するのでキーは `if-match`）。strong な単一
タグのみ受理し数値にパース（`*`／weak／複数タグは版を一意に定められず弾く）。ハンドラは
`c.req.valid('header')['if-match']` で版（number）を読む。ステータス対応づけ:

1. `If-Match` 欠如 —— **428 Precondition Required**（更新しない）。フックがヘッダの有無を直接見て 428/400
   を分ける（zValidator 既定の 400 一択では区別できない）。
2. `If-Match` 形式不正 —— **400**。
3. `findTask` で存在確認 —— 無ければ **404**。
4. `applyUpdate` の**メモリ内チェック**（ロードした版と `expectedVersion` の一致）—— 不一致なら
   **412 Precondition Failed**。
5. `saveTask` の**基底版を条件にした CAS**（`version` は `applyUpdate` が決めた絶対値を書き戻す。DB 側で
   +1 しない）—— load→save 間に別の書き手が割り込む窓を塞ぐ原子バックストップ。競合で 1 件も更新できな
   ければ **412**。基底版（`expectedVersion`）は「新版 - 1」と逆算せず呼び出し側から渡す（+1 の増分規約は
   ドメインの事実で repo が再現すべきでない）。

412 の body は **`{ error: 'Version conflict', entity: 'task', id }` のみ**（現在版は返さない）。競合は稀な
前提で、フロントは読み込んだ `version` を `If-Match` に載せ、412 を受けたら対象を再取得して再送信する。
送る版は task ペイロードの `meta.version` から組めるので今は `ETag` レスポンスヘッダは出していない（完全な
ETag 往復にするなら別途）。

## フロントへの公開面（exports）は `AppType` 一本

`package.json` の `exports` は `.`（`src/index.ts` が `AppType` を re-export）**だけ**。フロントとの契約面は
この RPC 型に集約する。`./app`・`./lambda` は export しない（`app.ts` はテストが相対 import で使い、
`lambda.ts` は iac が `NodejsFunction` の `entry` にパス直指定で参照するため package export は不要）。

- **`src/wire/task.ts` の zod スキーマ・serializer を package export しない**。これらは「信頼できない入力
  の門番」「出力整形」という**サーバ内部実装**で契約ではない。公開すると (1) 契約面が `AppType` と二重化
  し、(2) フロントが backend 内部モジュールへ _runtime_ 依存し、(3) `@icasu/db/schema`（drizzle/pg-core）
  まで越境して引き込まれる。
- フロントが必要とする型は RPC から取り出す（`InferRequestType`/`InferResponseType`）。型のためにスキーマ
  を export しない。`TaskResponse` も backend 内部で read/write の形をそろえる型なので export しない。
- クライアント側のフォーム検証はフロントが自前スキーマで行う（[`apps/frontend/CLAUDE.md`](../frontend/CLAUDE.md)）。
  サーバはそれに依存せず `zValidator` で常に独立に再検証する。
- **中間変数への型注釈で widening を掛けない**。`.route()` でのマウント合成は推論型を保つので合成点で
  `const applicationRoutes = new Hono().use(…).route('/', …)…` と中間変数に束ねてよい（型注釈で widening
  しない限り `AppType` は維持）。壊れるのは「1 本のビルダチェーンを途中で切って弱い型の変数に入れる」
  ことだけ。

## 認証・認可

authN（有効なセッションか）と authZ（誰で何を許すか）を**別レイヤ**に置く（変化の仕方が違うため）。

- **authN は合成点の境界に 1 回**。`auth.requireSession`（`@icasu/backend-auth`）を保護グループ境界に
  適用する。session 検証は Cookie / セッションストア / OIDC の**設定注入**を要するため注入点（合成点）に
  置く（ルート横断で変わらない）。
- **authZ は各ルートのハンドラ定義に同居**。`auth({ for: 'user' | 'admin' })`（`src/middleware/auth.ts`）を
  **ハンドラの可変長 middleware 引数として渡す**（`new Hono().get('/tasks', auth({ for: 'user' }), handler)`）。
  この authZ は `db`（静的 import）と Context 参照だけで成立し設定注入が不要なので静的 import で直接
  書ける。アクセスレベルをルート側に置くことで**ファイル単体テストが認可まで込みで完全性を保証**できる。
- **レイヤリング**: `@icasu/backend-auth` は session / identity（`userSub`・`email`）まで。再利用パッケージを
  app 固有モデルに依存させないため、`session.userSub → users` 行の解決と role による RBAC は `apps/backend`
  （`auth({ for })`）の責務。解決した `User` は `c.set('user')` で注入し、ハンドラは `c.get('user')` だけを
  見る。
- **Env は推論に任せ `new Hono<AppEnv>()` の型引数は書かない**。`auth` を middleware 引数で渡すと Hono が
  Env を推論し、後続で `c.get('user')` が型安全になる。型引数で `AppEnv` を明示すると「app に `user` が
  ある」と宣言してしまい、auth 付け忘れでも `c.get('user')` が型を通って undefined を掴む。middleware 引数
  で渡せば**auth を外すと `c.get('user')` が即コンパイルエラー**になり認可漏れを型で防げる（`AppEnv` は
  `auth` 内部の型定義としてのみ使う）。
- **`users` に `email` は持たせない**。email は IdP（Cognito → session）が単一の真実源で、DB に置くと二重
  管理（`session.email` は `string | undefined`）。`users` は identity の結合キー（`user_sub` unique）と app
  所有の `role` だけ持つ。JIT は `createUser`（role=member・版=初期値を固定）で組み立て、`findUserBySub` →
  （無ければ）`addUser` → 読み直しで初回アクセス時に 1 行確保（追加は競合を無視する upsert とし、並行初回は
  `unique(user_sub)` で「勝った行」に収束）。role 付与（admin 昇格）は当面シード / 手動運用。RBAC の 403
  判断はアプリ層（`auth`）に置きドメインに持ち込まない。

認証の全体像（BFF パターン・OIDC フロー）は [`docs/specs/authentication.md`](../../docs/specs/authentication.md)。

## コマンド（このパッケージ内から）

| 目的       | コマンド                        |
| ---------- | ------------------------------- |
| 開発サーバ | `pnpm dev`                      |
| 型チェック | `pnpm typecheck`                |
| テスト     | `pnpm test` / `pnpm test:watch` |
