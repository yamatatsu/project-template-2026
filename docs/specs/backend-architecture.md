# バックエンド設計（apps/backend）

このドキュメントは、BFF（`apps/backend`）の**レイヤ分割・値の所有・境界の引き方がなぜこの形なのか**を
人が読んで理解するための設計書。実装は `apps/backend/src/` にあり、**このドキュメントとコードが
食い違ったらコードが正**。日々の作業ルール（何をすべきか）は
[`apps/backend/CLAUDE.md`](../../apps/backend/CLAUDE.md) に置く。

個別テーマの設計書は別にある: [楽観ロック](optimistic-lock.md)・[認証](authentication.md)・[ログ](logs.md)。

## 概要

BFF は 3 つの原則で組む。

### 中心不変条件 —— 層は守るべき不変条件のあるところにだけ積む

> 状態遷移という不変条件を持つ write にはドメイン層を積み、それを持たない read には積まない。
> 層は「あると綺麗だから」ではなく「守るものがあるから」置く。

楽観ロックはこの不変条件に**数えない** —— lost update の防止は業務ルールではなく並行制御＝永続化の
関心なので、repo の CAS が担い、ドメインは版を知らない（[楽観ロック](optimistic-lock.md)）。

- **設定は注入する**。env の直読みをアプリ内でせず、`AppConfig` として合成点で 1 回注入する。
- **フロントとの契約面は `AppType` 一本**。それ以外は内部実装として閉じる。

## 1. 合成点と設定注入

`createApp(config)`（`src/app.ts`）が唯一の合成点。`@icasu/backend-auth` を `/auth` にマウントし、
機能ルート（`/me`・`/tasks`）を保護グループに束ねてルート直下に合成する。エントリは 2 つ:
`src/index.ts`（Node 起動。`loadAuthConfigFromEnv()` を注入）と `src/lambda.ts`（Lambda ハンドラ）。

**env をアプリ内で直読みしない**のは、設定の欠落を「その env を最初に読んだリクエスト」ではなく
**起動時に一括で**落とすため。テストも env を汚さずに config を差し替えられる。

## 2. ルートのフラット配置

機能ルートは **1 エンドポイント 1 ファイル**で `src/routes/` 直下にフラットに置く。ファイル名に
パスとメソッドをエンコードする（`.`＝パス区切り、`$xxx`＝動的セグメント、末尾＝操作。
TanStack Router / Remix のフラットルート規約相当）。

| ファイル                         | エンドポイント              |
| -------------------------------- | --------------------------- |
| `routes/me.get.ts`               | `GET /me`（現在のユーザー） |
| `routes/tasks.list.ts`           | `GET /tasks`（一覧取得）    |
| `routes/tasks.post.ts`           | `POST /tasks`（作成）       |
| `routes/tasks.$taskId.get.ts`    | `GET /tasks/:id`            |
| `routes/tasks.$taskId.put.ts`    | `PUT /tasks/:id`            |
| `routes/tasks.$taskId.delete.ts` | `DELETE /tasks/:id`         |

ディレクトリを掘らずファイル名だけでパスとメソッドが一意に分かるのが狙い。`$taskId` はファイル名上の
可読名にすぎず、**真実の源は各ファイル内の `'/tasks/:id'`**（`createApp` が各 default export を
`.route('/', …)` でルート直下にマウントするため、パスは各ファイルにフルパスで書く）。

## 3. 関数型 DDD —— load → apply → save

更新系は **load → apply → save**、作成系は **create → add** に分け、レイヤごとにファイルを分ける。
狙いは、**状態遷移・生成の判断（業務ルール）を副作用のない純粋関数に閉じ込め、DB もフレームワークも
無しでテストできるようにする**こと。`PUT /tasks/:id` と `POST /tasks` が実装リファレンス。

正直に言えば、**テンプレート時点の `createTask`／`applyUpdate` が守る不変条件は無い**（PUT は全体置換で
遷移制約が無く、どちらもほぼ spread）。それでも層を維持するのは、遷移ルール（例: 完了済みからの
差し戻し禁止）が生まれたときの**置き場所（席）を示す**ため——ルートに散らばってからドメイン層を
再導入するより、空でも席がある方が安い、という判断。

- **`src/entities/<feature>.ts`（純粋）** —— エンティティ型・factory（`createTask`）・状態遷移
  （`applyUpdate`）。DB もフレームワークも触らない。
