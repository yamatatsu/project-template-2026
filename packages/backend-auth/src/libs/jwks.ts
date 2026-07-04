import { createRemoteJWKSet, type JWTPayload, jwtVerify } from 'jose';

import type { AuthConfig } from './config.ts';

export interface IdTokenVerifier {
  /**
   * id_token をプロバイダの JWKS・issuer・audience に対して検証し、続けて紐付けられた
   * nonce を確認する。いずれかが一致しなければ throw する。
   */
  verifyIdToken(idToken: string, expectedNonce: string): Promise<JWTPayload>;
}

/** id_token の verifier を組み立てる。プロバイダのリモート JWKS はキャッシュする。 */
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
