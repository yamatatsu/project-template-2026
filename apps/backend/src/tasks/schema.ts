import { taskPriority, taskStatus } from '@icasu/db/schema';
import { z } from 'zod';

/** enum のメンバー定義が一箇所に集まるよう、pgEnum の値を再利用する。 */
export const taskStatusEnum = z.enum(taskStatus.enumValues);
export const taskPriorityEnum = z.enum(taskPriority.enumValues);

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().nullable().optional(),
  status: taskStatusEnum.optional(),
  priority: taskPriorityEnum.optional(),
  dueDate: z.string().datetime({ offset: true }).nullable().optional(),
});

export const updateTaskSchema = createTaskSchema.partial();

export const taskIdParamSchema = z.object({
  id: z.string().uuid(),
});
