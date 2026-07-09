import { loadAuthConfigFromEnv } from '@icasu/backend-auth';
import { testClient } from 'hono/testing';
import { describe, expect, it } from 'vitest';

import { createApp } from './app.ts';

// `createApp` が BFF の部品を組み立てられるよう、完全な auth 設定を用意する。組み立て自体は
// 副作用なし（ネットワークアクセスなし）なので、認証以外のルートのテストにはこれで足りる。
const TEST_ENV: Record<string, string> = {
  OIDC_ISSUER: 'http://localhost:8080/default',
  OIDC_AUTHORIZE_URL: 'http://localhost:8080/default/authorize',
  OIDC_TOKEN_URL: 'http://localhost:8080/default/token',
  OIDC_JWKS_URL: 'http://localhost:8080/default/jwks',
  OIDC_CLIENT_ID: 'local-client',
  OIDC_CLIENT_SECRET: 'local-secret',
  AUTH_REDIRECT_URI: 'http://localhost:5001/auth/callback',
  AUTH_LOGOUT_URL: 'http://localhost:8080/default/endsession?post_logout_redirect_uri={redirect}',
  APP_BASE_URL: 'http://localhost:5001',
  COOKIE_SECRET: 'x'.repeat(32),
  SESSION_TABLE_NAME: 'sessions',
};

const client = testClient(createApp({ auth: loadAuthConfigFromEnv(TEST_ENV) }));

describe('createApp', () => {
  it('保護ルートは未認証だと 401（requireSession が組み込まれていることの smoke test）', async () => {
    const res = await client.tasks.$get();

    expect(res.status).toBe(401);
  });

  it('/me も保護グループ配下で未認証だと 401（apps/backend 所有に移設済み）', async () => {
    const res = await client.me.$get();

    expect(res.status).toBe(401);
  });
});
