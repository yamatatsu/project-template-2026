# CLAUDE.md — apps/backend

BFF（Hono on Node.js / Lambda）の作業ルール。全体構成・共通コマンドはルート
[`CLAUDE.md`](../../CLAUDE.md)。

**設計の根拠（なぜこの層分けか・なぜ `AppType` 一本か・なぜ read に層を積まないか）は
[`docs/specs/backend-architecture.md`](../../docs/specs/backend-architecture.md)**。個別テーマは
[楽観ロック](../../docs/specs/optimistic-lock.md)・[認証](../../docs/specs/authentication.md)・
[ログ](../../docs/specs/logs.md)。ここには**何をすべきか**だけを書き、根拠は再説しない。

## ルートの追加

- **1 エンドポイント 1 ファイル**で `src/routes/` 直下にフラットに置く。ファイル名にパスとメソッドを
  エンコードする（`tasks.$taskId.put.ts` → `PUT /tasks/:id`。`.`＝パス区切り、`$xxx`＝動的セグメント、
  末尾＝操作）。
- 各ファイルは `export default new Hono().<method>('/path', …)` を返す。**パスはフルパスで書く**
  （`'/tasks/:id'`）。合成点が `.route('/', …)` でルート直下にマウントするため。
- **末尾スラッシュを付けない**（`'tasks/'` は実パスが `/tasks/` になり、Hono 既定の strict 判定で RPC
  クライアントの `/tasks` と食い違い 404）。
- **ルートビルダはメソッドチェーンで書き切る**。チェーンを途中で切って弱い型の変数に入れると `AppType`
  が壊れる。
- ルートを足したら `src/app.ts`（唯一の合成点）に足す。**env の直読みはアプリ内でしない**——設定は
  `AppConfig` として合成点で注入する。
- **テストは `backend-testing` skill に従って書く**。

## 入力検証（`src/wire/<feature>.ts`）

- 各ルートは `zValidator('json' | 'param' | 'query', schema)` で検証する。スキーマは feature 単位で
  `src/wire/<feature>.ts` に置き、ルートから相対 import する（**package export しない**）。
- **リクエストボディは全フィールド必須**（optional を作らない）。「無いなら null」を明示させる
  （`description`/`dueDate` は「キー必須・値は null 可」）。
- **enum は wire で二重宣言しない**。値集合の単一定義源は `entities/<feature>.ts`（`taskStatusValues` 等）で、
  wire の zod は `z.enum(taskStatusValues)` で派生させる。
- **ワイヤ→ドメインの変換はスキーマの `.transform` で済ませる**（`dueDate`: ISO 文字列 → `Date | null`）。
  下流は変換済みの値だけ扱う（parse, don't validate）。
- **スキーマ名は境界の語彙で名詞始まり**にする（`taskInputSchema`）。`create`/`update` はコマンド層の語彙
  なので wire に持ち込まない。版を伴う PUT の入力は `conditionalTaskInputSchema`
  （＝ `taskInputSchema.extend({ expectedVersion })`）。「条件付きリクエスト」は境界の概念なのでこの規約に
  収まる。内容部分の定義源は `taskInputSchema` 1 つに保ち、PUT 用は `.extend` で派生させる。

## レスポンス（同じ `src/wire/<feature>.ts`）

- **POST/PUT/GET/list は同一のワイヤ形**（`meta` ネスト）を返す。整形は wire の serializer が単一の定義源:
  write は `toTaskResponse`（ドメイン型 → ワイヤ）、read は `rowToTaskResponse`（drizzle 行 → ワイヤ）。
  read の serializer は**返り値型を `TaskResponse` に固定**して write と形が割れないことを型で保証する。
- **`TaskResponse` はドメイン `Task` の再 export にしない**。境界の独立した契約として宣言する。
- **`Date → ISO 文字列` の encode は serializer 内で明示する**（Hono 任せにしない）。

## 書き込み系（更新・作成）

**更新は load → apply → save、作成は create → add**。レイヤごとにファイルを分ける。
`PUT /tasks/:id` と `POST /tasks` が実装リファレンス（`users` の JIT も同形）。

- **`src/entities/<feature>.ts`（純粋）** —— エンティティ型・factory（`createTask`）・状態遷移
  （`applyUpdate`）・版の判定（`ensureExpectedVersion`）。DB もフレームワークも触らない。
  - 失敗は throw せず `Result` で返す（[`.claude/rules/result-type.md`](../../.claude/rules/result-type.md)）。
    `E` はタグ付き union（`{ type: 'version-conflict', … }`）。
  - **時計 `now` は `new Date()` せず引数で注入する**。`updates`/`expectedVersion`（クライアントの意図）は
    Command に載せ、`now` は別引数で渡す。
  - **クライアントが編集の土台にした版は `expectedVersion` と呼ぶ**（`currentVersion` は「今 DB にある版」と
    読み違える）。
- **`src/repositories/<feature>-db-repo.ts`（永続化）** —— DB の読み書きだけ。業務判断を持たない。API は
  **`find`/`add`/`save`/`remove` のコレクション語彙**でそろえ、SQL/CRUD 動詞は使わない。`find*` は nullable
  （`get*` にしない）。DB 行 ⇄ ドメイン型の変換は repo 内のヘルパ 1 か所に集約する。
- **ルート（アプリケーション層）** —— `findTask` →（`applyUpdate` の `Result` を narrowing）→ `saveTask` を
  繋ぎ、HTTP と結果コードの対応づけだけ持つ。**ワイヤ⇄ドメインの組み替え**（フラットな入力を
  `{ updates, expectedVersion }` という Command の形に分ける等）はここに置き、ドメインにワイヤの語彙を
  持ち込まない。
