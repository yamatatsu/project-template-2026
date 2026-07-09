import { zValidator } from '@hono/zod-validator';
import type { Context } from 'hono';
import { z } from 'zod';

// 楽観ロックをエンドポイントに要求するミドルウェア。名前は仕様（意図）で付け、実装メカニズム（HTTP の
// `If-Match` ヘッダ）はこのファイル内に閉じる。受理するのは precondition（存在・形式）まで。実際の版一致
// 判定はドメイン（`applyUpdate`）と repo の CAS（`saveTask`）が行う。
//
// 版はヘッダで運び `zValidator('header')` で RPC の型（InferRequestType）に載せて送信を型で強制する
// （手読みだと型に現れず送り忘れを検出できない）。

// strong な単一 entity-tag（`"<version>"`）のみ受理し、`*`・weak タグ（`W/"…"`）・複数タグは弾く（版を
// 一意に定められない／楽観ロックを迂回するため）。中身を数値にパースする（"parse, don't validate"）。
// Hono がヘッダ名を小文字化するのでキーは `if-match`。
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