- **`src/repositories/<feature>-db-repo.ts`（永続化）** —— DB の読み書きだけを担い、業務判断を持たない。
- **ルート（アプリケーション層）** —— 上の 2 つを繋ぎ、HTTP と結果コードの対応づけだけ持つ。

### 例外: 層を積まないケース

- **削除（DELETE）** —— 状態遷移を持たないので、ドメイン関数を挟まず repo の `removeTask` を直接呼ぶ。
  守る不変条件が無いのに層だけ積んでも間接層が増えるだけ。
- **読み取り（GET）** —— 下記「mini-CQRS」。

### repo のメソッド名をコレクション語彙でそろえる理由

API を `find`/`add`/`save`/`remove` でそろえ、SQL/CRUD 動詞（`select`/`insert`/`update`）を避ける。
**DB 実装の語彙をドメイン側に漏らさない**ため —— repo を DynamoDB や外部 API に差し替えても、
呼び出し側の語彙が変わらない。

- `find*` —— 無いかもしれないので nullable（`get*` にしない。`get` は「必ずある」と読める）。
- `add*` —— factory が組んだ新規状態を追加。CAS 不要。記録メタデータ（版の起点・タイムスタンプ）を打つ。
- `save*` —— 次状態を基底版条件の CAS で書き戻す（競合で書けなければ「保存できず」を返す）。版は CAS を
  通った書き込みだけが `+1` 進め、`updatedAt` もここで打つ。
- `remove*` —— 1 件削除し成否だけ返す。楽観ロックは掛けない（[楽観ロック](optimistic-lock.md)）。

### 記録メタデータをドメイン型に持たせない理由

版（`version`）と監査タイムスタンプ（`createdAt`/`updatedAt`）は**レコードの属性であって業務の事実では
ない** —— 読んでいるのはワイヤの `meta` と監査ログだけで、業務ルールはどれにも依存しない。ドメイン型に
載せると、純粋なはずの状態遷移が「版の一致判定・増分・時刻の決定」という永続化の都合を抱え込む
（失敗しない遷移が `Result` を返し、時計の注入を引き回す羽目になる）。

そこで repo が **`Persisted<T> = { value: T; version: number; createdAt: Date; updatedAt: Date }`**
（`repositories/persisted.ts`）として値と記録の対で運び、値の決定（版の起点・`+1`・タイムスタンプ）と
版の一致判定（CAS）を repo に閉じる。ワイヤの `meta` ネストはこの封筒と 1:1 に対応する。DB 行 → 対の
変換は共有ヘルパ `toPersisted` に集約する（「ドメイン型 = 行から記録列を除いたもの」という対応が
成り立つ間だけ。乖離した entity は個別 mapper に戻す）。

境界線は「業務ルールが読みうるか」。`createdBy`（作成者＝所有）は業務の事実なのでドメインに残る。

### ドメインは時間を扱わない

タイムスタンプが repo に移った結果、現在のドメイン関数は時間を必要としない。時間を読む業務ルール
（期限超過の判定等）が生まれたら、ドメイン内で `new Date()` を呼ばず **`now` を引数で注入する**
（純粋性とテストの決定性のため）。その場合も「クライアントの意図」（`updates` 等）と ambient な `now` は
出所が違うので、同じオブジェクトに混ぜない。

### 版のフィールド名を意図で選ぶ理由

クライアントが編集の土台にした版は `expectedVersion` と呼ぶ（wire・repo の CAS 引数とも）。
`currentVersion` は「今 DB にある版」と読み違えられ、CAS の条件を逆に書く事故を招く。

## 4. 読み取り系 —— mini-CQRS

読み取り系（`GET /tasks/:id`・`GET /tasks`）は**ドメイン層を経由しない**。

write の層分けを正当化するのは状態遷移という守るべき不変条件で、**read にはそれが無い**。
`findTask`/`Task` を通しても間接層が増えるだけになる。加えて command と query は**変更の圧力が違う**
（整合性 vs 表示形・性能）ので、分けておくと片方の都合でもう片方が歪まない。

read ハンドラは **drizzle 直書き**でよく、リファクタは**ハンドラ内の関数抽出に留める**（read 専用の
repo/query 抽象を先に作らない＝YAGNI）。次が**顕在化したら** read 専用の query 関数／read-model に
昇格する:

- N+1・複数クエリを跨ぐ集約
- 行そのまま以上の projection・集計・整形
- ページング・フィルタ・ソートの組み合わせ爆発
- read model がテーブル形から乖離

