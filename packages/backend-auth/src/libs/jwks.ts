import { createRemoteJWKSet, type JWTPayload, jwtVerify } from 'jose';

import { getAuthConfig } from './config.ts';

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(getAuthConfig().oidc.jwksUrl));
  }
  return jwks;
}

/**
 * Verify an id_token against the provider's JWKS, issuer, and audience, then
 * check the bound nonce. Throws on any mismatch.
 */
export async function verifyIdToken(idToken: string, expectedNonce: string): Promise<JWTPayload> {
  const cfg = getAuthConfig();
  const { payload } = await jwtVerify(idToken, getJwks(), {
    issuer: cfg.oidc.issuer,
    audience: cfg.oidc.clientId,
  });
  if (payload.nonce !== expectedNonce) {
    throw new Error('id_token nonce mismatch');
  }
  return payload;
}
