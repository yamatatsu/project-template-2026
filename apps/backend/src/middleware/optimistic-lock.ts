import { zValidator } from '@hono/zod-validator';
import type { Context } from 'hono';
import { z } from 'zod';

// 楽観的並行性制御をエンドポイントに要求するミドルウェア。ミューテーションを書くたびに使うので、`auth` と
// 同じくルート定義に middleware 引数として差せる形にまとめる。クライアントは「編集の土台にした版」を送り、
// stale な書き込みは弾く——というのがここで足す API 仕様。名前は仕様（意図）で付け、実装メカニズム（HTTP の
// `If-Match` ヘッダ）はこのファイル内に閉じる。
//
// 版は precondition でリソースの内容ではないので body ではなくヘッダで運び、`zValidator('header')` で
// **RPC の型（InferRequestType）に載せて送信を型で強制**する（手読みだと型に現れず送り忘れを検出できない）。
// なお、ここが担うのはクライアント側 precondition の受理（存在・形式）まで。実際の版一致判定は
// ドメイン（`applyUpdate`）と repo の CAS（`saveTask`）が行う。

// strong な単一 entity-tag（`"<version>"`）のみ受理し、`*`・weak タグ（`W/"…"`）・複数タグは弾く（版を
// 一意に定められない／楽観ロックを迂回するため）。中身（version 列＝整数）を数値にパースする
// （"parse, don't validate"）。Hono がヘッダ名を小文字化するのでキーは `if-match`。
const versionHeaderSchema = z.object({
  'if-match': z
    .string()
    .regex(/^"\d+"$/, 'If-Match must be a strong entity-tag like "3"')
    .transform((tag) => Number(tag.slice(1, -1))),
});

// 検証失敗を HTTP ステータスに対応づける zValidator フック。欠如は precondition 必須の 428、形式不正は 400
// に分ける（zValidator 既定の 400 一択では両者を区別できない）。ヘッダの有無を直接見て、zod の issue code
// には依存しない。
function validationHook(result: { success: boolean }, c: Context) {
  if (!result.success) {
    return c.req.header('If-Match') == null
      ? c.json({ error: 'Precondition required' }, 428)
      : c.json({ error: 'Invalid If-Match header' }, 400);
  }
}

/**
 * 楽観ロックを要求するミドルウェア。ルート定義に差すと、ハンドラで `c.req.valid('header')['if-match']` から
 * クライアントが土台にした版（number）を読める。欠如→428／形式不正→400 はミドルウェアが返す。
 */
export const requireOptimisticLock = () =>
  zValidator('header', versionHeaderSchema, validationHook);
