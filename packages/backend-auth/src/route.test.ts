import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { loadAuthConfigFromEnv } from './libs/config.ts';
import { createCookies } from './libs/cookie.ts';
import { createOidcClient, TokenError } from './libs/oidc.ts';
import type { PendingAuth, SessionData, SessionStore } from './libs/session.ts';
import { createRequireSession } from './middleware.ts';
import { createAuthRoute } from './route.ts';

/**
 * BFF 認証フローの仕様。
 *
 * `createAuthRoute` が返す Hono app を実 Cookie で駆動し、OIDC authorization-code + PKCE
 * フローをエンドツーエンドで記述する。DI で差し替えるのは2つの外部境界のみで、それ以外
 * （PKCE・state・Cookie 署名・リダイレクトの配線・リフレッシュのロジック）は実物を動かす:
 *
 *  - セッションストア → DynamoDB の代わりに in-memory の Map、
 *  - トークンエンドポイント / id_token 検証 → vi.fn() のスタブ。
 */

const ENV: Record<string, string> = {
  OIDC_ISSUER: 'http://localhost:8080/default',
  OIDC_AUTHORIZE_URL: 'http://localhost:8080/default/authorize',
  OIDC_TOKEN_URL: 'http://localhost:8080/default/token',
  OIDC_JWKS_URL: 'http://localhost:8080/default/jwks',
  OIDC_CLIENT_ID: 'local-client',
  OIDC_CLIENT_SECRET: 'local-secret',
  OIDC_SCOPES: 'openid email profile',
  AUTH_REDIRECT_URI: 'http://localhost:5001/api/auth/callback',
  AUTH_LOGOUT_URL: 'http://localhost:8080/default/endsession?post_logout_redirect_uri={redirect}',
  APP_BASE_URL: 'http://localhost:5001',
  COOKIE_SECRET: 'x'.repeat(32),
  SESSION_TABLE_NAME: 'sessions',
};

const config = loadAuthConfigFromEnv(ENV);

function createInMemoryStore(): SessionStore {
  const states = new Map<string, PendingAuth>();
  const sessions = new Map<string, SessionData>();
  return {
    async saveState(state, data) {
      states.set(state, data);
    },
    async consumeState(state) {
      const value = states.get(state);
      states.delete(state);
      return value;
    },
    async saveSession(id, data) {
      sessions.set(id, data);
    },
    async getSession(id) {
      return sessions.get(id);
    },
    async deleteSession(id) {
      sessions.delete(id);
    },
  };
}

let authRoute: ReturnType<typeof createAuthRoute>;
let exchangeCode: Mock;
let refreshTokens: Mock;
let verifyIdToken: Mock;

beforeEach(() => {
  exchangeCode = vi.fn();
  refreshTokens = vi.fn();
  verifyIdToken = vi.fn();

  const cookies = createCookies(config.cookie);
  const store = createInMemoryStore();
  const oidc = { ...createOidcClient(config), exchangeCode, refreshTokens };
  const verifier = { verifyIdToken };
  const requireSession = createRequireSession({ cookies, store, oidc });
  authRoute = createAuthRoute({ cookies, store, oidc, verifier, requireSession });
});

/** レスポンスの Set-Cookie ヘッダから `name=value` の組を取り出す。 */
function cookieFrom(res: Response): string {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) throw new Error('expected a Set-Cookie header');
  return setCookie.split(';')[0]!;
}

