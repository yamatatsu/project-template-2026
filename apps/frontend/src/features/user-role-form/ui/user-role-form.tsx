import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { InferRequestType } from 'hono/client';
import { useState } from 'react';

import { type User, userKeys, userRoleLabels, userRoleOptions } from '@/entities/user';
import { client } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

// ペイロードの型はサーバの検証スキーマからではなく RPC 型から取り出す（契約面を `AppType` 一本に集約し、
// フロントが backend 内部モジュールへ runtime 依存しないため）。可変なのは role のみ。
type UpdateUserInput = InferRequestType<(typeof client.users)[':id']['$put']>['json'];

type FormValues = {
  role: User['role'];
};

export function UserRoleForm({ user }: { user: User }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: async (json: UpdateUserInput) => {
      const res = await client.users[':id'].$put({
        param: { id: user.id },
        // 楽観ロック: 編集開始時に読み込んだ版を strong entity-tag（`"<version>"`）として If-Match で送る。
        header: { 'if-match': `"${user.meta.version}"` },
        json,
      });
      // 412 = 版競合。他の変更に負けたので、最新を読み直して再編集するよう促す。
      if (res.status === 412) {
        throw new Error('他の変更と競合しました。最新の状態を読み込み直してください。');
      }
      // 403 = 自己降格の禁止（サーバが最終判断する業務ルール）。UI で理由を伝える。
      if (res.status === 403) {
        throw new Error('自分自身を管理者から降格することはできません。');
      }
      if (!res.ok) throw new Error('ロールの変更に失敗しました');
      return res.json();
    },
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: userKeys.all });
      await queryClient.invalidateQueries({ queryKey: userKeys.detail(updated.id) });
      await navigate({ to: '/users/$userId', params: { userId: updated.id } });
    },
  });

  const form = useForm({
    defaultValues: {
      role: user.role,
    } satisfies FormValues,
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        await updateMutation.mutateAsync({ role: value.role });
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : '送信に失敗しました');
      }
    },
  });

  return (
    <form
      data-testid="user-role-form"
      className="flex max-w-xl flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label>ユーザー</Label>
        <p className="text-muted-foreground text-sm">{user.userSub}</p>
      </div>

      <form.Field name="role">
        {(field) => (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={field.name}>ロール</Label>
            <Select
              value={field.state.value}
              onValueChange={(value) => field.handleChange(value as User['role'])}
            >
              <SelectTrigger id={field.name} className="w-48" data-testid="user-role-form-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {userRoleOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {userRoleLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </form.Field>

      {submitError && (
        <p className="text-destructive text-sm" data-testid="user-role-form-error">
          {submitError}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={updateMutation.isPending} data-testid="user-role-form-submit">
          更新
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={updateMutation.isPending}
          onClick={() => void navigate({ to: '/users/$userId', params: { userId: user.id } })}
        >
          キャンセル
        </Button>
      </div>
    </form>
  );
}
