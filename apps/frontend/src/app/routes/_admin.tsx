import { createFileRoute, Outlet } from '@tanstack/react-router';

import { AdminGuard } from '@/features/auth';
import { SidebarInset, SidebarProvider } from '@/shared/ui/sidebar';
import { AppHeader } from '@/widgets/app-header';
import { AppSidebar } from '@/widgets/app-sidebar';

// 管理画面領域のレイアウトシェル（サイドナビ有り）。pathless レイアウトなので URL には `_admin` が
// 出ず、配下は従来どおり `/tasks`・`/users`。admin のみ入れるよう AdminGuard で閉じる。
export const Route = createFileRoute('/_admin')({
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <AdminGuard>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <AppHeader variant="admin" />
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    </AdminGuard>
  );
}
