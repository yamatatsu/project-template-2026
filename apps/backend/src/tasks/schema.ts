import { taskPriority, taskStatus } from '@icasu/db/schema';
import { z } from 'zod';

/** Reuse the pgEnum values so enum membership is defined in a single place. */
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

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskIdParam = z.infer<typeof taskIdParamSchema>;
