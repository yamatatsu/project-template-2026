import { DropdownMenuItem } from '@/shared/ui/dropdown-menu';

import { authUrls } from '../lib/urls';

/**
 * ログアウトのメニュー項目 — BFF へのフルページ遷移で、BFF がセッションを破棄した上で
 * プロバイダのログアウトエンドポイントへリダイレクトする。`DropdownMenuContent` の
 * 中に置いて使う。
 */
export function LogoutButton() {
  return (
    <DropdownMenuItem
      onClick={() => {
        window.location.href = authUrls.logout();
      }}
    >
      ログアウト
    </DropdownMenuItem>
  );
}
