import type { InferResponseType } from 'hono/client';

import { client } from '@/shared/api';

/**
 * Task entity type derived from the Hono RPC response (200, list endpoint).
 *
 * Because this is the JSON-serialized shape, dates are strings:
 * `dueDate: string | null`, `createdAt: string`, `updatedAt: string`.
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
