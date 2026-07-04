import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { type AuthConfig, loadAuthConfigFromEnv } from './config.ts';
import { createOidcClient } from './oidc.ts';
import { challengeFromVerifier, generateVerifier } from './pkce.ts';

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

const config: AuthConfig = loadAuthConfigFromEnv(ENV);

describe('pkce', () => {
  it('derives an S256 base64url challenge from the verifier', () => {
    const verifier = 'test-verifier';
    const expected = createHash('sha256').update(verifier).digest('base64url');
    expect(challengeFromVerifier(verifier)).toBe(expected);
  });

  it('generates distinct, url-safe verifiers', () => {
    const a = generateVerifier();
    const b = generateVerifier();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('buildAuthorizeUrl', () => {
  it('includes the OIDC authorization-code + PKCE parameters', () => {
    const oidc = createOidcClient(config);
    const url = new URL(oidc.buildAuthorizeUrl({ state: 's1', nonce: 'n1', codeChallenge: 'c1' }));
    expect(`${url.origin}${url.pathname}`).toBe('http://localhost:8080/default/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('local-client');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5001/api/auth/callback');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')).toBe('s1');
    expect(url.searchParams.get('nonce')).toBe('n1');
    expect(url.searchParams.get('code_challenge')).toBe('c1');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });
});

describe('buildLogoutUrl', () => {
  it('substitutes {redirect} with the URL-encoded app base URL', () => {
    const oidc = createOidcClient(config);
    expect(oidc.buildLogoutUrl()).toBe(
      `http://localhost:8080/default/endsession?post_logout_redirect_uri=${encodeURIComponent(
        'http://localhost:5001',
      )}`,
    );
  });
});

describe('loadAuthConfigFromEnv', () => {
  it('parses a complete environment', () => {
    expect(config.oidc.issuer).toBe('http://localhost:8080/default');
    expect(config.cookie.name).toBe('sid');
    // COOKIE_SECURE 未設定時のデフォルトは true。
    expect(config.cookie.secure).toBe(true);
    expect(config.dynamo.region).toBe('ap-northeast-1');
  });

  it('reports every missing required variable at once', () => {
    const { OIDC_ISSUER: _issuer, COOKIE_SECRET: _secret, ...partial } = ENV;
    expect(() => loadAuthConfigFromEnv(partial)).toThrow(/OIDC_ISSUER.*COOKIE_SECRET/);
  });
});
