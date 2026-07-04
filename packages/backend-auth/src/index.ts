/**
 * `@icasu/backend-auth` — the BFF (Backend-For-Frontend) auth feature.
 *
 * Exposes a self-contained Hono app (`authRoute`) that implements the OIDC
 * authorization-code + PKCE flow (login / callback / logout / me) and the
 * `requireSession` middleware that protects the host app's own routes. The
 * host backend mounts `authRoute` under `/auth` and reuses `AuthEnv` /
 * `requireSession` on its protected routers.
 *
 * Configuration is read from environment variables at runtime (see
 * `./config.ts`), so the same code runs against Cognito (prod) and
 * mock-oauth2-server (local) without changes.
 */
export { authRoute } from './route.ts';
export { requireSession, type AuthEnv, type SessionContext } from './middleware.ts';
