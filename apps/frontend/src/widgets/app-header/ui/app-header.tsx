import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import { sessionQuery } from '@/entities/session';
import { LogoutButton, useIsAdmin } from '@/features/auth';
import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { SidebarTrigger } from '@/shared/ui/sidebar';

// トップ（サイドナビ無しのタスク一覧）と管理画面（サイドナビ有り）で共有するヘッダー。
// 差分は variant に閉じる: 管理画面はサイドバートリガーを出し、トップは admin にだけ管理画面への
// 導線を出す。
type AppHeaderProps = { variant: 'top' | 'admin' };

export function AppHeader({ variant }: AppHeaderProps) {
  const { data: session } = useQuery(sessionQuery());
  const isAdmin = useIsAdmin();
  const email = session?.email;
  const initial = (email?.[0] ?? 'U').toUpperCase();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
      <div className="flex items-center gap-2">
        {variant === 'admin' && <SidebarTrigger />}
        <span className="text-lg font-semibold">
          {variant === 'admin' ? '管理画面' : 'タスク一覧'}
        </span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          className="focus-visible:ring-ring rounded-full outline-none focus-visible:ring-2"
          aria-label="ユーザーメニュー"
        >
          <Avatar>
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {email ? (
            <DropdownMenuItem disabled className="opacity-100">
              {email}
            </DropdownMenuItem>
          ) : null}
          {variant === 'top' && isAdmin ? (
            <DropdownMenuItem render={<Link to="/tasks">管理画面へ</Link>} />
          ) : null}
          {variant === 'admin' ? <DropdownMenuItem render={<Link to="/">トップへ</Link>} /> : null}
          <LogoutButton />
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
