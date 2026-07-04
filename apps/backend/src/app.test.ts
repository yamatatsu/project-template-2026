import { loadAuthConfigFromEnv } from '@icasu/backend-auth';
import { describe, expect, it } from 'vitest';

import { createApp } from './app.ts';

// A complete auth config so `createApp` can wire the BFF pieces. Building them
// is side-effect-free (no network), so this suffices for the non-auth routes.
const TEST_ENV: Record<string, string> = {
  OIDC_ISSUER: 'http://localhost:8080/default',
  OIDC_AUTHORIZE_URL: 'http://localhost:8080/default/authorize',
  OIDC_TOKEN_URL: 'http://localhost:8080/default/token',
  OIDC_JWKS_URL: 'http://localhost:8080/default/jwks',
  OIDC_CLIENT_ID: 'local-client',
  OIDC_CLIENT_SECRET: 'local-secret',
  AUTH_REDIRECT_URI: 'http://localhost:5001/api/auth/callback',
  AUTH_LOGOUT_URL: 'http://localhost:8080/default/endsession?post_logout_redirect_uri={redirect}',
  APP_BASE_URL: 'http://localhost:5001',
  COOKIE_SECRET: 'x'.repeat(32),
  SESSION_TABLE_NAME: 'sessions',
};

const app = createApp({ auth: loadAuthConfigFromEnv(TEST_ENV) });

describe('GET /hello-world', () => {
  it('responds with the hello world message as JSON', async () => {
    const res = await app.request('/hello-world');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello world' });
  });
});
