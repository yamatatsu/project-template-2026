import { serve } from '@hono/node-server';
import { loadAuthConfigFromEnv } from '@icasu/backend-auth';

import { type AppType, createApp } from './app.ts';

export type { AppType };

// Validate the whole auth config once, at startup: a missing env var crashes
// here (with the full list) instead of on the first authenticated request.
const app = createApp({ auth: loadAuthConfigFromEnv() });
export { app };

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server running on http://localhost:${info.port}`);
});
