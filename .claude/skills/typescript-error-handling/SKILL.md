---
name: typescript-error-handling
description: >
  このモノレポ（target ESNext / 最新 Node + モダンブラウザ）での失敗の扱い方。
  既定は「例外を throw せず自作 `Result<T, E>` を返す」で、TypeScript / TSX で失敗
  しうる関数を書くとき——`Result` / `ok` / `err` の使い方、`if (!res.ok)` での
  narrowing、`E`（失敗理由）に何を入れるか、throw してよい境界の判断をするときに使う。
  加えて、例外を扱う場面——独自の Error クラス（`class XxxError extends Error`）を
  定義・追加するとき、エラーを投げ直す／エラー連鎖（cause）を書くとき、`this.name` /
  `Error.captureStackTrace` / `Object.setPrototypeOf` / `toJSON` の扱いを判断するとき、
  既存の例外・エラー処理まわりをレビュー・リファクタするときにも使う。Result type,
  ok/err, extends Error, captureStackTrace, error cause, custom error class といった
  話題が出たら参照する。
---

# TypeScript エラー処理 / カスタム Error の作り方

このモノレポは `target: ESNext` かつ最新の Node.js（`apps/backend` / `packages/*`）と
モダンブラウザ（`apps/frontend`）の両方で動く。以下はその前提での方針。

## まず前提: 失敗は throw せず Result を返す（既定）

このリポの既定は「**失敗しうる関数は例外を throw せず `Result<T, E>` を返す**」。
throw は例外的な境界だけで使う（後述）。この方針自体は `.claude/rules/result-type.md`
にも短く置いてあり、TS を触る間は常に効いている。ここではその実装ディテールを扱う。

### 使い方

`Result` / `ok` / `err` は **`@icasu/simple-result` から import する。再定義しない。**

```typescript
import { type Result, err, ok } from '@icasu/simple-result';

function parse(input: string): Result<string, 'empty'> {
  if (input.length === 0) return err('empty');
  return ok(input.toUpperCase());
}

const res = parse('hello');
if (!res.ok) return; // res.error: 'empty' に narrowing
// res.value: string
```

`ok(...)` は `Ok<T>`、`err(...)` は `Err<E>` を返す。これらは任意の `Result<T, E>` に
代入できるので、関数の戻り値型で `T` / `E` を明示していればそのまま通る。

### `E`（失敗理由）に何を入れるか

- **リテラル / タグ付き union**（`'empty'` や `{ type: 'not_found' }`）… 分岐が有限で
  呼び出し側が全ケースを網羅したいとき。`switch` の網羅チェックが効く。
- **ドメインエラー（下記の `AppError` サブクラス）**… message / `code` / `cause` を
  運びたいとき。`E = NotFoundError | ValidationError` のように **throw せず Result の
  `error` チャネルに載せる**。この場合も後述の Error 設計ルール（`code` で分岐等）に従う。

つまり以降の「カスタム Error の作り方」は、**throw するためだけの話ではない**。Result の
`E` に載せるドメインエラーの作り方でもある。

### throw してよい境界

- **プログラマのバグ・不変条件違反**（到達しないはずの分岐）。回復させない。
- **ライブラリ / フレームワークが throw を I/F にしている所**（エラーバウンダリ、検証
  ミドルウェア等）。
- 境界で受けた例外は **その場で Result に変換**して内部へ流す（throw を伝播させない）。

## ルール（Error クラスを作る／throw する場合）

1. **`extends Error` で作る。`Object.setPrototypeOf` は書かない。**
   `target` が ES2015 以上なら prototype チェーンは壊れず `instanceof` は正しく動く。
   このリポは `ESNext` なので不要（書くとノイズ）。

2. **`this.name` を必ず設定する。**
   設定しないと stack が汎用の `Error:` で始まり、どの種類のエラーか分からない。
   基底クラスで `this.name = new.target.name` を設定し、サブクラスでは書かない。

3. **`Error.captureStackTrace` は必ず optional call でガードして呼ぶ。**
   これは **V8 専用（Node / Chrome / Edge）**。Firefox / Safari には存在しない。
   → `Error.captureStackTrace?.(this, new.target)` の形で呼ぶ。
   このリポでは全パッケージが `@types/node` を `types` に入れているため **型は付く**
   （キャスト不要）。ただし `apps/frontend` の実行環境はブラウザなので、optional call は
   **型のためでなく実行時安全のため**に必須。非 V8 では呼ばれないが `stack` は継承で使える。

