import { type Result, err, ok } from '@icasu/simple-result';

// ドメインの語彙（role の集合）の単一定義源。
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

export type UserRoleChangeCommand = {
  role: UserRole;
  // クライアントが編集の土台にした版（楽観ロックの前提）。ロードした版と一致しなければ競合。
  expectedVersion: number;
  // 変更を実行する actor（＝現在ログイン中の User）の id。自分自身の降格を禁止する判断に使う。
  actorUserId: string;
};

export type VersionConflict = {
  type: 'version-conflict';
  expected: number; // クライアントが土台にした版
  actual: number; // ロード時点で DB にあった版
};

// admin が自分自身を降格して管理機能から締め出す事故を防ぐためのガード（自己ロックアウト防止）。
export type SelfDemotionForbidden = {
  type: 'self-demotion-forbidden';
};

export type ApplyRoleChangeError = VersionConflict | SelfDemotionForbidden;

// 新規 User の版の起点（生成時の版はドメインの決定）。
const INITIAL_VERSION = 1;
// 生成時の初期 role（昇格は別導線）。
const DEFAULT_ROLE: UserRole = 'member';

/**
 * identity（userSub）から新規 User を組み立てる純粋関数（副作用なし・DB を触らない）。role は member・
 * 版は INITIAL_VERSION に固定し、id・now は実行時コンテキストとして外から注入する。
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

/**
 * ロードした User に role 変更コマンドを適用し、次の状態を返す純粋関数（副作用なし・DB を触らない）。
 * 版チェックと自己降格ガードを内包し、now（時計）は実行時コンテキストとして外から注入する。
 */
export function applyRoleChange(
  current: User,
  command: UserRoleChangeCommand,
  { now }: { now: Date },
): Result<User, ApplyRoleChangeError> {
  const checked = ensureExpectedVersion(current, command.expectedVersion);
  if (!checked.ok) {
    return checked;
  }
  // actor が自分自身を admin 以外へ変えるのは降格。最後の admin による自己ロックアウトを防ぐ。
  if (current.id === command.actorUserId && command.role !== 'admin') {
    return err({ type: 'self-demotion-forbidden' });
  }
  return ok({
    ...current,
    role: command.role,
    meta: { ...current.meta, version: current.meta.version + 1, updatedAt: now },
  });
}

/**
 * 楽観ロックの前提（クライアントが土台にした版＝ロードした版）を検証する純粋関数。「版競合とは何か」の
 * 判断を 1 か所に閉じ、applyRoleChange が内部で使う。成功時は検証済みの current をそのまま返す。
 */
export function ensureExpectedVersion(
  current: User,
  expectedVersion: number,
): Result<User, VersionConflict> {
  if (current.meta.version !== expectedVersion) {
    return err({
      type: 'version-conflict',
      expected: expectedVersion,
      actual: current.meta.version,
    });
  }
  return ok(current);
}
