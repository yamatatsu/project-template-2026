import { createFileRoute } from '@tanstack/react-router';

import { UserDetailPage } from '@/pages/user-detail';

export const Route = createFileRoute('/_admin/users/$userId/')({
  component: RouteComponent,
});

function RouteComponent() {
  const { userId } = Route.useParams();
  return <UserDetailPage userId={userId} />;
}
