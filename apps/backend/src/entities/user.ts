// ドメインの語彙（role の集合）はここが単一の定義源。境界（wire）も DB（@icasu/db/schema が持つコピー）も
// ここから派生させ、infra→domain の依存方向にそろえる（tasks の taskStatusValues と同じ扱い）。
export const userRoleValues = ['member', 'admin'] as const;
export type UserRole = (typeof userRoleValues)[number];

export type User = {
  id: string;
  // OIDC の sub。session.userSub と突き合わせるドメイン User の結合キー（identity）。
  userSub: string;
  role: UserRole;
  meta: {
    version: number;
    createdAt: Date;
    updatedAt: Date;
  };
};

// 新規 User の版の起点（createTask と同じく生成時の版はドメインの決定）。
const INITIAL_VERSION = 1;
// JIT プロビジョニング時の初期 role。昇格（admin 付与）は別導線（シード / 手動運用）で行い、生成時は member 固定。
const DEFAULT_ROLE: UserRole = 'member';

/**
 * session の identity（userSub）から新規 User を組み立てる純粋関数（副作用なし・DB を触らない）。
 * 別サインアップ導線を持たない JIT プロビジョニング用で、role は member・版は INITIAL_VERSION に固定する。
 * 「クライアントの意図」ではなく session が持つ identity を入力に取り、id・now は実行時コンテキストとして
 * 外から注入する（createTask の command / { id, now } の切り分けと同じ）。
 */
export function createUser(
  identity: { userSub: string },
  { id, now }: { id: string; now: Date },
): User {
  return {
    id,
    userSub: identity.userSub,
    role: DEFAULT_ROLE,
    meta: { version: INITIAL_VERSION, createdAt: now, updatedAt: now },
  };
}
