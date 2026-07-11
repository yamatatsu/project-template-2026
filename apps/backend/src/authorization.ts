import type { UserRole } from './entities/user.ts';

// Permission-based RBAC のポリシー定義。action（個別の操作能力）を role に付与し、その集合を
// permissions と呼ぶ。ここが action の値集合と role→permissions マップの単一定義源（app 層の
// ポリシーで DB enum ではない）。詳細は apps/backend/CLAUDE.md「認証・認可」。
export const actionValues = ['task:read', 'task:write', 'user:read', 'user:write'] as const;
export type Action = (typeof actionValues)[number];

// ユーザー管理（user:*）は admin 限定（`_admin` コンソールの admin ガードと一致）。member は task の
// 読み取りのみ。
const rolePermissions: Record<UserRole, readonly Action[]> = {
  member: ['task:read'],
  admin: ['task:read', 'task:write', 'user:read', 'user:write'],
};

export function permissionsForRole(role: UserRole): readonly Action[] {
  return rolePermissions[role];
}

export function can(role: UserRole, action: Action): boolean {
  return rolePermissions[role].includes(action);
}
