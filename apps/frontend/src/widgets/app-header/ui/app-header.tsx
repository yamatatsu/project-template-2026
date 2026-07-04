import { useQuery } from '@tanstack/react-query';

import { sessionQuery } from '@/entities/session';
import { LogoutButton } from '@/features/auth';
import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { SidebarTrigger } from '@/shared/ui/sidebar';

export function AppHeader() {
  const { data: session } = useQuery(sessionQuery());
  const email = session?.email;
  const initial = (email?.[0] ?? 'U').toUpperCase();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
        <span className="text-lg font-semibold">管理画面</span>
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
          <LogoutButton />
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
