import { app, type AppType } from './app.ts'

export type { AppType }
export { app }

const port = Number(process.env.PORT ?? 3000)

// Bun automatically serves the default export's `fetch` handler on `port`.
export default {
  port,
  fetch: app.fetch,
}
