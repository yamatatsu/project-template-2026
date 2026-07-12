# 楽観ロック設計

このドキュメントは、本モノレポのミューテーションが**なぜこの形なのか**を人が読んで理解するための
設計書。実装は `apps/backend`（`middleware/optimistic-lock.ts`・`entities/task.ts`・
`repositories/task-db-repo.ts`）と `packages/db` の `version` 列にあり、**このドキュメントとコードが
食い違ったらコードが正**。日々の作業ルール（何をすべきか）は
[`apps/backend/CLAUDE.md`](../../apps/backend/CLAUDE.md)「ミューテーションの意味論」に置く。

## 概要

**更新（PUT）は `version` 列による楽観ロックを必須**とする（全テーブルが `version` を持つ。
スキーマ側の規約は [`packages/db/CLAUDE.md`](../../packages/db/CLAUDE.md)）。

### 中心不変条件 —— lost update を起こさない

> クライアントが読んだ版を土台にした更新だけを通し、その間に別の書き手が割り込んでいたら拒否する。

**削除（DELETE）には現状かけない**。テンプレート時点で削除の要求が定かでなく、複雑度・テスト量に
見合わないため。要求が固まれば PUT と同じ `If-Match` 方式で足せる。

## 版をどこで受けるか —— `If-Match` ヘッダ

版は「土台にした版」という **precondition** であってリソースの内容ではないので、body に混ぜず
**`If-Match` ヘッダの entity-tag（`"<version>"`）** で受ける。これにより POST と PUT が同じ
`taskInputSchema`（全フィールド必須）を共有できる。

`PUT /tasks/:id` は **PATCH ではなく PUT（全体置換）**。全フィールド必須なので送られたボディが
リソースの全体像そのものになり、送値どおりに反映する（旧値は保持しない）。

検証は **`src/middleware/optimistic-lock.ts` の `requireOptimisticLock()`** を `auth` と同様に
ルート定義へ差して行う。ミューテーションのたびに使う cross-cutting な関心なので middleware に集約する。

- **名前は仕様（楽観ロックを要求する意図）で付け、実装メカニズム（`If-Match`）はミドルウェア内に
  閉じる** —— middleware 列を読めばエンドポイントの仕様が分かるように。
- 内部は `zValidator('header', …)` で版を RPC の型（`InferRequestType`）に載せ、**送信を型で強制する**
  （手読みだと送り忘れを検出できない）。ヘッダ名は Hono が小文字化するのでキーは `if-match`。
- strong な単一タグのみ受理し数値にパースする（`*`／weak／複数タグは版を一意に定められず弾く）。
- ハンドラは `c.req.valid('header')['if-match']` で版（number）を読む。

## ステータスの対応づけ

1. `If-Match` 欠如 —— **428 Precondition Required**（更新しない）。フックがヘッダの有無を直接見て
   428/400 を分ける（`zValidator` 既定の 400 一択では区別できない）。
2. `If-Match` 形式不正 —— **400**。
3. `findTask` で存在確認 —— 無ければ **404**。
4. `applyUpdate` の**メモリ内チェック**（ロードした版と `expectedVersion` の一致）—— 不一致なら
   **412 Precondition Failed**。版チェックはドメインの純粋関数 `ensureExpectedVersion` に閉じる。
5. `saveTask` の**基底版を条件にした CAS** —— load→save 間に別の書き手が割り込む窓を塞ぐ原子
   バックストップ。競合で 1 件も更新できなければ **412**。

### CAS の書き戻し規約

`version` は `applyUpdate` が決めた**絶対値**を書き戻す（DB 側で `+1` しない）。基底版
（`expectedVersion`）は「新版 - 1」と逆算せず**呼び出し側から渡す** —— `+1` という増分規約は
ドメインの事実であり、repo が再現すべきものではない。

## 412 のレスポンスと回復

412 の body は **`{ error: 'Version conflict', entity: 'task', id }` のみ**で、現在版は返さない。
競合は稀な前提で、フロントは読み込んだ `version` を `If-Match` に載せ、412 を受けたら対象を
再取得して再送信する。

送る版は task ペイロードの `meta.version` から組めるため、`ETag` レスポンスヘッダは出していない
（完全な `ETag` 往復にするなら別途）。
