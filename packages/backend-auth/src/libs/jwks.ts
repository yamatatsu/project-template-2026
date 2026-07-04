import { createRemoteJWKSet, type JWTPayload, jwtVerify } from 'jose';

import type { AuthConfig } from './config.ts';

export interface IdTokenVerifier {
  /**
   * Verify an id_token against the provider's JWKS, issuer, and audience, then
   * check the bound nonce. Throws on any mismatch.
   */
  verifyIdToken(idToken: string, expectedNonce: string): Promise<JWTPayload>;
}

/** Build the id_token verifier, caching the provider's remote JWKS. */
export function createIdTokenVerifier(cfg: AuthConfig['oidc']): IdTokenVerifier {
  const jwks = createRemoteJWKSet(new URL(cfg.jwksUrl));

  return {
    async verifyIdToken(idToken, expectedNonce) {
      const { payload } = await jwtVerify(idToken, jwks, {
        issuer: cfg.issuer,
        audience: cfg.clientId,
      });
      if (payload.nonce !== expectedNonce) {
        throw new Error('id_token nonce mismatch');
      }
      return payload;
    },
  };
}
