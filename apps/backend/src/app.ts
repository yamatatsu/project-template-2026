import { type AuthConfig, createAuth } from '@icasu/backend-auth';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { createTasksRoute } from './tasks/route.ts';

/** Everything the app needs to be constructed. Built once at startup. */
export interface AppConfig {
  auth: AuthConfig;
}

/**
 * Build the Hono application.
 *
 * Routes are defined with method chaining so that the inferred type (`AppType`)
 * carries full route/response information to the frontend via the Hono RPC client.
 *
 * `/auth/*` are the BFF endpoints (login/callback/logout/me). `/tasks` and any
 * other API routes are protected by the session middleware injected into them.
 */
export function createApp(config: AppConfig) {
  const auth = createAuth(config.auth);

  return new Hono()
    .use('*', cors())
    .get('/hello-world', (c) => c.json({ message: 'hello world' }))
    .route('/auth', auth.route)
    .route('/tasks', createTasksRoute(auth.requireSession));
}

export type AppType = ReturnType<typeof createApp>;
