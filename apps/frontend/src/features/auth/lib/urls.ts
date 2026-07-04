/**
 * BFF の認証エンドポイント。
 *
 * ログイン/ログアウトはフルページ遷移になる（プロバイダの hosted UI には
 * アプリ内ルートから到達できない）ため、RPC 呼び出しではなく素の URL として持つ。
 * `/api` 配下の same-origin（ローカルは Vite proxy、本番は CloudFront）。
 */
const API_BASE = '/api';

export const authUrls = {
  login: (returnTo?: string): string =>
    returnTo
      ? `${API_BASE}/auth/login?returnTo=${encodeURIComponent(returnTo)}`
      : `${API_BASE}/auth/login`,
  logout: (): string => `${API_BASE}/auth/logout`,
};

/** ログインへのフルページリダイレクト。ユーザーがいた場所を returnTo として保持する。 */
export function redirectToLogin(): void {
  window.location.href = authUrls.login(window.location.pathname + window.location.search);
}
