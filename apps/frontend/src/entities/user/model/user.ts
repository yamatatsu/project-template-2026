import type { InferResponseType } from 'hono/client';

import { client } from '@/shared/api';

/**
 * Hono RPC のレスポンス（一覧エンドポイントの 200 の `items` 要素）から導出した User エンティティ型。
 *
 * JSON シリアライズ後の形なので、日時は文字列になる: `createdAt: string`、`updatedAt: string`。
 * users は identity（`userSub`）と `role` だけを持ち email は持たない（IdP/session が真実源）。
 */
export type User = InferResponseType<typeof client.users.$get, 200>['items'][number];

export type UserRole = User['role'];

export const userRoleLabels: Record<UserRole, string> = {
  member: 'メンバー',
  admin: '管理者',
};

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export const userRoleVariants: Record<UserRole, BadgeVariant> = {
  member: 'outline',
  admin: 'default',
};

export const userRoleOptions: UserRole[] = ['member', 'admin'];
