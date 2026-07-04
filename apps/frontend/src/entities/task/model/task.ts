import type { InferResponseType } from 'hono/client';

import { client } from '@/shared/api';

/**
 * Hono RPC のレスポンス（一覧エンドポイントの 200）から導出した Task エンティティ型。
 *
 * JSON シリアライズ後の形なので、日時は文字列になる:
 * `dueDate: string | null`、`createdAt: string`、`updatedAt: string`。
 */
export type Task = InferResponseType<typeof client.tasks.$get, 200>[number];

export type TaskStatus = Task['status'];
export type TaskPriority = Task['priority'];

export const taskStatusLabels: Record<TaskStatus, string> = {
  todo: '未着手',
  in_progress: '進行中',
  done: '完了',
};

export const taskPriorityLabels: Record<TaskPriority, string> = {
  low: '低',
  medium: '中',
  high: '高',
};

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export const taskStatusVariants: Record<TaskStatus, BadgeVariant> = {
  todo: 'outline',
  in_progress: 'secondary',
  done: 'default',
};

export const taskPriorityVariants: Record<TaskPriority, BadgeVariant> = {
  low: 'outline',
  medium: 'secondary',
  high: 'destructive',
};

export const taskStatusOptions: TaskStatus[] = ['todo', 'in_progress', 'done'];
export const taskPriorityOptions: TaskPriority[] = ['low', 'medium', 'high'];
