import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { InferRequestType } from 'hono/client';
import { useState } from 'react';

import { type Task, taskKeys, taskPriorityLabels, taskStatusLabels } from '@/entities/task';
import { client } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';

import { taskFormSchema } from '../model/schema';

// ペイロードの型はサーバの検証スキーマからではなく RPC 型から取り出す。
// 契約面を `AppType` 一本に集約し、フロントが backend 内部モジュールへ
// runtime 依存しないようにするため。
type CreateTaskInput = InferRequestType<typeof client.tasks.$post>['json'];
type UpdateTaskInput = InferRequestType<(typeof client.tasks)[':id']['$put']>['json'];

type TaskFormProps = { mode: 'create'; task?: undefined } | { mode: 'edit'; task: Task };

type FormValues = {
  title: string;
  description: string;
  status: Task['status'];
  priority: Task['priority'];
  /** datetime-local 形式の文字列（未入力のときは ''）。 */
  dueDate: string;
};

/** ISO 文字列を `datetime-local` input の値（ローカル時刻）に変換する。 */
function isoToDateTimeLocal(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** `datetime-local` input の値をオフセット付き ISO 文字列（または null）に変換する。 */
function dateTimeLocalToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function TaskForm({ mode, task }: TaskFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async (json: CreateTaskInput) => {
      const res = await client.tasks.$post({ json });
      if (!res.ok) throw new Error('タスクの作成に失敗しました');
      return res.json();
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: taskKeys.all });
      await navigate({ to: '/tasks/$taskId', params: { taskId: created.id } });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (json: UpdateTaskInput) => {
      if (mode !== 'edit') throw new Error('invalid mode');
      const res = await client.tasks[':id'].$put({ param: { id: task.id }, json });
      if (!res.ok) throw new Error('タスクの更新に失敗しました');
      return res.json();
    },
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: taskKeys.all });
      await queryClient.invalidateQueries({ queryKey: taskKeys.detail(updated.id) });
      await navigate({ to: '/tasks/$taskId', params: { taskId: updated.id } });
    },
  });

  const form = useForm({
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      status: task?.status ?? 'todo',
      priority: task?.priority ?? 'medium',
      dueDate: isoToDateTimeLocal(task?.dueDate ?? null),
    } satisfies FormValues,
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      const payload = {
        title: value.title,
        description: value.description.trim() === '' ? null : value.description,
        status: value.status,
        priority: value.priority,
        dueDate: dateTimeLocalToIso(value.dueDate),
      };
      try {
        if (mode === 'create') {
          await createMutation.mutateAsync(payload);
        } else {
          // 楽観ロック: 編集開始時に読み込んだ version を送り返す。サーバ側で不一致なら 409。
          await updateMutation.mutateAsync({ ...payload, version: task.version });
        }
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : '送信に失敗しました');
      }
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <form
      data-testid="task-form"
      className="flex max-w-xl flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.Field
        name="title"
        validators={{
          onChange: ({ value }) => {
            const result = taskFormSchema.shape.title.safeParse(value);
            return result.success ? undefined : result.error.issues[0]?.message;
          },
        }}
      >
        {(field) => (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={field.name}>タイトル</Label>
            <Input
              id={field.name}
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              aria-invalid={field.state.meta.errors.length > 0}
            />
            {field.state.meta.errors.length > 0 && (
              <p className="text-destructive text-sm" data-testid="task-form-title-error">
                {String(field.state.meta.errors[0])}
              </p>
            )}
          </div>
        )}
      </form.Field>

      <form.Field name="description">
        {(field) => (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={field.name}>説明</Label>
            <Textarea
              id={field.name}
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="status">
        {(field) => (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={field.name}>ステータス</Label>
            <Select
              value={field.state.value}
              onValueChange={(value) => field.handleChange(value as Task['status'])}
            >
              <SelectTrigger id={field.name} className="w-48" data-testid="task-form-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(taskStatusLabels) as Task['status'][]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {taskStatusLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </form.Field>

      <form.Field name="priority">
        {(field) => (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={field.name}>優先度</Label>
            <Select
              value={field.state.value}
              onValueChange={(value) => field.handleChange(value as Task['priority'])}
            >
              <SelectTrigger id={field.name} className="w-48" data-testid="task-form-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(taskPriorityLabels) as Task['priority'][]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {taskPriorityLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </form.Field>

      <form.Field name="dueDate">
        {(field) => (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={field.name}>期限</Label>
            <Input
              id={field.name}
              name={field.name}
              type="datetime-local"
              className="w-64"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>

      {submitError && (
        <p className="text-destructive text-sm" data-testid="task-form-error">
          {submitError}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending} data-testid="task-form-submit">
          {mode === 'create' ? '作成' : '更新'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => void navigate({ to: '/tasks' })}
        >
          キャンセル
        </Button>
      </div>
    </form>
  );
}
