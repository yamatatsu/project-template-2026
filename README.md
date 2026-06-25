# project-template-2026

A TypeScript monorepo template: Hono backend on Bun + React/Vite frontend, with
end-to-end type safety via the Hono RPC client.

## Stack

| Area        | Choice                                              |
| ----------- | --------------------------------------------------- |
| Monorepo    | Bun workspaces (`apps/*`, `packages/*`)             |
| Package mgr | Bun                                                 |
| Backend     | Hono on the Bun runtime                             |
| Frontend    | React + Vite + Tailwind v4 + shadcn/ui (Base UI)    |
| Data layer  | Hono RPC client + TanStack Query (typed end-to-end) |
| Lint/format | oxlint + oxfmt                                      |
| Tests       | Vitest (both apps)                                  |
| Hooks / CI  | husky + lint-staged · GitHub Actions                |

## Layout

```
apps/
  backend/   Hono API — GET /hello-world, exports AppType for RPC
  frontend/  React app — shows the backend message via TanStack Query
packages/    (reserved for shared packages)
```

## Getting started

```bash
bun install
bun run dev          # runs backend (:3000) and frontend (:5173) together
```

Open http://localhost:5173 — the page fetches `hello world` from the backend
through the typed RPC client. Vite proxies `/api/*` to the backend in dev.

## Scripts (run from the repo root)

| Command                | Description                     |
| ---------------------- | ------------------------------- |
| `bun run dev`          | Start both apps                 |
| `bun run dev:backend`  | Backend only                    |
| `bun run dev:frontend` | Frontend only                   |
| `bun run build`        | Build both apps                 |
| `bun run test`         | Run all tests                   |
| `bun run typecheck`    | Type-check all workspaces       |
| `bun run lint`         | oxlint                          |
| `bun run format`       | oxfmt (write)                   |
| `bun run format:check` | oxfmt (check only — used in CI) |

## Type-safe API calls

The backend exports its app type:

```ts
// apps/backend/src/app.ts
export type AppType = typeof app
```

The frontend consumes it through the Hono RPC client (`apps/frontend/src/lib/api.ts`),
so routes and responses are fully typed with autocomplete.

## Adding shadcn components

```bash
cd apps/frontend
bunx shadcn@latest add <component>
```

Components use **Base UI** primitives (configured in `components.json`).
