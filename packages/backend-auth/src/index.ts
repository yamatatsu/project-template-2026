import { type AuthConfig } from './libs/config.ts';
/**
 * `@icasu/backend-auth` — the BFF (Backend-For-Frontend) auth feature.
 *
 * `createAuth(config)` builds a self-contained set of BFF auth pieces from an
 * injected `AuthConfig`:
 *  - `route`: a Hono app implementing the OIDC authorization-code + PKCE flow
 *    (login / callback / logout / me), which the host mounts under `/auth`;
 *  - `requireSession`: middleware that protects the host's own routes.
 *
 * The config is injected (not read from `process.env` inside the package) so
 * the wiring is explicit and type-checked, and the host can validate it once at
 * startup via `loadAuthConfigFromEnv` — see `apps/backend`.
 */
import { createCookies } from './libs/cookie.ts';
import { createIdTokenVerifier } from './libs/jwks.ts';
import { createOidcClient } from './libs/oidc.ts';
import { createSessionStore } from './libs/session.ts';
import { createRequireSession } from './middleware.ts';
import { createAuthRoute } from './route.ts';

export { type AuthConfig, loadAuthConfigFromEnv } from './libs/config.ts';
export { type AuthEnv, type RequireSession, type SessionContext } from './middleware.ts';

/** Wire the BFF auth pieces from an injected config. */
export function createAuth(config: AuthConfig) {
  const cookies = createCookies(config.cookie);
  const store = createSessionStore(config.dynamo);
  const oidc = createOidcClient(config);
  const verifier = createIdTokenVerifier(config.oidc);
  const requireSession = createRequireSession({ cookies, store, oidc });
  const route = createAuthRoute({ cookies, store, oidc, verifier, requireSession });
  return { route, requireSession };
}
