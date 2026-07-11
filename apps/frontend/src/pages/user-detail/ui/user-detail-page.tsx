import { useQuery } from '@tanstack/react-query';

import { UserRoleBadge, userDetailQuery } from '@/entities/user';
import { formatDateTime } from '@/shared/lib/utils';
import { ButtonLink } from '@/shared/ui/button-link';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/shared/ui/card';

export function UserDetailPage({ userId }: { userId: string }) {
  const { data: user, isPending, isError } = useQuery(userDetailQuery(userId));

  if (isPending) {
    return (
      <p className="text-muted-foreground p-6 text-sm" data-testid="user-detail-loading">
        読み込み中...
      </p>
    );
  }

  if (isError || !user) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <p className="text-destructive text-sm" data-testid="user-detail-error">
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
        <ButtonLink to="/users" variant="ghost" size="sm">
          ← 一覧へ
        </ButtonLink>
        <h1 className="text-2xl font-bold">ユーザー詳細</h1>
      </div>

      <Card data-testid="user-detail">
        <CardHeader>
          <CardTitle>{user.userSub}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">ロール:</span>
            <UserRoleBadge role={user.role} />
          </div>
          <div>
            <span className="text-muted-foreground">作成日: </span>
            {formatDateTime(user.meta.createdAt)}
          </div>
          <div>
            <span className="text-muted-foreground">更新日: </span>
            {formatDateTime(user.meta.updatedAt)}
          </div>
        </CardContent>
        <CardFooter className="gap-2">
          <ButtonLink to="/users/$userId/edit" params={{ userId: user.id }}>
            ロール変更
          </ButtonLink>
        </CardFooter>
      </Card>
    </div>
  );
}
