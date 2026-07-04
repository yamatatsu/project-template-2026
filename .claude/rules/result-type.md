---
paths:
  - '**/*.ts'
  - '**/*.tsx'
---

# 失敗は throw せず Result を返す（このリポの既定）

失敗しうる関数は、**例外を throw せず** 自作の `Result<T, E>` を返すのが既定。
呼び出し側は `if (!res.ok) return;` で `res.error` / `res.value` に narrowing する。

- `Result` / `ok` / `err` は **`@icasu/simple-result` から import する。各所で再定義しない。**
- `E`（失敗理由）には、`'empty'` のようなリテラル/タグ付き union か、`@icasu/*` の
  ドメインエラーを載せる。文字列 message だけの `Error` を Result に詰めない。

## throw してよい境界（例外的に throw を使う場所）

- **プログラマのバグ・不変条件違反**（到達しないはずの分岐、契約違反）。回復させない。
- **ライブラリ / フレームワークが throw を要求する所**（例: フレームワークのエラーバウンダリ、
  検証ミドルウェアなど、throw が I/F になっている境界）。
- **境界で受けた例外は、その場で Result に変換して以降へ流す**（内部ロジックへ throw を伝播させない）。

判断や実装ディテール（型定義・`ok`/`err`・narrowing・`E` に何を入れるか、
throw する場合の Error クラスの作り方）は **typescript-error-handling skill** を参照。
