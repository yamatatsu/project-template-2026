import { serve } from '@hono/node-server';

import { app, type AppType } from './app.ts';

export type { AppType };
export { app };

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server running on http://localhost:${info.port}`);
});