- **列の値は DB のデフォルトではなくアプリが決める**（[`packages/db/CLAUDE.md`](../../packages/db/CLAUDE.md)）。
  初期版・`createdAt`/`updatedAt` は `createTask`、`version`(+1)・`updatedAt` は `applyUpdate` が決める。
  **`$onUpdate` は使わず、ハンドラでもセットしない**。
- **DELETE はドメイン関数を挟まない**（状態遷移も楽観ロックも無い）。repo の `removeTask` を直接呼ぶ。

## 読み取り系（mini-CQRS）

- **read はドメイン層を経由しない**。ハンドラで **drizzle 直書き**でよい。
- リファクタは**ハンドラ内の関数抽出に留める**。read 専用の repo/query 抽象を先に作らない（YAGNI）。
- 次が**顕在化したら** read 専用の query 関数／read-model に昇格する: N+1・複数クエリを跨ぐ集約 ／
  行そのまま以上の projection・集計 ／ ページング・フィルタ・ソートの組み合わせ爆発 ／ read model が
  テーブル形から乖離。

## 楽観ロック

- **更新（PUT）は楽観ロック必須**。版は**リクエストボディのトップレベル `expectedVersion`（number）**で
  受け、ハンドラは `c.req.valid('json')` から内容と分けて読む。**DELETE には掛けない**。
- **`ETag` / `If-Match` は使わない**（HTTP の条件付きリクエストを実装しない）。版はリソースの属性として
  body で往復させる。根拠は [`docs/specs/optimistic-lock.md`](../../docs/specs/optimistic-lock.md)。
  **版を受けるミドルウェアも作らない** —— 検証は PUT の `zValidator('json', conditionalTaskInputSchema)` が
  兼ねる。
- **版の一致判定はドメインの `ensureExpectedVersion`（純粋）に閉じる**。
- **`saveTask` は基底版を条件に CAS する**。`version` は `applyUpdate` が決めた絶対値を書き戻し、DB 側で
  `+1` しない。基底版は「新版 - 1」と逆算せず呼び出し側から渡す。
- **ステータス**: `expectedVersion` の欠如・形式不正 → **400** ／ 対象なし → **404** ／ 版不一致・CAS 競合
  → **409**。409 の body は `{ error: 'Version conflict', entity, id }` のみ。**412 / 428 は使わない**
  （ヘッダ条件を使わない以上あたらない）。
- `PUT /tasks/:id` は **PATCH ではなく PUT（全体置換）**。送られたボディをそのまま反映する（旧値を保持
  しない）。

## 認可

- **必要 action は `auth({ action })`（`src/middleware/auth.ts`）でルート定義に差す**
  （`new Hono().get('/tasks', auth({ action: 'task:read' }), handler)`）。permissions に無ければ **403**
  （未認証 401 は合成点の `requireSession` の担当）。action を省略した `auth()` は role を解決するだけ
  （`/me` が使う）。
- **action の追加・role の権限変更は `src/authorization.ts` の 2 定義だけを触る**（`actionValues` と
  role→permissions マップ。ここが単一定義源）。**RBAC をドメインに持ち込まない**。
- **`new Hono<AppEnv>()` の型引数は書かない**（Env は推論に任せる）。明示すると auth 付け忘れでも
  `c.get('user')` が型を通り、認可漏れを型で防げなくなる。
- ハンドラは `c.get('user')` だけを見る（`session.userSub → users` の解決と JIT は `middleware/auth.ts` が
  担う）。**`users` に `email` を持たせない**（IdP が単一の真実源）。

## 監査ログ

- **アクセスログは `middleware/request-logger.ts` が全リクエストに自動で 1 行出す**。ルートで触らない。
- **監査ログはハンドラ／ミドルウェアから明示的に emit する**。emit 口は `src/audit.ts` の 2 つだけ:
  - `audit(c, action, params?)` —— ハンドラから。actor は `c.get('user')` から自動で採る。
  - `auditWithActor(action, actor, params?)` —— `c.set('user')` 前の authZ ミドルウェア自身が使う。
- **action 名は `auditActionValues`（`src/audit.ts`）に足す**。RBAC の `actionValues`（`authorization.ts`）
  とは別物なので混ぜない。認証イベント（`auth.*`）は `@icasu/backend-auth` が所有する。

| 仕掛け所                                | イベント                                         |
| --------------------------------------- | ------------------------------------------------ |
| `src/middleware/auth.ts`                | `authz.denied`（403）/ `user.provisioned`（JIT） |
| `src/routes/tasks.{post,put,delete}.ts` | `task.created` / `task.updated` / `task.deleted` |

**記録しないもの**（要求が変わるまで増やさない）: 読み取り（`GET`）・404 / 409・Cookie が無い 401・
リクエスト本文・email。`task.updated` の `detail` に載せるのは版と status の遷移だけ。

## 公開面（exports）は `AppType` 一本

- `package.json` の `exports` は `.`（`src/index.ts` が `AppType` を re-export）**だけ**。`./app`・`./lambda`・
  wire の zod スキーマ・serializer・`TaskResponse` は **export しない**。
- **フロントが必要とする型は RPC から取り出す**（`InferRequestType`/`InferResponseType`）。型のためにスキーマを
  export しない。フォーム検証はフロントが自前スキーマで行い（[`apps/frontend/CLAUDE.md`](../frontend/CLAUDE.md)）、
  **サーバはそれに依存せず常に独立に再検証する**。

## コマンド（このパッケージ内から）

| 目的       | コマンド                        |
| ---------- | ------------------------------- |
| 開発サーバ | `pnpm dev`                      |
| 型チェック | `pnpm typecheck`                |
| テスト     | `pnpm test` / `pnpm test:watch` |
