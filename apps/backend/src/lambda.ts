import { loadAuthConfigFromEnv } from '@icasu/backend-auth';
import { handle } from 'hono/aws-lambda';

import { createApp } from './app.ts';

/**
 * AWS Lambda (API Gateway HTTP API, payload format 2.0) entrypoint.
 *
 * Builds the exact same Hono app that runs locally on Node via `index.ts`.
 * The auth config is validated at cold start (`loadAuthConfigFromEnv`), so a
 * missing env var fails the init instead of the first authenticated request.
 * CloudFront strips the `/api` prefix before forwarding here, so routes stay at
 * the root (`/tasks`, `/hello-world`) and no backend code changes are required.
 */
const app = createApp({ auth: loadAuthConfigFromEnv() });

export const handler = handle(app);
