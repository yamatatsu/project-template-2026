import { handle } from 'hono/aws-lambda';

import { app } from './app.ts';

/**
 * AWS Lambda (API Gateway HTTP API, payload format 2.0) entrypoint.
 *
 * Reuses the exact same Hono `app` that runs locally on Node via `index.ts`.
 * CloudFront strips the `/api` prefix before forwarding here, so routes stay at
 * the root (`/tasks`, `/hello-world`) and no backend code changes are required.
 */
export const handler = handle(app);
