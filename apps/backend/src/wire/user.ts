import type { User as UserRow } from '@icasu/db/schema';
import { z } from 'zod';

import type { User, UserRole } from '../entities/user.ts';
import { userRoleValues } from '../entities/user.ts';

// user がワイヤを越える形（入力＝request / 出力＝response）を 1 feature 1 ファイルにまとめる。設計方針は
// apps/backend/CLAUDE.md「入力検証と値の所有」「読み取り系の方針」を参照。

// ── リクエスト（入力境界・decode）──────────────────────────────────────────────
// zod で untrusted input を検証する。可変なのは role のみ（userSub は identity なので変更させない）。

// enum のメンバーはドメイン（entities）の値配列を単一の定義源として派生させる。
const userRoleEnum = z.enum(userRoleValues);

export const userInputSchema = z.object({
  role: userRoleEnum,
});

export const userIdParamSchema = z.object({
  id: z.uuid(),
});

// クエリ文字列は常に string で届くので、境界で number までパースする。上限は業務ルールではなく境界の
// 防御: pageSize はレスポンス行数が際限なく膨らむのを、page は不正に巨大な OFFSET を防ぐ。
const boundedIntParam = (fallback: number, max: number) =>
  z
    .string()
    .regex(/^\d+$/)
    .default(String(fallback))
    .transform(Number)
    .pipe(z.number().min(1).max(max));

export const userListQuerySchema = z.object({
  page: boundedIntParam(1, 100_000),
  pageSize: boundedIntParam(20, 100),
});

// ── レスポンス（出力境界・encode）──────────────────────────────────────────────
// ドメイン User / drizzle 行を、全 endpoint 共通のワイヤ形へ serializer で整形する。

// ユーザーのワイヤ・レスポンス形（PUT/GET/list 全 endpoint 共通の単一契約）。ドメインの `User` とは別物:
// `c.json` が `Date` を ISO 文字列にエンコードするので date 系の leaf は string になり、`User`（`Date`）と
// 一致しない。ゆえに再export せず境界の独立した契約として宣言する。email は持たない（IdP/session が真実源）。
export type UserResponse = {
  id: string;
  userSub: string;
  role: UserRole;
  meta: {
    version: number;
    createdAt: string;
    updatedAt: string;
  };
};

// 一覧（GET /users）のワイヤ形。ページの行だけを返すため、フロントがページ数を出すのに使う
// 全件数 `total` を同梱する。
export type UserListResponse = {
  items: UserResponse[];
  total: number;
};

/**
 * write 側（PUT）: ドメイン `User` をワイヤ形へエンコードする。`Date → ISO 文字列` の変換をここで明示し
 * （Hono 任せにせず `UserResponse` を実ワイヤ形と一致させ型を正直に保つため）、返り値型を固定する。
 */
export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    userSub: user.userSub,
    role: user.role,
    meta: {
      version: user.meta.version,
      createdAt: user.meta.createdAt.toISOString(),
      updatedAt: user.meta.updatedAt.toISOString(),
    },
  };
}

/**
 * read 側（GET/list）: drizzle 行（フラット）をワイヤ形へエンコードする。read はドメイン層を経由しない
 * （mini-CQRS）ので行から直接組むが、返り値型を `toUserResponse` と共有して形が割れないことを型で保証する。
 */
export function rowToUserResponse(row: UserRow): UserResponse {
  return {
    id: row.id,
    userSub: row.userSub,
    role: row.role,
    meta: {
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    },
  };
}
