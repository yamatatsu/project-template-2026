import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { tasksRoute } from './tasks/route.ts';

/**
 * The Hono application.
 *
 * Routes are defined with method chaining so that the inferred type (`AppType`)
 * carries full route/response information to the frontend via the Hono RPC client.
 */
export const app = new Hono()
  .use('*', cors())
  .get('/hello-world', (c) => c.json({ message: 'hello world' }))
  .route('/tasks', tasksRoute);

export type AppType = typeof app;
