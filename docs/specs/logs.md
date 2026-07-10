# ログ設計

このドキュメントは、本モノレポのログと監査ログが**なぜこの形なのか**を人が読んで理解するための
設計書。実装は `packages/logger`（`@icasu/logger`）と各パッケージの `audit.ts` にあり、
**このドキュメントとコードが食い違ったらコードが正**。日々の作業ルール（何をすべきか）は
[`packages/logger/CLAUDE.md`](../../packages/logger/CLAUDE.md) と
[`apps/backend/CLAUDE.md`](../../apps/backend/CLAUDE.md)「監査ログ」に置く。

## 概要

ログ基盤は [AWS Lambda Powertools Logger](https://docs.aws.amazon.com/powertools/typescript/latest/features/logger/)
の薄いラッパ。構造化 JSON を stdout に出し、Lambda では CloudWatch Logs が拾う。

- **同一コードが Lambda と Node サーバの両方で動く**（`apps/backend/src/lambda.ts` と `index.ts`）。
  この二面性がリクエストスコープ設計の主要因になる（後述）。
- **監査ログは通常のアプリログと同じ log group** に、`logType: 'audit'` を目印にして出す。

### 中心不変条件 —— 監査証跡はログレベルで消えない

> 監査ログは、運用がアプリのログレベルを上げても消えてはならない。

証跡が消える経路を塞ぐのがログ設計の第一目的で、「5. Powertools の癖と、それに対する設計」の
監査ログ専用インスタンスと ALC 非設定の方針は、どちらもこの一線を守るためにある。

---

## 1. ログの 3 分類

目的が違えば量も保持期間も変更の圧力も違うので、混ぜない。

| 種類         | 目的                     | 出す場所                                | 実体                             |
| ------------ | ------------------------ | --------------------------------------- | -------------------------------- |
| アクセスログ | 障害調査・レイテンシ     | 最外周ミドルウェアが全リクエストに 1 行 | `getLogger().info('request', …)` |
| **監査ログ** | 「誰が何をしたか」の証跡 | 状態が変わる地点で明示的に emit         | `auditLog(event)`                |
| 診断ログ     | デバッグ                 | 任意                                    | `getLogger().debug/info/warn/…`  |

両者は `requestId` で突き合わせる。1 リクエストは必ず 1 本のアクセスログを持ち、監査ログは 0 本以上。

---

## 2. 監査ログをミドルウェアで自動生成しない

**理由: HTTP の method / path / status からは「何がどう変わったか」を復元できない。**

`DELETE /tasks/:id → 200` から取れるのは「誰がどの id を消したか」までで、更新の before/after
（版や status の遷移）は取れない。ミドルウェアで自動生成すれば書き忘れは構造的に起きないが、
記録できる内容が HTTP の語彙に縛られる。

監査ログは HTTP の副産物ではなく**ドメインイベント**なので、それが起きたと確定した場所から
ドメインの語彙（`task.deleted`）で emit する。網羅性はレビューと型（action の値集合）で担保する。

アクセスログは逆で、全リクエストを漏れなく 1 行にするのが目的なのでミドルウェアが自動で出す。

### emit は型付き関数に閉じる

フリーテキストで書かせない。action 名の値集合を単一定義源に置き、そこから型で縛る。

| 関数                               | 置き場所                             | 使う人                                      |
| ---------------------------------- | ------------------------------------ | ------------------------------------------- |
| `auditLog(event)`                  | `packages/logger`                    | 下記ラッパの実装（直接は呼ばない）          |
| `auditAuth(action, params?)`       | `packages/backend-auth/src/audit.ts` | 認証イベント（`auth.*`）                    |
| `audit(c, action, params?)`        | `apps/backend/src/audit.ts`          | ハンドラ。actor を `c.get('user')` から採る |
| `auditWithActor(action, actor, …)` | `apps/backend/src/audit.ts`          | `c.set('user')` 前の authZ ミドルウェア     |

`audit(c, …)` が actor を Context から採るのは、**呼び出し側に「誰が」を渡す余地を与えない**ため。
渡せると詐称も取り違えも起こりうる。

### action の語彙は依存の向きに従って分割する

`packages/logger` は監査レコードの**形**だけを決め、語彙を持たない。値集合は使う側が所有する。

- `packages/backend-auth/src/audit.ts` … `auth.*`（identity までしか知らないパッケージなので）
- `apps/backend/src/audit.ts` … `authz.*` と `task.*`（role 由来・ドメイン由来）

`apps/backend` の `auditActionValues` は RBAC の `actionValues`（`authorization.ts`）とは**別物**。
あちらは「許可の粒度」、こちらは「起きた事実の粒度」で、`task:write` ひとつが `task.created` /
`task.updated` / `task.deleted` の 3 事実に割れる。

---

## 3. 何を記録し、何を記録しないか

### 仕掛け所

| レイヤ        | 場所                                                 | イベント                                                                                  |
| ------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 認証（authN） | `packages/backend-auth`                              | `auth.login.succeeded` / `auth.login.failed` / `auth.logout` / `auth.session.invalidated` |
| 認可（authZ） | `apps/backend/src/middleware/auth.ts`                | `authz.denied`（403）/ `user.provisioned`（JIT）                                          |
| データ変更    | `apps/backend/src/routes/tasks.{post,put,delete}.ts` | `task.created` / `task.updated` / `task.deleted`                                          |

認証イベントが監査ログの中核で、不正アクセス検知の材料はほぼここに出る。次点が `authz.denied`
（権限の無い操作の試行）。

### 記録しないもの（と、その理由）

| 対象                 | 理由                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 読み取り（`GET`）    | 量が跳ね上がる一方、tasks は機微データではない。機微データを扱う要件が出たら `task.read` を足す                                       |
| 404 / 412            | アクセスログの status から追える。412 は「他人の更新に負けた」だけで不正の兆候ではない                                                |
| Cookie が無い 401    | ログイン前の正常な状態で、全訪問者が踏む。Cookie があるのにセッションが無い／リフレッシュ失敗だけを `auth.session.invalidated` に残す |
| 本文（`title` など） | ユーザーが書いた内容。`task.updated` は版と status の**遷移だけ**を `detail` に残す                                                   |
| email                | identity の真実源は IdP で `users` にも持たせていない。監査の主体も `userSub` に統一する                                              |
| Lambda の event 全体 | `POWERTOOLS_LOGGER_LOG_EVENT` を有効にしない（Cookie・認可コード・ボディが丸ごと落ちる。5 節）                                        |

「試行して失敗した」ものを全部残すのではなく、**不正の兆候になるものだけ残す**という切り分け。

### 監査レコードの形

`logType: 'audit'` を目印に、アプリログと同じ log group へ構造化 JSON で出す
（CloudWatch Logs Insights の `filter logType = "audit"` で選り分ける）。

| 項目      | 意味                                                                 |
| --------- | -------------------------------------------------------------------- |
| `action`  | 起きた事実（`task.deleted` など）                                    |
| `outcome` | `success` / `failure`。action 名から自明でも横断集計のため独立       |
| `actor`   | 誰が（`userSub` / `role`）                                           |
| `target`  | 何に対して（`type` / `id`）                                          |
| `reason`  | 失敗の理由タグ（自由文でなく固定語彙。集計できるように）             |
| `detail`  | 補足。スカラーのみ（構造体を丸ごと吐かせない＝PII 混入と肥大の予防） |

加えてリクエストスコープの `requestId`（と認証後の `userSub` / `role`）が自動で載る。

---

## 4. リクエストスコープを AsyncLocalStorage で切る

**理由: Powertools の `appendKeys` は Logger インスタンスに残るため。**

Lambda は 1 インスタンス 1 リクエストなので素の singleton でも壊れない。しかし**同じコードが
Node サーバでも動く**（`apps/backend/src/index.ts`。ローカル開発の主経路）。そこでは並行リクエストが
単一の Logger を共有するので、スコープを切らないと他リクエストの `userSub` が自分のログに混ざる。

`runInRequestScope` が `createChild()` した子 Logger を AsyncLocalStorage に載せ、`getLogger()` が
それを引く。この不変条件は `packages/logger/src/logger.test.ts` の並行テストが守っている。

Hono の Context ではなく ALS を使うのは、ドメインやリポジトリなど Context を持たない層からも
`getLogger()` を引けるようにするため。

> `createChild()` のコストは実測 21µs、スコープ確立（子 2 つ + `appendKeys`）で 47µs/req。
> DSQL への往復に比べれば誤差なので、性能上の懸念はない。

---

## 5. Powertools の癖と、それに対する設計

Powertools Logger は Lambda を主対象に作られており、上記の「Node サーバでも動く」前提と
噛み合わない箇所がある。以下はすべて実測で確認した挙動。

### 監査ログ専用インスタンスにレベルを焼き込む

Powertools のログレベル優先順位は次のとおり。

> `AWS_LAMBDA_LOG_LEVEL`（Lambda Advanced Logging Controls）＞ コンストラクタ引数 ＞ `POWERTOOLS_LOG_LEVEL`

アプリログと同じインスタンスで監査ログを出すと、運用がノイズ削減のため `POWERTOOLS_LOG_LEVEL=WARN` に
した瞬間に**証跡が黙って消える**。そこで監査ログだけ別インスタンス（コンストラクタで `logLevel: 'INFO'`）
にし、env では下げられないようにしている。消せるのは ALC という明示的なプラットフォーム操作だけ。

### ALC（`applicationLogLevelV2`）を設定しない

`apps/iac` の Lambda に Advanced Logging Controls を設定すると、Lambda が `AWS_LAMBDA_LOG_LEVEL` を
注入する。これは上記の優先順位で最強なので、**監査ログ専用インスタンスの防御を貫通する**。
ログレベルの調整は `POWERTOOLS_LOG_LEVEL` だけで行う。

### `addContext()` / `injectLambdaContext()` を使わない

Powertools の主機能だが、**このリポジトリの設計とは組み合わせられない**。

`createChild()` した子 Logger は親とは別の cold start フラグを持つ（`Utility.coldStart` はインスタンス
フィールドで、`getColdStart()` が初回呼び出しで反転する）。`createChild()` は内部で
`childLogger.addContext(...)` を呼び直すが、`addContext` は渡された context の `coldStart` を無視して
`this.getColdStart()` を読む。結果、リクエストごとに子を作る我々の設計では**毎回「初回」判定**になる。

`AWS_LAMBDA_INITIALIZATION_TYPE=on-demand` を模擬した実測:

```
--- invocation 1 ---     --- invocation 2 ---
root  cold_start: true   root  cold_start: false   ← 正しい
child cold_start: true   child cold_start: true    ← 常に true
```

したがって `addContext` は採用せず、`coldStart` は `middleware/request-logger.ts` の
モジュールスコープのフラグで自前管理する（こちらは正しく `true → false` になる）。
失うのは `function_name` / `function_arn` / `function_memory_size`（log group とスタックから自明）と
`function_request_id`（我々の `requestId` と同値）だけ。

### `xray_trace_id` は自動で付く

ドキュメントでは `addContext` の節に並記されているが、実際には `_X_AMZN_TRACE_ID` 環境変数から
**毎ログに自動で**付く。`addContext` を使わなくても Lambda 上での X-Ray 相関は効いている。

### `POWERTOOLS_LOGGER_LOG_EVENT` を有効にしない

Lambda の event 全体をログに吐く機能。**この BFF では致命的**で、event には認証 Cookie、
`/auth/callback` の認可コード、リクエストボディが丸ごと入る。有効にすると生の秘密が CloudWatch に落ちる。

### テストでログを黙らせる

- **他パッケージ**は `AWS_LAMBDA_LOG_LEVEL: 'SILENT'`。監査ログ専用インスタンスはレベルを焼き込んで
  あるので `POWERTOOLS_LOG_LEVEL` では黙らず、全ロガーを短絡できる ALC 相当のこの変数だけが効く。
- **`packages/logger` 自身**は出力を検証するので黙らせず、`POWERTOOLS_DEV: 'true'` を使う。
  Powertools は既定で `new Console({ stdout })` を自前生成するため、これが無いと `console.info` の
  spy で出力を捕まえられない（ログレベルには影響せず、整形が indent 付きになるだけ）。

---

## 6. なぜ Powertools か（pino ではなく）

**性能は理由ではない。** リクエストあたりのログは 1〜2 行、スコープ確立は 47µs。pino の速度は効かない。

我々が実際に使っているのは構造化 JSON・レベル・子ロガー・`xray_trace_id` の自動付与・キー名の規約
（`level: "INFO"` / `timestamp` / `service`）だけで、Powertools の主目的である `addContext` / middy /
デコレータ / バッファリング / サンプリングは一つも使っていない。純粋なロガーとしての素直さでは
pino の方が上で、上記「Powertools の癖」の 3 つ（レベル優先順位・`createChild` と cold start の干渉・
インスタンスごとの `Console`）はいずれも pino には存在しない。pino の `redact` も BFF には魅力がある。

それでも Powertools を選ぶのは、**ロガー単体の優劣ではなく AWS 可観測性スイートの入口として**。
このリポは AWS CDK + Lambda + DSQL のテンプレで、Powertools Metrics / Tracer / Idempotency を
後から足す可能性が高い。そのとき cold start 判定・`service` 名・`POWERTOOLS_*` 環境変数の規約を
共有できるほうが、ログだけ別系統になるより整合が取れる。

**Metrics / Tracer を使わないと決まったなら、pino に替える判断は合理的**。その場合は
`xray_trace_id` の付与・`level` の文字列化・ISO timestamp・`messageKey: 'message'` を自前で持ち、
Lambda では非同期書き込みと worker thread transport を使わないこと（ランタイム凍結でログが失われる）。

---

## 7. 出力先と保持期間

`apps/iac` の `Api` construct が Lambda の LogGroup を明示的に作る。

- **監査ログはアプリログと同じ log group** に流れる。分離するなら subscription filter か Firehose が
  必要で、テンプレの複雑度に見合わない。`logType: 'audit'` で選り分けられれば当面は足りる。
- **保持期間は証跡の要件で決める**（デバッグの都合ではない）。prod は 1 年 + `RETAIN`、
  dev は 1 週間 + `DESTROY`。

---

## 関連ファイル

| ファイル                                                                                               | 役割                                       |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| [`packages/logger/src/logger.ts`](../../packages/logger/src/logger.ts)                                 | ルート / 監査の Logger、リクエストスコープ |
| [`packages/logger/src/audit.ts`](../../packages/logger/src/audit.ts)                                   | 監査レコードの形と `auditLog`              |
| [`packages/backend-auth/src/audit.ts`](../../packages/backend-auth/src/audit.ts)                       | 認証イベントの値集合                       |
| [`apps/backend/src/audit.ts`](../../apps/backend/src/audit.ts)                                         | 認可・ドメインイベントの値集合と `audit`   |
| [`apps/backend/src/middleware/request-logger.ts`](../../apps/backend/src/middleware/request-logger.ts) | スコープ確立とアクセスログ                 |
| [`apps/iac/src/stacks/web/api.ts`](../../apps/iac/src/stacks/web/api.ts)                               | LogGroup・保持期間・`POWERTOOLS_*` の注入  |
