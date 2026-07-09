import { Hono } from 'hono';

import { permissionsForRole } from '../authorization.ts';
import { auth } from '../middleware/auth.ts';

// permissions は role 由来の app 固有 RBAC なので、identity までしか持たない backend-auth ではなく
// ここで組む（詳細は apps/backend/CLAUDE.md「認証・認可」）。auth() は action 無し＝認証済みなら通し、
// role 解決だけ行う。userSub/email は境界の requireSession が載せた session から読む。
export default new Hono().get('/me', auth(), (c) => {
  const { userSub, email } = c.get('session');
  const { role } = c.get('user');
  return c.json({ userSub, email, permissions: permissionsForRole(role) });
});
