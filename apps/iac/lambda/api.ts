import { app } from '@icasu/backend/app';
import { handle } from 'hono/aws-lambda';

/**
 * API Gateway (HTTP API, payload format 2.0) entrypoint.
 *
 * Reuses the exact same Hono `app` that runs locally on Node. CloudFront strips
 * the `/api` prefix before forwarding here, so routes stay at the root
 * (`/tasks`, `/hello-world`) and no backend code changes are required.
 */
export const handler = handle(app);
