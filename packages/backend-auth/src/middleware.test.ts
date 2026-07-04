import { Hono } from 'hono';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { TokenError } from './libs/oidc.ts';
import type { SessionData } from './libs/session.ts';
import { type AuthEnv, createRequireSession } from './middleware.ts';

/**
 * `requireSession` の仕様。
 *
 * BFF フロー全体を実 Cookie で駆動する `route.test.ts` と違い、こちらは3つの依存 —
 * cookie ヘルパー・セッションストア・トークンエンドポイント — にフェイクを注入して
 * ミドルウェアを分離し、各分岐（Cookie 無し / セッション無し / 有効 / リフレッシュ＋
 * ローテーション / 無効化）を、どの副作用が発火したかまで直接検証できるようにする。
 */

let cookies: {
  setSessionCookie: Mock;
  readSessionCookie: Mock;
  clearSessionCookie: Mock;
};
let store: {
  saveState: Mock;
  consumeState: Mock;
  saveSession: Mock;
  getSession: Mock;
  deleteSession: Mock;
};
let refreshTokens: Mock;
let app: Hono<AuthEnv>;

beforeEach(() => {
  cookies = {
    setSessionCookie: vi.fn(),
    readSessionCookie: vi.fn(),
    clearSessionCookie: vi.fn(),
  };
  store = {
    saveState: vi.fn(),
    consumeState: vi.fn(),
    saveSession: vi.fn(),
    getSession: vi.fn(),
    deleteSession: vi.fn(),
  };
  refreshTokens = vi.fn();

  const requireSession = createRequireSession({ cookies, store, oidc: { refreshTokens } });
  // 最小構成の保護アプリ: ハンドラはミドルウェアがセットしたセッションをそのまま返す。
  app = new Hono<AuthEnv>()
    .use('*', requireSession)
    .get('/protected', (c) => c.json(c.get('session')));
});

const nowSeconds = () => Math.floor(Date.now() / 1000);

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

describe('when there is no session cookie', () => {
  it('responds 401 without touching the session store', async () => {
    cookies.readSessionCookie.mockResolvedValue(undefined);

    const res = await request();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthenticated' });
    expect(store.getSession).not.toHaveBeenCalled();
    expect(cookies.clearSessionCookie).not.toHaveBeenCalled();
  });
});

describe('when the cookie has no matching session', () => {
  it('clears the stale cookie and responds 401', async () => {
    cookies.readSessionCookie.mockResolvedValue('sess-1');
    store.getSession.mockResolvedValue(undefined);

    const res = await request();

    expect(res.status).toBe(401);
    expect(cookies.clearSessionCookie).toHaveBeenCalledOnce();
  });
});

describe('when the session is valid and not near expiry', () => {
  it('exposes the session to the handler and does not refresh', async () => {
    cookies.readSessionCookie.mockResolvedValue('sess-1');
    store.getSession.mockResolvedValue(makeSession());

    const res = await request();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sessionId: 'sess-1',
      userSub: 'user-1',
      email: 'user@example.com',
    });
    expect(refreshTokens).not.toHaveBeenCalled();
    expect(store.saveSession).not.toHaveBeenCalled();
  });
});

describe('when the access token is within the refresh margin', () => {
  beforeEach(() => {
    cookies.readSessionCookie.mockResolvedValue('sess-1');
    // 残り寿命 30 秒 → 60 秒のリフレッシュマージン内。
    store.getSession.mockResolvedValue(makeSession({ accessTokenExpiresAt: nowSeconds() + 30 }));
  });

  it('refreshes, persists the rotated tokens, and proceeds', async () => {
    refreshTokens.mockResolvedValue({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      idToken: 'id-2',
      expiresIn: 3600,
    });

    const res = await request();

    expect(res.status).toBe(200);
    expect(refreshTokens).toHaveBeenCalledWith('refresh-1');
    expect(store.saveSession).toHaveBeenCalledWith(
      'sess-1',
      expect.objectContaining({
        accessToken: 'access-2',
        refreshToken: 'refresh-2',
        idToken: 'id-2',
        userSub: 'user-1',
      }),
    );
    // リフレッシュ後のアクセストークンは今からおよそ1時間有効。
    const saved = store.saveSession.mock.calls[0]![1] as SessionData;
    expect(saved.accessTokenExpiresAt).toBeGreaterThan(nowSeconds() + 3000);
  });

  it('keeps the existing refresh token when the provider does not rotate it', async () => {
    refreshTokens.mockResolvedValue({
      accessToken: 'access-2',
      refreshToken: undefined,
      idToken: 'id-2',
      expiresIn: 3600,
    });

    const res = await request();

    expect(res.status).toBe(200);
    expect(store.saveSession).toHaveBeenCalledWith(
      'sess-1',
      expect.objectContaining({ refreshToken: 'refresh-1' }),
    );
  });

  it('rethrows a transient token-endpoint error without destroying the session', async () => {
    refreshTokens.mockRejectedValue(new TokenError(503, 'service unavailable'));

    const res = await request();

    expect(res.status).toBe(500);
    expect(store.deleteSession).not.toHaveBeenCalled();
    expect(cookies.clearSessionCookie).not.toHaveBeenCalled();
  });
});

describe('when the session can no longer be refreshed', () => {
  beforeEach(() => {
    cookies.readSessionCookie.mockResolvedValue('sess-1');
  });

  it('invalidates a session that has no refresh token', async () => {
    store.getSession.mockResolvedValue(
      makeSession({ accessTokenExpiresAt: nowSeconds() + 30, refreshToken: undefined }),
    );

    const res = await request();

    expect(res.status).toBe(401);
    expect(refreshTokens).not.toHaveBeenCalled();
    expect(store.deleteSession).toHaveBeenCalledWith('sess-1');
    expect(cookies.clearSessionCookie).toHaveBeenCalledOnce();
  });

  it('invalidates the session when the refresh token is rejected (invalid_grant)', async () => {
    store.getSession.mockResolvedValue(makeSession({ accessTokenExpiresAt: nowSeconds() + 30 }));
    refreshTokens.mockRejectedValue(new TokenError(400, '{"error":"invalid_grant"}'));

    const res = await request();

    expect(res.status).toBe(401);
    expect(store.deleteSession).toHaveBeenCalledWith('sess-1');
    expect(cookies.clearSessionCookie).toHaveBeenCalledOnce();
  });
});
