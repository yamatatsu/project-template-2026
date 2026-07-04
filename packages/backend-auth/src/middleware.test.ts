import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type AuthEnv, requireSession } from './middleware.ts';

/**
 * `requireSession` spec.
 *
 * Unlike `route.test.ts` (which drives the whole BFF flow with real cookies),
 * this isolates the middleware by mocking its three boundaries — the cookie
 * reader, the session store, and the token endpoint — so each branch (no
 * cookie / no session / valid / refresh-with-rotation / invalidation) can be
 * asserted directly, including which side effects fire.
 */

const boundary = vi.hoisted(() => ({
  readSessionCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
  getSession: vi.fn(),
  saveSession: vi.fn(),
  deleteSession: vi.fn(),
  refreshTokens: vi.fn(),
}));

vi.mock('./libs/cookie.ts', () => ({
  readSessionCookie: boundary.readSessionCookie,
  clearSessionCookie: boundary.clearSessionCookie,
}));

vi.mock('./libs/session.ts', () => ({
  getSession: boundary.getSession,
  saveSession: boundary.saveSession,
  deleteSession: boundary.deleteSession,
}));

// Keep TokenError real (the invalid-grant branch relies on it); stub the call.
vi.mock('./libs/oidc.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./libs/oidc.ts')>()),
  refreshTokens: boundary.refreshTokens,
}));

const { TokenError } = await import('./libs/oidc.ts');

// A minimal protected app: the handler echoes the session the middleware set.
const app = new Hono<AuthEnv>()
  .use('*', requireSession)
  .get('/protected', (c) => c.json(c.get('session')));

const nowSeconds = () => Math.floor(Date.now() / 1000);

interface SessionData {
  accessToken: string;
  refreshToken: string | undefined;
  idToken: string;
  accessTokenExpiresAt: number;
  userSub: string;
  email: string | undefined;
}

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
  return {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    idToken: 'id-1',
    accessTokenExpiresAt: nowSeconds() + 3600,
    userSub: 'user-1',
    email: 'user@example.com',
    ...overrides,
  };
}

const request = () => app.request('/protected');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('when there is no session cookie', () => {
  it('responds 401 without touching the session store', async () => {
    boundary.readSessionCookie.mockResolvedValue(undefined);

    const res = await request();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthenticated' });
    expect(boundary.getSession).not.toHaveBeenCalled();
    expect(boundary.clearSessionCookie).not.toHaveBeenCalled();
  });
});

describe('when the cookie has no matching session', () => {
  it('clears the stale cookie and responds 401', async () => {
    boundary.readSessionCookie.mockResolvedValue('sess-1');
    boundary.getSession.mockResolvedValue(undefined);

    const res = await request();

    expect(res.status).toBe(401);
    expect(boundary.clearSessionCookie).toHaveBeenCalledOnce();
  });
});

describe('when the session is valid and not near expiry', () => {
  it('exposes the session to the handler and does not refresh', async () => {
    boundary.readSessionCookie.mockResolvedValue('sess-1');
    boundary.getSession.mockResolvedValue(makeSession());

    const res = await request();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sessionId: 'sess-1',
      userSub: 'user-1',
      email: 'user@example.com',
    });
    expect(boundary.refreshTokens).not.toHaveBeenCalled();
    expect(boundary.saveSession).not.toHaveBeenCalled();
  });
});

describe('when the access token is within the refresh margin', () => {
  beforeEach(() => {
    boundary.readSessionCookie.mockResolvedValue('sess-1');
    // 30s of life left → inside the 60s refresh margin.
    boundary.getSession.mockResolvedValue(makeSession({ accessTokenExpiresAt: nowSeconds() + 30 }));
  });

  it('refreshes, persists the rotated tokens, and proceeds', async () => {
    boundary.refreshTokens.mockResolvedValue({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      idToken: 'id-2',
      expiresIn: 3600,
    });

    const res = await request();

    expect(res.status).toBe(200);
    expect(boundary.refreshTokens).toHaveBeenCalledWith('refresh-1');
    expect(boundary.saveSession).toHaveBeenCalledWith(
      'sess-1',
      expect.objectContaining({
        accessToken: 'access-2',
        refreshToken: 'refresh-2',
        idToken: 'id-2',
        userSub: 'user-1',
      }),
    );
    // The refreshed access token is good for ~1h from now.
    const saved = boundary.saveSession.mock.calls[0]![1] as SessionData;
    expect(saved.accessTokenExpiresAt).toBeGreaterThan(nowSeconds() + 3000);
  });

  it('keeps the existing refresh token when the provider does not rotate it', async () => {
    boundary.refreshTokens.mockResolvedValue({
      accessToken: 'access-2',
      refreshToken: undefined,
      idToken: 'id-2',
      expiresIn: 3600,
    });

    const res = await request();

    expect(res.status).toBe(200);
    expect(boundary.saveSession).toHaveBeenCalledWith(
      'sess-1',
      expect.objectContaining({ refreshToken: 'refresh-1' }),
    );
  });

  it('rethrows a transient token-endpoint error without destroying the session', async () => {
    boundary.refreshTokens.mockRejectedValue(new TokenError(503, 'service unavailable'));

    const res = await request();

    expect(res.status).toBe(500);
    expect(boundary.deleteSession).not.toHaveBeenCalled();
    expect(boundary.clearSessionCookie).not.toHaveBeenCalled();
  });
});

describe('when the session can no longer be refreshed', () => {
  beforeEach(() => {
    boundary.readSessionCookie.mockResolvedValue('sess-1');
  });

  it('invalidates a session that has no refresh token', async () => {
    boundary.getSession.mockResolvedValue(
      makeSession({ accessTokenExpiresAt: nowSeconds() + 30, refreshToken: undefined }),
    );

    const res = await request();

    expect(res.status).toBe(401);
    expect(boundary.refreshTokens).not.toHaveBeenCalled();
    expect(boundary.deleteSession).toHaveBeenCalledWith('sess-1');
    expect(boundary.clearSessionCookie).toHaveBeenCalledOnce();
  });

  it('invalidates the session when the refresh token is rejected (invalid_grant)', async () => {
    boundary.getSession.mockResolvedValue(makeSession({ accessTokenExpiresAt: nowSeconds() + 30 }));
    boundary.refreshTokens.mockRejectedValue(new TokenError(400, '{"error":"invalid_grant"}'));

    const res = await request();

    expect(res.status).toBe(401);
    expect(boundary.deleteSession).toHaveBeenCalledWith('sess-1');
    expect(boundary.clearSessionCookie).toHaveBeenCalledOnce();
  });
});