## 5. ワイヤ境界（`src/wire/<feature>.ts`）

request の zod スキーマ（入力の門番）と response serializer ＋ `TaskResponse` 型（出力）を、
**方向でなくリソースで割って** 1 feature 1 ファイルに同居させる。feature を足す人が「送る形・返る形」を
一度に触れ、共有フィールドの drift を隣り合わせでレビューできるため。ただし**整合の強制は近接ではなく
上流ソース**（`entities` の値配列・型）が担うので、enum をここで二重宣言しない。

### リクエストボディを全フィールド必須にする理由

optional を作らず「無いなら null」を明示させる（`description`/`dueDate` は「キー必須・値は null 可」）。
PUT は版（`expectedVersion`）も body で受けるので、入力形は POST と完全一致しない。内容部分の定義源は
`taskInputSchema` 1 つに保ち、PUT 用の `conditionalTaskInputSchema` を `.extend` で派生させる
（[楽観ロック](optimistic-lock.md)）。

### 境界でパースまで済ませる（parse, don't validate）

ワイヤ→ドメインの変換はスキーマの `.transform` で行い、下流は変換済みの値だけ扱う（`dueDate` は
ISO 文字列 → `Date | null`）。RPC のリクエスト型は transform **前**の入力型を見るので、クライアント契約
（ISO 文字列送信）は変わらない。

### レスポンス形を全 endpoint で一貫させる（`TaskResponse`）

同じリソースが endpoint 次第で別の形にならないよう、POST/PUT/GET/list は同一のワイヤ形（`meta` ネスト）を
返す。整形は wire の serializer を単一の定義源にする（write は `toTaskResponse`、read は
`rowToTaskResponse`。read は行から直接組むが、**返り値型を `TaskResponse` に固定**して write と形が
割れないことを型で保証する）。

**`TaskResponse` をドメイン `Task` の再 export にしない**のは、`c.json` が `Date` を ISO 文字列に
エンコードするため。date 系 leaf の型が `Task`（`Date`）と一致せず、再 export は嘘になる。境界の語彙は
ドメインの語彙と別物として、独立した契約を宣言する。同じ理由で **`Date → ISO 文字列` の encode を
serializer 内で明示する**（入力境界の `.transform` による ISO→Date decode と対称。Hono 任せにすると
`TaskResponse` が実ワイヤ形とずれ、型が嘘をつく）。

### スキーマ名を境界の語彙で付ける

名詞始まりにする（`taskInputSchema`）。`create`/`update` はアプリ／コマンド層の語彙なので wire に
持ち込まない。版を伴う PUT の入力は `conditionalTaskInputSchema` —— 「条件付きリクエスト」は境界
（HTTP）の概念なので、この規約を破らずに済む。

## 6. フロントへの公開面が `AppType` 一本である理由

`package.json` の `exports` は `.`（`src/index.ts` が `AppType` を re-export）だけ。`./app`・`./lambda` は
export しない（`app.ts` はテストが相対 import で使い、`lambda.ts` は iac が `NodejsFunction` の `entry` に
パス直指定で参照するため、export は不要）。

**wire の zod スキーマ・serializer・`TaskResponse` を package export しない**。これらは「信頼できない
入力の門番」「出力整形」という**サーバ内部実装**であって契約ではない。公開すると:

1. 契約面が `AppType` と二重化し、どちらが正か分からなくなる。
2. フロントが backend 内部モジュールへ _runtime_ 依存する（型だけのつもりが実体を引き込む）。
3. `@icasu/db/schema`（drizzle/pg-core）まで越境してフロントのバンドルに入る。

フロントが必要とする型は **RPC から取り出す**（`InferRequestType`/`InferResponseType`）。クライアント側の
フォーム検証はフロントが自前スキーマで行い、**サーバはそれに依存せず常に独立に再検証する**
（クライアントの検証は UX であって security boundary ではない）。

### `AppType` が壊れる条件

RPC の型は Hono のビルダチェーンの推論に依存する。**1 本のビルダチェーンを途中で切って弱い型の変数に
入れる**と推論が落ちて `AppType` が壊れる。一方 `.route()` のマウント合成は推論型を保つので、合成点で
`const applicationRoutes = new Hono().use(…).route('/', …)…` と中間変数に束ねるのは問題ない。壊すのは
**中間変数への型注釈による widening** であって、中間変数そのものではない。

## 7. authN / authZ のレイヤ分離

