import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { SidebarTrigger } from '@/shared/ui/sidebar';

export function AppHeader() {
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
            <AvatarFallback>U</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>アイテム1</DropdownMenuItem>
          <DropdownMenuItem>アイテム2</DropdownMenuItem>
          <DropdownMenuItem>アイテム3</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
