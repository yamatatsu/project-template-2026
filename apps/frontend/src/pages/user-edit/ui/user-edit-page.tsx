import { useQuery } from '@tanstack/react-query';

import { userDetailQuery } from '@/entities/user';
import { UserRoleForm } from '@/features/user-role-form';
import { ButtonLink } from '@/shared/ui/button-link';

export function UserEditPage({ userId }: { userId: string }) {
  const { data: user, isPending, isError } = useQuery(userDetailQuery(userId));

  if (isPending) {
    return (
      <p className="text-muted-foreground p-6 text-sm" data-testid="user-edit-loading">
        読み込み中...
      </p>
    );
  }

  if (isError || !user) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <p className="text-destructive text-sm" data-testid="user-edit-error">
          ユーザーが見つかりませんでした。
        </p>
        <ButtonLink to="/users" variant="outline">
          一覧へ戻る
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <ButtonLink to="/users/$userId" params={{ userId: user.id }} variant="ghost" size="sm">
          ← 詳細へ
        </ButtonLink>
        <h1 className="text-2xl font-bold">ロールを変更</h1>
      </div>
      <UserRoleForm user={user} />
    </div>
  );
}
