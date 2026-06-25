import type { AppType } from 'backend'
import { hc } from 'hono/client'

/**
 * Typed Hono RPC client.
 *
 * `AppType` is imported from the backend workspace, so every route and response
 * is fully typed end-to-end. In development, requests go to `/api` and are
 * proxied to the backend by Vite (see `vite.config.ts`).
 */
const baseUrl = import.meta.env.VITE_API_URL ?? '/api'

export const client = hc<AppType>(baseUrl)
