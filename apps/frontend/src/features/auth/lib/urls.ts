/**
 * BFF の OAuth 遷移エンドポイント。
 *
 * ログイン/ログアウトはフルページ遷移になる（プロバイダの hosted UI には
 * アプリ内ルートから到達できない）ため、RPC 呼び出しではなく素の URL として持つ。
 * リダイレクト専用の `/auth` 配下の same-origin（ローカルは Vite proxy、本番は CloudFront）。
 * JSON API（`/api`）とは別系統なので `/api` プレフィックスは付けない。
 */
const AUTH_BASE = '/auth';

export const authUrls = {
  login: (returnTo?: string): string =>
    returnTo ? `${AUTH_BASE}/login?returnTo=${encodeURIComponent(returnTo)}` : `${AUTH_BASE}/login`,
  logout: (): string => `${AUTH_BASE}/logout`,
};

/** ログインへのフルページリダイレクト。ユーザーがいた場所を returnTo として保持する。 */
export function redirectToLogin(): void {
  window.location.href = authUrls.login(window.location.pathname + window.location.search);
}
