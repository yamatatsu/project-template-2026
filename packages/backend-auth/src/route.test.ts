import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * BFF auth-flow spec.
 *
 * These tests describe the OIDC authorization-code + PKCE flow end to end by
 * driving the exported Hono app (`authRoute`) with real cookies. Only the two
 * external boundaries are mocked:
 *
 *  - the session store (`./libs/session.ts`) → an in-memory Map instead of DynamoDB,
 *  - the token endpoint / id_token verification (`./libs/oidc.ts`, `./libs/jwks.ts`).
 *
 * Everything else — PKCE, state handling, cookie signing, the redirect wiring,
 * and the `requireSession` refresh logic — runs for real.
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

// Hoisted so the (hoisted) vi.mock factories below can reference them.
const boundary = vi.hoisted(() => ({
  exchangeCode: vi.fn(),
  refreshTokens: vi.fn(),
  verifyIdToken: vi.fn(),
}));

// Session store: an in-memory stand-in for the DynamoDB-backed store.
vi.mock('./libs/session.ts', () => {
  const states = new Map<string, unknown>();
  const sessions = new Map<string, unknown>();
  return {
    saveState: async (state: string, data: unknown) => void states.set(state, data),
    consumeState: async (state: string) => {
      const v = states.get(state);
      states.delete(state);
      return v;
    },
    saveSession: async (id: string, data: unknown) => void sessions.set(id, data),
    getSession: async (id: string) => sessions.get(id),
    deleteSession: async (id: string) => void sessions.delete(id),
  };
});

// Keep buildAuthorizeUrl/buildLogoutUrl/TokenError real; stub the network calls.
vi.mock('./libs/oidc.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./libs/oidc.ts')>()),
  exchangeCode: boundary.exchangeCode,
  refreshTokens: boundary.refreshTokens,
}));

vi.mock('./libs/jwks.ts', () => ({ verifyIdToken: boundary.verifyIdToken }));

const { authRoute } = await import('./route.ts');
const { TokenError } = await import('./libs/oidc.ts');
const { resetAuthConfig } = await import('./libs/config.ts');

beforeEach(() => {
  for (const [key, value] of Object.entries(ENV)) {
    process.env[key] = value;
  }
  resetAuthConfig();
  vi.clearAllMocks();
});

afterAll(() => {
  for (const key of Object.keys(ENV)) {
    delete process.env[key];
  }
  resetAuthConfig();
});

/** Take the `name=value` pair from a Set-Cookie response header. */
function cookieFrom(res: Response): string {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) throw new Error('expected a Set-Cookie header');
  return setCookie.split(';')[0]!;
}

/** Start /login and return the `state` bound into the authorize redirect. */
async function startLogin(returnTo = '/'): Promise<string> {
  const res = await authRoute.request(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  const location = new URL(res.headers.get('location')!);
  return location.searchParams.get('state')!;
}

/** Complete the login flow and return the signed session cookie. */
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
  boundary.exchangeCode.mockResolvedValue({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    idToken: 'id-token',
    expiresIn: 3600,
    ...tokens,
  });
  boundary.verifyIdToken.mockResolvedValue(claims);
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
    boundary.exchangeCode.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      idToken: 'id-token',
      expiresIn: 3600,
    });
    boundary.verifyIdToken.mockResolvedValue({ sub: 'user-1', email: 'user@example.com' });

    const res = await authRoute.request(`/callback?code=auth-code&state=${state}`);

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/dashboard');
    expect(boundary.exchangeCode).toHaveBeenCalledWith('auth-code', expect.any(String));
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
    boundary.exchangeCode.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      idToken: 'id-token',
      expiresIn: 3600,
    });
    boundary.verifyIdToken.mockResolvedValue({ sub: 'user-1' });

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
    // expiresIn: 0 → the stored access token is already within the refresh margin.
    const cookie = await authenticate(
      { sub: 'user-2' },
      { refreshToken: 'refresh-1', expiresIn: 0 },
    );
    boundary.refreshTokens.mockResolvedValue({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      idToken: 'id-2',
      expiresIn: 3600,
    });

    const res = await authRoute.request('/me', { headers: { cookie } });

    expect(res.status).toBe(200);
    expect(boundary.refreshTokens).toHaveBeenCalledWith('refresh-1');
    expect(await res.json()).toEqual({ userSub: 'user-2', email: undefined });
  });

  it('invalidates the session when the refresh token is rejected (invalid_grant)', async () => {
    const cookie = await authenticate(
      { sub: 'user-3' },
      { refreshToken: 'refresh-1', expiresIn: 0 },
    );
    boundary.refreshTokens.mockRejectedValue(new TokenError(400, '{"error":"invalid_grant"}'));

    const res = await authRoute.request('/me', { headers: { cookie } });

    expect(res.status).toBe(401);
    // The session is gone: even a non-expiring retry stays unauthenticated.
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
    // After logout the same cookie no longer authenticates.
    const after = await authRoute.request('/me', { headers: { cookie } });
    expect(after.status).toBe(401);
  });
});
