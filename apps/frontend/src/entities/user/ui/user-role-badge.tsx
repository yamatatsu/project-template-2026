import { Badge } from '@/shared/ui/badge';

import { type UserRole, userRoleLabels, userRoleVariants } from '../model/user';

export function UserRoleBadge({ role }: { role: UserRole }) {
  return (
    <Badge variant={userRoleVariants[role]} data-testid="user-role-badge">
      {userRoleLabels[role]}
    </Badge>
  );
}