authN（有効なセッションか）と authZ（誰に何を許すか）は**変化の仕方が違う**ので別レイヤに置く。
authN は認証基盤の都合（Cookie・セッションストア・OIDC）で変わり、authZ は業務要求（role・action）で
変わる。

### Permission-based RBAC（`src/authorization.ts`）

action を role に付与し、その集合を permissions と呼ぶ。`src/authorization.ts` が **action の値集合**
（`actionValues`）と **role→permissions マップ**の単一定義源で、これは **app 層のポリシー**（DB enum では
ない。role の値だけは `entities/user.ts` の `UserRole` を使う）。ルートは `auth({ action })` で必要 action を
要求し、`/me` は `permissionsForRole` で user の permissions を返す。action 追加や role の権限変更は
`authorization.ts` の 2 定義だけを触れば済む。

**RBAC をドメインに持ち込まない**。「誰が許されるか」は業務ルール（タスクがどう遷移するか）ではなく
アプリの都合。ドメインに入れると、role が増えるたびに純粋なはずの状態遷移が汚れる。

### authN は合成点の境界に 1 回、authZ は各ルートに同居

- **authN** —— `auth.requireSession`（`@icasu/backend-auth`）を保護グループの境界に 1 回適用する。
  session 検証は Cookie / セッションストア / OIDC の**設定注入**を要するため、注入点（合成点）に置くのが
  自然。
- **authZ** —— `auth({ action })`（`src/middleware/auth.ts`）を**ハンドラの可変長 middleware 引数**として
  渡す。要求 action をルート側に置くことで、**ファイル単体テストが認可まで込みで完全性を保証**できる
  （そのファイルを読めば「このエンドポイントに何が要るか」が分かる）。

### `new Hono<AppEnv>()` の型引数を書かない理由

型引数で `AppEnv` を明示すると「この app には `user` がある」と宣言してしまい、**auth を付け忘れても
`c.get('user')` が型を通って undefined を掴む**。middleware 引数で渡せば、auth を外した瞬間に
`c.get('user')` が即コンパイルエラーになり、**認可漏れを型で防げる**。`AppEnv` は `auth` 内部の型定義と
してのみ使う。

### `@icasu/backend-auth` と `apps/backend` の責務境界

`@icasu/backend-auth` は session / identity（`userSub`・`email`）まで。**再利用パッケージを app 固有モデルに
依存させない**ため、`session.userSub → users` 行の解決と action/role による RBAC は `apps/backend` の責務。
解決した `User` は `c.set('user')` で注入し、ハンドラは `c.get('user')` だけを見る。**`/me` も同じ理由で
apps/backend が所有**する（permissions は role 由来の app 固有情報なので backend-auth には置けない）。

### `users` に `email` を持たせない理由

email は IdP（Cognito → session）が単一の真実源。DB に置くと二重管理になり、IdP 側の変更で腐る。`users` は
identity の結合キー（`user_sub` unique）と app 所有の `role` だけ持つ。

JIT provisioning は `findUserBySub` →（無ければ）`addUser` → 読み直しで、初回アクセス時に 1 行確保する。
追加は競合を無視する upsert とし、**並行初回は `unique(user_sub)` で「勝った行」に収束**する。role 付与
（admin 昇格）は当面シード／手動運用。

## 既知の負債: enum の二重管理

`packages/db` は package なので app 内の `entities` を import できず、`@icasu/db/schema` が enum のコピーを
持つ（値を足すときは両方を揃える必要がある）。解消には entity を `packages/domains` へ切り出す必要があり、
別途。

## 関連ファイル

| ファイル                                | 役割                                    |
| --------------------------------------- | --------------------------------------- |
| `src/app.ts`                            | 合成点（`createApp(config)`）           |
| `src/routes/*.ts`                       | 1 エンドポイント 1 ファイル             |
| `src/entities/<feature>.ts`             | 純粋なドメイン（factory・状態遷移）     |
| `src/repositories/<feature>-db-repo.ts` | 永続化（`find`/`add`/`save`/`remove`）  |
| `src/repositories/persisted.ts`         | 記録メタデータの封筒（`Persisted<T>`）  |
| `src/wire/<feature>.ts`                 | ワイヤ境界（zod スキーマ・serializer）  |
| `src/authorization.ts`                  | RBAC の単一定義源（action・role→perms） |
| `src/middleware/auth.ts`                | authZ（`auth({ action })`）・JIT の合成 |
