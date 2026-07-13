import { createFileRoute } from '@tanstack/react-router';

import { UserEditPage } from '@/pages/user-edit';

export const Route = createFileRoute('/_admin/users/$userId/edit')({
  component: RouteComponent,
});

function RouteComponent() {
  const { userId } = Route.useParams();
  return <UserEditPage userId={userId} />;
}