4. **エラー連鎖は ES2022 の `cause` を使う。`originalError` など独自プロパティを持たない。**
   `super(message, { cause: originalError })`。最新 Node / モダンブラウザで標準。
   役割の違いを混同しない:
   - `captureStackTrace` … **自分の** stack からコンストラクタ内部のノイズを取り除く
   - `cause` … **元エラー**（とその stack）を引き継ぐ

5. **共通処理は基底クラス 1 つに集約する。**
   `name` 設定 / `captureStackTrace` ガード / `cause` 受け渡し / `code` を毎回書かない。

6. **エラーを細かく作りすぎない。**
   `UserEmailNotFoundError` のような粒度で乱造せず、`NotFoundError` + `code` /
   `resource` フィールドで分岐する。

7. **ログに JSON で出すなら `toJSON()` を実装する。**
   `Error` の `message` / `stack` は非列挙プロパティなので、`JSON.stringify(err)` では
   ほぼ空になる。

## 参照実装

```typescript
// errors.ts

export interface AppErrorOptions {
  /** 元となったエラー（エラー連鎖）。ES2022 の Error cause に載る */
  cause?: unknown;
  /** プログラムから分岐するための安定した識別子（minify 非依存） */
  code?: string;
}

/**
 * アプリ共通のベースエラー。
 * 個別のエラーはこれを継承し、デフォルトの message / code を差し替えるだけにする。
 */
export class AppError extends Error {
  readonly code: string;

  constructor(message: string, options: AppErrorOptions = {}) {
    // cause は ES2022 標準。undefined のときは own プロパティを作らないよう条件分岐。
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);

    // new.target = 実際に new された最派生クラス。サブクラスでも正しい名前になる。
    // 注: minify するとクラス名が変わる。実行時に安定した名前が必要なら code で判別する。
    this.name = new.target.name;

    this.code = options.code ?? 'APP_ERROR';

    // captureStackTrace は V8 (Node / Chrome / Edge) 専用。
    // optional call が「Firefox / Safari では存在しない」の実行時ガードを兼ねる。
    // new.target を渡すことで、サブクラス経由でも「new した呼び出し元」から stack が始まる。
    Error.captureStackTrace?.(this, new.target);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      stack: this.stack,
      cause:
        this.cause instanceof Error
          ? { name: this.cause.name, message: this.cause.message }
          : this.cause,
    };
  }
}
```

### サブクラスの作り方

```typescript
export class NotFoundError extends AppError {
  constructor(message = 'Not found', options: AppErrorOptions = {}) {
    // code は呼び出し側で上書き可能にしつつ、デフォルトを与える
    super(message, { code: 'NOT_FOUND', ...options });
  }
}

export class ValidationError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, { code: 'VALIDATION', ...options });
  }
}
```

### 使い方（エラー連鎖）

以下は「ライブラリが throw を I/F にしている境界」の例。`db.query` が投げる例外を
その場で捕まえ、cause に載せて **Result に変換して返す**（throw を内部へ伝播させない）。
真に回復不能でそのまま throw し直す場合も、cause の載せ方は同じ。

```typescript
import { type Result, err, ok } from '@icasu/simple-result';

async function findUser(sql: string): Promise<Result<User, AppError>> {
  try {
    return ok(await db.query(sql));
  } catch (e) {
    // 元の DB エラーを cause に載せる。stack は AppError 側で整形される。
    return err(
      new AppError('ユーザーの取得に失敗しました', { cause: e, code: 'DB_QUERY_FAILED' }),
    );
  }
}
```

### 判別

```typescript
try {
  // ...
} catch (e) {
  if (e instanceof NotFoundError) {
    // 型が絞り込まれ、e.code などに安全にアクセスできる
  }
}
```

## やってはいけないこと（アンチパターン）

- `Object.setPrototypeOf(this, X.prototype)` を書く（`ESNext` target では不要・ノイズ）。
- `Error.captureStackTrace(this, X)` をガードなしで呼ぶ（ブラウザ実行時に落ちる）。
- 元エラーを `this.originalError = e` のような独自プロパティで持つ（`cause` を使う）。
- `this.name = this.constructor.name` を「安定した識別子」として信頼する（minify で変わる。
  デバッグ表示用途なら可、ロジック分岐には使わない）。
- エラーを 1 ケースごとにクラス化して爆発させる（`code` で分岐する）。

## TypeScript の細かい注意

- `useDefineForClassFields`（`target ES2022+` で既定 true、このリポは有効）の下で、**基底が
  設定するフィールドをサブクラスで再宣言**すると `super()` 後に `undefined` で上書きされる。
  再宣言が必要なら `declare` を付ける（例: `declare readonly code: string;`）。
- `error.stack` は非標準でエンジンごとにフォーマットが違う。文字列パースに依存した実装は
  避け、構造化したい情報は `code` / 独自フィールドに持たせる。
