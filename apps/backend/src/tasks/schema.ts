import { taskPriorityValues, taskStatusValues } from '@icasu/db/schema';
import { z } from 'zod';

/** enum のメンバー定義が一箇所に集まるよう、DB スキーマの値配列を再利用する。 */
export const taskStatusEnum = z.enum(taskStatusValues);
export const taskPriorityEnum = z.enum(taskPriorityValues);

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
