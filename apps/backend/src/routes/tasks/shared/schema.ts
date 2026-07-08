import { z } from 'zod';

/** enum のメンバー定義が一箇所に集まるよう、DB スキーマの値配列を再利用する。 */
export const taskStatusEnum = z.enum(['todo', 'in_progress', 'done']);
export const taskPriorityEnum = z.enum(['low', 'medium', 'high']);

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().nullable().optional(),
  status: taskStatusEnum.optional(),
  priority: taskPriorityEnum.optional(),
  dueDate: z.iso.datetime({ offset: true }).nullable().optional(),
});

export const updateTaskSchema = createTaskSchema.partial();

export const taskIdParamSchema = z.object({
  id: z.uuid(),
});