/** /login を開始し、authorize リダイレクトに紐付いた `state` を返す。 */
async function startLogin(returnTo = '/'): Promise<string> {
  const res = await authRoute.request(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  const location = new URL(res.headers.get('location')!);
  return location.searchParams.get('state')!;
}

/** ログインフローを完了し、署名付きセッション Cookie を返す。 */
async function authenticate(
  claims: { sub: string; email?: string },
  tokens: Partial<{
    accessToken: string;
    refreshToken: string;
    idToken: string;
    expiresIn: number;
  }> = {},
  returnTo = '/',
): Promise<string> {
  const state = await startLogin(returnTo);
  exchangeCode.mockResolvedValue({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    idToken: 'id-token',
    expiresIn: 3600,
    ...tokens,
  });
  verifyIdToken.mockResolvedValue(claims);
  const res = await authRoute.request(`/callback?code=auth-code&state=${state}`);
  return cookieFrom(res);
}

describe('GET /login', () => {
  it('redirects to the provider with PKCE + state and remembers the return path', async () => {
    const res = await authRoute.request('/login?returnTo=%2Fdashboard');

    expect(res.status).toBe(302);
    const url = new URL(res.headers.get('location')!);
    expect(`${url.origin}${url.pathname}`).toBe('http://localhost:8080/default/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('nonce')).toBeTruthy();
  });
});

describe('GET /callback', () => {
  it('exchanges the code, verifies the id_token, sets a session cookie, and redirects to returnTo', async () => {
    const state = await startLogin('/dashboard');
    exchangeCode.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      idToken: 'id-token',
      expiresIn: 3600,
    });
    verifyIdToken.mockResolvedValue({ sub: 'user-1', email: 'user@example.com' });

    const res = await authRoute.request(`/callback?code=auth-code&state=${state}`);

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/dashboard');
    expect(exchangeCode).toHaveBeenCalledWith('auth-code', expect.any(String));
    expect(cookieFrom(res)).toMatch(/^sid=/);
  });

  it('rejects a callback that is missing the code or state', async () => {
    const res = await authRoute.request('/callback?code=auth-code');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_request' });
  });

  it('rejects an unknown / already-consumed state', async () => {
    const res = await authRoute.request('/callback?code=auth-code&state=never-issued');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_state' });
  });

  it('refuses to redirect to an off-site returnTo (open-redirect guard)', async () => {
    const state = await startLogin('https://evil.example/phish');
    exchangeCode.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      idToken: 'id-token',
      expiresIn: 3600,
    });
    verifyIdToken.mockResolvedValue({ sub: 'user-1' });

    const res = await authRoute.request(`/callback?code=auth-code&state=${state}`);

    expect(res.headers.get('location')).toBe('/');
  });
});

describe('GET /me', () => {
  it('returns the authenticated user for a valid session cookie', async () => {
    const cookie = await authenticate({ sub: 'user-1', email: 'user@example.com' });

    const res = await authRoute.request('/me', { headers: { cookie } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userSub: 'user-1', email: 'user@example.com' });
  });

  it('responds 401 when no session cookie is present', async () => {
    const res = await authRoute.request('/me');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthenticated' });
  });

  it('transparently refreshes an access token that is about to expire', async () => {
    // expiresIn: 0 → 保存済みのアクセストークンは最初からリフレッシュマージン内。
    const cookie = await authenticate(
      { sub: 'user-2' },
      { refreshToken: 'refresh-1', expiresIn: 0 },
    );
    refreshTokens.mockResolvedValue({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      idToken: 'id-2',
      expiresIn: 3600,
    });

    const res = await authRoute.request('/me', { headers: { cookie } });

    expect(res.status).toBe(200);
    expect(refreshTokens).toHaveBeenCalledWith('refresh-1');
    expect(await res.json()).toEqual({ userSub: 'user-2', email: undefined });
  });

  it('invalidates the session when the refresh token is rejected (invalid_grant)', async () => {
    const cookie = await authenticate(
      { sub: 'user-3' },
      { refreshToken: 'refresh-1', expiresIn: 0 },
    );
    refreshTokens.mockRejectedValue(new TokenError(400, '{"error":"invalid_grant"}'));

    const res = await authRoute.request('/me', { headers: { cookie } });

    expect(res.status).toBe(401);
    // セッションは消えている: 失効と無関係なリトライでも未認証のまま。
    const retry = await authRoute.request('/me', { headers: { cookie } });
    expect(retry.status).toBe(401);
  });
});

describe('GET /logout', () => {
  it('destroys the session and redirects to the provider end-session URL', async () => {
    const cookie = await authenticate({ sub: 'user-1' });

    const res = await authRoute.request('/logout', { headers: { cookie } });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/default/endsession');
    // ログアウト後は同じ Cookie ではもう認証されない。
    const after = await authRoute.request('/me', { headers: { cookie } });
    expect(after.status).toBe(401);
  });
});
